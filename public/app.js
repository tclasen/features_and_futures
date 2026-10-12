const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const errorMessage = document.querySelector('#error-message');
const taskContainer = document.querySelector('#tasks');
let activeProjectId = null;
let projectTasks = [];

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, open);
    projectContainer.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listSection.hidden = false;
    detailSection.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find(item => String(item.id) === match[1]);
  if (!project) {
    navigate('/', true);
    return;
  }
  document.querySelector('#detail-name').textContent = project.name;
  activeProjectId = project.id;
  listSection.hidden = true;
  detailSection.hidden = false;
  await loadTasks();
}

function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  showRoute();
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  errorMessage.hidden = true;
  const input = document.querySelector('#project-name');
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    errorMessage.textContent = result.error || 'Unable to create project';
    errorMessage.hidden = false;
    return;
  }
  input.value = '';
  await loadProjects();
});

async function loadTasks() {
  const response = await fetch(`/api/projects/${activeProjectId}/tasks`);
  if (!response.ok) return;
  projectTasks = await response.json();
  renderTasks();
}

function renderTasks() {
  const filter = document.querySelector('#task-filter').value;
  taskContainer.replaceChildren();
  for (const task of projectTasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked })
      });
      if (response.ok) {
        const updated = await response.json();
        task.completed = updated.completed;
        renderTasks();
      }
    });
    row.append(title, checkbox);
    taskContainer.append(row);
  }
}

document.querySelector('#task-filter').addEventListener('change', renderTasks);
document.querySelector('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.querySelector('#task-error-message');
  error.hidden = true;
  const input = document.querySelector('#task-title');
  const response = await fetch(`/api/projects/${activeProjectId}/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    error.textContent = result.error || 'Unable to create task';
    error.hidden = false;
    return;
  }
  input.value = '';
  await loadTasks();
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', showRoute);
showRoute();
