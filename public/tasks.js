export async function createTaskPanel(projectId, api) {
  const path = `/api/projects/${projectId}/tasks`;
  const tasks = await api(path);
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Tasks');
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.htmlFor = 'task-title';
  label.textContent = 'Task title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.type = 'text';
  input.name = 'title';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create task';
  form.append(label, input, submit);

  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }

  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'task-filter';
  filterLabel.textContent = 'Task filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    filter.append(option);
  }
  filter.value = 'All';
  const filterBar = document.createElement('div');
  filterBar.className = 'task-filter';
  filterBar.append(filterLabel, filter);
  const list = document.createElement('div');
  list.setAttribute('aria-label', 'Tasks');

  function renderTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      const title = document.createElement('span');
      title.textContent = task.title;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(checkbox, title);
      list.append(row);
    }
  }
  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(new Error('Task title is required'));
      return;
    }
    submit.disabled = true;
    try {
      const task = await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error);
    } finally {
      submit.disabled = false;
    }
  });
  panel.append(form, alert, filterBar, list);
  renderTasks();
  return panel;
}
