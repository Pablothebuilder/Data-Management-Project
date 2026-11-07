# NutriCart SmartPantry: User Guide

This guide follows the normal path of a new user: set up, stock the pantry, add recipes, plan the week, shop, and keep on track day to day. The pages in the top menu are in the same order as these steps.

---

## 1. Create an account

1. Open the app and click **Create account**.
2. Enter your name, email, a password of at least 8 characters, your **weekly grocery budget**, and (optionally) your **daily calorie target**.
3. You are logged in and taken to the **Dashboard**, which shows a **Getting started** checklist:
   1. Set your weekly budget and daily calorie target
   2. Add what is already in your pantry
   3. Add a recipe of your own (optional)
   4. Plan your meals for the next 7 days
   5. Generate a grocery list from your plan

   Each step links to the right page. Finished steps are crossed off, and the box disappears once all five are done.

You can change your budget, calorie target, name, email or password at any time under **Account** (top right).

> Just looking? Click **Continue as guest** on the login page. Guests can browse recipes, ingredients and the catalog reports, but cannot save anything.

## 2. Stock your pantry (Pantry page)

1. Under **Add an item**, start typing an ingredient name and pick it from the suggestions. The **unit** fills in automatically (for example `100g`, `each`, `tbsp`), because each ingredient is always measured in one unit.
2. Enter the quantity and click **Add to pantry**. If the item is already in your pantry, the amount is added to what you have.
3. To correct an amount, change it in the **What I have** table and click **Save** (or press Enter). **Remove** deletes the item.

Your pantry also updates by itself:
- **Completing a grocery list** adds everything you ticked as bought.
- **Marking a meal as Cooked** in the meal planner uses up that recipe's ingredients.

The page also shows:
- **Running low for planned meals**: items you have, but not enough of, for the meals you have planned (View 3).
- **Not used by your meal plan**: things you have that none of your upcoming meals use, so they may go to waste (View 5). *Use it in* links to the recipes that contain the item, or invites you to add your own recipe if none do.
- **Pantry by category**: how many items you have and what they are worth, per category (View 8).

If an ingredient is not in the catalog, add it on the **Ingredients** page first (see section 7).

## 3. Add your own recipes (Recipes page)

1. Click **Add my own recipe**.
2. Enter a name, prep time and number of servings.
3. Add ingredients one row at a time. Pick each ingredient from the suggestions and enter the quantity in its unit. Use **Add another ingredient** for more rows. Calories and cost per serving update as you type.
4. Click **Create recipe**. The app immediately asks whether you want to **add it to your meal plan**. Pick a date and meal, or close the box and plan it later.

Your recipes show the label *mine*. Only you (or an admin) can edit or delete them.

To find recipes, use the search box and filters: an ingredient the recipe contains, maximum prep time, maximum cost per serving, and **My recipes only**. *Sort by: Most ingredients in my pantry* puts recipes you can almost make already at the top.

## 4. Plan your meals (Meal Planner page)

The planner is a table: one row per day for the next 7 days, and one column each for Breakfast, Lunch, Dinner and Snack. The right-hand column shows the day's calories against your target. A day over target is shown in red.

To add a meal, do either of these:
- Click **Add** in the cell you want (for example Tuesday / Dinner). The form at the top fills in that date and meal, so you only choose the recipe.
- Or click **Plan** next to any recipe on the Recipes page.

Each planned meal has four actions:
- **Cooked**: you made it. Its ingredients are taken out of your pantry and the meal leaves the plan.
- **Edit**: change the date, meal or recipe.
- **Cheaper swap**: lists recipes that cost less per serving than this meal and still have at least 60% of its calories (so a dinner isn't swapped for a snack), with how much you save. **Swap** replaces the meal in one click (View 2).
- **Remove**: delete it from the plan.

Use **Previous week / This week / Next week** to move around. *Search planned meals* finds meals by recipe name, date range or meal type.

## 5. Make a grocery list and go shopping (Grocery List page)

The page is laid out as three steps:

1. **Choose the days you are shopping for.** It defaults to the next 7 days. The budget defaults to your weekly budget, and you can type a different one.
2. **Review what you need to buy.** The app adds up the ingredients for every meal planned in those days, subtracts what is already in your pantry, and shows what is left to buy and what it costs. A bar shows the total against your budget. If you are over, it says by how much and points you to **Cheaper swap** in the meal planner. Change the days and the review updates. When it looks right, click **Create grocery list**.
3. **Shop with the list.** Tick each item as you buy it. You can add extra items or remove ones you don't need. When you are done, click **Complete list**: everything you ticked is added to your pantry, and the list is kept as a record.

**My lists** at the bottom shows all your lists with their totals, budget and how much has been bought (View 7). Lists can be exported to CSV or PDF, or viewed as XML.

## 6. Stay on track day to day (Dashboard)

- **Today**: the calories you have planned today against your target, and how many are left.
- **Light snack ideas**: recipes of 300 kcal or less per serving, lowest first, with protein and cost. *Fits today?* tells you whether a snack fits in your remaining calories. **Add as snack today** puts it in today's plan, and the numbers update straight away.
- **Running low for planned meals**: the same warning as on the Pantry page, with a link to make a grocery list.
- **Calories planned, next 7 days**: a bar per day, with your target as a dashed line.
- **Highest-protein recipes**: the six recipes with the most protein per serving.
- **Most-planned ingredients**: the ingredients that appear most often across everyone's meal plans.

*Example:* you are hungry in the afternoon. Open the Dashboard, see that you have 1,266 kcal left, pick *Hard-Boiled Eggs* (144 kcal, marked "Yes" under *Fits today?*), and click **Add as snack today**.

## 7. The ingredient catalog (Ingredients page)

All users share one catalog. For each ingredient it shows the unit, price, calories and macros per unit, plus **Used in** (how many recipes use it) and **Households** (how many users have it in their pantry), both from View 4. The **Usage** filter finds ingredients used in recipes, not used in any recipe, or needed by recipes but stocked by nobody.

To add an ingredient:
- **Import from Open Food Facts**: search for a real product (for example "greek yogurt"), click **Import**, check the name and category, and save. Nutrition per 100 g comes from Open Food Facts. The price comes from Open Prices if any have been recorded, or you can type one.
- **Add ingredient by hand**: enter the values yourself.

**Prices** shows an ingredient's price history and can fetch the latest prices from Open Prices. Only admins can edit or delete catalog ingredients.

## 8. Reports

The **Reports** page runs each of the 10 database views and shows the result as a table. You can filter, sort, see the SQL, and export to CSV or PDF. Each view lists where it is used in the app. Regular users only see their own rows. Guests only see the catalog views (4, 9). View 10 is admin-only.

## 9. Admin

Admins see an **Admin** page with every user and their activity (pantry items, meals in the next 7 days, active lists and recipes, from View 10). There they can create users, change roles and budgets, reset passwords, and delete users. Admins cannot delete themselves or remove their own admin role.
