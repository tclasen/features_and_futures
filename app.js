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
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
let appliedDueRange = { from: '', through: '' };
const defaultTaskPriority = document.querySelector('#default-task-priority');
const projectFilter = document.querySelector('#project-filter');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
const projectSearchInput = document.querySelector('#project-search');
const taskSearchInput = document.querySelector('#task-search');
let appliedProjectQuery = '';
let appliedTaskQuery = '';

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) return;
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    if (projectFilter.value === 'active' && project.archived) continue;
    if (projectFilter.value === 'archived' && !project.archived) continue;
    if (appliedProjectQuery && !asciiLower(project.name).includes(asciiLower(appliedProjectQuery))) continue;
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
      appliedTaskQuery = '';
      taskSearchInput.value = '';
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
  taskSearchInput.value = appliedTaskQuery;
  const response = await fetch(`/api/projects/${match[1]}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return showRoute();
  }
  const project = await response.json();
  appliedDueRange = { from: '', through: '' };
  dueFromInput.value = '';
  dueThroughInput.value = '';
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
  const destinationResponse = await fetch('/api/projects/active');
  const destinations = destinationResponse.ok ? await destinationResponse.json() : [];
  taskContainer.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    if (priorityFilter.value !== 'all' && task.priority !== priorityFilter.value) continue;
    if (appliedTaskQuery && !asciiLower(task.title).includes(asciiLower(appliedTaskQuery))) continue;
    if ((appliedDueRange.from || appliedDueRange.through) && !task.dueDate) continue;
    if (appliedDueRange.from && task.dueDate < appliedDueRange.from) continue;
    if (appliedDueRange.through && task.dueDate > appliedDueRange.through) continue;
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
    const dueDate = document.createElement('input');
    dueDate.type = 'text';
    dueDate.value = task.dueDate || '';
    dueDate.setAttribute('aria-label', 'Task due date');
    dueDate.disabled = archived;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'button';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = archived;
    saveDueDate.addEventListener('click', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dueDate: dueDate.value }),
      });
      if (response.ok) {
        taskAlert.hidden = true;
        const saved = await response.json();
        dueDate.value = saved.dueDate || '';
        await loadTasks(projectId, archived);
      } else {
        const error = await response.json();
        taskAlert.textContent = error.error || 'Unable to save due date';
        taskAlert.hidden = false;
      }
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
      await loadTasks(projectId, archived);
    });
    label.append(checkbox);
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', 'Destination project');
    const eligible = destinations.filter((item) => item.id !== projectId);
    for (const item of eligible) {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = item.name;
      destination.append(option);
    }
    destination.disabled = archived || eligible.length === 0;
    const move = document.createElement('button');
    move.type = 'button';
    move.textContent = 'Move task';
    move.disabled = archived || eligible.length === 0;
    move.addEventListener('click', async () => {
      const moved = await fetch(`/api/tasks/${task.id}/move`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
      });
      if (moved.ok) await loadTasks(projectId, archived);
    });
    row.append(title, renameInput, renameButton, priority, dueDate, saveDueDate, destination, move, label);
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

function validCalendarDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

document.querySelector('#apply-due-range').addEventListener('click', async () => {
  const from = dueFromInput.value.trim();
  const through = dueThroughInput.value.trim();
  if ((from && !validCalendarDate(from)) || (through && !validCalendarDate(through))) {
    taskAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
    taskAlert.hidden = false;
    return;
  }
  if (from && through && from > through) {
    taskAlert.textContent = 'Due from must not be after Due through';
    taskAlert.hidden = false;
    return;
  }
  appliedDueRange = { from, through };
  taskAlert.hidden = true;
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (!projectId) return;
  const response = await fetch(`/api/projects/${projectId}`);
  if (response.ok) await loadTasks(Number(projectId), (await response.json()).archived);
});
priorityFilter.addEventListener('change', () => {
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (projectId) fetch(`/api/projects/${projectId}`).then((response) => response.json()).then((project) => loadTasks(Number(projectId), project.archived));
});
projectFilter.addEventListener('change', loadProjects);
document.querySelector('#project-search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  appliedProjectQuery = projectSearchInput.value.trim();
  await loadProjects();
});
document.querySelector('#task-search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  appliedTaskQuery = taskSearchInput.value.trim();
  const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (!projectId) return;
  const response = await fetch(`/api/projects/${projectId}`);
  if (response.ok) await loadTasks(Number(projectId), (await response.json()).archived);
});

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
  appliedProjectQuery = '';
  projectSearchInput.value = '';
  history.pushState({}, '', '/');
  showRoute();
});
window.addEventListener('popstate', showRoute);
showRoute();
