// Grocery list workflow:
//   1. choose dates  2. review the preview (needed - pantry; View 5 flags items
//   not in the pantry at all)  3. create the list, tick items off while shopping,
//   then Complete to add the purchases to the pantry.
// "My lists" uses View 7 (v_grocery_list_budget_status).
(async () => {
  const { $, h, api, table, money, num, toast, showError, validateForm, formData, showFieldErrors, confirmDialog, isoDate, debounce } = App;
  await App.init();

  const gen = $('#gen-form');
  gen.elements.from.value = isoDate(0);
  gen.elements.to.value = isoDate(6);
  const profile = (await api('/users/me')).user;
  gen.elements.max_budget.placeholder = profile.weekly_budget_limit;

  function budgetBar(total, budget) {
    const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : 100;
    const cls = total > budget ? 'over' : pct > 85 ? 'near' : '';
    return h('div', {},
      h('div', { class: `budget-bar ${cls}` }, h('span', { style: `width:${pct}%` })),
      h('p', { class: 'small' }, `Estimated ${money(total)} of a ${money(budget)} budget. `,
        total > budget ? h('strong', { class: 'pill-bad' }, `Over budget by ${money(total - budget)}.`) : `${money(budget - total)} left.`));
  }

  function rangeValid() {
    return validateForm(gen, { to: (v, f) => (v && f.elements.from.value && v < f.elements.from.value ? 'Must be on or after the From date' : '') });
  }

  // Step 2: preview (nothing is saved yet)
  async function preview() {
    if (!rangeValid()) return;
    try {
      const { items, estimated_total: total } = await api('/grocery-lists/preview', { query: { from: gen.elements.from.value, to: gen.elements.to.value } });
      const budget = gen.elements.max_budget.value ? Number(gen.elements.max_budget.value) : profile.weekly_budget_limit;
      if (!items.length) {
        $('#preview').replaceChildren(h('p', {}, 'Nothing to buy: your pantry already covers every meal planned for these days. ',
          h('a', { href: '/planner' }, 'Plan more meals'), '.'));
        return;
      }
      $('#preview').replaceChildren(
        table(items, [
          { key: 'name', label: 'Ingredient', render: (r) => h('span', {}, r.name, r.not_in_pantry ? h('span', { class: 'tag' }, 'not in pantry') : null) },
          { key: 'needed', label: 'Needed by meals', class: 'num', render: (r) => `${num(r.needed)} ${r.base_unit}` },
          { key: 'on_hand', label: 'In pantry', class: 'num', render: (r) => `${num(r.on_hand)} ${r.base_unit}` },
          { key: 'to_buy', label: 'To buy', class: 'num', render: (r) => h('strong', {}, `${num(r.to_buy)} ${r.base_unit}`) },
          { key: 'line_total', label: 'Cost', class: 'num' },
        ]),
        budgetBar(total, budget),
        h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'button', onclick: create }, `Create grocery list (${items.length} items)`)));
    } catch (err) {
      showError(err);
    }
  }

  async function create() {
    if (!rangeValid()) return;
    try {
      const res = await api('/grocery-lists/generate', { method: 'POST', body: formData(gen) });
      if (!res.list) { toast(res.message, 'info'); return; }
      toast(`List #${res.list.list_id} created`);
      // Don't leave the create button there - it would make a duplicate list.
      $('#preview').replaceChildren(h('p', {}, `List #${res.list.list_id} was created from this preview. Shop with it in Step 3 below. `,
        h('button', { class: 'link-btn', type: 'button', onclick: preview }, 'Show the preview again')));
      loadLists();
      showList(res.list);
    } catch (err) {
      showFieldErrors(gen, err);
    }
  }

  async function loadLists() {
    try {
      const { lists } = await api('/grocery-lists', { query: { status: $('#f-status').value } });
      $('#lists').replaceChildren(table(lists, [
        { key: 'list_id', label: 'List', render: (r) => h('a', { href: `?list=${r.list_id}`, onclick: (e) => { e.preventDefault(); openList(r.list_id); } }, `#${r.list_id}`) },
        { key: 'created_at', label: 'Created' },
        { key: 'status' },
        { key: 'item_count', label: 'Items', class: 'num' },
        { key: 'estimated_total', label: 'Total', class: 'num', render: (r) => h('span', { class: r.over_budget ? 'pill-bad' : '' }, money(r.estimated_total)) },
        { key: 'max_budget', label: 'Budget', class: 'num' },
        { key: 'percent_purchased', label: 'Bought', class: 'num', render: (r) => `${r.percent_purchased}%` },
      ], { empty: 'No grocery lists yet.' }));
    } catch (err) {
      showError(err);
    }
  }

  async function openList(id) {
    try {
      showList((await api(`/grocery-lists/${id}`)).list);
    } catch (err) {
      showError(err);
    }
  }

  async function mutate(path, opts, message) {
    try {
      const res = await api(path, opts);
      if (message) toast(message);
      if (res.list) showList(res.list, false);
      loadLists();
      return res;
    } catch (err) {
      showError(err);
      return null;
    }
  }

  // Step 3: a single list - tick items off while shopping, then complete it.
  function showList(list, scroll = true) {
    history.replaceState(null, '', `?list=${list.list_id}`);
    const box = $('#detail');
    box.classList.remove('hidden');
    const active = list.status === 'Active';

    const addForm = h('form', { novalidate: true },
      h('h3', {}, 'Add something else'),
      h('div', { class: 'row' },
        h('label', {}, 'Ingredient', h('input', { name: 'ingredient_name', required: true, placeholder: 'Start typing...' })),
        h('label', {}, 'Quantity', h('input', { name: 'quantity_to_buy', type: 'number', min: '0.01', step: '0.01', required: true })),
        h('label', {}, 'Unit price ($)', h('input', { name: 'estimated_unit_price', type: 'number', min: '0', step: '0.01', placeholder: 'catalog price' })),
        h('div', {}, h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Add'))));
    let picked = null;
    App.ingredientPicker(addForm.elements.ingredient_name, (ing) => {
      picked = ing;
      addForm.elements.estimated_unit_price.placeholder = ing ? `${ing.estimated_unit_price} per ${ing.base_unit}` : 'catalog price';
    });
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(addForm)) return;
      const body = formData(addForm);
      delete body.ingredient_name;
      body.ingredient_id = picked.ingredient_id;
      await mutate(`/grocery-lists/${list.list_id}/items`, { method: 'POST', body }, `Added ${picked.name}`);
    });

    const budgetInput = h('input', { type: 'number', min: '0', step: '0.01', value: list.max_budget, style: 'width:7rem', 'aria-label': 'Budget' });

    box.replaceChildren(
      h('div', { class: 'card-head' },
        h('h2', {}, `Step 3: Shop with list #${list.list_id} (${list.status})`),
        h('div', { class: 'actions' },
          App.exportButtons('grocery-list', { id: list.list_id }),
          h('a', { class: 'btn btn-small btn-ghost', href: `/xml-viewer?list=${list.list_id}` }, 'View as XML'))),
      active
        ? h('p', { class: 'small' }, 'Tick each item as you buy it. When you are done, press ', h('strong', {}, 'Complete list'),
          ' and everything you ticked is added to your pantry.')
        : h('p', { class: 'small muted' }, list.status === 'Completed'
          ? 'This list is completed. The ticked items were added to your pantry.'
          : 'This list is archived. Re-open it to make changes.'),
      budgetBar(list.estimated_total, list.max_budget),
      table(list.items, [
        { key: 'is_purchased', label: 'Bought', class: 'no-strike', render: (r) => h('input', {
          type: 'checkbox', checked: r.is_purchased, disabled: !active, 'aria-label': `Bought ${r.name}`,
          onchange: (e) => mutate(`/grocery-lists/${list.list_id}/items/${r.item_id}`, { method: 'PUT', body: { is_purchased: e.target.checked } }),
        }) },
        { key: 'name', label: 'Item' },
        { key: 'category' },
        { key: 'quantity_to_buy', label: 'Quantity', class: 'num', render: (r) => `${num(r.quantity_to_buy)} ${r.unit}` },
        { key: 'estimated_unit_price', label: 'Unit price', class: 'num' },
        { key: 'line_total', label: 'Line total', class: 'num' },
        { key: 'x', label: '', class: 'no-strike', render: (r) => active && h('button', { class: 'link-btn small', type: 'button',
          onclick: () => mutate(`/grocery-lists/${list.list_id}/items/${r.item_id}`, { method: 'DELETE' }, `Removed ${r.name}`) }, 'Remove') },
      ], { empty: 'This list has no items.', rowClass: (r) => (r.is_purchased ? 'row-done' : '') }),
      active ? addForm : null,
      h('div', { class: 'form-actions' },
        active && h('span', { class: 'actions small' }, 'Budget: ', budgetInput,
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => {
            const v = Number(budgetInput.value);
            if (budgetInput.value === '' || v < 0) { toast('Budget must be 0 or more', 'error'); return; }
            mutate(`/grocery-lists/${list.list_id}`, { method: 'PUT', body: { max_budget: v } }, 'Budget updated');
          } }, 'Update')),
        active && h('button', { class: 'btn btn-ghost', type: 'button',
          onclick: () => mutate(`/grocery-lists/${list.list_id}`, { method: 'PUT', body: { status: 'Archived' } }, 'List archived') }, 'Archive'),
        list.status === 'Archived' && h('button', { class: 'btn btn-ghost', type: 'button',
          onclick: () => mutate(`/grocery-lists/${list.list_id}`, { method: 'PUT', body: { status: 'Active' } }, 'List re-opened') }, 'Re-open'),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
          if (await confirmDialog(`Delete list #${list.list_id}? This cannot be undone.`)) {
            const r = await mutate(`/grocery-lists/${list.list_id}`, { method: 'DELETE' }, 'List deleted');
            if (r) { box.classList.add('hidden'); history.replaceState(null, '', '/grocery'); }
          }
        } }, 'Delete list'),
        active && h('button', { class: 'btn', type: 'button', onclick: async () => {
          if (await confirmDialog('Complete this list? Every ticked item will be added to your pantry.')) {
            const r = await mutate(`/grocery-lists/${list.list_id}/complete`, { method: 'POST' });
            if (r) toast(`List completed. ${r.movedToPantry} item(s) added to your pantry.`);
          }
        } }, 'Complete list')),
    );
    if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ['from', 'to'].forEach((n) => gen.elements[n].addEventListener('change', preview));
  gen.elements.max_budget.addEventListener('input', debounce(preview, 400));
  gen.addEventListener('submit', (e) => { e.preventDefault(); preview(); });
  $('#f-status').addEventListener('change', loadLists);

  preview();
  await loadLists();
  const openId = Number(new URLSearchParams(window.location.search).get('list'));
  if (openId) openList(openId);
})();
