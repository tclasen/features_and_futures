const pendingSaves = new Set();

document.querySelectorAll('input[data-submit-on-change]').forEach((checkbox) => {
  checkbox.addEventListener('change', async () => {
    const completed = checkbox.checked;
    const form = checkbox.form;
    const body = new URLSearchParams(new FormData(form));
    checkbox.disabled = true;
    const save = fetch(form.action, { method: 'POST', body, keepalive: true });
    pendingSaves.add(save);
    try {
      const response = await save;
      if (!response.ok) throw new Error('Completion could not be saved');
      const filter = document.querySelector('#task-filter').value;
      if ((filter === 'Open' && completed) || (filter === 'Completed' && !completed)) {
        checkbox.closest('[data-testid="task-row"]').remove();
      }
    } catch {
      checkbox.checked = !completed;
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
      pendingSaves.delete(save);
    }
  });
});

const filter = document.querySelector('#task-filter');
filter.addEventListener('change', async () => {
  await Promise.allSettled([...pendingSaves]);
  filter.form.requestSubmit();
});
