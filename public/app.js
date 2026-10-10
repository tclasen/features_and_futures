const app = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

async function getTasks(projectId) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) throw new Error('Unable to load tasks');
  return response.json();
}

function makeButton(label, onClick, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

async function renderList(errorMessage = '') {
  app.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Workboard';
  app.append(heading);

  if (errorMessage) {
    const alert = document.createElement('p');
    alert.className = 'alert';
    alert.setAttribute('role', 'alert');
    alert.textContent = errorMessage;
    app.append(alert);
  }

  const form = document.createElement('form');
  form.className = 'project-form';
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  field.append(label, input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  form.append(field, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      await renderList('Project name is required');
      document.querySelector('#project-name')?.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      await renderList('Unable to create project');
      return;
    }
    await renderList();
  });
  app.append(form);

  try {
    const projects = await getProjects();
    for (const project of projects) {
      const row = document.createElement('section');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.className = 'project-name';
      name.textContent = project.name;
      row.append(name, makeButton('Open project', () => {
        history.pushState({}, '', `/projects/${project.id}`);
        renderRoute();
      }));
      app.append(row);
    }
  } catch {
    const error = document.createElement('p');
    error.className = 'alert';
    error.setAttribute('role', 'alert');
    error.textContent = 'Unable to load projects';
    app.append(error);
  }
}

async function renderProject(id) {
  const projects = await getProjects();
  const project = projects.find((item) => String(item.id) === id);
  if (!project) return renderList('Project not found');
  app.replaceChildren();
  app.append(makeButton('Projects', () => {
    history.pushState({}, '', '/');
    renderRoute();
  }, 'back-button'));
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  app.append(heading);

  const form = document.createElement('form');
  form.className = 'task-form';
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'task-title';
  label.textContent = 'Task title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  field.append(label, input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create task';
  form.append(field, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return renderProjectWithAlert(id, 'Task title is required');
    const response = await fetch(`/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (!response.ok) return renderProjectWithAlert(id, 'Unable to create task');
    renderProject(id);
  });
  app.append(form);

  const filterField = document.createElement('div');
  filterField.className = 'filter-field';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'task-filter';
  filterLabel.textContent = 'Task filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = document.createElement('option');
    option.value = value.toLowerCase();
    option.textContent = value;
    filter.append(option);
  }
  filterField.append(filterLabel, filter);
  app.append(filterField);

  const taskList = document.createElement('div');
  taskList.className = 'task-list';
  app.append(taskList);
  let tasks;
  try {
    tasks = await getTasks(id);
  } catch {
    taskList.textContent = 'Unable to load tasks';
    taskList.className = 'alert';
    return;
  }
  const renderTasks = () => {
    taskList.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'open' && task.completed) continue;
      if (filter.value === 'completed' && !task.completed) continue;
      const row = document.createElement('section');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.title;
      const checkboxLabel = document.createElement('label');
      checkboxLabel.className = 'completion-control';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (response.ok) {
          task.completed = checkbox.checked;
          renderTasks();
        } else {
          checkbox.checked = task.completed;
          checkbox.disabled = false;
        }
      });
      checkboxLabel.append(checkbox);
      row.append(title, checkboxLabel);
      taskList.append(row);
    }
  };
  filter.addEventListener('change', renderTasks);
  renderTasks();
}

async function renderProjectWithAlert(id, message) {
  await renderProject(id);
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  app.insertBefore(alert, app.querySelector('.task-form'));
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  try {
    if (match) await renderProject(match[1]);
    else await renderList();
  } catch {
    await renderList('Unable to load projects');
  }
}

window.addEventListener('popstate', renderRoute);
renderRoute();
