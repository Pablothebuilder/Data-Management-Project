// External REST/JSON API integration with Open Food Facts (free, no API key):
//   - Search API  : https://search.openfoodfacts.org/search        (product search)
//   - Product API : https://world.openfoodfacts.org/api/v2/product (nutrition facts)
//   - Open Prices : https://prices.openfoodfacts.org/api/v1/prices (crowd-sourced prices)
// All calls have a timeout and turn network/HTTP problems into 502 errors.
const config = require('../config/env');
const { ApiError } = require('../utils/errors');

const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const PRICES_URL = 'https://prices.openfoodfacts.org/api/v1/prices';

// Rough conversion so foreign-currency observations can still estimate a CAD
// price. Documented as an approximation in docs/IMPLEMENTATION_NOTES.md.
const TO_CAD = { CAD: 1, USD: 1.38, EUR: 1.5, GBP: 1.78, CHF: 1.6 };

async function getJson(url, what) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': config.offUserAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.externalTimeoutMs),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
    throw ApiError.badGateway(`${what} ${reason}. Check your internet connection and try again.`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw ApiError.badGateway(`${what} returned HTTP ${res.status}. Try again later.`);
  try {
    return await res.json();
  } catch {
    throw ApiError.badGateway(`${what} returned a response that is not valid JSON`);
  }
}

const CATEGORY_RULES = [
  [/seafood|fish|salmon|tuna|shrimp/, 'Seafood'],
  [/meat|poultry|chicken|beef|pork|turkey|sausage|ham/, 'Meat'],
  [/milk|dairy|chees|yogurt|yoghurt|butter|cream|egg/, 'Dairy'],
  [/bread|bakery|bagel|tortilla/, 'Bakery'],
  [/legume|bean|lentil|chickpea|tofu|soy/, 'Legumes'],
  [/cereal|grain|pasta|rice|oat|flour|quinoa/, 'Grains'],
  [/fruit|vegetable|produce|salad/, 'Produce'],
  [/oil|fat/, 'Oils & Fats'],
  [/spread|peanut|jam|honey/, 'Spreads'],
  [/snack|chip|cookie|biscuit|nut|chocolate|confection/, 'Snacks'],
  [/beverage|drink|juice|water|coffee|tea|soda/, 'Beverages'],
  [/sauce|condiment|canned|soup|spice|seasoning/, 'Pantry Staples'],
];

function mapCategory(tags = []) {
  const text = tags.filter((t) => t.startsWith('en:')).join(' ').toLowerCase();
  for (const [re, category] of CATEGORY_RULES) if (re.test(text)) return category;
  return 'Other';
}

function round1(n) {
  return Number.isFinite(Number(n)) ? Math.round(Number(n) * 10) / 10 : 0;
}

// Normalises a product from either API into the fields our Ingredients table uses
// (base unit = 100g, so nutrition per 100g maps 1:1).
function normaliseProduct(p) {
  const n = p.nutriments || {};
  return {
    code: p.code,
    name: (p.product_name || p.generic_name || '').trim() || `Product ${p.code}`,
    brands: Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands || ''),
    category: mapCategory(p.categories_tags),
    calories_per_unit: Math.round(Number(n['energy-kcal_100g']) || 0),
    protein_g: round1(n.proteins_100g),
    carbs_g: round1(n.carbohydrates_100g),
    fat_g: round1(n.fat_100g),
    base_unit: '100g',
    product_quantity: Number(p.product_quantity) || null,
    product_quantity_unit: p.product_quantity_unit || null,
    image_url: p.image_small_url || p.image_url || null,
  };
}

const FIELDS = 'code,product_name,generic_name,brands,categories_tags,nutriments,product_quantity,product_quantity_unit,image_small_url';

async function searchProducts(query, pageSize = 12) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&page_size=${pageSize}&fields=${FIELDS}`;
  const data = await getJson(url, 'Open Food Facts search');
  return (data?.hits || []).filter((p) => p.code).map(normaliseProduct);
}

async function getProduct(code) {
  const data = await getJson(`${PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`, 'Open Food Facts product lookup');
  if (!data || !data.product) return null;
  return normaliseProduct({ code, ...data.product });
}

// Converts one Open Prices observation into a price for 100g, when possible.
function pricePer100g(item) {
  const price = Number(item.price);
  if (!Number.isFinite(price)) return null;
  if (item.price_per === 'KILOGRAM') return price / 10;
  const qty = Number(item.product?.product_quantity);
  const unit = String(item.product?.product_quantity_unit || 'g').toLowerCase();
  if (qty > 0 && (unit === 'g' || unit === 'ml')) return price / (qty / 100);
  return null;
}

async function getPrices(code, size = 20) {
  const url = `${PRICES_URL}?product_code=${encodeURIComponent(code)}&size=${size}&order_by=-date`;
  const data = await getJson(url, 'Open Prices');
  return (data?.items || []).map((it) => ({
    product_code: it.product_code,
    product_name: it.product_name || it.product?.product_name || null,
    observed_price: Number(it.price),
    currency: String(it.currency || '').toUpperCase().slice(0, 3),
    price_per_base_unit: pricePer100g(it),
    observed_on: it.date || null,
  })).filter((p) => Number.isFinite(p.observed_price) && p.currency.length === 3);
}

// Median CAD price per 100g across observations whose currency we can convert.
function estimateCadPrice(prices) {
  const values = prices
    .filter((p) => p.price_per_base_unit !== null && TO_CAD[p.currency])
    .map((p) => p.price_per_base_unit * TO_CAD[p.currency])
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.round(median * 100) / 100;
}

module.exports = { searchProducts, getProduct, getPrices, estimateCadPrice, mapCategory, pricePer100g };
