const filter = document.querySelector('#task-filter');
const checkboxes = [...document.querySelectorAll('input[data-submit-on-change]')];

function applyFilter() {
  let visibleCount = 0;
  for (const checkbox of checkboxes) {
    const matches = filter.value === 'All'
      || checkbox.checked === (filter.value === 'Completed');
    checkbox.closest('[data-testid="task-row"]').hidden = !matches;
    if (matches) visibleCount += 1;
  }
  document.querySelector('#tasks-empty').hidden = visibleCount > 0;
}

checkboxes.forEach((checkbox) => {
  checkbox.addEventListener('change', async () => {
    const completed = checkbox.checked;
    const form = checkbox.form;
    const body = new URLSearchParams(new FormData(form));
    checkbox.disabled = true;
    applyFilter();
    try {
      const response = await fetch(form.action, {
        method: 'POST', body, keepalive: true,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Completion could not be saved');
    } catch {
      checkbox.checked = !completed;
      applyFilter();
      let alert = document.querySelector('#completion-error');
      if (!alert) {
        alert = document.createElement('p');
        alert.id = 'completion-error';
        alert.setAttribute('role', 'alert');
        document.querySelector('.task-list').before(alert);
      }
      alert.textContent = 'Task completion could not be saved. Please try again.';
    } finally {
      checkbox.disabled = false;
    }
  });
});

filter.addEventListener('change', () => {
  applyFilter();
  document.querySelectorAll('input[name="filter"]').forEach((input) => {
    input.value = filter.value;
  });
  const url = new URL(window.location.href);
  if (filter.value === 'All') url.searchParams.delete('filter');
  else url.searchParams.set('filter', filter.value);
  window.history.replaceState(null, '', url);
});
