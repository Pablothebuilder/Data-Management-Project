-- =====================================================================
-- NutriCart SmartPantry - Phase II Part B: sample data
-- Every relation has at least 6 tuples. Meal plan dates and list dates
-- are relative to CURRENT_DATE so the "upcoming week" views and charts
-- always have data, whenever the database is (re)seeded.
--
-- Demo logins (test values only):
--   admin@nutricart.test / Admin123!      (Admin)
--   sam@nutricart.test   / User123!       (User; also priya, marcus, jordan, nina)
--   guest@nutricart.test / Guest123!      (Guest)
-- =====================================================================

INSERT INTO Users (user_id, name, email, role, weekly_budget_limit, target_calories, password_hash) VALUES
 (1, 'Alice Admin',   'admin@nutricart.test',  'Admin', 150.00, 2200, 'scrypt$0cc966cf44b4802fc5b3da362f413d40$14a17d4d0916f74767680f4fe74d990210abfb9330bd9065ab7941865bb97e5efb03d5dc3fc38f355d1a9acc6947abbb8a01b1296903fafb88024024e3d0dd3a'),
 (2, 'Sam Student',   'sam@nutricart.test',    'User',   75.00, 2400, 'scrypt$dc8702326b6f74b85266631bf6a394a8$af3878146f57d39d5414ee8829f165a1b26ea3bfea3ecf7b254564ad1d950c91a6a28f9c0106ff27af22d2d042c913fabc0f7735e5a5b9311c45a63c496b2fdb'),
 (3, 'Priya Patel',   'priya@nutricart.test',  'User',  120.00, 1800, 'scrypt$dc8702326b6f74b85266631bf6a394a8$af3878146f57d39d5414ee8829f165a1b26ea3bfea3ecf7b254564ad1d950c91a6a28f9c0106ff27af22d2d042c913fabc0f7735e5a5b9311c45a63c496b2fdb'),
 (4, 'Marcus Lee',    'marcus@nutricart.test', 'User',   60.00, 2600, 'scrypt$dc8702326b6f74b85266631bf6a394a8$af3878146f57d39d5414ee8829f165a1b26ea3bfea3ecf7b254564ad1d950c91a6a28f9c0106ff27af22d2d042c913fabc0f7735e5a5b9311c45a63c496b2fdb'),
 (5, 'Jordan Kim',    'jordan@nutricart.test', 'User',   90.00, 2000, 'scrypt$dc8702326b6f74b85266631bf6a394a8$af3878146f57d39d5414ee8829f165a1b26ea3bfea3ecf7b254564ad1d950c91a6a28f9c0106ff27af22d2d042c913fabc0f7735e5a5b9311c45a63c496b2fdb'),
 (6, 'Gabe Guest',    'guest@nutricart.test',  'Guest',   0.00, NULL, 'scrypt$fdaa11ef13a5b395440a30e78ce4258c$7c506f382bba42a2249e4d8c23eb2bf3d31e1468afa37a7e316749fb253782509719e4f49d905323bbbeebbabe227deaac95488ff878b0ac9cc5953c1057c2a7'),
 (7, 'Nina Novak',    'nina@nutricart.test',   'User',  100.00, 2100, 'scrypt$dc8702326b6f74b85266631bf6a394a8$af3878146f57d39d5414ee8829f165a1b26ea3bfea3ecf7b254564ad1d950c91a6a28f9c0106ff27af22d2d042c913fabc0f7735e5a5b9311c45a63c496b2fdb');

-- price / calories / macros are per base_unit
INSERT INTO Ingredients (ingredient_id, name, category, estimated_unit_price, calories_per_unit, protein_g, carbs_g, fat_g, base_unit) VALUES
 (1,  'Rolled Oats',       'Grains',         0.40, 389, 16.9, 66.3,  6.9, '100g'),
 (2,  'Whole Milk',        'Dairy',          1.60, 610, 32.0, 48.0, 33.0, 'L'),
 (3,  'Eggs',              'Dairy',          0.35,  72,  6.3,  0.4,  4.8, 'each'),
 (4,  'Chicken Breast',    'Meat',           1.65, 165, 31.0,  0.0,  3.6, '100g'),
 (5,  'Brown Rice',        'Grains',         0.30, 370,  7.9, 77.0,  2.9, '100g'),
 (6,  'Broccoli',          'Produce',        0.55,  34,  2.8,  6.6,  0.4, '100g'),
 (7,  'Banana',            'Produce',        0.30, 105,  1.3, 27.0,  0.4, 'each'),
 (8,  'Greek Yogurt',      'Dairy',          0.90,  97,  9.0,  3.6,  5.0, '100g'),
 (9,  'Spinach',           'Produce',        0.80,  23,  2.9,  3.6,  0.4, '100g'),
 (10, 'Salmon Fillet',     'Seafood',        3.20, 208, 20.0,  0.0, 13.0, '100g'),
 (11, 'Whole Wheat Pasta', 'Grains',         0.45, 348, 14.6, 72.0,  2.5, '100g'),
 (12, 'Canned Tomatoes',   'Pantry Staples', 0.35,  32,  1.6,  7.0,  0.3, '100g'),
 (13, 'Olive Oil',         'Oils & Fats',    0.25, 119,  0.0,  0.0, 13.5, 'tbsp'),
 (14, 'Black Beans',       'Legumes',        0.30, 132,  8.9, 23.7,  0.5, '100g'),
 (15, 'Cheddar Cheese',    'Dairy',          1.50, 403, 25.0,  1.3, 33.0, '100g'),
 (16, 'Whole Wheat Bread', 'Bakery',         0.30,  81,  4.0, 13.8,  1.1, 'slice'),
 (17, 'Peanut Butter',     'Spreads',        0.20,  94,  4.0,  3.2,  8.0, 'tbsp'),
 (18, 'Firm Tofu',         'Legumes',        0.60, 144, 17.3,  2.8,  8.7, '100g'),
 (19, 'Yellow Onion',      'Produce',        0.40,  44,  1.2, 10.3,  0.1, 'each'),
 (20, 'Garlic',            'Produce',        0.10,   4,  0.2,  1.0,  0.0, 'clove'),
 (21, 'Quinoa',            'Grains',         0.90, 368, 14.1, 64.0,  6.1, '100g'),
 (22, 'Almonds',           'Snacks',         2.20, 579, 21.2, 21.6, 49.9, '100g');

INSERT INTO Recipes (recipe_id, title, prep_time_mins, servings, created_by_user) VALUES
 (1, 'Overnight Oats',                5, 1, 2),
 (2, 'Chicken & Broccoli Rice Bowl', 25, 2, 3),
 (3, 'Spinach Cheddar Omelette',     10, 1, 2),
 (4, 'Garlic Salmon with Rice',      30, 2, 1),
 (5, 'Pasta Pomodoro',               20, 3, 4),
 (6, 'Tofu Black Bean Stir-Fry',     20, 2, 5),
 (7, 'Peanut Butter Banana Toast',    5, 1, NULL),
 (8, 'Greek Yogurt & Banana',         3, 1, NULL),
 (9, 'Hard-Boiled Eggs',             12, 1, NULL),
 (10, 'Spinach Banana Smoothie',      5, 1, 7),
 (11, 'Handful of Almonds',           1, 1, NULL);

INSERT INTO RecipeIngredients (recipe_id, ingredient_id, required_quantity, unit) VALUES
 (1, 1, 0.80, '100g'), (1, 2, 0.25, 'L'), (1, 7, 1, 'each'), (1, 8, 1, '100g'), (1, 17, 1, 'tbsp'),
 (2, 4, 3, '100g'), (2, 5, 1.5, '100g'), (2, 6, 2, '100g'), (2, 13, 1, 'tbsp'), (2, 20, 2, 'clove'),
 (3, 3, 3, 'each'), (3, 9, 0.5, '100g'), (3, 15, 0.3, '100g'), (3, 13, 0.5, 'tbsp'),
 (4, 10, 3, '100g'), (4, 5, 1.5, '100g'), (4, 6, 1.5, '100g'), (4, 13, 1, 'tbsp'), (4, 20, 2, 'clove'),
 (5, 11, 2.5, '100g'), (5, 12, 4, '100g'), (5, 19, 1, 'each'), (5, 20, 3, 'clove'), (5, 13, 2, 'tbsp'), (5, 15, 0.5, '100g'),
 (6, 18, 3, '100g'), (6, 14, 2, '100g'), (6, 19, 1, 'each'), (6, 9, 1, '100g'), (6, 5, 1.5, '100g'), (6, 13, 1, 'tbsp'),
 (7, 16, 2, 'slice'), (7, 17, 2, 'tbsp'), (7, 7, 1, 'each'),
 (8, 8, 1.5, '100g'), (8, 7, 0.5, 'each'),
 (9, 3, 2, 'each'),
 (10, 9, 0.5, '100g'), (10, 7, 1, 'each'), (10, 2, 0.25, 'L'),
 (11, 22, 0.3, '100g');

INSERT INTO PantryItems (user_id, ingredient_id, quantity_on_hand, unit) VALUES
 (2, 1, 5, '100g'), (2, 2, 1, 'L'), (2, 3, 6, 'each'), (2, 7, 2, 'each'), (2, 17, 10, 'tbsp'), (2, 16, 8, 'slice'), (2, 9, 1, '100g'),
 (3, 4, 4, '100g'), (3, 5, 10, '100g'), (3, 6, 1, '100g'), (3, 13, 20, 'tbsp'), (3, 20, 10, 'clove'), (3, 21, 5, '100g'),
 (4, 11, 5, '100g'), (4, 12, 4, '100g'), (4, 19, 2, 'each'), (4, 15, 2, '100g'),
 (5, 18, 2, '100g'), (5, 14, 4, '100g'), (5, 5, 3, '100g'),
 (1, 10, 2, '100g'), (1, 5, 5, '100g');

INSERT INTO MealPlans (user_id, recipe_id, planned_date, meal_type) VALUES
 (2, 1, CURRENT_DATE,     'Breakfast'), (2, 1, CURRENT_DATE + 1, 'Breakfast'), (2, 1, CURRENT_DATE + 2, 'Breakfast'),
 (2, 3, CURRENT_DATE + 3, 'Breakfast'), (2, 7, CURRENT_DATE,     'Snack'),     (2, 2, CURRENT_DATE + 1, 'Dinner'),
 (2, 5, CURRENT_DATE + 2, 'Dinner'),    (2, 7, CURRENT_DATE - 1, 'Snack'),     (2, 3, CURRENT_DATE - 2, 'Breakfast'),
 (3, 2, CURRENT_DATE,     'Lunch'),     (3, 2, CURRENT_DATE + 2, 'Lunch'),     (3, 4, CURRENT_DATE + 1, 'Dinner'),
 (3, 1, CURRENT_DATE + 3, 'Breakfast'), (3, 8, CURRENT_DATE,     'Snack'),
 (4, 5, CURRENT_DATE,     'Dinner'),    (4, 5, CURRENT_DATE + 1, 'Dinner'),    (4, 5, CURRENT_DATE + 3, 'Dinner'),
 (4, 7, CURRENT_DATE,     'Breakfast'),
 (5, 6, CURRENT_DATE,     'Dinner'),    (5, 6, CURRENT_DATE + 2, 'Dinner'),    (5, 1, CURRENT_DATE + 1, 'Breakfast'),
 (1, 4, CURRENT_DATE + 4, 'Dinner'),    (1, 3, CURRENT_DATE - 2, 'Breakfast');

INSERT INTO GroceryLists (list_id, user_id, created_at, max_budget, status) VALUES
 (1, 2, CURRENT_TIMESTAMP - INTERVAL '1 day',   75.00, 'Active'),
 (2, 2, CURRENT_TIMESTAMP - INTERVAL '8 days',  70.00, 'Completed'),
 (3, 3, CURRENT_TIMESTAMP - INTERVAL '1 day',  120.00, 'Active'),
 (4, 4, CURRENT_TIMESTAMP - INTERVAL '2 days',  60.00, 'Active'),
 (5, 5, CURRENT_TIMESTAMP - INTERVAL '10 days', 90.00, 'Archived'),
 (6, 1, CURRENT_TIMESTAMP - INTERVAL '3 days', 150.00, 'Active'),
 (7, 4, CURRENT_TIMESTAMP - INTERVAL '9 days',  20.00, 'Completed');

INSERT INTO ListItems (list_id, ingredient_id, quantity_to_buy, estimated_unit_price, is_purchased) VALUES
 (1, 7, 2, 0.30, FALSE), (1, 8, 3, 0.90, FALSE), (1, 4, 3, 1.65, TRUE), (1, 11, 2.5, 0.45, FALSE),
 (2, 1, 5, 0.40, TRUE), (2, 2, 1, 1.60, TRUE), (2, 16, 8, 0.30, TRUE),
 (3, 4, 2, 1.65, FALSE), (3, 6, 3, 0.55, FALSE), (3, 1, 1, 0.40, FALSE),
 (4, 15, 1, 1.50, TRUE), (4, 20, 3, 0.10, FALSE),
 (5, 18, 3, 0.60, TRUE), (5, 14, 2, 0.30, TRUE),
 (6, 10, 4, 3.20, FALSE), (6, 6, 2, 0.55, FALSE),
 (7, 10, 6, 3.20, TRUE), (7, 15, 2, 1.50, TRUE);

INSERT INTO IngredientPriceHistory (ingredient_id, source, product_code, product_name, observed_price, currency, price_per_base_unit, observed_on, fetched_at) VALUES
 (2, 'Sample data', NULL, 'Whole Milk 4L', 6.29, 'CAD', 1.5725, CURRENT_DATE - 60, CURRENT_TIMESTAMP - INTERVAL '60 days'),
 (2, 'Sample data', NULL, 'Whole Milk 4L', 6.49, 'CAD', 1.6225, CURRENT_DATE - 45, CURRENT_TIMESTAMP - INTERVAL '45 days'),
 (2, 'Sample data', NULL, 'Whole Milk 4L', 6.39, 'CAD', 1.5975, CURRENT_DATE - 30, CURRENT_TIMESTAMP - INTERVAL '30 days'),
 (2, 'Sample data', NULL, 'Whole Milk 4L', 6.59, 'CAD', 1.6475, CURRENT_DATE - 15, CURRENT_TIMESTAMP - INTERVAL '15 days'),
 (2, 'Sample data', NULL, 'Whole Milk 4L', 6.40, 'CAD', 1.6000, CURRENT_DATE - 2,  CURRENT_TIMESTAMP - INTERVAL '2 days'),
 (10, 'Sample data', NULL, 'Atlantic Salmon Fillet 1kg', 31.99, 'CAD', 3.1990, CURRENT_DATE - 20, CURRENT_TIMESTAMP - INTERVAL '20 days'),
 (10, 'Sample data', NULL, 'Atlantic Salmon Fillet 1kg', 32.49, 'CAD', 3.2490, CURRENT_DATE - 5,  CURRENT_TIMESTAMP - INTERVAL '5 days');

-- Explicit ids were used above, so move each SERIAL sequence past them.
SELECT setval(pg_get_serial_sequence('users', 'user_id'),             (SELECT MAX(user_id) FROM Users));
SELECT setval(pg_get_serial_sequence('ingredients', 'ingredient_id'), (SELECT MAX(ingredient_id) FROM Ingredients));
SELECT setval(pg_get_serial_sequence('recipes', 'recipe_id'),         (SELECT MAX(recipe_id) FROM Recipes));
SELECT setval(pg_get_serial_sequence('grocerylists', 'list_id'),      (SELECT MAX(list_id) FROM GroceryLists));
