const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function projectsButton() {
  const button = element('button', 'Projects');
  button.type = 'button';
  button.addEventListener('click', () => location.assign('/'));
  return button;
}

function projectRow(project) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  const button = element('button', 'Open project');
  button.type = 'button';
  button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  row.append(element('span', project.name), button);
  return row;
}

async function renderTasks(projectId) {
  const endpoint = `/api/projects/${projectId}/tasks`;
  const form = element('form');
  const titleLabel = element('label', 'Task title');
  titleLabel.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  form.append(titleLabel, input, submit);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const name of ['All', 'Open', 'Completed']) {
    const option = element('option', name);
    option.value = name;
    filter.append(option);
  }
  const filterControls = element('div');
  filterControls.className = 'task-filter';
  filterControls.append(filterLabel, filter);
  const list = element('ul');
  list.setAttribute('aria-label', 'Tasks');
  app.append(form, filterControls, list);
  const tasks = await request(endpoint);

  function displayTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('li');
      row.dataset.testid = 'task-row';
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const updated = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = updated.completed;
          app.querySelector('[role="alert"]')?.remove();
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(element('span', task.title), checkbox);
      list.append(row);
    }
  }
  filter.addEventListener('change', displayTasks);
  displayTasks();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!input.value.trim()) {
      showError('Task title is required');
      return;
    }
    submit.disabled = true;
    try {
      const task = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      displayTasks();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.append(projectsButton());
    const project = await request(`/api/projects/${match[1]}`);
    document.title = `${project.name} · Workboard`;
    app.append(element('h1', project.name));
    await renderTasks(project.id);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);
  const list = element('ul');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, list);
  const projects = await request('/api/projects');
  projects.forEach(project => list.append(projectRow(project)));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!input.value.trim()) {
      showError('Project name is required');
      return;
    }
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

render().catch(error => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
