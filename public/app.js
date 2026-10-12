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
  const filter = document.querySelector('#project-filter').value;
  for (const project of projects.filter(p => Boolean(p.archived) === (filter === 'Archived'))) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = project.archived ? 'Restore project' : 'Archive project';
    toggle.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
      await loadProjects();
    });
    row.append(name, summary, open, toggle);
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
  document.querySelector('#archived-notice').hidden = !project.archived;
  document.querySelector('#task-title').disabled = Boolean(project.archived);
  document.querySelector('#task-form button').disabled = Boolean(project.archived);
  document.querySelector('#new-project-name').disabled = Boolean(project.archived);
  document.querySelector('#rename-form button').disabled = Boolean(project.archived);
  document.querySelector('#new-project-name').value = project.name;
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
    checkbox.disabled = document.querySelector('#archived-notice').hidden === false;
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
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    const archived = document.querySelector('#archived-notice').hidden === false;
    renameInput.disabled = archived;
    renameButton.disabled = archived;
    renameButton.addEventListener('click', async () => {
      const error = document.querySelector('#task-rename-error');
      error.hidden = true;
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameInput.value })
      });
      if (!response.ok) {
        const result = await response.json();
        error.textContent = result.error || 'Unable to rename task';
        error.hidden = false;
        return;
      }
      const updated = await response.json();
      task.title = updated.title;
      renderTasks();
    });
    row.append(title, checkbox, renameInput, renameButton);
    taskContainer.append(row);
  }
}

document.querySelector('#task-filter').addEventListener('change', renderTasks);
document.querySelector('#project-filter').addEventListener('change', loadProjects);
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

document.querySelector('#rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.querySelector('#rename-error');
  error.hidden = true;
  const input = document.querySelector('#new-project-name');
  const response = await fetch(`/api/projects/${activeProjectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    error.textContent = result.error || 'Unable to rename project';
    error.hidden = false;
    return;
  }
  await showRoute();
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', showRoute);
showRoute();
