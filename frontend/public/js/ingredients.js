// Ingredient catalog: search/filter, CRUD (role-dependent), Open Food Facts
// import, price refresh from Open Prices and a price-history chart.
(async () => {
  const { $, h, api, table, money, num, toast, showError, validateForm, formData, showFieldErrors, debounce, confirmDialog, modal, chart, COLORS } = App;
  await App.init();
  $('#export').append(App.exportButtons('ingredients'));

  async function loadCategories() {
    const { categories } = await api('/ingredients/categories');
    const sel = $('#f-category');
    const current = sel.value;
    sel.replaceChildren(h('option', { value: '' }, 'All'), ...categories.map((c) => h('option', { value: c.category }, `${c.category} (${c.count})`)));
    sel.value = current;
    return categories;
  }

  async function load() {
    try {
      const { ingredients } = await api('/ingredients', {
        query: { q: $('#f-q').value.trim(), category: $('#f-category').value, maxPrice: $('#f-price').value, minProtein: $('#f-protein').value, usage: $('#f-usage').value, sort: $('#f-sort').value },
      });
      $('#table').replaceChildren(table(ingredients, [
        { key: 'name', render: (r) => h('span', {}, r.name, r.off_product_code ? h('span', { class: 'tag', title: `Barcode ${r.off_product_code}` }, 'imported') : null) },
        { key: 'category' },
        { key: 'base_unit', label: 'Unit' },
        { key: 'estimated_unit_price', label: 'Price / unit', class: 'num' },
        { key: 'calories_per_unit', label: 'kcal / unit', class: 'num' },
        { key: 'protein_g', label: 'Protein', class: 'num', render: (r) => `${num(r.protein_g, 1)} g` },
        { key: 'carbs_g', label: 'Carbs', class: 'num', render: (r) => `${num(r.carbs_g, 1)} g` },
        { key: 'fat_g', label: 'Fat', class: 'num', render: (r) => `${num(r.fat_g, 1)} g` },
        { key: 'recipes_using', label: 'Used in', class: 'num', render: (r) => `${r.recipes_using} recipe(s)` },
        { key: 'households_stocking', label: 'Households', class: 'num', title: 'Users who have it in their pantry' },
        { key: 'a', label: '', render: (r) => h('div', { class: 'actions' },
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => prices(r) }, 'Prices'),
          App.isAdmin() && h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => editor(r) }, 'Edit'),
          App.isAdmin() && h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: () => remove(r) }, 'Delete')) },
      ], { empty: 'No ingredients match your filters.' }));
    } catch (err) {
      showError(err);
    }
  }

  function ingredientForm(data = {}) {
    const field = (label, name, attrs = {}) => h('label', {}, label, h('input', { name, value: data[name] ?? '', ...attrs }));
    return h('form', { novalidate: true },
      h('div', { class: 'row' },
        field('Name', 'name', { required: true, maxlength: '100' }),
        h('label', {}, 'Category', h('input', { name: 'category', required: true, maxlength: '50', list: 'cat-list', value: data.category ?? '' }))),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        h('label', {}, 'Unit', h('input', { name: 'base_unit', required: true, maxlength: '20', list: 'unit-list', value: data.base_unit ?? '100g' })),
        field('Price per unit ($)', 'estimated_unit_price', { type: 'number', min: '0', step: '0.01', required: true }),
        field('Calories per unit', 'calories_per_unit', { type: 'number', min: '0', step: '1', required: true })),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        field('Protein (g)', 'protein_g', { type: 'number', min: '0', step: '0.1' }),
        field('Carbs (g)', 'carbs_g', { type: 'number', min: '0', step: '0.1' }),
        field('Fat (g)', 'fat_g', { type: 'number', min: '0', step: '0.1' })),
      h('datalist', { id: 'unit-list' }, ['100g', '100ml', 'each', 'L', 'kg', 'tbsp', 'tsp', 'cup', 'slice', 'clove', 'can'].map((u) => h('option', { value: u }))),
      h('datalist', { id: 'cat-list' }, catNames.map((c) => h('option', { value: c }))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, data.ingredient_id ? 'Save changes' : 'Add ingredient')));
  }

  function editor(data) {
    const f = ingredientForm(data || {});
    const dlg = modal(data ? `Edit ${data.name}` : 'Add ingredient', f, { wide: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(f)) return;
      try {
        if (data) await api(`/ingredients/${data.ingredient_id}`, { method: 'PUT', body: formData(f) });
        else await api('/ingredients', { method: 'POST', body: formData(f) });
        dlg.close();
        toast(data ? 'Ingredient updated' : 'Ingredient added');
        App.clearIngredientCache();
        refresh();
      } catch (err) {
        showFieldErrors(f, err);
      }
    });
  }

  async function remove(r) {
    if (!(await confirmDialog(`Delete ${r.name}? It will also be removed from every pantry, recipe and grocery list.`))) return;
    try {
      await api(`/ingredients/${r.ingredient_id}`, { method: 'DELETE' });
      toast(`${r.name} deleted`);
      refresh();
    } catch (err) {
      showError(err);
    }
  }

  async function prices(r) {
    const body = h('div', {});
    const dlg = modal(`${r.name} · price history`, body, { wide: true });
    const render = async () => {
      const { prices: rows } = await api(`/ingredients/${r.ingredient_id}/prices`);
      const canvas = h('canvas', { 'aria-label': 'Price history chart' });
      const codeInput = h('input', { placeholder: 'Barcode (EAN)', value: r.off_product_code || '', pattern: '\\d{4,32}', style: 'max-width:14rem' });
      body.replaceChildren(
        h('p', { class: 'muted' }, `Current estimate: ${money(r.estimated_unit_price)} per ${r.base_unit}. Observations come from the Open Prices API (or sample data).`),
        rows.length ? h('div', { class: 'chart-box', style: 'height:220px' }, canvas) : null,
        table(rows, [
          { key: 'observed_on', label: 'Date' },
          { key: 'source' },
          { key: 'product_name', label: 'Product' },
          { key: 'observed_price', label: 'Price', class: 'num', render: (p) => `${num(p.observed_price)} ${p.currency}` },
          { key: 'price_per_base_unit', label: 'Per 100g/ml', class: 'num', render: (p) => (p.price_per_base_unit === null ? '—' : `${num(p.price_per_base_unit)} ${p.currency}`) },
        ], { empty: 'No price observations stored yet.' }),
        App.canWrite() ? h('div', { class: 'form-actions' }, codeInput,
          h('button', { class: 'btn btn-orange', type: 'button', onclick: async (e) => {
            const code = codeInput.value.trim();
            if (code && !/^\d{4,32}$/.test(code)) { toast('Barcode must be 4-32 digits', 'error'); return; }
            e.target.disabled = true;
            try {
              const res = await api(`/external/prices/${r.ingredient_id}`, { method: 'POST', body: code ? { code } : {} });
              Object.assign(r, res.ingredient);
              toast(`${res.observationsFound} observation(s) found, ${res.pricesStored} new saved${res.priceUpdated ? ` · price now ${money(res.ingredient.estimated_unit_price)}` : ''}`,
                res.observationsFound ? 'success' : 'info');
              await render();
              load();
            } catch (err) {
              showError(err);
              e.target.disabled = false;
            }
          } }, 'Fetch latest prices')) : null);
      if (rows.length) {
        chart(canvas, {
          type: 'line',
          data: {
            labels: rows.map((p) => p.observed_on || App.date(p.fetched_at)),
            datasets: [{ label: 'Observed price', data: rows.map((p) => p.observed_price), borderColor: COLORS[0], backgroundColor: COLORS[0], tension: 0.25 }],
          },
          options: { plugins: { legend: { display: false } } },
        });
      }
    };
    render().catch((err) => { showError(err); dlg.close(); });
  }

  // ---- Open Food Facts search + import ----------------------------------------
  const offForm = $('#off-form');
  offForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(offForm)) return;
    const out = $('#off-results');
    out.replaceChildren(h('p', { class: 'muted' }, 'Searching Open Food Facts…'));
    try {
      const { products } = await api('/external/products', { query: formData(offForm) });
      out.replaceChildren(products.length
        ? h('div', { class: 'product-grid' }, products.map(productCard))
        : h('p', { class: 'empty' }, 'No products found. Try a more general term.'));
    } catch (err) {
      out.replaceChildren(h('p', { class: 'field-error' }, err.message));
    }
  });

  function productCard(p) {
    return h('div', { class: 'product' },
      p.image_url ? h('img', { src: p.image_url, alt: p.name, loading: 'lazy' }) : null,
      h('div', { class: 'name' }, p.name),
      h('div', { class: 'muted small' }, [p.brands, p.category].filter(Boolean).join(' · ')),
      h('div', { class: 'small' }, `Per 100g: ${p.calories_per_unit} kcal · P ${p.protein_g}g · C ${p.carbs_g}g · F ${p.fat_g}g`),
      p.imported_ingredient_id
        ? h('span', { class: 'pill pill-grey' }, 'Already imported')
        : h('button', { class: 'btn btn-small', type: 'button', onclick: () => importDialog(p) }, 'Import'));
  }

  function importDialog(p) {
    const f = h('form', { novalidate: true },
      h('p', { class: 'muted small' }, `Barcode ${p.code}. Nutrition is stored per 100g. If you leave the price empty we estimate it from Open Prices observations.`),
      h('div', { class: 'row' },
        h('label', {}, 'Name in catalog', h('input', { name: 'name', required: true, maxlength: '100', value: p.name.slice(0, 100) })),
        h('label', {}, 'Category', h('input', { name: 'category', required: true, maxlength: '50', value: p.category, list: 'cat-list2' })),
        h('label', {}, 'Price per 100g ($)', h('input', { name: 'estimated_unit_price', type: 'number', min: '0', step: '0.01', placeholder: 'auto' }))),
      h('datalist', { id: 'cat-list2' }, catNames.map((c) => h('option', { value: c }))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, 'Import ingredient')));
    const dlg = modal(`Import "${p.name}"`, f, { wide: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(f)) return;
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const res = await api('/external/import', { method: 'POST', body: { code: p.code, ...formData(f) } });
        dlg.close();
        p.imported_ingredient_id = res.ingredient.ingredient_id;
        toast(`Imported ${res.ingredient.name} · price ${money(res.ingredient.estimated_unit_price)} (${res.priceSource}) · ${res.pricesStored} price observation(s) saved`);
        if (res.warning) toast(res.warning, 'info');
        App.clearIngredientCache();
        $('#off-form').requestSubmit();
        refresh();
      } catch (err) {
        btn.disabled = false;
        showFieldErrors(f, err);
      }
    });
  }

  let catNames = [];
  async function refresh() {
    catNames = (await loadCategories()).map((c) => c.category);
    load();
  }

  $('#new-ingredient').addEventListener('click', () => editor(null));
  $('#f-q').addEventListener('input', debounce(load));
  ['#f-price', '#f-protein'].forEach((s) => $(s).addEventListener('input', debounce(load)));
  ['#f-category', '#f-usage', '#f-sort'].forEach((s) => $(s).addEventListener('change', load));
  refresh();
})();
