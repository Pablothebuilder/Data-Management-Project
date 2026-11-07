// Meal planner: a day x meal table built from View 1 (v_meal_plan_details),
// CRUD on MealPlans, and "Cooked" which uses up pantry stock.
(async () => {
  const { $, h, api, table, money, toast, showError, validateForm, formData, showFieldErrors, debounce, confirmDialog, isoDate, modal } = App;
  await App.init();
  $('#export').append(App.exportButtons('meal-plans'));

  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const form = $('#plan-form');
  form.elements.planned_date.value = isoDate(0);

  const { recipes } = await api('/recipes', { query: { sort: 'title' } });
  const recipeOptions = () => recipes.map((r) => h('option', { value: r.recipe_id }, `${r.title} (${r.calories_per_serving} kcal)`));
  form.elements.recipe_id.append(...recipeOptions());
  if (!recipes.length) $('#recipe-hint').textContent = 'There are no recipes yet. Add one on the Recipes page first.';

  const profile = (await api('/users/me')).user; // calorie target
  let weekOffset = 0;

  // "Add" link in a cell: fill the form and jump to it.
  function prefill(date, meal) {
    form.elements.planned_date.value = date;
    form.elements.meal_type.value = meal;
    $('#add-card').scrollIntoView({ behavior: 'smooth' });
    form.elements.recipe_id.focus();
  }

  function entry(p) {
    return h('div', { class: 'meal-entry' },
      h('div', {}, p.recipe_title),
      h('div', { class: 'muted' }, `${p.calories_per_serving} kcal, ${money(p.cost_per_serving)}`),
      h('div', { class: 'actions' },
        h('button', { class: 'link-btn small', type: 'button', onclick: () => cook(p) }, 'Cooked'),
        h('button', { class: 'link-btn small', type: 'button', onclick: () => edit(p) }, 'Edit'),
        h('button', { class: 'link-btn small', type: 'button', onclick: () => cheaperSwap(p) }, 'Cheaper swap'),
        h('button', { class: 'link-btn small', type: 'button', onclick: () => remove(p) }, 'Remove')));
  }

  async function loadWeek() {
    const from = isoDate(weekOffset * 7);
    const to = isoDate(weekOffset * 7 + 6);
    $('#week-title').textContent = weekOffset === 0 ? 'Next 7 days' : `${App.date(from)} to ${App.date(to)}`;
    const { plans } = await api('/meal-plans', { query: { from, to } });
    const days = Array.from({ length: 7 }, (_, i) => isoDate(weekOffset * 7 + i));
    const target = profile.target_calories;

    const rows = days.map((d) => {
      const dayPlans = plans.filter((p) => p.planned_date === d);
      const kcal = dayPlans.reduce((s, p) => s + p.calories_per_serving, 0);
      const cls = d === isoDate(0) ? 'today' : null;
      return h('tr', {},
        h('th', { class: cls }, App.date(d)),
        ...MEALS.map((m) => h('td', { class: cls },
          dayPlans.filter((p) => p.meal_type === m).map(entry),
          h('button', { class: 'link-btn small', type: 'button', onclick: () => prefill(d, m) }, 'Add'))),
        h('td', { class: `num ${cls || ''}` }, h('span', { class: target && kcal > target ? 'pill-bad' : '' }, `${kcal}`),
          target ? h('div', { class: 'muted small' }, `of ${target}`) : null));
    });

    $('#week').replaceChildren(h('div', { class: 'table-wrap' },
      h('table', { class: 'data-table planner' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Day'), ...MEALS.map((m) => h('th', {}, m)), h('th', { class: 'num' }, 'kcal'))),
        h('tbody', {}, rows))));
  }

  async function search() {
    const { plans } = await api('/meal-plans', {
      query: { q: $('#f-q').value.trim(), from: $('#f-from').value, to: $('#f-to').value, mealType: $('#f-type').value },
    });
    $('#results').replaceChildren(table(plans, [
      { key: 'planned_date', label: 'Date' },
      { key: 'meal_type', label: 'Meal' },
      { key: 'recipe_title', label: 'Recipe' },
      { key: 'calories_per_serving', label: 'kcal / serving', class: 'num' },
      { key: 'cost_per_serving', label: 'Cost / serving', class: 'num' },
    ], { empty: 'No planned meals match.' }));
  }

  const refresh = () => Promise.all([loadWeek(), search()]).catch(showError);

  async function cook(p) {
    if (!(await confirmDialog(`Mark "${p.recipe_title}" as cooked? Its ingredients will be taken out of your pantry.`))) return;
    try {
      const r = await api(`/meal-plans/${p.plan_id}/cook`, { method: 'POST' });
      toast(`Done. ${r.pantryUpdated} pantry item(s) updated.`);
      refresh();
    } catch (err) {
      showError(err);
    }
  }

  async function remove(p) {
    if (!(await confirmDialog(`Remove ${p.recipe_title} on ${App.date(p.planned_date)} from your plan?`))) return;
    try {
      await api(`/meal-plans/${p.plan_id}`, { method: 'DELETE' });
      toast('Meal removed');
      refresh();
    } catch (err) {
      showError(err);
    }
  }

  // View 2 (v_cheaper_swaps): offer cheaper recipes with similar calories.
  async function cheaperSwap(p) {
    let dlg = null;
    try {
      const { meal, swaps } = await api(`/meal-plans/${p.plan_id}/swaps`);
      const doSwap = async (r) => {
        try {
          await api(`/meal-plans/${p.plan_id}`, { method: 'PUT', body: { recipe_id: r.recipe_id } });
          dlg.close();
          toast(`Swapped ${meal.recipe_title} for ${r.title}, saving ${money(r.saving)} per serving`);
          refresh();
        } catch (err) {
          showError(err);
        }
      };
      const body = h('div', {},
        h('p', {}, `${meal.recipe_title} costs ${money(meal.cost_per_serving)} and has ${meal.calories_per_serving} kcal per serving. `
          + 'These recipes cost less and still have at least 60% of the calories.'),
        table(swaps, [
          { key: 'title', label: 'Recipe' },
          { key: 'cost_per_serving', label: 'Cost / serving', class: 'num' },
          { key: 'saving', label: 'You save', class: 'num', render: (r) => money(r.saving) },
          { key: 'calories_per_serving', label: 'kcal', class: 'num' },
          { key: 'protein_per_serving', label: 'Protein', class: 'num', render: (r) => `${r.protein_per_serving} g` },
          { key: 's', label: '', render: (r) => h('button', { class: 'btn btn-small', type: 'button', onclick: () => doSwap(r) }, 'Swap') },
        ], { empty: 'This is already one of the cheapest meals of its size. No cheaper swap found.' }));
      dlg = modal(`Cheaper swap for ${meal.recipe_title}`, body, { wide: true });
    } catch (err) {
      showError(err);
    }
  }

  function edit(p) {
    const f = h('form', { novalidate: true },
      h('div', { class: 'row' },
        h('label', {}, 'Date', h('input', { name: 'planned_date', type: 'date', required: true, value: p.planned_date })),
        h('label', {}, 'Meal', h('select', { name: 'meal_type', required: true }, MEALS.map((m) => h('option', { selected: m === p.meal_type }, m)))),
        h('label', {}, 'Recipe', h('select', { name: 'recipe_id', required: true }, recipeOptions()))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, 'Save changes')));
    f.elements.recipe_id.value = p.recipe_id;
    const dlg = modal('Edit meal', f, { wide: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(f)) return;
      try {
        const body = formData(f);
        body.recipe_id = Number(body.recipe_id);
        await api(`/meal-plans/${p.plan_id}`, { method: 'PUT', body });
        dlg.close();
        toast('Meal updated');
        refresh();
      } catch (err) {
        showFieldErrors(f, err);
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    try {
      const body = formData(form);
      body.recipe_id = Number(body.recipe_id);
      const { plan } = await api('/meal-plans', { method: 'POST', body });
      toast(`Added ${plan.recipe_title} (${plan.meal_type}, ${App.date(plan.planned_date)})`);
      form.elements.recipe_id.value = '';
      refresh();
    } catch (err) {
      showFieldErrors(form, err);
    }
  });

  $('#prev').addEventListener('click', () => { weekOffset -= 1; loadWeek().catch(showError); });
  $('#next').addEventListener('click', () => { weekOffset += 1; loadWeek().catch(showError); });
  $('#today').addEventListener('click', () => { weekOffset = 0; loadWeek().catch(showError); });
  $('#f-q').addEventListener('input', debounce(() => search().catch(showError)));
  ['#f-from', '#f-to', '#f-type'].forEach((s) => $(s).addEventListener('change', () => search().catch(showError)));
  refresh();
})();
