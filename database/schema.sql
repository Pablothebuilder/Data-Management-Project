CREATE TABLE Users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'User' CHECK (role IN ('Admin', 'User', 'Guest')),
    weekly_budget_limit NUMERIC(10, 2) NOT NULL CHECK (weekly_budget_limit >= 0),
    target_calories INT CHECK (target_calories > 0)
);

CREATE TABLE Ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    estimated_unit_price NUMERIC(10, 2) NOT NULL CHECK (estimated_unit_price >= 0),
    calories_per_unit INT NOT NULL CHECK (calories_per_unit >= 0),
    protein_g NUMERIC(5, 1) DEFAULT 0,
    carbs_g NUMERIC(5, 1) DEFAULT 0,
    fat_g NUMERIC(5, 1) DEFAULT 0
);

CREATE TABLE PantryItems (
    pantry_item_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES Ingredients(ingredient_id) ON DELETE CASCADE,
    quantity_on_hand NUMERIC(10, 2) NOT NULL CHECK (quantity_on_hand >= 0),
    unit VARCHAR(20) NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ingredient_id)
);

CREATE TABLE Recipes (
    recipe_id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    prep_time_mins INT CHECK (prep_time_mins > 0),
    servings INT CHECK (servings > 0),
    created_by_user INT REFERENCES Users(user_id) ON DELETE SET NULL
);

CREATE TABLE RecipeIngredients (
    recipe_id INT NOT NULL REFERENCES Recipes(recipe_id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES Ingredients(ingredient_id) ON DELETE CASCADE,
    required_quantity NUMERIC(10, 2) NOT NULL CHECK (required_quantity > 0),
    unit VARCHAR(20) NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE TABLE MealPlans (
    plan_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    recipe_id INT NOT NULL REFERENCES Recipes(recipe_id) ON DELETE CASCADE,
    planned_date DATE NOT NULL,
    meal_type VARCHAR(20) CHECK (meal_type IN ('Breakfast', 'Lunch', 'Dinner', 'Snack'))
);

CREATE TABLE GroceryLists (
    list_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    max_budget NUMERIC(10, 2) NOT NULL CHECK (max_budget >= 0),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Archived'))
);

CREATE TABLE ListItems (
    item_id SERIAL PRIMARY KEY,
    list_id INT NOT NULL REFERENCES GroceryLists(list_id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES Ingredients(ingredient_id) ON DELETE CASCADE,
    quantity_to_buy NUMERIC(10, 2) NOT NULL CHECK (quantity_to_buy > 0),
    estimated_unit_price NUMERIC(10, 2) NOT NULL CHECK (estimated_unit_price >= 0),
    is_purchased BOOLEAN DEFAULT FALSE,
    UNIQUE(list_id, ingredient_id)
);
