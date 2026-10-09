document.querySelectorAll('form[data-auto-submit]').forEach(form => {
  form.addEventListener('change', () => form.requestSubmit());
});
