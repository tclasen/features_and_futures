document.querySelectorAll('form[data-auto-submit]').forEach(form => {
  form.addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.type !== 'checkbox') {
      form.requestSubmit();
      return;
    }

    // A reload immediately after a toggle must not cancel an unsaved update.
    // Complete this small same-origin write before the change handler returns.
    const request = new XMLHttpRequest();
    try {
      request.open('POST', form.action, false);
      request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      request.send(new URLSearchParams(new FormData(form)).toString());
      if (request.status !== 200) throw new Error('Task update failed');
      const filter = form.elements.filter.value;
      if (filter !== 'All' && checkbox.checked !== (filter === 'Completed')) {
        form.closest('[data-testid="task-row"]').hidden = true;
      }
    } catch {
      checkbox.checked = !checkbox.checked;
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Task completion could not be saved. Please try again.';
      form.append(alert);
    }
  });
});
