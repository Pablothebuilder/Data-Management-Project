// Admin page: CRUD on Users (Admin role only - enforced by the server too).
(async () => {
  const { $, h, api, table, toast, showError, validateForm, formData, showFieldErrors, debounce, confirmDialog, modal } = App;
  const me = await App.init();

  async function load() {
    try {
      const { users } = await api('/users', { query: { q: $('#f-q').value.trim(), role: $('#f-role').value, sort: $('#f-sort').value } });
      $('#table').replaceChildren(table(users, [
        { key: 'user_id', label: 'ID', class: 'num' },
        { key: 'name' },
        { key: 'email' },
        { key: 'role' },
        { key: 'weekly_budget_limit', label: 'Weekly budget', class: 'num' },
        { key: 'target_calories', label: 'kcal target', class: 'num' },
        // activity columns: View 10 (v_user_activity_summary)
        { key: 'pantry_items', label: 'Pantry items', class: 'num' },
        { key: 'meals_next_7_days', label: 'Meals next 7 days', class: 'num' },
        { key: 'active_lists', label: 'Active lists', class: 'num' },
        { key: 'recipes_authored', label: 'Recipes', class: 'num' },
        { key: 'created_at', label: 'Joined' },
        { key: 'a', label: '', render: (u) => h('div', { class: 'actions' },
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => editor(u) }, 'Edit'),
          u.user_id !== me.user_id && h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: () => remove(u) }, 'Delete')) },
      ], { empty: 'No users match.' }));
    } catch (err) {
      showError(err);
    }
  }

  function editor(u) {
    const isNew = !u;
    const data = u || { role: 'User', weekly_budget_limit: 75 };
    const f = h('form', { novalidate: true },
      h('div', { class: 'row' },
        h('label', {}, 'Name', h('input', { name: 'name', required: true, maxlength: '100', value: data.name || '' })),
        h('label', {}, 'Email', h('input', { name: 'email', type: 'email', required: true, maxlength: '100', value: data.email || '' }))),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        h('label', {}, 'Role', h('select', { name: 'role', disabled: u && u.user_id === me.user_id }, ['User', 'Admin', 'Guest'].map((r) => h('option', { selected: r === data.role }, r)))),
        h('label', {}, 'Weekly budget ($)', h('input', { name: 'weekly_budget_limit', type: 'number', min: '0', step: '0.01', required: true, value: data.weekly_budget_limit ?? '' })),
        h('label', {}, 'Calorie target', h('input', { name: 'target_calories', type: 'number', min: '1', max: '20000', step: '1', value: data.target_calories ?? '' }))),
      h('label', { style: 'margin-top:.6rem' }, isNew ? 'Password' : 'New password', h('span', { class: 'hint' }, isNew ? 'At least 8 characters' : 'Leave empty to keep the current password'),
        h('input', { name: 'password', type: 'password', minlength: '8', maxlength: '100', required: isNew, autocomplete: 'new-password' })),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, isNew ? 'Create user' : 'Save changes')));
    const dlg = modal(isNew ? 'New user' : `Edit ${u.name}`, f, { wide: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(f)) return;
      const body = formData(f);
      if (!isNew && f.elements.target_calories.value === '') body.target_calories = null;
      try {
        if (isNew) await api('/users', { method: 'POST', body });
        else await api(`/users/${u.user_id}`, { method: 'PUT', body });
        dlg.close();
        toast(isNew ? 'User created' : 'User updated');
        load();
      } catch (err) {
        showFieldErrors(f, err);
      }
    });
  }

  async function remove(u) {
    if (!(await confirmDialog(`Delete ${u.name} (${u.email})? Their pantry, meal plans and grocery lists will be deleted too.`))) return;
    try {
      await api(`/users/${u.user_id}`, { method: 'DELETE' });
      toast('User deleted');
      load();
    } catch (err) {
      showError(err);
    }
  }

  $('#new-user').addEventListener('click', () => editor(null));
  $('#f-q').addEventListener('input', debounce(load));
  ['#f-role', '#f-sort'].forEach((s) => $(s).addEventListener('change', load));
  load();
})();
