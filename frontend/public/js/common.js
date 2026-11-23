// Shared frontend helpers used by every page: API calls (fetch/AJAX),
// navigation, notifications, tables, forms, modals and formatting.
/* exported App */
const App = (() => {
  let currentUser = null;

  // ---- API ------------------------------------------------------------------
  class ApiError extends Error {
    constructor(status, message, details) {
      super(message);
      this.status = status;
      this.details = details || [];
    }
  }

  async function api(path, { method = 'GET', body, query } = {}) {
    let url = `/api${path}`;
    if (query) {
      const qs = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, v); });
      if ([...qs].length) url += `?${qs}`;
    }
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the server. Is it running?');
    }
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      throw new ApiError(401, 'Session expired');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data.error || {};
      throw new ApiError(res.status, err.message || `Request failed (${res.status})`, err.details);
    }
    return data;
  }

  // ---- DOM helpers ------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // h('div', {class: 'x', onclick: fn}, child1, 'text') - builds elements without innerHTML (XSS-safe)
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // ---- Formatting -------------------------------------------------------------
  const money = (n) => (n === null || n === undefined || n === '' ? '' : `$${Number(n).toFixed(2)}`);
  const num = (n, d = 2) => (n === null || n === undefined ? '' : String(Math.round(Number(n) * 10 ** d) / 10 ** d));
  function date(d) {
    if (!d) return '';
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function isoDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const pretty = (col) => col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  function formatAuto(col, v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    // money columns: *_price*, *_cost*, *_budget*, *_value, *_total (but not e.g. total_on_hand)
    if (/(price|cost|budget|value$|(^|_)total$)/.test(col) && typeof v === 'number') return money(v);
    if (/(_date|_at|^date|last_updated|observed_on)/.test(col)) return date(v);
    return String(v);
  }

  // ---- Notifications ------------------------------------------------------------
  function toast(message, type = 'success') {
    let box = $('#toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' }, message);
    box.append(t);
    setTimeout(() => t.classList.add('hide'), 3800);
    setTimeout(() => t.remove(), 4300);
  }

  function showError(err) {
    const detail = err.details && err.details.length ? `: ${err.details.map((d) => d.message || d.constraint).join('; ')}` : '';
    toast(`${err.message}${detail}`, 'error');
  }

  // ---- Tables -------------------------------------------------------------------
  // columns: [{key, label, render(row) -> Node|string, class}] or omitted for automatic columns.
  function table(rows, columns, { empty = 'No records found.', rowClass } = {}) {
    if (!rows.length) return h('p', { class: 'empty' }, empty);
    const cols = columns || Object.keys(rows[0]).map((key) => ({ key }));
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.class }, c.label ?? pretty(c.key))))),
        h('tbody', {}, rows.map((r) => h('tr', { class: rowClass ? rowClass(r) : null },
          cols.map((c) => h('td', { class: c.class, 'data-label': c.label ?? pretty(c.key) },
            c.render ? c.render(r) : formatAuto(c.key, r[c.key]))))))));
  }

  // ---- Forms --------------------------------------------------------------------
  // Reads a form into an object; number inputs become numbers, empty fields are omitted.
  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') { out[el.name] = el.checked; continue; }
      const v = el.value.trim();
      if (v === '') continue;
      out[el.name] = el.type === 'number' ? Number(v) : v;
    }
    return out;
  }

  // Client-side validation using HTML5 constraints plus optional custom checks.
  // Shows messages next to the fields and returns true when valid.
  function validateForm(form, custom = {}) {
    let ok = true;
    $$('.field-error', form).forEach((e) => e.remove());
    $$('.invalid', form).forEach((e) => e.classList.remove('invalid'));
    for (const el of form.elements) {
      if (!el.name) continue;
      // Only touch custom validity for fields with a custom rule, so validity set
      // elsewhere (e.g. the ingredient picker) is preserved.
      if (custom[el.name]) el.setCustomValidity(custom[el.name](el.value.trim(), form) || '');
      if (!el.checkValidity()) {
        ok = false;
        el.classList.add('invalid');
        el.insertAdjacentElement('afterend', h('small', { class: 'field-error' }, el.validationMessage));
      }
    }
    if (!ok) { const first = $('.invalid', form); if (first) first.focus(); }
    return ok;
  }

  // Shows server-side validation errors (400 details) next to the matching fields.
  function showFieldErrors(form, err) {
    let placed = false;
    for (const d of err.details || []) {
      const el = d.field && form.elements[d.field];
      if (el && el.insertAdjacentElement) {
        el.classList.add('invalid');
        el.insertAdjacentElement('afterend', h('small', { class: 'field-error' }, d.message));
        placed = true;
      }
    }
    if (!placed || err.status !== 400) showError(err);
  }

  function fillForm(form, data) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in data)) continue;
      if (el.type === 'checkbox') el.checked = !!data[el.name];
      else el.value = data[el.name] ?? '';
    }
  }

  const debounce = (fn, ms = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // ---- Modal dialog ---------------------------------------------------------------
  function modal(title, content, { wide = false } = {}) {
    const dlg = h('dialog', { class: `modal${wide ? ' modal-wide' : ''}` },
      h('div', { class: 'modal-head' },
        h('h2', {}, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
      h('div', { class: 'modal-body' }, content));
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      let answered = false;
      const dlg = modal('Please confirm', h('div', {},
        h('p', {}, message),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
          h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { answered = true; dlg.close(); } }, 'Confirm'))));
      dlg.addEventListener('close', () => resolve(answered));
    });
  }

  // ---- Ingredient autocomplete (datalist + unit auto-fill) ---------------------------
  let ingredientCache = null;
  async function ingredients() {
    if (!ingredientCache) ingredientCache = (await api('/ingredients')).ingredients;
    return ingredientCache;
  }
  const clearIngredientCache = () => { ingredientCache = null; };

  // Wires a text input to a <datalist> of ingredient names. onPick(ingredient|null)
  // fires whenever the typed text matches (or stops matching) an ingredient.
  async function ingredientPicker(input, onPick) {
    const list = await ingredients();
    const id = `dl-${Math.random().toString(36).slice(2)}`;
    const dl = h('datalist', { id }, list.map((i) => h('option', { value: i.name }, `${i.category} · ${money(i.estimated_unit_price)}/${i.base_unit}`)));
    input.setAttribute('list', id);
    input.setAttribute('autocomplete', 'off');
    input.after(dl);
    const check = () => {
      const match = list.find((i) => i.name.toLowerCase() === input.value.trim().toLowerCase()) || null;
      input.setCustomValidity(input.value.trim() && !match ? 'Pick an ingredient from the suggestions' : '');
      onPick(match);
    };
    input.addEventListener('input', check);
    input.addEventListener('change', check);
    return { find: (name) => list.find((i) => i.name.toLowerCase() === String(name).toLowerCase()) };
  }

  // ---- Navigation ------------------------------------------------------------------
  // Order follows the normal workflow: stock pantry -> recipes -> plan -> shop.
  const NAV = [
    { href: '/', label: 'Dashboard', roles: ['Admin', 'User', 'Guest'] },
    { href: '/pantry', label: 'Pantry', roles: ['Admin', 'User'] },
    { href: '/recipes', label: 'Recipes', roles: ['Admin', 'User', 'Guest'] },
    { href: '/planner', label: 'Meal Planner', roles: ['Admin', 'User'] },
    { href: '/grocery', label: 'Grocery List', roles: ['Admin', 'User'] },
    { href: '/ingredients', label: 'Ingredients', roles: ['Admin', 'User', 'Guest'] },
    { href: '/views', label: 'Reports', roles: ['Admin', 'User', 'Guest'] },
    { href: '/admin', label: 'Admin', roles: ['Admin'] },
  ];

  function renderNav(user) {
    const header = $('#app-nav');
    if (!header) return;
    const path = window.location.pathname;
    const links = NAV.filter((n) => n.roles.includes(user.role));
    header.replaceChildren(
      h('div', { class: 'nav-inner' },
        h('a', { class: 'brand', href: '/' }, 'NutriCart SmartPantry'),
        h('nav', { class: 'nav-links' },
          links.map((n) => h('a', { href: n.href, class: path === n.href ? 'active' : null, 'aria-current': path === n.href ? 'page' : null }, n.label))),
        h('div', { class: 'nav-user' },
          h('span', {}, user.name, ' ', h('span', { class: 'role-badge' }, user.role)),
          user.role !== 'Guest' && h('a', { href: '/account', class: path === '/account' ? 'active' : null }, 'Account'),
          h('button', { class: 'link-btn', type: 'button', onclick: logout }, 'Log out'))));
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/login';
  }

  // Every page calls App.init() first: loads the session user and renders the nav.
  async function init() {
    const { user } = await api('/auth/me');
    if (!user) { window.location.href = '/login'; throw new Error('not logged in'); }
    currentUser = user;
    renderNav(user);
    document.body.classList.add(`role-${user.role.toLowerCase()}`);
    if (new URLSearchParams(window.location.search).get('denied')) toast('You do not have access to that page.', 'error');
    return user;
  }

  const user = () => currentUser;
  const canWrite = () => currentUser && currentUser.role !== 'Guest';
  const isAdmin = () => currentUser && currentUser.role === 'Admin';

  // Export helper: downloads /api/export/<dataset>?format=csv|pdf
  function exportButtons(dataset, extra = {}) {
    const link = (format) => {
      const qs = new URLSearchParams({ format, ...extra });
      return h('a', { class: 'btn btn-small btn-ghost', href: `/api/export/${dataset}?${qs}`, download: '' }, `Export ${format.toUpperCase()}`);
    };
    return h('span', { class: 'export-buttons' }, link('csv'), link('pdf'));
  }

  // Chart.js shared defaults (Chart is loaded from /vendor/chart.umd.min.js).
  // Matches the colours in style.css: green, blue, amber, red, then extras.
  const COLORS = ['#1f7a4d', '#2b6cb0', '#d69e2e', '#c0262d', '#6b46c1', '#0f766e', '#b83280', '#5b6675'];
  let chartDefaultsSet = false;
  function chart(canvas, config) {
    if (!window.Chart) return null;
    if (!chartDefaultsSet) {
      const d = window.Chart.defaults;
      d.font.family = getComputedStyle(document.body).fontFamily;
      d.color = '#5b6675';
      d.borderColor = '#e5e9ef';
      chartDefaultsSet = true;
    }
    const existing = window.Chart.getChart(canvas);
    if (existing) existing.destroy();
    return new window.Chart(canvas, {
      ...config,
      options: { responsive: true, maintainAspectRatio: false, ...config.options },
    });
  }

  return {
    api, ApiError, $, $$, h, money, num, date, isoDate, pretty, formatAuto, toast, showError, table,
    formData, validateForm, showFieldErrors, fillForm, debounce, modal, confirmDialog,
    ingredients, clearIngredientCache, ingredientPicker, init, user, canWrite, isAdmin, exportButtons, chart, COLORS,
  };
})();
