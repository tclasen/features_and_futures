const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskContainer = document.querySelector('#tasks');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const defaultTaskPriority = document.querySelector('#default-task-priority');
const projectFilter = document.querySelector('#project-filter');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) return;
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    if (projectFilter.value === 'active' && project.archived) continue;
    if (projectFilter.value === 'archived' && !project.archived) continue;
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      taskFilter.value = 'all';
      priorityFilter.value = 'all';
      history.pushState({}, '', `/projects/${project.id}`);
      showRoute();
    });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
      await loadProjects();
    });
    row.append(name, summary, open, archive);
    projectContainer.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    detailView.hidden = true;
    listView.hidden = false;
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return showRoute();
  }
  const project = await response.json();
  document.querySelector('#detail-name').textContent = project.name;
  document.querySelector('#archived-notice').hidden = !project.archived;
  renameInput.value = project.name;
  renameInput.disabled = project.archived;
  defaultTaskPriority.value = project.defaultPriority || 'Normal';
  defaultTaskPriority.disabled = project.archived;
  renameForm.querySelector('button[type="submit"]').disabled = project.archived;
  renameAlert.hidden = true;
  taskForm.querySelector('button[type="submit"]').disabled = project.archived;
  taskInput.disabled = project.archived;
  detailView.hidden = false;
  listView.hidden = true;
  await loadTasks(Number(match[1]), project.archived);
}

defaultTaskPriority.addEventListener('change', async () => {
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (!projectId) return;
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ defaultPriority: defaultTaskPriority.value }),
  });
  if (!response.ok) {
    const projectResponse = await fetch(`/api/projects/${projectId}`);
    if (projectResponse.ok) defaultTaskPriority.value = (await projectResponse.json()).defaultPriority || 'Normal';
  }
});

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    renameInput.focus();
    return;
  }
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (!projectId) return;
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.ok) {
    const project = await response.json();
    document.querySelector('#detail-name').textContent = project.name;
    renameInput.value = project.name;
    renameAlert.hidden = true;
  }
});

async function loadTasks(projectId, archived = false) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) return;
  const tasks = await response.json();
  taskContainer.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    if (priorityFilter.value !== 'all' && task.priority !== priorityFilter.value) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = archived;
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = archived;
    renameButton.addEventListener('click', async () => {
      const newTitle = renameInput.value.trim();
      if (!newTitle) {
        taskAlert.textContent = 'Task title is required';
        taskAlert.hidden = false;
        renameInput.focus();
        return;
      }
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (response.ok) {
        taskAlert.hidden = true;
        await loadTasks(projectId, archived);
      }
    });
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority || 'Normal';
    priority.disabled = archived;
    priority.addEventListener('change', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: priority.value }),
      });
      if (response.ok) await loadTasks(projectId, archived);
    });
    const label = document.createElement('label');
    label.className = 'task-check-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      await loadTasks(projectId);
    });
    label.append(checkbox);
    row.append(title, renameInput, renameButton, priority, label);
    taskContainer.append(row);
  }
}

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    taskInput.focus();
    return;
  }
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (!projectId) return;
  taskAlert.hidden = true;
  const response = await fetch(`/api/projects/${projectId}/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (response.ok) {
    taskInput.value = '';
    await loadTasks(Number(projectId));
  }
});
taskFilter.addEventListener('change', () => {
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (projectId) fetch(`/api/projects/${projectId}`).then((response) => response.json()).then((project) => loadTasks(Number(projectId), project.archived));
});
priorityFilter.addEventListener('change', () => {
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (projectId) fetch(`/api/projects/${projectId}`).then((response) => response.json()).then((project) => loadTasks(Number(projectId), project.archived));
});
projectFilter.addEventListener('change', loadProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    nameInput.focus();
    return;
  }
  alert.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.ok) {
    nameInput.value = '';
    await loadProjects();
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  history.pushState({}, '', '/');
  showRoute();
});
window.addEventListener('popstate', showRoute);
showRoute();
