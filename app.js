const app = document.querySelector('#app');
const form = document.querySelector('#create-form');
const input = document.querySelector('#project-name');
const error = document.querySelector('#error');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');

async function projects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

function showList() {
  document.title = 'Workboard';
  app.querySelector('h1').hidden = false;
  form.hidden = false;
  list.hidden = false;
  detail.hidden = true;
}

async function renderList() {
  showList();
  const items = await projects();
  list.replaceChildren();
  for (const project of items) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, button);
    list.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return renderList();
  const items = await projects();
  const project = items.find(item => String(item.id) === match[1]);
  if (!project) return renderList();
  document.title = `${project.name} — Workboard`;
  app.querySelector('h1').hidden = true;
  form.hidden = true;
  list.hidden = true;
  detail.hidden = false;
  detail.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  detail.append(heading, back);

  const taskForm = document.createElement('form');
  taskForm.className = 'task-form';
  const taskLabel = document.createElement('label');
  taskLabel.htmlFor = 'task-title';
  taskLabel.textContent = 'Task title';
  const taskControls = document.createElement('div');
  taskControls.className = 'form-row';
  const taskInput = document.createElement('input');
  taskInput.id = 'task-title';
  taskInput.type = 'text';
  taskInput.autocomplete = 'off';
  const taskSubmit = document.createElement('button');
  taskSubmit.type = 'submit';
  taskSubmit.textContent = 'Create task';
  taskControls.append(taskInput, taskSubmit);
  const taskError = document.createElement('p');
  taskError.setAttribute('role', 'alert');
  taskError.hidden = true;
  taskForm.append(taskLabel, taskControls, taskError);

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
  const taskList = document.createElement('section');
  taskList.setAttribute('aria-label', 'Tasks');
  detail.append(taskForm, filterLabel, filter, taskList);

  async function renderTasks() {
    const response = await fetch(`/api/projects/${project.id}/tasks`);
    if (!response.ok) throw new Error('Unable to load tasks');
    const tasks = await response.json();
    taskList.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = document.createElement('div');
      row.dataset.testid = 'task-row';
      row.className = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        const result = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        if (!result.ok) { checkbox.checked = !checkbox.checked; return; }
        await renderTasks();
      });
      row.append(title, checkbox);
      taskList.append(row);
    }
  }
  filter.addEventListener('change', () => renderTasks().catch(() => {}));
  taskForm.addEventListener('submit', async event => {
    event.preventDefault();
    taskError.hidden = true;
    const title = taskInput.value.trim();
    if (!title) { taskError.textContent = 'Task title is required'; taskError.hidden = false; return; }
    const response = await fetch(`/api/projects/${project.id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
    });
    if (!response.ok) {
      const result = await response.json();
      taskError.textContent = result.error || 'Unable to create task';
      taskError.hidden = false;
      return;
    }
    taskInput.value = '';
    await renderTasks();
  });
  await renderTasks();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const name = input.value.trim();
  if (!name) {
    error.textContent = 'Project name is required';
    error.hidden = false;
    return;
  }
  const response = await fetch('/api/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (!response.ok) {
    const result = await response.json();
    error.textContent = result.error || 'Unable to create project';
    error.hidden = false;
    return;
  }
  input.value = '';
  await renderList();
});

renderRoute().catch(error => {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = error.message;
  app.append(message);
});
