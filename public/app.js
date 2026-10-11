const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.testId) node.dataset.testid = options.testId;
  return node;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function showProject(projectId) {
  const projects = await loadProjects();
  const project = projects.find((item) => String(item.id) === projectId);
  if (!project) {
    history.replaceState(null, '', '/');
    await render();
    return;
  }

  app.replaceChildren();
  const back = element('button', { text: 'Projects', className: 'back-button' });
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', { text: project.name }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const form = element('form');
  const label = element('label', { text: 'Task title' });
  const input = element('input');
  input.type = 'text';
  input.name = 'taskTitle';
  label.append(input);
  const create = element('button', { text: 'Create task' });
  create.type = 'submit';
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error('Could not create task');
      await loadTasks();
      input.value = '';
      alert.hidden = true;
    } catch {
      alert.textContent = 'Could not create task';
      alert.hidden = false;
    }
  });
  app.append(form);

  const filterLabel = element('label', { text: 'Task filter', className: 'filter-label' });
  const filter = element('select');
  filter.setAttribute('aria-label', 'Task filter');
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);
  const taskList = element('section', { className: 'task-list', testId: 'task-list' });
  app.append(taskList);

  async function loadTasks() {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    if (!response.ok) throw new Error('Could not load tasks');
    const tasks = await response.json();
    taskList.replaceChildren();
    const visibleTasks = tasks.filter((task) => filter.value === 'All'
      || (filter.value === 'Open' && !task.completed)
      || (filter.value === 'Completed' && task.completed));
    for (const task of visibleTasks) {
      const row = element('div', { className: 'task-row', testId: 'task-row' });
      const checkboxLabel = element('label', { className: 'task-checkbox' });
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const update = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          if (!update.ok) throw new Error('Could not update task');
          await loadTasks();
        } catch {
          checkbox.checked = task.completed;
          checkbox.disabled = false;
          alert.textContent = 'Could not update task';
          alert.hidden = false;
        }
      });
      checkboxLabel.append(checkbox, element('span', { text: task.title }));
      row.append(checkboxLabel);
      taskList.append(row);
    }
  }
  filter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  await loadTasks();
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const form = element('form');
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text';
  input.name = 'projectName';
  label.append(input);
  const create = element('button', { text: 'Create project' });
  create.type = 'submit';
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Could not create project';
      alert.hidden = false;
      return;
    }
    await render();
  });
  app.append(form);

  const projects = await loadProjects();
  for (const project of projects) {
    const row = element('div', { className: 'project-row', testId: 'project-row' });
    row.append(element('span', { text: project.name, className: 'project-name' }));
    const open = element('button', { text: 'Open project' });
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(open);
    app.append(row);
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
}

render().catch(() => {
  app.replaceChildren(element('p', { text: 'Workboard could not be loaded.' }));
});
