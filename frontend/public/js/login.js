// Login, registration and guest access.
(() => {
  const { $, $$, api, validateForm, formData, showFieldErrors } = App;
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const next = new URLSearchParams(window.location.search).get('next');
  // Only allow redirects to local paths.
  const goNext = () => { window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'; };

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    loginForm.classList.toggle('hidden', tab.dataset.tab !== 'login');
    registerForm.classList.toggle('hidden', tab.dataset.tab !== 'register');
  }));

  async function submit(form, path, body) {
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api(path, { method: 'POST', body });
      goNext();
    } catch (err) {
      showFieldErrors(form, err);
    } finally {
      btn.disabled = false;
    }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm(loginForm)) submit(loginForm, '/auth/login', formData(loginForm));
  });

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = validateForm(registerForm, {
      confirm: (v, f) => (v !== f.elements.password.value ? 'Passwords do not match' : ''),
    });
    if (!ok) return;
    const body = formData(registerForm);
    delete body.confirm;
    submit(registerForm, '/auth/register', body);
  });

  $('#guest-btn').addEventListener('click', async () => {
    try {
      await api('/auth/guest', { method: 'POST' });
      goNext();
    } catch (err) {
      App.showError(err);
    }
  });

  $$('.demo-accounts button').forEach((b) => b.addEventListener('click', () => {
    $$('.tab')[0].click();
    loginForm.elements.email.value = b.dataset.email;
    loginForm.elements.password.value = b.dataset.pw;
    loginForm.elements.password.focus();
  }));
})();
