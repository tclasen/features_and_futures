// Submit filter and completion changes through the same forms as normal navigation.
document.querySelectorAll('form[data-auto-submit]').forEach((form) => {
  form.addEventListener('change', () => form.requestSubmit());
});
