document.addEventListener('change', (event) => {
  const form = event.target.closest('form[data-submit-on-change]');
  if (form) form.requestSubmit();
});
