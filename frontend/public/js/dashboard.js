// Dashboard: today's calories, snack ideas that fit, pantry shortfalls, and
// three rankings/charts. Data comes from /api/stats/dashboard and /api/stats/overview.
(async () => {
  const { $, h, api, chart, table, money, num, toast, showError, isoDate, COLORS } = App;
  const user = await App.init();
  $('#greeting').textContent = user.role === 'Guest' ? 'Welcome, guest' : `Hello, ${user.name.split(' ')[0]}`;
  $('#subtitle').textContent = user.role === 'Guest'
    ? 'You are browsing without an account. Create one to track your own pantry and meals.'
    : '';

  let remaining = null; // calories left today (null = no target set)

  const dayLabel = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  };

  async function loadPersonal() {
    const d = await api('/stats/dashboard');

    // Getting started checklist (hidden once everything is done)
    const steps = d.gettingStarted;
    if (steps.some((s) => !s.done)) {
      $('#getting-started').classList.remove('hidden');
      $('#steps').replaceChildren(...steps.map((s) => h('li', { class: s.done ? 'done' : null },
        s.done ? s.label : h('a', { href: s.href }, s.label))));
    }

    // Today
    const t = d.today;
    remaining = t.remaining_calories;
    $('#today-date').textContent = App.date(isoDate(0));
    $('#today-numbers').replaceChildren(t.target_calories
      ? h('p', {}, 'Planned ', h('strong', {}, `${t.planned_calories} kcal`), ` of your ${t.target_calories} kcal target. `,
        remaining >= 0 ? h('span', {}, h('strong', {}, `${remaining} kcal`), ' left.')
          : h('span', { class: 'pill-bad' }, `${-remaining} kcal over.`))
      : h('p', {}, `Planned ${t.planned_calories} kcal. `, h('a', { href: '/account' }, 'Set a calorie target'), ' to see what is left.'));
    $('#today-meals').replaceChildren(table(t.meals, [
      { key: 'meal_type', label: 'Meal' },
      { key: 'recipe_title', label: 'Recipe' },
      { key: 'calories_per_serving', label: 'kcal', class: 'num' },
    ], { empty: 'Nothing planned for today.' }));

    // Running low (View 3)
    $('#shortfalls').replaceChildren(table(d.shortfalls, [
      { key: 'ingredient_name', label: 'Ingredient' },
      { key: 'quantity_on_hand', label: 'Have', class: 'num', render: (r) => `${num(r.quantity_on_hand)} ${r.unit}` },
      { key: 'quantity_needed', label: 'Needed', class: 'num', render: (r) => `${num(r.quantity_needed)} ${r.unit}` },
    ], { empty: 'Nothing in your pantry is running low. Ingredients you have none of are listed on the Grocery List page.' }));

    // Calories next 7 days (View 6)
    const target = d.profile.target_calories;
    $('#cal-target').textContent = target ? `Target ${target} kcal/day` : '';
    chart($('#chart-calories'), {
      type: 'bar',
      data: {
        labels: d.week.map((w) => dayLabel(w.day)),
        datasets: [
          { label: 'Planned kcal', data: d.week.map((w) => w.calories), backgroundColor: COLORS[0] },
          ...(target ? [{ type: 'line', label: 'Target', data: d.week.map(() => target), borderColor: COLORS[3], borderDash: [5, 4], pointRadius: 0 }] : []),
        ],
      },
      options: { scales: { y: { beginAtZero: true } } },
    });
  }

  async function addSnack(r) {
    try {
      await api('/meal-plans', { method: 'POST', body: { recipe_id: r.recipe_id, planned_date: isoDate(0), meal_type: 'Snack' } });
      toast(`${r.title} added as a snack for today`);
      await loadPersonal();
      renderSnacks(lightest);
    } catch (err) {
      showError(err);
    }
  }

  let lightest = [];
  let snackMax = 300;
  function renderSnacks(rows) {
    const canAdd = App.canWrite();
    $('#snack-hint').textContent = `Recipes of ${snackMax} kcal or less per serving, lowest first.`
      + (canAdd && remaining !== null ? ` You have ${Math.max(remaining, 0)} kcal left today.` : '');
    $('#snacks').replaceChildren(table(rows, [
      { key: 'title', label: 'Recipe' },
      { key: 'calories_per_serving', label: 'kcal', class: 'num' },
      { key: 'protein_per_serving', label: 'Protein', class: 'num', render: (r) => `${num(r.protein_per_serving, 1)} g` },
      { key: 'cost_per_serving', label: 'Cost', class: 'num', render: (r) => money(r.cost_per_serving) },
      { key: 'prep_time_mins', label: 'Prep', class: 'num', render: (r) => (r.prep_time_mins ? `${r.prep_time_mins} min` : '') },
      ...(canAdd ? [
        { key: 'fits', label: 'Fits today?', render: (r) => (remaining === null ? '—'
          : r.calories_per_serving <= remaining ? 'Yes' : h('span', { class: 'pill-bad' }, 'No')) },
        { key: 'add', label: '', render: (r) => h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => addSnack(r) }, 'Add as snack today') },
      ] : []),
    ], { empty: 'No recipes are light enough to count as a snack yet.' }));
  }

  async function loadOverview() {
    const o = await api('/stats/overview');
    lightest = o.lightest;
    snackMax = o.snackMaxKcal;
    renderSnacks(lightest);
    chart($('#chart-protein'), {
      type: 'bar',
      data: {
        labels: o.topProtein.map((r) => r.title),
        datasets: [{ label: 'Protein per serving (g)', data: o.topProtein.map((r) => r.protein_per_serving), backgroundColor: COLORS[0] }],
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } },
    });
    chart($('#chart-popular'), {
      type: 'bar',
      data: {
        labels: o.popularIngredients.map((p) => p.name),
        datasets: [{ label: 'Times needed by planned meals', data: o.popularIngredients.map((p) => p.times_planned), backgroundColor: COLORS[1] }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  try {
    if (App.canWrite()) await loadPersonal();
    await loadOverview();
  } catch (err) {
    showError(err);
  }
})();
