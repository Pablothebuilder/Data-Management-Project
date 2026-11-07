// REST/JSON API routes. Every route is mounted under /api.
//
// Access summary:   (G = Guest, U = User, A = Admin)
//   auth ............ public
//   ingredients ..... read G/U/A, create U/A, update/delete A
//   recipes ......... read G/U/A, create U/A, update/delete author or A
//   pantry, meal plans, grocery lists ... U/A (own data; A may pass ?userId=)
//   views ........... per-view (see services/viewRegistry.js)
//   users ........... A (plus /users/me for everyone logged in)
//   external ........ search G/U/A, import/refresh U/A
const express = require('express');
const { asyncHandler: h } = require('../utils/errors');
const { requireAuth, requireWriter, requireAdmin } = require('../middleware/auth');

const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const ingredients = require('../controllers/ingredientController');
const recipes = require('../controllers/recipeController');
const pantry = require('../controllers/pantryController');
const plans = require('../controllers/mealPlanController');
const lists = require('../controllers/groceryListController');
const views = require('../controllers/viewController');
const stats = require('../controllers/statsController');
const external = require('../controllers/externalController');
const exporter = require('../controllers/exportController');

const router = express.Router();

// --- Authentication ---------------------------------------------------------
router.post('/auth/login', h(auth.login));
router.post('/auth/guest', h(auth.guestLogin));
router.post('/auth/register', h(auth.register));
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);

// Everything below requires a session.
router.use(requireAuth);

// --- Users ------------------------------------------------------------------
router.get('/users/me', h(users.getProfile));
router.put('/users/me', requireWriter, h(users.updateProfile));
router.get('/users', requireAdmin, h(users.list));
router.get('/users/:id', requireAdmin, h(users.getOne));
router.post('/users', requireAdmin, h(users.create));
router.put('/users/:id', requireAdmin, h(users.update));
router.delete('/users/:id', requireAdmin, h(users.remove));

// --- Ingredients ------------------------------------------------------------
router.get('/ingredients', h(ingredients.list));
router.get('/ingredients/categories', h(ingredients.categories));
router.get('/ingredients/:id', h(ingredients.getOne));
router.get('/ingredients/:id/prices', h(ingredients.priceHistory));
router.post('/ingredients', requireWriter, h(ingredients.create));
router.put('/ingredients/:id', requireAdmin, h(ingredients.update));
router.delete('/ingredients/:id', requireAdmin, h(ingredients.remove));

// --- Recipes ----------------------------------------------------------------
router.get('/recipes', h(recipes.list));
router.get('/recipes/:id', h(recipes.getOne));
router.post('/recipes', requireWriter, h(recipes.create));
router.put('/recipes/:id', requireWriter, h(recipes.update));
router.delete('/recipes/:id', requireWriter, h(recipes.remove));

// --- Pantry -----------------------------------------------------------------
router.get('/pantry', requireWriter, h(pantry.list));
router.get('/pantry/shortfalls', requireWriter, h(pantry.shortfalls));
router.get('/pantry/summary', requireWriter, h(pantry.summary));
router.get('/pantry/:id', requireWriter, h(pantry.getOne));
router.post('/pantry', requireWriter, h(pantry.create));
router.put('/pantry/:id', requireWriter, h(pantry.update));
router.delete('/pantry/:id', requireWriter, h(pantry.remove));

// --- Meal plans -------------------------------------------------------------
router.get('/meal-plans', requireWriter, h(plans.list));
router.get('/meal-plans/:id', requireWriter, h(plans.getOne));
router.post('/meal-plans', requireWriter, h(plans.create));
router.put('/meal-plans/:id', requireWriter, h(plans.update));
router.delete('/meal-plans/:id', requireWriter, h(plans.remove));
router.post('/meal-plans/:id/cook', requireWriter, h(plans.cook));

// --- Grocery lists ----------------------------------------------------------
router.get('/grocery-lists', requireWriter, h(lists.list));
router.get('/grocery-lists/preview', requireWriter, h(lists.preview));
router.post('/grocery-lists/generate', requireWriter, h(lists.generate));
router.get('/grocery-lists/:id', requireWriter, h(lists.getOne));
router.get('/grocery-lists/:id/xml', requireWriter, h(lists.xml));
router.post('/grocery-lists', requireWriter, h(lists.create));
router.put('/grocery-lists/:id', requireWriter, h(lists.update));
router.delete('/grocery-lists/:id', requireWriter, h(lists.remove));
router.post('/grocery-lists/:id/complete', requireWriter, h(lists.complete));
router.post('/grocery-lists/:id/items', requireWriter, h(lists.addItem));
router.put('/grocery-lists/:id/items/:itemId', requireWriter, h(lists.updateItem));
router.delete('/grocery-lists/:id/items/:itemId', requireWriter, h(lists.removeItem));

// --- Views, statistics, export ----------------------------------------------
router.get('/views', views.listViews);
router.get('/views/:name', h(views.getView));
router.get('/stats/overview', h(stats.overview));
router.get('/stats/dashboard', requireWriter, h(stats.dashboard));
router.get('/export/:dataset', h(exporter.exportData));

// --- External API (Open Food Facts) -----------------------------------------
router.get('/external/products', h(external.search));
router.post('/external/import', requireWriter, h(external.importProduct));
router.post('/external/prices/:ingredientId', requireWriter, h(external.refreshPrices));

module.exports = router;
