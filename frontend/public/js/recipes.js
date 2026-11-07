// Recipes: search/filter, detail view, and a dynamic create/edit form whose
// ingredient rows can be added/removed on the fly.
(async () => {
  const { $, h, api, table, money, num, toast, showError, validateForm, showFieldErrors, debounce, confirmDialog, modal, isoDate } = App;
  const user = await App.init();
  $('#export').append(App.exportButtons('recipes'));

  const all = await App.ingredients();
  const byName = (name) => all.find((i) => i.name.toLowerCase() === String(name).trim().toLowerCase());

  // "Contains ingredient" filter uses the same autocomplete.
  let filterIngredient = null;
  await App.ingredientPicker($('#f-ing'), (ing) => { filterIngredient = ing; load(); });
  // Links like /recipes?ingredient=21 (from the Pantry page) pre-select an ingredient.
  const wantedId = Number(new URLSearchParams(window.location.search).get('ingredient'));
  const wanted = wantedId ? all.find((i) => i.ingredient_id === wantedId) : null;
  if (wanted) { $('#f-ing').value = wanted.name; filterIngredient = wanted; }

  const canEdit = (r) => App.isAdmin() || (App.canWrite() && r.created_by_user === user.user_id);

  // Recipes are shown as a plain table, one row per recipe.
  function render(recipes) {
    $('#table').replaceChildren(table(recipes, [
      { key: 'title', label: 'Recipe', render: (r) => h('span', {}, r.title,
        App.canWrite() && r.created_by_user === user.user_id ? h('span', { class: 'tag' }, 'mine') : null) },
      { key: 'author', label: 'By' },
      { key: 'calories_per_serving', label: 'kcal / serving', class: 'num' },
      { key: 'protein_per_serving', label: 'Protein', class: 'num', render: (r) => `${num(r.protein_per_serving, 1)} g` },
      { key: 'cost_per_serving', label: 'Cost / serving', class: 'num', render: (r) => money(r.cost_per_serving) },
      { key: 'prep_time_mins', label: 'Prep', class: 'num', render: (r) => (r.prep_time_mins ? `${r.prep_time_mins} min` : '') },
      ...(App.canWrite() ? [{ key: 'pantry_match_pct', label: 'In pantry', class: 'num', render: (r) => `${r.pantry_match_pct}%` }] : []),
      { key: 'a', label: '', render: (r) => h('span', { class: 'actions' },
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => details(r.recipe_id) }, 'Details'),
        App.canWrite() && h('button', { class: 'btn btn-small', type: 'button', onclick: () => planIt(r) }, 'Plan'),
        canEdit(r) && h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => editor(r.recipe_id) }, 'Edit'),
        canEdit(r) && h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: () => remove(r) }, 'Delete')) },
    ], { empty: 'No recipes match your filters.' }));
  }

  async function load() {
    try {
      const { recipes } = await api('/recipes', {
        query: {
          q: $('#f-q').value.trim(),
          ingredientId: filterIngredient ? filterIngredient.ingredient_id : '',
          maxPrep: $('#f-prep').value,
          maxCost: $('#f-cost').value,
          sort: $('#f-sort').value,
          mine: $('#f-mine').checked ? '1' : '',
        },
      });
      render(recipes);
    } catch (err) {
      showError(err);
    }
  }

  async function details(id) {
    try {
      const { recipe: r } = await api(`/recipes/${id}`);
      modal(r.title, h('div', {},
        h('p', { class: 'muted' }, `by ${r.author} · ${r.prep_time_mins || '?'} min · serves ${r.servings || 1} · total cost ${money(r.total_cost)}`),
        h('p', {}, `Per serving: ${r.calories_per_serving} kcal, protein ${num(r.protein_per_serving, 1)} g, `
          + `carbs ${num(r.carbs_per_serving, 1)} g, fat ${num(r.fat_per_serving, 1)} g, cost ${money(r.cost_per_serving)}.`),
        table(r.ingredients, [
          { key: 'name', label: 'Ingredient' },
          { key: 'required_quantity', label: 'Amount', render: (i) => `${num(i.required_quantity)} ${i.unit}` },
          { key: 'line_calories', label: 'kcal', class: 'num' },
          { key: 'line_cost', label: 'Cost', class: 'num' },
          ...(App.canWrite() ? [{ key: 'on_hand', label: 'In my pantry', class: 'num', render: (i) =>
            h('span', { class: i.on_hand >= i.required_quantity ? '' : 'pill-bad' }, `${num(i.on_hand)} ${i.unit}`) }] : []),
        ])), { wide: true });
    } catch (err) {
      showError(err);
    }
  }

  function planIt(r, intro) {
    const f = h('form', { novalidate: true },
      h('div', { class: 'row' },
        h('label', {}, 'Date', h('input', { name: 'planned_date', type: 'date', required: true, value: isoDate(0) })),
        h('label', {}, 'Meal', h('select', { name: 'meal_type', required: true }, ['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((m) => h('option', { selected: m === 'Dinner' }, m))))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, 'Add to meal plan')));
    const dlg = modal(`Plan "${r.title}"`, h('div', {}, intro ? h('p', {}, intro) : null, f));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(f)) return;
      try {
        await api('/meal-plans', { method: 'POST', body: { recipe_id: r.recipe_id, planned_date: f.elements.planned_date.value, meal_type: f.elements.meal_type.value } });
        dlg.close();
        toast(`${r.title} added to your meal plan for ${App.date(f.elements.planned_date.value)}`);
      } catch (err) {
        showFieldErrors(f, err);
      }
    });
  }

  async function remove(r) {
    if (!(await confirmDialog(`Delete "${r.title}"? It will also be removed from any meal plans.`))) return;
    try {
      await api(`/recipes/${r.recipe_id}`, { method: 'DELETE' });
      toast('Recipe deleted');
      load();
    } catch (err) {
      showError(err);
    }
  }

  // ---- Dynamic recipe form -------------------------------------------------------
  function ingredientRow(rows, data = {}) {
    const name = h('input', { required: true, placeholder: 'Ingredient', 'aria-label': 'Ingredient', value: data.name || '' });
    const qty = h('input', { type: 'number', min: '0.01', step: '0.01', required: true, placeholder: 'Qty', 'aria-label': 'Quantity', value: data.required_quantity ?? '' });
    const unit = h('input', { readonly: true, placeholder: 'unit', 'aria-label': 'Unit', value: data.unit || '' });
    const row = h('div', { class: 'ing-row' }, name, qty, unit,
      h('button', { class: 'btn btn-small btn-danger', type: 'button', 'aria-label': 'Remove ingredient', onclick: () => { row.remove(); updateTotals(rows); } }, 'Remove'));
    App.ingredientPicker(name, (ing) => { unit.value = ing ? ing.base_unit : ''; updateTotals(rows); });
    qty.addEventListener('input', () => updateTotals(rows));
    rows.append(row);
    return row;
  }

  function readRows(rows) {
    return [...rows.querySelectorAll('.ing-row')].map((row) => {
      const [name, qty] = row.querySelectorAll('input');
      return { ing: byName(name.value), qty: Number(qty.value), nameInput: name };
    });
  }

  // Live preview of calories and cost while the user edits the recipe.
  function updateTotals(rows) {
    const out = rows.parentElement.querySelector('.live-totals');
    const servings = Number(rows.closest('form').elements.servings.value) || 1;
    let kcal = 0;
    let cost = 0;
    for (const { ing, qty } of readRows(rows)) {
      if (ing && qty > 0) { kcal += ing.calories_per_unit * qty; cost += ing.estimated_unit_price * qty; }
    }
    out.textContent = `Per serving: ${Math.round(kcal / servings)} kcal · ${money(cost / servings)}  (total ${money(cost)})`;
  }

  async function editor(id) {
    let recipe = { title: '', prep_time_mins: '', servings: 1, ingredients: [] };
    if (id) {
      try { recipe = (await api(`/recipes/${id}`)).recipe; } catch (err) { showError(err); return; }
    }
    const rows = h('div', { class: 'ingredient-rows' });
    const f = h('form', { novalidate: true },
      h('label', {}, 'Title', h('input', { name: 'title', required: true, maxlength: '150', value: recipe.title })),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        h('label', {}, 'Prep time (min)', h('input', { name: 'prep_time_mins', type: 'number', min: '1', step: '1', value: recipe.prep_time_mins ?? '' })),
        h('label', {}, 'Servings', h('input', { name: 'servings', type: 'number', min: '1', step: '1', required: true, value: recipe.servings ?? 1 }))),
      h('h3', { style: 'margin-top:1rem' }, 'Ingredients'),
      rows,
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => ingredientRow(rows).querySelector('input').focus() }, 'Add another ingredient'),
      h('p', { class: 'muted small' }, 'Quantities use the unit of each ingredient (shown after you pick it). Missing an ingredient? Add it on the Ingredients page first.'),
      h('p', { class: 'live-totals muted small' }),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, id ? 'Save changes' : 'Create recipe')));
    const dlg = modal(id ? `Edit ${recipe.title}` : 'New recipe', f, { wide: true });
    for (const i of recipe.ingredients) ingredientRow(rows, i);
    if (!recipe.ingredients.length) ingredientRow(rows);
    f.elements.servings.addEventListener('input', () => updateTotals(rows));
    updateTotals(rows);

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(f)) return;
      const items = readRows(rows);
      if (!items.length) { toast('Add at least one ingredient', 'error'); return; }
      const ids = items.map((it) => it.ing.ingredient_id);
      if (new Set(ids).size !== ids.length) { toast('Each ingredient can only be listed once', 'error'); return; }
      const body = {
        title: f.elements.title.value.trim(),
        prep_time_mins: f.elements.prep_time_mins.value ? Number(f.elements.prep_time_mins.value) : null,
        servings: Number(f.elements.servings.value),
        ingredients: items.map((it) => ({ ingredient_id: it.ing.ingredient_id, required_quantity: it.qty })),
      };
      try {
        const saved = await api(id ? `/recipes/${id}` : '/recipes', { method: id ? 'PUT' : 'POST', body });
        dlg.close();
        toast(id ? 'Recipe updated' : 'Recipe saved');
        load();
        // New recipe: go straight to the next step of the workflow, planning it.
        if (!id) planIt(saved.recipe, 'Recipe saved. Do you want to add it to your meal plan now? (You can also close this and plan it later.)');
      } catch (err) {
        showFieldErrors(f, err);
      }
    });
  }

  $('#new-recipe').addEventListener('click', () => editor(null));
  $('#f-q').addEventListener('input', debounce(load));
  ['#f-prep', '#f-cost'].forEach((s) => $(s).addEventListener('input', debounce(load)));
  ['#f-sort', '#f-mine'].forEach((s) => $(s).addEventListener('change', load));
  load();
})();
