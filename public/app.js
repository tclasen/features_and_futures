const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const error = document.querySelector('#error');
const taskContainer = document.querySelector('#tasks');
const taskForm = document.querySelector('#create-task');
const taskTitleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const projectFilter = document.querySelector('#project-filter');
const archivedNotice = document.querySelector('#archived-notice');
const renameForm = document.querySelector('#rename-project');
const newProjectNameInput = document.querySelector('#new-project-name');
let activeProjectId;
let activeProjectArchived = false;

async function loadProjects() {
  const response = await fetch(`/api/projects?filter=${encodeURIComponent(projectFilter.value)}`);
  if (!response.ok) throw new Error('Unable to load projects');
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      const update = await fetch(`/api/projects/${encodeURIComponent(project.id)}/archive`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived })
      });
      if (!update.ok) { showError('Unable to update project'); return; }
      await loadProjects();
    });
    row.append(name, summary, open, archive);
    projectContainer.append(row);
  }
}

async function showRoute() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
  if (!response.ok) {
    window.location.replace('/');
    return;
  }
  const project = await response.json();
  activeProjectId = project.id;
  activeProjectArchived = Boolean(project.archived);
  document.querySelector('#project-title').textContent = project.name;
  archivedNotice.hidden = !activeProjectArchived;
  newProjectNameInput.disabled = activeProjectArchived;
  renameForm.querySelector('button').disabled = activeProjectArchived;
  taskForm.querySelector('button').disabled = activeProjectArchived;
  listView.hidden = true;
  detailView.hidden = false;
  await loadTasks();
}

async function loadTasks() {
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`);
  if (!response.ok) throw new Error('Unable to load tasks');
  const tasks = await response.json();
  const filter = taskFilter.value;
  taskContainer.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'project-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const label = document.createElement('label');
    label.className = 'task-completion';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = activeProjectArchived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const update = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked })
      });
      if (!update.ok) {
        checkbox.checked = !checkbox.checked;
        error.textContent = 'Unable to update task';
        error.hidden = false;
        return;
      }
      await loadTasks();
    });
    label.append(checkbox);
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    priority.disabled = activeProjectArchived;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority;
    priority.addEventListener('change', async () => {
      const update = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/priority`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: priority.value })
      });
      if (!update.ok) {
        showError('Unable to update task priority');
        return;
      }
      error.hidden = true;
    });
    const renameForm = document.createElement('form');
    renameForm.className = 'task-rename-form';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = activeProjectArchived;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = activeProjectArchived;
    renameForm.append(renameInput, renameButton);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      error.hidden = true;
      const update = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/title`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: renameInput.value })
      });
      const result = await update.json();
      if (!update.ok) {
        showError(result.error || 'Unable to rename task');
        return;
      }
      await loadTasks();
    });
    row.append(title, label, priority, renameForm);
    taskContainer.append(row);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: nameInput.value })
  });
  const result = await response.json();
  if (!response.ok) {
    error.textContent = result.error || 'Unable to create project';
    error.hidden = false;
    return;
  }
  nameInput.value = '';
  await loadProjects();
});

document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
function showError(message) { error.textContent = message; error.hidden = false; }
renameForm.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/name`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: newProjectNameInput.value })
  });
  const result = await response.json();
  if (!response.ok) {
    showError(result.error || 'Unable to rename project');
    return;
  }
  document.querySelector('#project-title').textContent = result.name;
  newProjectNameInput.value = '';
});
projectFilter.addEventListener('change', () => loadProjects().catch(() => showError('Unable to load projects')));
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: taskTitleInput.value })
  });
  const result = await response.json();
  if (!response.ok) {
    error.textContent = result.error || 'Unable to create task';
    error.hidden = false;
    return;
  }
  taskTitleInput.value = '';
  await loadTasks();
});
taskFilter.addEventListener('change', () => loadTasks().catch(() => {
  error.textContent = 'Unable to load tasks';
  error.hidden = false;
}));
showRoute().catch(() => {
  error.textContent = 'Unable to load projects';
  error.hidden = false;
});
