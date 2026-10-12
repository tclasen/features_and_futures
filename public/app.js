const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectsNode = document.querySelector('#projects');
const alertNode = document.querySelector('#form-alert');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const tasksNode = document.querySelector('#tasks');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const dueRangeForm = document.querySelector('#due-range-form');
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
const projectFilter = document.querySelector('#project-filter');
const projectSearchForm = document.querySelector('#project-search-form');
const projectSearchInput = document.querySelector('#project-search');
const taskSearchForm = document.querySelector('#task-search-form');
const taskSearchInput = document.querySelector('#task-search');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
const defaultPriority = document.querySelector('#default-priority');
let activeProjectId = null;
let currentTasks = [];
let activeProjects = [];
let activeProjectArchived = false;
let appliedDueFrom = '';
let appliedDueThrough = '';
let appliedProjectQuery = '';
let appliedTaskQuery = '';

function asciiLower(value) {
  return value.replace(/[A-Z]/g, character => character.toLowerCase());
}

function normalizeSearch(value) {
  return asciiLower(value.replace(/[ \t]+/g, ' '));
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  appliedProjectQuery = '';
  projectSearchInput.value = '';
  history.pushState({}, '', '/');
  loadProjects();
}

async function loadProjects() {
  const projects = await request('/api/projects');
  projectsNode.replaceChildren();
  const query = normalizeSearch(appliedProjectQuery);
  const visibleProjects = projects.filter(project => project.archived === (projectFilter.value === 'Archived') &&
    normalizeSearch(project.name).includes(query));
  document.querySelector('#project-count').textContent = visibleProjects.length ? String(visibleProjects.length).padStart(2, '0') : '';
  if (!visibleProjects.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<span class="empty-icon" aria-hidden="true">◇</span><strong>No ${projectFilter.value.toLowerCase()} projects</strong><span>${projectFilter.value === 'Active' ? 'Create your first project to get started.' : 'Archived projects will appear here.'}</span>`;
    projectsNode.append(empty);
    return;
  }
  for (const project of visibleProjects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;
    const summary = document.createElement('span');
    summary.className = 'project-summary';
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const button = document.createElement('button');
    button.className = 'open-button';
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => openProject(project.id));
    const actions = document.createElement('div');
    actions.className = 'project-actions';
    const archiveButton = document.createElement('button');
    archiveButton.className = 'open-button';
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    archiveButton.addEventListener('click', async () => {
      await request(`/api/projects/${encodeURIComponent(project.id)}/archive`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived })
      });
      await loadProjects();
    });
    actions.append(button, archiveButton);
    row.append(name, summary, actions);
    projectsNode.append(row);
  }
}

async function openProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  taskFilter.value = 'All';
  priorityFilter.value = 'All';
  resetDueRange();
  appliedTaskQuery = '';
  taskSearchInput.value = '';
  document.querySelector('#detail-name').textContent = project.name;
  activeProjectId = project.id;
  setProjectArchived(project.archived);
  defaultPriority.value = project.defaultPriority || 'Normal';
  defaultPriority.dataset.saved = defaultPriority.value;
  listView.hidden = true;
  detailView.hidden = false;
  history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
  await loadTasks();
}

function setProjectArchived(archived) {
  activeProjectArchived = archived;
  document.querySelector('#archived-label').hidden = !archived;
  taskInput.disabled = archived;
  taskForm.querySelector('button[type="submit"]').disabled = archived;
  taskForm.setAttribute('aria-disabled', String(archived));
  renameInput.disabled = archived;
  renameForm.querySelector('button[type="submit"]').disabled = archived;
  defaultPriority.disabled = archived;
}

function drawTasks() {
  tasksNode.replaceChildren();
  const filter = taskFilter.value;
  const selectedPriority = priorityFilter.value;
  const visible = currentTasks.filter(task =>
    (filter === 'Deleted' ? Boolean(task.deleted) : !task.deleted &&
      (filter === 'All' || (filter === 'Open' ? !task.completed : task.completed))) &&
    (selectedPriority === 'All' || (task.priority || 'Normal') === selectedPriority) &&
    (!appliedDueFrom && !appliedDueThrough || Boolean(task.dueDate)) &&
    (!appliedDueFrom || (task.dueDate || '') >= appliedDueFrom) &&
    (!appliedDueThrough || (task.dueDate || '') <= appliedDueThrough) &&
    normalizeSearch(task.title).includes(normalizeSearch(appliedTaskQuery))
  );
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'task-empty';
    empty.textContent = currentTasks.length ? 'No tasks match this filter.' : 'No tasks yet.';
    tasksNode.append(empty);
  }
  for (const task of visible) {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    const label = document.createElement('label');
    label.className = 'task-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    const readOnly = activeProjectArchived || Boolean(task.deleted);
    checkbox.disabled = readOnly;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        task.completed = checkbox.checked;
        drawTasks();
      } catch { checkbox.checked = task.completed; }
    });
    const renameForm = document.createElement('form');
    renameForm.className = 'task-rename-form';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = readOnly;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.className = 'open-button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = readOnly;
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const renamed = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: renameInput.value })
        });
        task.title = renamed.title;
        drawTasks();
      } catch (error) {
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    renameForm.append(renameInput, renameButton);
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority || 'Normal';
    priority.disabled = readOnly;
    priority.addEventListener('change', async () => {
      const previous = task.priority || 'Normal';
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ priority: priority.value })
        });
        task.priority = updated.priority;
        drawTasks();
      } catch (error) {
        priority.value = previous;
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'text';
    dueDateInput.value = task.dueDate || '';
    dueDateInput.setAttribute('aria-label', 'Task due date');
    dueDateInput.disabled = readOnly;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'submit';
    saveDueDate.className = 'open-button';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = readOnly;
    dueDateForm.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dueDate: dueDateInput.value })
        });
        task.dueDate = updated.dueDate || null;
        dueDateInput.value = task.dueDate || '';
        taskAlert.hidden = true;
        drawTasks();
      } catch (error) {
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    dueDateForm.append(dueDateInput, saveDueDate);
    const notesForm = document.createElement('form');
    notesForm.className = 'task-notes-form';
    const notesInput = document.createElement('textarea');
    notesInput.value = task.notes || '';
    notesInput.setAttribute('aria-label', 'Task notes');
    notesInput.disabled = readOnly;
    const saveNotes = document.createElement('button');
    saveNotes.type = 'submit';
    saveNotes.className = 'open-button';
    saveNotes.textContent = 'Save notes';
    saveNotes.disabled = readOnly;
    notesForm.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: notesInput.value })
        });
        task.notes = updated.notes;
        taskAlert.hidden = true;
      } catch (error) {
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    notesForm.append(notesInput, saveNotes);
    const destinationForm = document.createElement('form');
    destinationForm.className = 'task-move-form';
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', 'Destination project');
    for (const project of activeProjects.filter(item => item.id !== activeProjectId)) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      destination.append(option);
    }
    const moveButton = document.createElement('button');
    moveButton.type = 'submit';
    moveButton.className = 'open-button';
    moveButton.textContent = 'Move task';
    destination.disabled = readOnly || destination.options.length === 0;
    moveButton.disabled = readOnly || destination.options.length === 0;
    destinationForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!destination.value) return;
      try {
        await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}/move`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ destinationProjectId: destination.value })
        });
        currentTasks = currentTasks.filter(item => item.id !== task.id);
        drawTasks();
      } catch (error) {
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    destinationForm.append(destination, moveButton);
    const lifecycleButton = document.createElement('button');
    lifecycleButton.type = 'button';
    lifecycleButton.className = 'open-button';
    lifecycleButton.textContent = task.deleted ? 'Restore task' : 'Delete task';
    lifecycleButton.disabled = activeProjectArchived;
    lifecycleButton.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}/${task.deleted ? 'restore' : 'delete'}`, { method: 'POST' });
        task.deleted = !task.deleted;
        drawTasks();
      } catch (error) {
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    label.append(checkbox);
    row.append(title, renameForm, priority, dueDateForm, notesForm, destinationForm, label, lifecycleButton);
    tasksNode.append(row);
  }
}

async function loadTasks() {
  if (!activeProjectId) return;
  const [tasks, projects] = await Promise.all([
    request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`), request('/api/projects')
  ]);
  currentTasks = tasks;
  activeProjects = projects.filter(project => !project.archived);
  drawTasks();
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/([^/]+)$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  try {
    const project = await request(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    document.querySelector('#detail-name').textContent = project.name;
    activeProjectId = project.id;
    taskFilter.value = 'All';
    priorityFilter.value = 'All';
    resetDueRange();
    appliedTaskQuery = '';
    taskSearchInput.value = '';
    setProjectArchived(project.archived);
    defaultPriority.value = project.defaultPriority || 'Normal';
    defaultPriority.dataset.saved = defaultPriority.value;
    listView.hidden = true;
    detailView.hidden = false;
    await loadTasks();
  } catch {
    activeProjectId = null;
    history.replaceState({}, '', '/');
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alertNode.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value })
    });
    nameInput.value = '';
    await loadProjects();
  } catch (error) {
    alertNode.textContent = error.message;
    alertNode.hidden = false;
  }
});

document.querySelector('#back-button').addEventListener('click', showList);
renameForm.addEventListener('submit', async event => {
  event.preventDefault();
  renameAlert.hidden = true;
  try {
    const project = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/rename`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: renameInput.value })
    });
    document.querySelector('#detail-name').textContent = project.name;
    renameInput.value = '';
  } catch (error) {
    renameAlert.textContent = error.message;
    renameAlert.hidden = false;
  }
});
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  taskAlert.hidden = true;
  try {
    await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: taskInput.value })
    });
    taskInput.value = '';
    await loadTasks();
  } catch (error) {
    taskAlert.textContent = error.message;
    taskAlert.hidden = false;
  }
});
taskFilter.addEventListener('change', drawTasks);
priorityFilter.addEventListener('change', drawTasks);
function resetDueRange() {
  appliedDueFrom = '';
  appliedDueThrough = '';
  dueFromInput.value = '';
  dueThroughInput.value = '';
}
function validCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
dueRangeForm.addEventListener('submit', event => {
  event.preventDefault();
  const from = dueFromInput.value.trim();
  const through = dueThroughInput.value.trim();
  taskAlert.hidden = true;
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
  appliedDueFrom = from;
  appliedDueThrough = through;
  dueFromInput.value = from;
  dueThroughInput.value = through;
  drawTasks();
});
defaultPriority.addEventListener('change', async () => {
  const previous = defaultPriority.dataset.saved || 'Normal';
  const selected = defaultPriority.value;
  try {
    const project = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/default-priority`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priority: selected })
    });
    defaultPriority.value = project.defaultPriority;
    defaultPriority.dataset.saved = project.defaultPriority;
  } catch (error) {
    defaultPriority.value = previous;
    taskAlert.textContent = error.message;
    taskAlert.hidden = false;
  }
});
projectFilter.addEventListener('change', loadProjects);
projectSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  appliedProjectQuery = projectSearchInput.value.trim();
  projectSearchInput.value = appliedProjectQuery;
  loadProjects();
});
taskSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  appliedTaskQuery = taskSearchInput.value.trim();
  taskSearchInput.value = appliedTaskQuery;
  drawTasks();
});
window.addEventListener('popstate', renderRoute);
renderRoute();
