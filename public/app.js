document.addEventListener('change', (event) => {
  if (event.target.matches('[data-submit-on-change]')) {
    event.target.form.requestSubmit();
  }
});
