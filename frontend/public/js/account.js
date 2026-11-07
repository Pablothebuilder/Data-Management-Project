// Account page: edit your own profile (PUT /api/users/me).
(async () => {
  const { $, api, toast, validateForm, formData, showFieldErrors, fillForm } = App;
  await App.init();
  const form = $('#profile-form');
  const { user } = await api('/users/me');
  fillForm(form, user);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = validateForm(form, {
      confirm: (v, f) => (f.elements.password.value && v !== f.elements.password.value ? 'Passwords do not match' : ''),
    });
    if (!ok) return;
    const body = formData(form);
    delete body.confirm;
    if (form.elements.target_calories.value === '') body.target_calories = null;
    try {
      await api('/users/me', { method: 'PUT', body });
      form.elements.password.value = '';
      form.elements.confirm.value = '';
      toast('Account saved');
      const next = new URLSearchParams(window.location.search).get('next');
      if (next === 'dashboard') window.location.href = '/';
    } catch (err) {
      showFieldErrors(form, err);
    }
  });
})();
