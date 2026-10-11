// A second interaction can happen before a filter's navigation finishes. Read
// the live selections at submission instead of sending stale hidden copies.
document.querySelectorAll('form').forEach((form) => {
  form.addEventListener('submit', () => {
    const filters = [
      ['filter', document.getElementById('task-filter') || document.getElementById('project-filter')],
      ['priorityFilter', document.getElementById('priority-filter')],
    ];
    for (const [name, control] of filters) {
      const hidden = form.querySelector(`input[type="hidden"][name="${name}"]`);
      if (hidden && control) hidden.value = control.value;
    }
  });

  // Keep native form navigation, including keyboard submission and validation.
  if (form.hasAttribute('data-auto-submit')) {
    form.addEventListener('change', () => form.requestSubmit());
  }
});
