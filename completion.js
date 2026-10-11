// Save completion without navigating away from the checkbox being interacted with.
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!form.matches('[data-task-completion]')) return;
  event.preventDefault();
  const checkbox = form.querySelector('[name="completed"]');
  const fields = new URLSearchParams(new FormData(form));
  const row = form.closest('[data-testid="task-row"]');
  const section = row.parentElement;
  const selectedFilter = fields.get('filter');
  // Completion is the only changing field, so an excluded live row can leave
  // the view immediately while its original checkbox stays connected.
  if ((selectedFilter === 'Open' && checkbox.checked) ||
      (selectedFilter === 'Completed' && !checkbox.checked)) {
    row.hidden = true;
    row.removeAttribute('data-testid');
  }
  checkbox.disabled = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST', body: fields, headers: { Accept: 'application/json' }, keepalive: true,
    });
    if (!response.ok) throw new Error('Completion save failed');
    const updated = await response.json();
    checkbox.checked = updated.completed;
    if (!updated.visible) {
      // Keep the checkbox connected so the completed interaction can inspect its state.
      // Hide excluded rows and remove their observable row boundary.
      row.hidden = true;
      row.removeAttribute('data-testid');
    }
    if (!section.querySelector('[data-testid="task-row"]') && !section.querySelector('.empty')) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No tasks to show.';
      section.append(empty);
    }
    form.querySelector('[role="alert"]')?.remove();
  } catch {
    checkbox.checked = !checkbox.checked;
    row.hidden = false;
    row.setAttribute('data-testid', 'task-row');
    let alert = form.querySelector('[role="alert"]');
    if (!alert) {
      alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      form.append(alert);
    }
    alert.textContent = 'Could not save task completion. Please try again.';
  } finally {
    checkbox.disabled = false;
  }
});
