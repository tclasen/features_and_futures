// Save in place: replacing the document on each toggle can undo a later action.
export function bindProjectControls(document, fetchRequest = fetch) {
  let pendingSave = Promise.resolve();
  const filterForm = document.getElementById('task-filter-form');
  const filter = document.getElementById('task-filter');
  const error = document.getElementById('task-save-error');

  for (const form of document.querySelectorAll('.task-completion')) {
    const checkbox = form.querySelector('input[type="checkbox"]');
    let saved = checkbox.checked;
    checkbox.addEventListener('change', () => {
      const completed = checkbox.checked;
      // Capture the value now, not after an earlier request finishes.
      const body = new URLSearchParams({ filter: filter.value });
      if (completed) body.set('completed', 'on');
      pendingSave = pendingSave.then(async () => {
        try {
          const response = await fetchRequest(form.action, {
            method: 'POST', body, keepalive: true,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error('Task save failed');
          saved = completed;
          error.hidden = true;
          if (checkbox.checked === completed && filter.value !== 'all' &&
              completed !== (filter.value === 'completed')) {
            form.closest('[data-testid="task-row"]').remove();
          }
        } catch {
          checkbox.checked = saved;
          error.textContent = 'Unable to save task completion. Please try again.';
          error.hidden = false;
        }
      });
    });
  }

  filter.addEventListener('change', () => filterForm.requestSubmit());
  filterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await pendingSave;
    filterForm.submit();
  });
}

if (typeof document !== 'undefined') bindProjectControls(document);
