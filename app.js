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
const defaultTaskPriority = document.querySelector('#default-task-priority');
const priorityFilter = document.querySelector('#priority-filter');
const taskRenameAlert = document.querySelector('#task-rename-alert');
const taskDateAlert = document.querySelector('#task-date-alert');
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
const dueRangeAlert = document.querySelector('#due-range-alert');
let appliedDueRange = { from: '', through: '' };
const projectFilter = document.querySelector('#project-filter');
const archivedNotice = document.querySelector('#archived-notice');
const renameForm = document.querySelector('#rename-project-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
let activeProjectId = null;
let activeProjectArchived = false;
let activeProjectDefaultPriority = 'Normal';

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
  taskFilter.value = 'All';
  priorityFilter.value = 'All';
  dueFromInput.value = '';
  dueThroughInput.value = '';
  appliedDueRange = { from: '', through: '' };
  dueRangeAlert.hidden = true;
  document.querySelector('#detail-heading').textContent = project.name;
  activeProjectId = id;
  activeProjectArchived = project.archived;
  activeProjectDefaultPriority = project.defaultPriority;
  defaultTaskPriority.value = project.defaultPriority;
  defaultTaskPriority.disabled = activeProjectArchived;
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
  const destinations = (await fetchProjects()).filter((project) => !project.archived && String(project.id) !== String(activeProjectId));
  const filter = taskFilter.value;
  const selectedPriority = priorityFilter.value;
  taskList.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    if (selectedPriority !== 'All' && task.priority !== selectedPriority) continue;
    if ((appliedDueRange.from || appliedDueRange.through) && !task.dueDate) continue;
    if (appliedDueRange.from && task.dueDate < appliedDueRange.from) continue;
    if (appliedDueRange.through && task.dueDate > appliedDueRange.through) continue;
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
        return;
      }
      await refreshTasks();
    });

    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'text';
    dueDateInput.setAttribute('aria-label', 'Task due date');
    dueDateInput.placeholder = 'YYYY-MM-DD';
    dueDateInput.value = task.dueDate || '';
    dueDateInput.disabled = activeProjectArchived;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'submit';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = activeProjectArchived;
    dueDateForm.append(dueDateInput, saveDueDate);
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dueDate: dueDateInput.value }),
      });
      if (!response.ok) {
        taskDateAlert.textContent = 'Due date must be a valid YYYY-MM-DD date';
        taskDateAlert.hidden = false;
        return;
      }
      taskDateAlert.hidden = true;
      await refreshTasks();
    });

    const moveForm = document.createElement('form');
    moveForm.className = 'task-move-form';
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', 'Destination project');
    for (const project of destinations) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      destination.append(option);
    }
    destination.disabled = activeProjectArchived || destinations.length === 0;
    const moveButton = document.createElement('button');
    moveButton.type = 'submit';
    moveButton.textContent = 'Move task';
    moveButton.disabled = destination.disabled;
    moveForm.append(destination, moveButton);
    moveForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const moved = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${task.id}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
      });
      if (!moved.ok) {
        taskAlert.textContent = 'Unable to move task';
        taskAlert.hidden = false;
        return;
      }
      await refreshTasks();
    });

    row.append(title, renameForm, priority, dueDateForm, moveForm, checkbox);
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
priorityFilter.addEventListener('change', refreshTasks);
document.querySelector('#apply-due-range').addEventListener('click', () => {
  const from = dueFromInput.value.trim();
  const through = dueThroughInput.value.trim();
  const validDate = (value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || year > 9999) return false;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  };
  if (!validDate(from) || !validDate(through)) {
    dueRangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
    dueRangeAlert.hidden = false;
    return;
  }
  if (from && through && from > through) {
    dueRangeAlert.textContent = 'Due from must not be after Due through';
    dueRangeAlert.hidden = false;
    return;
  }
  dueRangeAlert.hidden = true;
  appliedDueRange = { from, through };
  refreshTasks();
});
defaultTaskPriority.addEventListener('change', async () => {
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ defaultPriority: defaultTaskPriority.value }),
  });
  if (!response.ok) {
    defaultTaskPriority.value = activeProjectDefaultPriority;
    taskAlert.textContent = 'Unable to update default task priority';
    taskAlert.hidden = false;
    return;
  }
  activeProjectDefaultPriority = defaultTaskPriority.value;
});
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
