// Fetches the grocery-list XML document and renders it with DOMParser.
(async () => {
  const { $, h, api, table, money, showError } = App;
  await App.init();

  const { lists } = await api('/grocery-lists');
  const select = $('#list-select');
  select.append(...lists.map((l) => h('option', { value: l.list_id }, `#${l.list_id} · ${l.status}`)));
  const wanted = new URLSearchParams(window.location.search).get('list');
  if (wanted) select.value = wanted;

  const text = (el, sel) => el.querySelector(sel)?.textContent ?? '';

  async function load() {
    const id = select.value;
    if (!id) { $('#parsed').replaceChildren(h('p', { class: 'empty' }, 'You have no grocery lists yet.')); return; }
    history.replaceState(null, '', `?list=${id}`);
    $('#raw-link').href = `/api/grocery-lists/${id}/xml`;
    try {
      const res = await fetch(`/api/grocery-lists/${id}/xml`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Could not load XML (HTTP ${res.status})`);
      const xmlText = await res.text();
      $('#raw').textContent = xmlText;
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('The XML document could not be parsed');

      const root = doc.documentElement;
      const items = [...doc.querySelectorAll('items > item')].map((it) => ({
        item: text(it, 'ingredient'),
        category: text(it, 'category'),
        quantity: `${text(it, 'quantity')} ${it.querySelector('quantity').getAttribute('unit')}`,
        unit_price: Number(text(it, 'unitPrice')),
        line_total: Number(text(it, 'lineTotal')),
        purchased: it.getAttribute('purchased') === 'true',
      }));
      $('#parsed').replaceChildren(
        h('div', { class: 'card-head' },
          h('h2', {}, `List #${root.getAttribute('id')} · ${root.getAttribute('status')}`),
          h('span', { class: 'muted' }, `Owner: ${text(doc, 'owner')} · created ${App.date(text(doc, 'createdAt'))}`)),
        h('div', { class: 'stats' },
          ...[['Budget', money(text(doc, 'budget'))], ['Estimated total', money(text(doc, 'estimatedTotal'))],
            ['Purchased', money(text(doc, 'purchasedTotal'))], ['Remaining', money(text(doc, 'remainingBudget'))]]
            .map(([label, value]) => h('div', { class: `stat ${label === 'Remaining' && text(doc, 'overBudget') === 'true' ? 'bad' : ''}` },
              h('div', { class: 'label' }, label), h('div', { class: 'value' }, value)))),
        table(items, null, { empty: 'This list has no items.' }));
    } catch (err) {
      showError(err);
    }
  }

  select.addEventListener('change', load);
  load();
})();
