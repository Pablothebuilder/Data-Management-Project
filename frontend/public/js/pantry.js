// Pantry page: add/edit/delete PantryItems, search and filter,
// "running low" (View 3), "not used by your meal plan" (View 5) and
// "by category" (View 8) tables.
(async () => {
  const { $, h, api, table, money, num, toast, showError, validateForm, showFieldErrors, debounce, confirmDialog } = App;
  await App.init();
  $('#export').append(App.exportButtons('pantry'));

  const form = $('#add-form');
  let picked = null;
  await App.ingredientPicker(form.elements.ingredient_name, (ing) => {
    picked = ing;
    form.elements.unit.value = ing ? ing.base_unit : '';
    $('#add-hint').textContent = ing
      ? `${ing.category}. Quantity is in "${ing.base_unit}". ${ing.calories_per_unit} kcal and ${money(ing.estimated_unit_price)} per ${ing.base_unit}.`
      : '';
  });

  const { categories } = await api('/ingredients/categories');
  $('#f-category').append(...categories.map((c) => h('option', { value: c.category }, c.category)));

  async function saveQuantity(item, input) {
    const value = Number(input.value);
    if (input.value === '' || !Number.isFinite(value) || value < 0) {
      input.classList.add('invalid');
      toast('Quantity must be a number of 0 or more', 'error');
      return;
    }
    try {
      await api(`/pantry/${item.pantry_item_id}`, { method: 'PUT', body: { quantity_on_hand: value } });
      toast(`Updated ${item.name}`);
      refresh();
    } catch (err) {
      showError(err);
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Remove ${item.name} from your pantry?`))) return;
    try {
      await api(`/pantry/${item.pantry_item_id}`, { method: 'DELETE' });
      toast(`Removed ${item.name}`);
      refresh();
    } catch (err) {
      showError(err);
    }
  }

  async function loadItems() {
    const { items } = await api('/pantry', {
      query: { q: $('#f-q').value.trim(), category: $('#f-category').value, status: $('#f-status').value, sort: $('#f-sort').value },
    });
    const total = items.reduce((s, i) => s + i.estimated_value, 0);
    $('#summary').textContent = `${items.length} item(s), estimated value ${money(total)}. Change a quantity and press Save (or Enter).`;
    $('#table').replaceChildren(table(items, [
      { key: 'name', label: 'Ingredient' },
      { key: 'category' },
      { key: 'quantity_on_hand', label: 'Quantity', render: (r) => {
        const input = h('input', { type: 'number', min: '0', step: '0.01', value: r.quantity_on_hand, style: 'width:6rem', 'aria-label': `Quantity of ${r.name}` });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveQuantity(r, input); });
        return h('span', { class: 'actions' }, input, r.unit,
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => saveQuantity(r, input) }, 'Save'));
      } },
      { key: 'needed_for_plans', label: 'Needed for planned meals', class: 'num', render: (r) => (r.needed_for_plans ? `${num(r.needed_for_plans)} ${r.unit}` : '') },
      { key: 'estimated_value', label: 'Value', class: 'num', render: (r) => money(r.estimated_value) },
      { key: 'last_updated', label: 'Updated' },
      { key: 'actions', label: '', render: (r) => h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: () => remove(r) }, 'Remove') },
    ], {
      empty: 'Nothing here yet. Use "Add an item" above to record what you already have.',
      rowClass: (r) => (r.quantity_on_hand === 0 ? 'row-bad' : r.quantity_on_hand < r.needed_for_plans ? 'row-warn' : ''),
    }));
  }

  // View 3: v_pantry_shortfalls
  async function loadShortfalls() {
    const { shortfalls } = await api('/pantry/shortfalls');
    $('#shortfalls').replaceChildren(table(shortfalls, [
      { key: 'ingredient_name', label: 'Ingredient' },
      { key: 'quantity_on_hand', label: 'Have', class: 'num', render: (r) => `${num(r.quantity_on_hand)} ${r.unit}` },
      { key: 'quantity_needed', label: 'Needed', class: 'num', render: (r) => `${num(r.quantity_needed)} ${r.unit}` },
      { key: 'quantity_missing', label: 'Missing', class: 'num', render: (r) => h('strong', {}, `${num(r.quantity_missing)} ${r.unit}`) },
    ], { empty: 'Nothing is running low. Ingredients you have none of at all are shown on the Grocery List page.' }));
  }

  // View 5: v_unplanned_pantry_items
  async function loadUnplanned() {
    const { items } = await api('/pantry/unplanned');
    $('#unplanned').replaceChildren(table(items, [
      { key: 'ingredient_name', label: 'Ingredient' },
      { key: 'quantity_on_hand', label: 'You have', class: 'num', render: (r) => `${num(r.quantity_on_hand)} ${r.unit}` },
      { key: 'estimated_value', label: 'Value', class: 'num' },
      { key: 'recipes_using', label: 'Use it in', render: (r) => (r.recipes_using
        ? h('a', { href: `/recipes?ingredient=${r.ingredient_id}` }, `${r.recipes_using} recipe(s)`)
        : h('span', {}, 'No recipe uses it yet. ', h('a', { href: '/recipes' }, 'Add your own'))) },
    ], { empty: 'Everything in your pantry is used by an upcoming meal.' }));
  }

  // View 8: v_pantry_value_by_category
  async function loadCategories() {
    const { categories: rows } = await api('/pantry/summary');
    $('#categories').replaceChildren(table(rows, [
      { key: 'category' },
      { key: 'item_count', label: 'Items', class: 'num' },
      { key: 'estimated_value', label: 'Estimated value', class: 'num' },
    ], { empty: 'Your pantry is empty.' }));
  }

  function refresh() {
    Promise.all([loadItems(), loadShortfalls(), loadUnplanned(), loadCategories()]).catch(showError);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    try {
      const { item } = await api('/pantry', {
        method: 'POST',
        body: { ingredient_id: picked.ingredient_id, quantity_on_hand: Number(form.elements.quantity_on_hand.value), unit: form.elements.unit.value },
      });
      toast(`${item.name}: you now have ${num(item.quantity_on_hand)} ${item.unit}`);
      form.reset();
      picked = null;
      $('#add-hint').textContent = '';
      form.elements.ingredient_name.focus();
      refresh();
    } catch (err) {
      showFieldErrors(form, err);
    }
  });

  $('#f-q').addEventListener('input', debounce(() => loadItems().catch(showError)));
  ['#f-category', '#f-status', '#f-sort'].forEach((s) => $(s).addEventListener('change', () => loadItems().catch(showError)));
  refresh();
})();
