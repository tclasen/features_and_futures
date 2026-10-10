const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const errorMessage = document.querySelector('#error-message');
const taskMessage = document.createElement('p');
taskMessage.id = 'task-error';
taskMessage.setAttribute('role', 'alert');
taskMessage.hidden = true;
document.querySelector('#project-detail').append(taskMessage);
let activeProjectId = null;
let projectTasks = [];

async function loadTasks() {
  const response = await fetch(`/api/projects/${activeProjectId}/tasks`);
  if (!response.ok) throw new Error('Could not load tasks');
  projectTasks = await response.json();
  renderTasks();
}

function renderTasks() {
  const container = document.querySelector('#tasks');
  const filter = document.querySelector('#task-filter').value;
  container.replaceChildren();
  for (const task of projectTasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = Boolean(window.currentProjectArchived);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
      if (response.ok) { task.completed = checkbox.checked; renderTasks(); }
      else showTaskError('Unable to update task');
    });
    row.append(title, checkbox);
    container.append(row);
  }
}

function showTaskError(message) {
  taskMessage.textContent = message;
  taskMessage.hidden = false;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  const filter = document.querySelector('#project-filter').value;
  projectContainer.replaceChildren();
  for (const project of projects) {
    if (filter === 'Active' && project.archived || filter === 'Archived' && !project.archived) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = project.archived ? 'Restore project' : 'Archive project';
    action.addEventListener('click', async () => {
      const response = await fetch(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
      if (response.ok) await loadProjects();
    });
    row.append(name, summary, open, action);
    projectContainer.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    navigate('/');
    return;
  }
  const project = await response.json();
  activeProjectId = project.id;
  document.querySelector('#project-title').textContent = project.name;
  window.currentProjectArchived = project.archived;
  document.querySelector('#archived-message').hidden = !project.archived;
  document.querySelector('#task-form').querySelectorAll('input, button').forEach(control => { control.disabled = project.archived; });
  listView.hidden = true;
  detailView.hidden = false;
  taskMessage.hidden = true;
  document.querySelector('#task-filter').value = 'All';
  await loadTasks();
}

function navigate(path) {
  history.pushState({}, '', path);
  renderRoute().catch(showLoadError);
}

function showLoadError() {
  errorMessage.textContent = 'Unable to load projects';
  errorMessage.hidden = false;
}

document.querySelector('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    errorMessage.textContent = 'Project name is required';
    errorMessage.hidden = false;
    return;
  }
  errorMessage.hidden = true;
  try {
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Could not create project');
    input.value = '';
    await loadProjects();
  } catch { showLoadError(); }
});

document.querySelector('#task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#task-title');
  const title = input.value.trim();
  if (!title) { showTaskError('Task title is required'); return; }
  taskMessage.hidden = true;
  try {
    const response = await fetch(`/api/projects/${activeProjectId}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!response.ok) throw new Error('Could not create task');
    input.value = '';
    await loadTasks();
  } catch { showTaskError('Unable to create task'); }
});
document.querySelector('#task-filter').addEventListener('change', renderTasks);
document.querySelector('#project-filter').addEventListener('change', () => loadProjects().catch(showLoadError));
document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', () => renderRoute().catch(showLoadError));
renderRoute().catch(showLoadError);
