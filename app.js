const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectList = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskList = document.querySelector('#tasks');
const taskFilter = document.querySelector('#task-filter');
const taskRenameAlert = document.querySelector('#task-rename-alert');
const projectFilter = document.querySelector('#project-filter');
const archivedNotice = document.querySelector('#archived-notice');
const renameForm = document.querySelector('#rename-project-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
let activeProjectId = null;
let activeProjectArchived = false;

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function renderProjects(projects) {
  projectList.replaceChildren();
  const archived = projectFilter.value === 'Archived';
  for (const project of projects.filter((item) => item.archived === archived)) {
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
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      const action = archived ? 'restore' : 'archive';
      const response = await fetch(`/api/projects/${project.id}/${action}`, { method: 'POST' });
      if (response.ok) renderProjects(await fetchProjects());
    });
    row.append(name, summary, open, archive);
    projectList.append(row);
  }
}

async function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  renderProjects(await fetchProjects());
}

async function showProject(id) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    navigate('/');
    return;
  }
  const project = await response.json();
  document.querySelector('#detail-heading').textContent = project.name;
  activeProjectId = id;
  activeProjectArchived = project.archived;
  archivedNotice.hidden = !activeProjectArchived;
  renameInput.disabled = activeProjectArchived;
  renameForm.querySelector('button').disabled = activeProjectArchived;
  taskForm.querySelectorAll('input, button').forEach((control) => { control.disabled = activeProjectArchived; });
  listView.hidden = true;
  detailView.hidden = false;
  taskAlert.hidden = true;
  await refreshTasks();
}

async function refreshTasks() {
  if (!activeProjectId) return;
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`);
  if (!response.ok) throw new Error('Could not load tasks');
  const tasks = await response.json();
  const filter = taskFilter.value;
  taskList.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = activeProjectArchived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const update = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      if (!update.ok) {
        checkbox.checked = task.completed;
        taskAlert.textContent = 'Unable to update task';
        taskAlert.hidden = false;
        return;
      }
      await refreshTasks();
    });

    const renameForm = document.createElement('form');
    renameForm.className = 'task-rename-form';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.value = task.title;
    renameInput.disabled = activeProjectArchived;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = activeProjectArchived;
    renameForm.append(renameInput, renameButton);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newTitle = renameInput.value.trim();
      if (!newTitle) {
        taskRenameAlert.textContent = 'Task title is required';
        taskRenameAlert.hidden = false;
        return;
      }
      taskRenameAlert.hidden = true;
      const update = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!update.ok) {
        taskRenameAlert.textContent = 'Unable to rename task';
        taskRenameAlert.hidden = false;
        return;
      }
      await refreshTasks();
    });

    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority;
    priority.disabled = activeProjectArchived;
    priority.addEventListener('change', async () => {
      const update = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: priority.value }),
      });
      if (!update.ok) {
        priority.value = task.priority;
        taskAlert.textContent = 'Unable to update task priority';
        taskAlert.hidden = false;
      }
    });

    row.append(title, renameForm, priority, checkbox);
    taskList.append(row);
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  renderRoute();
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  try {
    if (match) await showProject(match[1]);
    else await showList();
  } catch {
    listView.hidden = false;
    detailView.hidden = true;
    alert.textContent = 'Unable to load projects';
    alert.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    return;
  }
  alert.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    alert.textContent = 'Unable to create project';
    alert.hidden = false;
    return;
  }
  nameInput.value = '';
  renderProjects(await fetchProjects());
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    return;
  }
  renameAlert.hidden = true;
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    renameAlert.textContent = 'Unable to rename project';
    renameAlert.hidden = false;
    return;
  }
  document.querySelector('#detail-heading').textContent = name;
  renameInput.value = '';
});
taskFilter.addEventListener('change', refreshTasks);
projectFilter.addEventListener('change', async () => renderProjects(await fetchProjects()));
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  taskAlert.hidden = true;
  taskRenameAlert.hidden = true;
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    taskAlert.textContent = 'Unable to create task';
    taskAlert.hidden = false;
    return;
  }
  taskInput.value = '';
  await refreshTasks();
});
window.addEventListener('popstate', renderRoute);
renderRoute();
