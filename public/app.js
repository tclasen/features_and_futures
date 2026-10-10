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
const priorityFilter = document.querySelector('#priority-filter');
const dueRangeForm = document.querySelector('#due-range-form');
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
const defaultTaskPriority = document.querySelector('#default-task-priority');
const projectFilter = document.querySelector('#project-filter');
const projectSearchForm = document.querySelector('#project-search-form');
const projectSearchInput = document.querySelector('#project-search');
const taskSearchForm = document.querySelector('#task-search-form');
const taskSearchInput = document.querySelector('#task-search');
const archivedNotice = document.querySelector('#archived-notice');
const renameForm = document.querySelector('#rename-project');
const newProjectNameInput = document.querySelector('#new-project-name');
let activeProjectId;
let activeProjectArchived = false;
let appliedDueRange = { from: '', through: '' };
let appliedProjectQuery = '';
let appliedTaskQuery = '';

function matchesSearch(value, query) {
  const foldAscii = text => text.replace(/[A-Z]/g, character => character.toLowerCase());
  const normalizeWhitespace = text => text.replace(/[ \t]+/g, ' ');
  return foldAscii(normalizeWhitespace(value)).includes(foldAscii(normalizeWhitespace(query)));
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

async function loadProjects() {
  const response = await fetch(`/api/projects?filter=${encodeURIComponent(projectFilter.value)}`);
  if (!response.ok) throw new Error('Unable to load projects');
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects.filter(item => matchesSearch(item.name, appliedProjectQuery))) {
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
    appliedProjectQuery = '';
    projectSearchInput.value = '';
    await loadProjects();
    return;
  }
  const response = await fetch(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
  if (!response.ok) {
    window.location.replace('/');
    return;
  }
  const project = await response.json();
  appliedDueRange = { from: '', through: '' };
  appliedTaskQuery = '';
  taskSearchInput.value = '';
  dueFromInput.value = '';
  dueThroughInput.value = '';
  taskFilter.value = 'All';
  priorityFilter.value = 'All';
  activeProjectId = project.id;
  activeProjectArchived = Boolean(project.archived);
  document.querySelector('#project-title').textContent = project.name;
  archivedNotice.hidden = !activeProjectArchived;
  newProjectNameInput.disabled = activeProjectArchived;
  renameForm.querySelector('button').disabled = activeProjectArchived;
  taskForm.querySelector('button').disabled = activeProjectArchived;
  defaultTaskPriority.disabled = activeProjectArchived;
  defaultTaskPriority.value = project.default_task_priority;
  listView.hidden = true;
  detailView.hidden = false;
  await loadTasks();
}

async function loadTasks() {
  const [response, projectsResponse] = await Promise.all([
    fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`),
    fetch('/api/projects?filter=Active')
  ]);
  if (!response.ok || !projectsResponse.ok) throw new Error('Unable to load tasks');
  const [tasks, activeProjects] = await Promise.all([response.json(), projectsResponse.json()]);
  const destinations = activeProjects.filter(project => project.id !== activeProjectId);
  const filter = taskFilter.value;
  const selectedPriority = priorityFilter.value;
  const { from, through } = appliedDueRange;
  taskContainer.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    if (selectedPriority !== 'All' && task.priority !== selectedPriority) continue;
    if ((from || through) && !task.due_date) continue;
    if (from && task.due_date < from || through && task.due_date > through) continue;
    if (!matchesSearch(task.title, appliedTaskQuery)) continue;
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
      await loadTasks();
    });
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'text';
    dueDateInput.value = task.due_date || '';
    dueDateInput.setAttribute('aria-label', 'Task due date');
    dueDateInput.disabled = activeProjectArchived;
    const dueDateButton = document.createElement('button');
    dueDateButton.type = 'submit';
    dueDateButton.textContent = 'Save due date';
    dueDateButton.disabled = activeProjectArchived;
    dueDateForm.append(dueDateInput, dueDateButton);
    dueDateForm.addEventListener('submit', async event => {
      event.preventDefault();
      const update = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/due-date`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dueDate: dueDateInput.value })
      });
      const result = await update.json();
      if (!update.ok) {
        showError(result.error || 'Unable to save due date');
        return;
      }
      error.hidden = true;
      await loadTasks();
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
    const moveForm = document.createElement('form');
    moveForm.className = 'task-move-form';
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', 'Destination project');
    destination.disabled = activeProjectArchived || destinations.length === 0;
    for (const project of destinations) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      destination.append(option);
    }
    const moveButton = document.createElement('button');
    moveButton.type = 'submit';
    moveButton.textContent = 'Move task';
    moveButton.disabled = destination.disabled;
    moveForm.append(destination, moveButton);
    moveForm.addEventListener('submit', async event => {
      event.preventDefault();
      const update = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/move`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: destination.value })
      });
      if (!update.ok) {
        showError('Unable to move task');
        return;
      }
      error.hidden = true;
      await loadTasks();
    });
    row.append(title, label, priority, renameForm, dueDateForm, moveForm);
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
defaultTaskPriority.addEventListener('change', async () => {
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/default-task-priority`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ priority: defaultTaskPriority.value })
  });
  if (!response.ok) {
    showError('Unable to update default task priority');
    return;
  }
  error.hidden = true;
});
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
projectSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  appliedProjectQuery = projectSearchInput.value.trim();
  loadProjects().catch(() => showError('Unable to load projects'));
});
taskSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  appliedTaskQuery = taskSearchInput.value.trim();
  loadTasks().catch(() => showError('Unable to load tasks'));
});
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
priorityFilter.addEventListener('change', () => loadTasks().catch(() => {
  error.textContent = 'Unable to load tasks';
  error.hidden = false;
}));
dueRangeForm.addEventListener('submit', async event => {
  event.preventDefault();
  const from = dueFromInput.value.trim();
  const through = dueThroughInput.value.trim();
  if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
    showError('Due range must use valid YYYY-MM-DD dates');
    return;
  }
  if (from && through && from > through) {
    showError('Due from must not be after Due through');
    return;
  }
  appliedDueRange = { from, through };
  error.hidden = true;
  try {
    await loadTasks();
  } catch {
    showError('Unable to load tasks');
  }
});
showRoute().catch(() => {
  error.textContent = 'Unable to load projects';
  error.hidden = false;
});
