// End-to-end API tests. Run with:  npm test   (from /backend)
// Uses a throw-away in-memory embedded PostgreSQL, so no setup is needed and
// the real database is never touched. External API calls are not tested here
// (they need internet access); see docs/IMPLEMENTATION_NOTES.md.
process.env.NODE_ENV = 'test';
process.env.PGLITE_DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const { ensureDatabase } = require('../src/config/setup');
const { createApp } = require('../src/app');

let server;
let base;

// Minimal cookie-aware client so each "browser" keeps its own session.
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
    login: (email, password) => call('POST', '/api/auth/login', { email, password }),
  };
}

before(async () => {
  await db.connect();
  await ensureDatabase({ log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.close();
});

test('rejects unauthenticated API access and redirects pages to login', async () => {
  const c = client();
  assert.equal((await c.get('/api/pantry')).status, 401);
  const page = await c.get('/pantry');
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /^\/login/);
});

test('login validation and wrong passwords', async () => {
  const c = client();
  const bad = await c.post('/api/auth/login', { email: 'not-an-email', password: 'x' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.details[0].field, 'email');
  assert.equal((await c.login('sam@nutricart.test', 'wrong-password')).status, 401);
  const ok = await c.login('SAM@nutricart.test', 'User123!');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'User');
  assert.equal((await c.get('/api/auth/me')).data.user.email, 'sam@nutricart.test');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('registration creates a User and rejects duplicates / weak passwords', async () => {
  const c = client();
  const weak = await c.post('/api/auth/register', { name: 'T', email: 't@x.test', password: 'short', weekly_budget_limit: 10 });
  assert.equal(weak.status, 400);
  const res = await c.post('/api/auth/register', { name: 'Test Person', email: 'test@x.test', password: 'password123', weekly_budget_limit: 50, role: 'Admin' });
  assert.equal(res.status, 201);
  assert.equal(res.data.user.role, 'User', 'self-registration can never grant Admin');
  const dup = await client().post('/api/auth/register', { name: 'Again', email: 'test@x.test', password: 'password123', weekly_budget_limit: 5 });
  assert.equal(dup.status, 409);
});

test('role-based access control', async () => {
  const guest = client();
  await guest.post('/api/auth/guest');
  assert.equal((await guest.get('/api/ingredients')).status, 200);
  assert.equal((await guest.get('/api/pantry')).status, 403);
  assert.equal((await guest.post('/api/ingredients', {})).status, 403);
  assert.equal((await guest.get('/api/views/v_budget_friendly_recipes')).status, 200);
  assert.equal((await guest.get('/api/views/v_pantry_shortfalls')).status, 403);
  assert.equal((await guest.get('/admin')).status, 302);

  const user = client();
  await user.login('sam@nutricart.test', 'User123!');
  assert.equal((await user.get('/api/users')).status, 403);
  assert.equal((await user.del('/api/ingredients/1')).status, 403);
  assert.equal((await user.get('/api/views/10')).status, 403);
  // Users only see their own rows in per-user views.
  const v1 = await user.get('/api/views/1');
  assert.ok(v1.data.rows.length > 0);
  assert.ok(v1.data.rows.every((r) => r.user_id === 2));

  const admin = client();
  await admin.login('admin@nutricart.test', 'Admin123!');
  assert.equal((await admin.get('/api/users')).data.users.length >= 7, true);
  const all = await admin.get('/api/views/1');
  assert.ok(new Set(all.data.rows.map((r) => r.user_id)).size > 1);
});

test('all 10 views run and return rows for an admin', async () => {
  const admin = client();
  await admin.login('admin@nutricart.test', 'Admin123!');
  const { data } = await admin.get('/api/views');
  assert.equal(data.views.length, 10);
  for (const v of data.views) {
    const res = await admin.get(`/api/views/${v.name}`);
    assert.equal(res.status, 200, v.name);
    assert.ok(res.data.rows.length > 0, `${v.name} returned no rows`);
    assert.match(res.data.view.sql, /CREATE OR REPLACE VIEW/);
  }
  // FULL JOIN view keeps both "stocked only" and "needed only" ingredients.
  const v4 = await admin.get('/api/views/4');
  const statuses = new Set(v4.data.rows.map((r) => r.status));
  assert.ok(statuses.has('Stocked, not used by any recipe'));
  assert.ok(statuses.has('Needed by recipes, not stocked'));
});

test('pantry CRUD, upsert and filters', async () => {
  const c = client();
  await c.login('nina@nutricart.test', 'User123!');
  assert.equal((await c.get('/api/pantry')).data.items.length, 0);
  const add = await c.post('/api/pantry', { ingredient_id: 1, quantity_on_hand: 2 });
  assert.equal(add.status, 201);
  assert.equal(add.data.item.unit, '100g', 'unit defaults to the ingredient base unit');
  const again = await c.post('/api/pantry', { ingredient_id: 1, quantity_on_hand: 3 });
  assert.equal(again.data.item.quantity_on_hand, 5, 'adding an existing ingredient tops it up');
  const id = add.data.item.pantry_item_id;
  assert.equal((await c.put(`/api/pantry/${id}`, { quantity_on_hand: -1 })).status, 400);
  assert.equal((await c.put(`/api/pantry/${id}`, { quantity_on_hand: 1.5 })).data.item.quantity_on_hand, 1.5);
  assert.equal((await c.get('/api/pantry?q=oat')).data.items.length, 1);
  assert.equal((await c.get('/api/pantry?category=Dairy')).data.items.length, 0);
  // Nina cannot touch Sam's pantry rows.
  assert.equal((await c.del('/api/pantry/1')).status, 404);
  assert.equal((await c.del(`/api/pantry/${id}`)).status, 200);
});

test('recipes: create with ingredients, ownership rules, filters', async () => {
  const c = client();
  await c.login('jordan@nutricart.test', 'User123!');
  const bad = await c.post('/api/recipes', { title: 'Nothing', servings: 1, ingredients: [] });
  assert.equal(bad.status, 400);
  const dupIng = await c.post('/api/recipes', { title: 'Dup', ingredients: [{ ingredient_id: 1, required_quantity: 1 }, { ingredient_id: 1, required_quantity: 2 }] });
  assert.equal(dupIng.status, 400);
  const res = await c.post('/api/recipes', {
    title: 'Quinoa Bowl', prep_time_mins: 15, servings: 2,
    ingredients: [{ ingredient_id: 21, required_quantity: 1.5 }, { ingredient_id: 14, required_quantity: 1 }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.recipe.ingredients.length, 2);
  assert.ok(res.data.recipe.calories_per_serving > 0);
  const id = res.data.recipe.recipe_id;

  const other = client();
  await other.login('sam@nutricart.test', 'User123!');
  assert.equal((await other.put(`/api/recipes/${id}`, { title: 'Hijacked' })).status, 403);

  assert.equal((await c.put(`/api/recipes/${id}`, { title: 'Quinoa Power Bowl' })).data.recipe.title, 'Quinoa Power Bowl');
  const filtered = await c.get('/api/recipes?ingredientId=21');
  assert.ok(filtered.data.recipes.some((r) => r.recipe_id === id));
  assert.ok((await c.get('/api/recipes?maxPrep=10')).data.recipes.every((r) => r.prep_time_mins <= 10));
  assert.equal((await c.del(`/api/recipes/${id}`)).status, 200);
});

test('meal plans: validation, CRUD and cooking consumes pantry', async () => {
  const c = client();
  await c.login('priya@nutricart.test', 'User123!');
  assert.equal((await c.post('/api/meal-plans', { recipe_id: 2, planned_date: '2026-02-30', meal_type: 'Dinner' })).status, 400);
  assert.equal((await c.post('/api/meal-plans', { recipe_id: 2, planned_date: '2026-11-10', meal_type: 'Brunch' })).status, 400);
  assert.equal((await c.post('/api/meal-plans', { recipe_id: 9999, planned_date: '2026-11-10', meal_type: 'Lunch' })).status, 400);
  const plan = await c.post('/api/meal-plans', { recipe_id: 2, planned_date: '2026-11-10', meal_type: 'dinner' });
  assert.equal(plan.status, 201);
  assert.equal(plan.data.plan.meal_type, 'Dinner');

  const before = (await c.get('/api/pantry?q=rice')).data.items[0].quantity_on_hand;
  const cooked = await c.post(`/api/meal-plans/${plan.data.plan.plan_id}/cook`);
  assert.equal(cooked.status, 200);
  const afterQty = (await c.get('/api/pantry?q=rice')).data.items[0].quantity_on_hand;
  assert.equal(afterQty, before - 1.5);
  assert.equal((await c.get(`/api/meal-plans/${plan.data.plan.plan_id}`)).status, 404);
});

test('grocery list generation subtracts pantry stock and completes into pantry', async () => {
  const c = client();
  await c.login('marcus@nutricart.test', 'User123!');
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const from = iso(today);
  const to = iso(new Date(today.getTime() + 6 * 86400000));
  assert.equal((await c.post('/api/grocery-lists/generate', { from: to, to: from })).status, 400);

  const preview = await c.get(`/api/grocery-lists/preview?from=${from}&to=${to}`);
  // Marcus plans Pasta Pomodoro x3 (2.5 pasta each = 7.5) and has 5 in the pantry -> buy 2.5
  const pasta = preview.data.items.find((i) => i.ingredient_id === 11);
  assert.equal(pasta.to_buy, 2.5);
  // Onions are counted in whole units: needs 3, has 2 -> buy 1
  assert.equal(preview.data.items.find((i) => i.ingredient_id === 19).to_buy, 1);

  const gen = await c.post('/api/grocery-lists/generate', { from, to });
  assert.equal(gen.status, 201);
  const list = gen.data.list;
  assert.equal(list.max_budget, 60, 'defaults to the weekly budget');
  assert.equal(list.items.length, preview.data.items.length);

  assert.equal((await c.post(`/api/grocery-lists/${list.list_id}/complete`)).status, 400, 'nothing purchased yet');
  const item = list.items.find((i) => i.ingredient_id === 11);
  await c.put(`/api/grocery-lists/${list.list_id}/items/${item.item_id}`, { is_purchased: true });
  const done = await c.post(`/api/grocery-lists/${list.list_id}/complete`);
  assert.equal(done.status, 200);
  assert.equal(done.data.list.status, 'Completed');
  const pantryPasta = (await c.get('/api/pantry?q=pasta')).data.items[0];
  assert.equal(pantryPasta.quantity_on_hand, 7.5);
  assert.equal((await c.put(`/api/grocery-lists/${list.list_id}`, { status: 'Active' })).status, 400, 'completed lists are final');
  assert.equal((await c.post(`/api/grocery-lists/${list.list_id}/items`, { ingredient_id: 1, quantity_to_buy: 1 })).status, 400);
});

test('XML web service returns a well-formed grocery list document', async () => {
  const c = client();
  await c.login('sam@nutricart.test', 'User123!');
  const res = await c.get('/api/grocery-lists/1/xml');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /xml/);
  assert.match(res.data, /<groceryList [^>]*id="1"/);
  assert.match(res.data, /grocery-list\.xsd/);
  assert.equal((res.data.match(/<item /g) || []).length, 4);
  assert.equal((await c.get('/api/grocery-lists/3/xml')).status, 404, "cannot read another user's list");
});

test('CSV and PDF export', async () => {
  const c = client();
  await c.login('sam@nutricart.test', 'User123!');
  const csv = await c.get('/api/export/pantry?format=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  const lines = csv.data.trim().split(/\r\n/);
  assert.equal(lines.length, 8); // header + 7 items
  const pdf = await c.get('/api/export/v_pantry_shortfalls?format=pdf');
  assert.equal(pdf.status, 200);
  assert.ok(pdf.data.startsWith('%PDF'));
  assert.equal((await c.get('/api/export/pantry?format=docx')).status, 400);
  assert.equal((await c.get('/api/export/nope?format=csv')).status, 404);
});

test('error handling: bad JSON, unknown endpoint, bad ids, constraint violations', async () => {
  const c = client();
  await c.login('admin@nutricart.test', 'Admin123!');
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  assert.equal(res.status, 400);
  assert.equal((await c.get('/api/does-not-exist')).status, 404);
  assert.equal((await c.get('/api/ingredients/abc')).status, 400);
  assert.equal((await c.get('/api/ingredients/99999')).status, 404);
  const dupEmail = await c.put('/api/users/3', { email: 'sam@nutricart.test' });
  assert.equal(dupEmail.status, 409);
  assert.equal((await c.del('/api/users/1')).status, 400, 'admins cannot delete themselves');
});

test('dashboard: today, snack ideas, rankings, getting-started checklist', async () => {
  const c = client();
  await c.login('sam@nutricart.test', 'User123!');
  const d = (await c.get('/api/stats/dashboard')).data;
  assert.equal(d.week.length, 7);
  assert.ok(d.week[0].calories > 0);
  assert.equal(d.today.target_calories, 2400);
  assert.equal(d.today.remaining_calories, 2400 - d.today.planned_calories);
  assert.ok(d.shortfalls.some((s) => s.ingredient_name === 'Banana'));
  assert.ok(d.gettingStarted.every((s) => s.done), 'seeded user has completed every step');

  const o = (await c.get('/api/stats/overview')).data;
  const kcal = o.lightest.map((r) => r.calories_per_serving);
  assert.deepEqual(kcal, [...kcal].sort((a, b) => a - b), 'snack ideas sorted by calories');
  assert.equal(o.lightest[0].title, 'Hard-Boiled Eggs');
  assert.ok(o.topProtein[0].protein_per_serving >= o.topProtein[1].protein_per_serving);

  // A brand-new user starts with nothing done.
  const fresh = client();
  await fresh.post('/api/auth/register', { name: 'New Person', email: 'new@x.test', password: 'password123', weekly_budget_limit: 40 });
  const steps = (await fresh.get('/api/stats/dashboard')).data.gettingStarted;
  assert.ok(steps.every((s) => !s.done));
});

test('every view powers a real feature outside the Reports page', async () => {
  const sam = client();
  await sam.login('sam@nutricart.test', 'User123!');
  const { views } = (await sam.get('/api/views')).data;
  assert.ok(views.every((v) => v.usedIn.length > 0));

  // View 2: budget-friendly recipe filter + flag
  const budget = (await sam.get('/api/recipes?budget=1')).data.recipes;
  assert.ok(budget.length > 0 && budget.every((r) => r.budget_friendly));
  assert.ok(!budget.some((r) => r.title === 'Garlic Salmon with Rice'));
  // View 3: pantry shortfalls table + "short" filter agree
  const short = (await sam.get('/api/pantry/shortfalls')).data.shortfalls;
  const filtered = (await sam.get('/api/pantry?status=short')).data.items;
  assert.deepEqual(filtered.map((i) => i.pantry_item_id).sort(), short.map((s) => s.pantry_item_id).sort());
  // View 4: ingredient usage columns + filter
  const unused = (await sam.get('/api/ingredients?usage=unused')).data.ingredients;
  assert.ok(unused.some((i) => i.name === 'Quinoa'));
  assert.ok(unused.every((i) => i.recipes_using === 0));
  // View 5: preview flags ingredients not in the pantry at all
  const today = new Date();
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const prev = (await sam.get(`/api/grocery-lists/preview?from=${iso(today)}&to=${iso(new Date(today.getTime() + 6 * 86400000))}`)).data.items;
  assert.equal(prev.find((i) => i.name === 'Greek Yogurt').not_in_pantry, true);
  assert.equal(prev.find((i) => i.name === 'Banana').not_in_pantry, false);
  // View 8: pantry by category
  const cats = (await sam.get('/api/pantry/summary')).data.categories;
  assert.ok(cats.length > 0 && cats.every((c) => c.item_count > 0));
  // View 10: admin user table activity columns
  const admin = client();
  await admin.login('admin@nutricart.test', 'Admin123!');
  const users = (await admin.get('/api/users')).data.users;
  assert.equal(users.find((u) => u.email === 'sam@nutricart.test').pantry_items, 7);
});
