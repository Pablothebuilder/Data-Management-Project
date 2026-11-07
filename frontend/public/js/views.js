// Reports page: runs each of the 10 database views and renders the result as
// an HTML table, with client-side filter/sort and CSV/PDF export.
(async () => {
  const { $, h, api, table, showError, pretty } = App;
  await App.init();

  const { views } = await api('/views');
  let rows = [];
  let current = null;

  $('#tabs').replaceChildren(...views.map((v) => h('button', {
    class: 'tab', type: 'button', role: 'tab', disabled: !v.accessible, dataset: { name: v.name },
    title: v.accessible ? v.description : 'Not available for your role',
    onclick: () => open(v.name),
  }, `${v.number}. ${v.title}`)));

  function render() {
    const q = $('#f-q').value.trim().toLowerCase();
    const sortKey = $('#f-sort').value;
    const dir = $('#f-dir').value === 'desc' ? -1 : 1;
    let shown = q ? rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))) : [...rows];
    if (sortKey) {
      shown.sort((a, b) => {
        const x = a[sortKey];
        const y = b[sortKey];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
      });
    }
    $('#row-count').textContent = `${shown.length} of ${rows.length} row(s)`;
    $('#view-table').replaceChildren(table(shown, null, { empty: 'This view returned no rows.' }));
  }

  async function open(name) {
    $('#f-q').value = '';
    history.replaceState(null, '', `?v=${name}`);
    document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.name === name));
    try {
      const data = await api(`/views/${name}`);
      current = data.view;
      rows = data.rows;
      $('#view-title').textContent = `View ${current.number}: ${current.title}`;
      $('#view-req').textContent = `Requirement: ${current.requirement} · ${current.scope === 'user' && !App.isAdmin() ? 'showing your rows only' : 'all rows'}`;
      $('#view-desc').textContent = current.description;
      $('#view-used').replaceChildren(...current.usedIn.map((u) => h('li', {}, u)));
      $('#view-sql').textContent = current.sql;
      $('#view-actions').replaceChildren(App.exportButtons(current.name));
      const cols = rows.length ? Object.keys(rows[0]) : [];
      $('#f-sort').replaceChildren(h('option', { value: '' }, '(view order)'), ...cols.map((c) => h('option', { value: c }, pretty(c))));
      render();
    } catch (err) {
      showError(err);
    }
  }

  $('#f-q').addEventListener('input', render);
  $('#f-sort').addEventListener('change', render);
  $('#f-dir').addEventListener('change', render);

  const wanted = new URLSearchParams(window.location.search).get('v');
  const first = views.find((v) => v.name === wanted && v.accessible) || views.find((v) => v.accessible);
  if (first) open(first.name);
})();
