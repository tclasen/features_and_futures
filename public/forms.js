// Submit filter, completion, and priority changes through normal form navigation.
document.querySelectorAll('form[data-auto-submit]').forEach((form) => {
  form.addEventListener('change', () => form.requestSubmit());
});
