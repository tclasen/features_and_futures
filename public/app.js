const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#detail-view');
const list = document.querySelector('#project-list');
const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#alert');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskList = document.querySelector('#task-list');
const taskFilter = document.querySelector('#task-filter');
let currentProjectId = null;

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function renderList() {
  currentProjectId = null;
  listView.hidden = false;
  detailView.hidden = true;
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, open);
    list.append(row);
  }
}

async function renderTasks() {
  const tasks = await request(`/api/projects/${currentProjectId}/tasks`);
  taskList.replaceChildren();
  const filter = taskFilter.value;
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'project-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    row.append(title, checkbox);
    taskList.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) return renderList();
  try {
    const project = await request(`/api/projects/${match[1]}`);
    currentProjectId = project.id;
    listView.hidden = true;
    detailView.hidden = false;
    document.querySelector('#project-title').textContent = project.name;
    await renderTasks();
  } catch {
    history.replaceState(null, '', '/');
    await renderList();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    return;
  }
  alert.textContent = '';
  alert.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    nameInput.value = '';
    await renderList();
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
});

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  try {
    await request(`/api/projects/${currentProjectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    taskInput.value = '';
    taskAlert.hidden = true;
    await renderTasks();
  } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
});
taskFilter.addEventListener('change', () => renderTasks().catch(error => {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}));
document.querySelector('#back-button').addEventListener('click', () => { location.href = '/'; });
window.addEventListener('popstate', renderRoute);
renderRoute().catch(() => {
  alert.textContent = 'Unable to load projects';
  alert.hidden = false;
});
