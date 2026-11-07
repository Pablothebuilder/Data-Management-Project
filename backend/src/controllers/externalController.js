// Endpoints that call the external Open Food Facts APIs and save the results
// into our database (Ingredients + IngredientPriceHistory).
const db = require('../config/db');
const { ApiError } = require('../utils/errors');
const { validate, intParam } = require('../utils/validate');
const off = require('../services/openFoodFacts');

// GET /api/external/products?q=oats
async function search(req, res) {
  const { q } = validate(req.query, { q: { type: 'string', required: true, minLength: 2, maxLength: 100, label: 'Search text' } });
  const products = await off.searchProducts(q);
  // Flag products that were already imported.
  const codes = products.map((p) => p.code);
  const existing = codes.length
    ? await db.query('SELECT off_product_code, ingredient_id FROM Ingredients WHERE off_product_code = ANY($1::text[])', [codes])
    : [];
  const imported = new Map(existing.map((e) => [e.off_product_code, e.ingredient_id]));
  res.json({ products: products.map((p) => ({ ...p, imported_ingredient_id: imported.get(p.code) || null })) });
}

// Saves price observations, skipping ones already stored. Returns the rows inserted.
async function storePrices(tx, ingredientId, prices) {
  let inserted = 0;
  for (const p of prices) {
    const [dup] = await tx.query(
      `SELECT 1 FROM IngredientPriceHistory
        WHERE ingredient_id = $1 AND product_code IS NOT DISTINCT FROM $2
          AND observed_on IS NOT DISTINCT FROM $3::date AND observed_price = $4 AND currency = $5`,
      [ingredientId, p.product_code, p.observed_on, p.observed_price, p.currency],
    );
    if (dup) continue;
    await tx.query(
      `INSERT INTO IngredientPriceHistory
         (ingredient_id, source, product_code, product_name, observed_price, currency, price_per_base_unit, observed_on)
       VALUES ($1, 'Open Prices', $2, $3, $4, $5, $6, $7)`,
      [ingredientId, p.product_code, p.product_name ? p.product_name.slice(0, 200) : null,
        p.observed_price, p.currency, p.price_per_base_unit, p.observed_on],
    );
    inserted += 1;
  }
  return inserted;
}

// POST /api/external/import {code, name?, category?, estimated_unit_price?}
// Fetches nutrition facts for a product and inserts it as a new Ingredient,
// then tries to fetch its prices from Open Prices.
async function importProduct(req, res) {
  const d = validate(req.body, {
    code: { type: 'string', required: true, pattern: /^\d{4,32}$/, patternMessage: 'Barcode must be 4-32 digits', label: 'Barcode' },
    name: { type: 'string', maxLength: 100, label: 'Name' },
    category: { type: 'string', maxLength: 50, label: 'Category' },
    estimated_unit_price: { type: 'number', min: 0, max: 99999999, label: 'Price per 100g' },
  });
  const [already] = await db.query('SELECT ingredient_id, name FROM Ingredients WHERE off_product_code = $1', [d.code]);
  if (already) throw ApiError.conflict(`Already imported as "${already.name}"`);

  const product = await off.getProduct(d.code);
  if (!product) throw ApiError.notFound('Open Food Facts product');

  // Prices are optional: a failure here should not block the import.
  let prices = [];
  let priceWarning = null;
  try {
    prices = await off.getPrices(d.code);
  } catch (err) {
    priceWarning = err.message;
  }
  const estimated = d.estimated_unit_price ?? off.estimateCadPrice(prices) ?? 0;
  const name = (d.name || product.name).slice(0, 100);

  const result = await db.transaction(async (tx) => {
    const [dup] = await tx.query('SELECT 1 FROM Ingredients WHERE LOWER(name) = LOWER($1)', [name]);
    if (dup) throw ApiError.conflict(`An ingredient named "${name}" already exists - choose a different name`);
    const [ingredient] = await tx.query(
      `INSERT INTO Ingredients (name, category, estimated_unit_price, calories_per_unit, protein_g, carbs_g, fat_g, base_unit, off_product_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '100g', $8) RETURNING *`,
      [name, d.category || product.category, estimated, product.calories_per_unit,
        product.protein_g, product.carbs_g, product.fat_g, d.code],
    );
    const stored = await storePrices(tx, ingredient.ingredient_id, prices);
    return { ingredient, stored };
  });

  res.status(201).json({
    ingredient: result.ingredient,
    pricesStored: result.stored,
    priceSource: d.estimated_unit_price !== undefined ? 'manual' : (prices.length && estimated ? 'Open Prices' : 'none'),
    ...(priceWarning ? { warning: priceWarning } : {}),
  });
}

// POST /api/external/prices/:ingredientId {code?}
// Refreshes prices for an existing ingredient and updates its estimated price.
async function refreshPrices(req, res) {
  const id = intParam(req.params.ingredientId, 'ingredientId');
  const d = validate(req.body, {
    code: { type: 'string', pattern: /^\d{4,32}$/, patternMessage: 'Barcode must be 4-32 digits', label: 'Barcode' },
  });
  const [ingredient] = await db.query('SELECT * FROM Ingredients WHERE ingredient_id = $1', [id]);
  if (!ingredient) throw ApiError.notFound('Ingredient');
  const code = d.code || ingredient.off_product_code;
  if (!code) throw ApiError.badRequest('This ingredient has no Open Food Facts barcode. Provide one in "code".');

  const prices = await off.getPrices(code);
  // Observations are normalised to 100g/100ml; scale to the ingredient's unit
  // when it is convertible, otherwise keep the existing price untouched.
  const per100 = off.estimateCadPrice(prices);
  const factor = { '100g': 1, '100ml': 1, kg: 10, l: 10 }[String(ingredient.base_unit).toLowerCase()];
  const estimate = per100 !== null && factor ? Math.round(per100 * factor * 100) / 100 : null;
  const stored = await db.transaction(async (tx) => {
    const n = await storePrices(tx, id, prices);
    await tx.query(
      `UPDATE Ingredients SET off_product_code = $2, estimated_unit_price = COALESCE($3, estimated_unit_price)
        WHERE ingredient_id = $1`,
      [id, code, estimate],
    );
    return n;
  });
  const [updated] = await db.query('SELECT * FROM Ingredients WHERE ingredient_id = $1', [id]);
  res.json({
    ingredient: updated,
    observationsFound: prices.length,
    pricesStored: stored,
    estimatedCadPerUnit: estimate,
    priceUpdated: estimate !== null,
  });
}

module.exports = { search, importProduct, refreshPrices };
