export async function saveCompletion(action, completed, filter, fetchRequest = globalThis.fetch) {
  const values = { filter };
  if (completed) values.completed = '1';
  const response = await fetchRequest(action, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams(values),
    keepalive: true,
  });
  if (!response.ok) throw new Error('Task completion could not be saved. Please try again.');
}

export function installTaskCompletion(document, save = saveCompletion) {
  const pending = new Set();
  const alert = document.querySelector('#completion-error');

  document.addEventListener('change', (event) => {
    const checkbox = event.target;
    if (!checkbox.matches('form[data-task-completion] input[type="checkbox"][name="completed"]')) return;
    const form = checkbox.form;
    const completed = checkbox.checked;
    const filter = form.elements.filter.value;
    checkbox.disabled = true;
    alert.hidden = true;

    const update = (async () => {
      try {
        await save(form.action, completed, filter);
        if ((filter === 'Open' && completed) || (filter === 'Completed' && !completed)) {
          form.closest('[data-testid="task-row"]').remove();
        }
        return true;
      } catch {
        checkbox.checked = !completed;
        alert.textContent = 'Task completion could not be saved. Please try again.';
        alert.hidden = false;
        return false;
      } finally {
        checkbox.disabled = false;
      }
    })();
    pending.add(update);
    update.finally(() => pending.delete(update));
  });

  // Native navigation must not cancel or overtake an in-flight completion save.
  document.addEventListener('submit', async (event) => {
    if (!pending.size) return;
    event.preventDefault();
    const form = event.target;
    const submitter = event.submitter;
    const saved = await Promise.all([...pending]);
    if (saved.every(Boolean)) form.requestSubmit(submitter || undefined);
  });
}

if (typeof document !== 'undefined') installTaskCompletion(document);
