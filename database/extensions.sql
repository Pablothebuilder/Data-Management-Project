-- =====================================================================
-- NutriCart SmartPantry - Phase III schema extensions
-- Applied AFTER schema.sql. The Phase II tables are left untouched; this
-- file only adds what the web application needs on top of them.
-- See docs/IMPLEMENTATION_NOTES.md for the reasoning behind each change.
-- =====================================================================

-- 1. Authentication: the Phase II Users table has no credential column.
--    Passwords are stored as salted scrypt hashes: "scrypt$<salt>$<hash>".
ALTER TABLE Users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE Users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Units: Ingredients store price and calories "per unit" but never say
--    what the unit is. base_unit makes that explicit (e.g. '100g', 'each',
--    'L', 'tbsp'); pantry, recipe and list quantities use the same unit.
ALTER TABLE Ingredients ADD COLUMN IF NOT EXISTS base_unit VARCHAR(20) NOT NULL DEFAULT 'unit';

-- 3. Link to the external Open Food Facts product an ingredient was imported from.
ALTER TABLE Ingredients ADD COLUMN IF NOT EXISTS off_product_code VARCHAR(32);

-- 4. Price observations fetched from the external Open Prices REST API.
CREATE TABLE IF NOT EXISTS IngredientPriceHistory (
    price_id SERIAL PRIMARY KEY,
    ingredient_id INT NOT NULL REFERENCES Ingredients(ingredient_id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL DEFAULT 'Open Prices',
    product_code VARCHAR(32),
    product_name VARCHAR(200),
    observed_price NUMERIC(10, 2) NOT NULL CHECK (observed_price >= 0),
    currency CHAR(3) NOT NULL,
    price_per_base_unit NUMERIC(10, 4) CHECK (price_per_base_unit >= 0),
    observed_on DATE,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Indexes for the search / filter endpoints and the common joins.
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON Ingredients (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON Ingredients (category);
CREATE INDEX IF NOT EXISTS idx_pantry_user ON PantryItems (user_id);
CREATE INDEX IF NOT EXISTS idx_mealplans_user_date ON MealPlans (user_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_recipeingredients_ingredient ON RecipeIngredients (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_grocerylists_user ON GroceryLists (user_id);
CREATE INDEX IF NOT EXISTS idx_listitems_list ON ListItems (list_id);
CREATE INDEX IF NOT EXISTS idx_pricehistory_ingredient ON IngredientPriceHistory (ingredient_id, fetched_at);
