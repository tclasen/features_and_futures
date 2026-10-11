const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectsContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const defaultTaskPriority = document.querySelector('#default-task-priority');
const tasksContainer = document.querySelector('#tasks');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
const dueRangeAlert = document.querySelector('#due-range-alert');
let appliedDueFrom = '';
let appliedDueThrough = '';
const projectFilter = document.querySelector('#project-filter');
const projectSearchForm = document.querySelector('#project-search-form');
const projectSearchInput = document.querySelector('#project-search');
const taskSearchForm = document.querySelector('#task-search-form');
const taskSearchInput = document.querySelector('#task-search');
const archiveNotice = document.querySelector('#archive-notice');
const createTaskButton = taskForm.querySelector('button');
const renameForm = document.querySelector('#rename-project-form');
const renameInput = document.querySelector('#new-project-name');
const renameButton = renameForm.querySelector('button');
const renameAlert = document.querySelector('#rename-alert');
let currentProjectId = null;
let currentProjectArchived = false;
let appliedProjectQuery = '';
let appliedTaskQuery = '';

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
}

function normalizeSearchText(value) {
  return asciiLower(value.replace(/[ \t]+/g, ' '));
}

async function loadProjects() {
  const response = await fetch(`/api/projects?filter=${encodeURIComponent(projectFilter.value)}`);
  const projects = await response.json();
  projectsContainer.replaceChildren();
  for (const project of projects) {
    if (!normalizeSearchText(project.name).includes(normalizeSearchText(appliedProjectQuery))) continue;
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      // Each entry from the list starts with the unfiltered task view, even
      // when reopening the project that was just viewed.
      taskFilter.value = 'All';
      priorityFilter.value = 'All';
      resetDueRange();
      navigate(`/projects/${project.id}`);
    });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    row.append(name, summary, open);
    if (project.archived) {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.textContent = 'Restore project';
      restore.addEventListener('click', () => setProjectArchived(project.id, false));
      row.append(restore);
    } else {
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.textContent = 'Archive project';
      archive.addEventListener('click', () => setProjectArchived(project.id, true));
      row.append(archive);
    }
    projectsContainer.append(row);
  }
}

async function setProjectArchived(projectId, archived) {
  await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ archived }),
  });
  await loadProjects();
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
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
  if (currentProjectId !== project.id) {
    taskFilter.value = 'All';
    priorityFilter.value = 'All';
    resetDueRange();
    appliedTaskQuery = '';
    taskSearchInput.value = '';
  }
  document.title = `${project.name} · Workboard`;
  document.querySelector('#project-heading').textContent = project.name;
  currentProjectId = project.id;
  currentProjectArchived = project.archived;
  defaultTaskPriority.value = project.defaultTaskPriority;
  defaultTaskPriority.disabled = currentProjectArchived;
  archiveNotice.hidden = !currentProjectArchived;
  renameInput.disabled = currentProjectArchived;
  renameButton.disabled = currentProjectArchived;
  createTaskButton.disabled = currentProjectArchived;
  taskInput.disabled = currentProjectArchived;
  listView.hidden = true;
  detailView.hidden = false;
  await loadTasks();
}

async function loadTasks() {
  if (currentProjectId === null) return;
  const response = await fetch(`/api/projects/${currentProjectId}/tasks`);
  const tasks = await response.json();
  const projectsResponse = await fetch('/api/projects?filter=Active');
  const activeProjects = await projectsResponse.json();
  tasksContainer.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'Open' && task.completed) continue;
    if (taskFilter.value === 'Completed' && !task.completed) continue;
    if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
    if ((appliedDueFrom || appliedDueThrough) && !task.dueDate) continue;
    if (appliedDueFrom && task.dueDate < appliedDueFrom) continue;
    if (appliedDueThrough && task.dueDate > appliedDueThrough) continue;
    if (!normalizeSearchText(task.title).includes(normalizeSearchText(appliedTaskQuery))) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = currentProjectArchived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      await loadTasks();
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
    priority.disabled = currentProjectArchived;
    priority.addEventListener('change', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: priority.value }),
      });
      if (response.ok) await loadTasks();
    });
    const renameForm = document.createElement('form');
    renameForm.className = 'task-rename-form';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = currentProjectArchived;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = currentProjectArchived;
    const renameAlert = document.createElement('span');
    renameAlert.setAttribute('role', 'alert');
    renameAlert.hidden = true;
    renameForm.append(renameInput, renameButton, renameAlert);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (currentProjectArchived) return;
      const newTitle = renameInput.value.trim();
      if (!newTitle) {
        renameAlert.textContent = 'Task title is required';
        renameAlert.hidden = false;
        return;
      }
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (response.ok) await loadTasks();
    });
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'text';
    dueDateInput.value = task.dueDate || '';
    dueDateInput.setAttribute('aria-label', 'Task due date');
    dueDateInput.disabled = currentProjectArchived;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'submit';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = currentProjectArchived;
    const dueDateAlert = document.createElement('span');
    dueDateAlert.setAttribute('role', 'alert');
    dueDateAlert.hidden = true;
    dueDateForm.append(dueDateInput, saveDueDate, dueDateAlert);
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (currentProjectArchived) return;
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dueDate: dueDateInput.value }),
      });
      if (!response.ok) {
        const result = await response.json();
        dueDateAlert.textContent = result.error || 'Unable to save due date';
        dueDateAlert.hidden = false;
        return;
      }
      dueDateAlert.hidden = true;
      await loadTasks();
    });
    const moveForm = document.createElement('form');
    moveForm.className = 'task-move-form';
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', 'Destination project');
    for (const candidate of activeProjects) {
      if (candidate.id === currentProjectId) continue;
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.name;
      destination.append(option);
    }
    const moveButton = document.createElement('button');
    moveButton.type = 'submit';
    moveButton.textContent = 'Move task';
    const noDestination = destination.options.length === 0;
    destination.disabled = currentProjectArchived || noDestination;
    moveButton.disabled = currentProjectArchived || noDestination;
    moveForm.append(destination, moveButton);
    moveForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (currentProjectArchived || !destination.value) return;
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
      });
      if (response.ok) await loadTasks();
    });
    row.append(title, checkbox, priority, renameForm, dueDateForm, moveForm);
    tasksContainer.append(row);
  }
}

function navigate(path) {
  if (path === '/') {
    appliedProjectQuery = '';
    projectSearchInput.value = '';
  }
  history.pushState({}, '', path);
  showRoute();
}

function resetDueRange() {
  appliedDueFrom = '';
  appliedDueThrough = '';
  dueFromInput.value = '';
  dueThroughInput.value = '';
  dueRangeAlert.hidden = true;
}

function isValidCalendarDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

document.querySelector('#apply-due-range').addEventListener('click', async () => {
  const dueFrom = dueFromInput.value.trim();
  const dueThrough = dueThroughInput.value.trim();
  if ((dueFrom && !isValidCalendarDate(dueFrom)) || (dueThrough && !isValidCalendarDate(dueThrough))) {
    dueRangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
    dueRangeAlert.hidden = false;
    return;
  }
  if (dueFrom && dueThrough && dueFrom > dueThrough) {
    dueRangeAlert.textContent = 'Due from must not be after Due through';
    dueRangeAlert.hidden = false;
    return;
  }
  appliedDueFrom = dueFrom;
  appliedDueThrough = dueThrough;
  dueFromInput.value = dueFrom;
  dueThroughInput.value = dueThrough;
  dueRangeAlert.hidden = true;
  await loadTasks();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alertMessage.textContent = 'Project name is required';
    alertMessage.hidden = false;
    return;
  }
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return;
  alertMessage.hidden = true;
  nameInput.value = '';
  await loadProjects();
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
projectSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  appliedProjectQuery = projectSearchInput.value.trim();
  projectSearchInput.value = appliedProjectQuery;
  await loadProjects();
});
taskSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  appliedTaskQuery = taskSearchInput.value.trim();
  taskSearchInput.value = appliedTaskQuery;
  await loadTasks();
});
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentProjectArchived) return;
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    return;
  }
  const response = await fetch(`/api/projects/${currentProjectId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return;
  const project = await response.json();
  document.querySelector('#project-heading').textContent = project.name;
  document.title = `${project.name} · Workboard`;
  renameInput.value = '';
  renameAlert.hidden = true;
});
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentProjectArchived) return;
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  const response = await fetch(`/api/projects/${currentProjectId}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) return;
  taskAlert.hidden = true;
  taskInput.value = '';
  await loadTasks();
});
taskFilter.addEventListener('change', loadTasks);
priorityFilter.addEventListener('change', loadTasks);
defaultTaskPriority.addEventListener('change', async () => {
  if (currentProjectId === null || currentProjectArchived) return;
  const response = await fetch(`/api/projects/${currentProjectId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ defaultTaskPriority: defaultTaskPriority.value }),
  });
  if (!response.ok) await showRoute();
});
projectFilter.addEventListener('change', loadProjects);
window.addEventListener('popstate', showRoute);
showRoute();
