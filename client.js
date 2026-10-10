// Save checkbox changes without navigating away from the clicked control.
// Other forms keep their existing server-rendered submission behavior.
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('form.task-completion')) return;
  event.preventDefault();

  const checkbox = form.querySelector('input[type="checkbox"]');
  const body = new URLSearchParams(new FormData(form));
  checkbox.disabled = true;
  try {
    const response = await fetch(form.action, { method: 'POST', body });
    if (!response.ok) throw new Error('Completion could not be saved');
    const updated = new DOMParser().parseFromString(await response.text(), 'text/html');
    const tasks = updated.querySelector('section[aria-label="Tasks"]');
    if (!tasks) throw new Error('Tasks could not be refreshed');
    // Allow the checked state to paint before a matching-filter change removes
    // its row. Keep the page and both filter controls in place.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (form.isConnected) {
        document.querySelector('section[aria-label="Tasks"]').replaceWith(tasks);
      }
    }));
  } catch {
    checkbox.checked = checkbox.defaultChecked;
    checkbox.disabled = false;
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = 'Unable to save task completion. Please try again.';
    form.prepend(alert);
  }
});
