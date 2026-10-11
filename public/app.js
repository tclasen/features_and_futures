const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
const projectSearchForm = document.querySelector('#project-search-form');
const projectSearchInput = document.querySelector('#project-search');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const detailTitle = document.querySelector('#detail-title');
const renameForm = document.querySelector('#rename-project-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const dueRangeForm = document.querySelector('#due-range-form');
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
const defaultTaskPriority = document.querySelector('#default-task-priority');
const taskSearchForm = document.querySelector('#task-search-form');
const taskSearchInput = document.querySelector('#task-search');
const taskContainer = document.querySelector('#tasks');
const archivedNotice = document.querySelector('#archived-notice');
let activeProjectId = null;
let activeProjectArchived = false;
let appliedDueRange = { from: '', through: '' };
let appliedProjectSearch = '';
let appliedTaskSearch = '';

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function normalizeSearchText(value) {
  return asciiLower(value.replace(/[ \t]+/g, ' '));
}

function isValidDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed');
  return result;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => navigate(`/projects/${project.id}`));
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    try {
      await request(`/api/projects/${project.id}/archive`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      await renderProjects();
    } catch (error) { showError(error); }
  });
  row.append(name, summary, open, archive);
  return row;
}

async function renderProjects() {
  const projects = await request(`/api/projects?archived=${projectFilter.value === 'archived'}`);
  const query = normalizeSearchText(appliedProjectSearch);
  projectContainer.replaceChildren(...projects
    .filter((project) => normalizeSearchText(project.name).includes(query))
    .map(projectRow));
}

async function renderRoute() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    if (activeProjectId !== null) {
      appliedProjectSearch = '';
      projectSearchInput.value = '';
    }
    listSection.hidden = false;
    detailSection.hidden = true;
    activeProjectId = null;
    await renderProjects();
    return;
  }
  const project = await request(`/api/projects/${match[1]}`);
  if (activeProjectId !== match[1]) {
    taskFilter.value = 'All';
    priorityFilter.value = 'All';
    appliedDueRange = { from: '', through: '' };
    dueFromInput.value = '';
    dueThroughInput.value = '';
    appliedTaskSearch = '';
    taskSearchInput.value = '';
  }
  activeProjectId = match[1];
  activeProjectArchived = Boolean(project.archived);
  detailTitle.textContent = project.name;
  renameInput.value = '';
  renameInput.disabled = activeProjectArchived;
  renameForm.querySelector('button').disabled = activeProjectArchived;
  renameAlert.hidden = true;
  archivedNotice.hidden = !activeProjectArchived;
  taskForm.querySelector('button').disabled = activeProjectArchived;
  defaultTaskPriority.value = project.defaultTaskPriority;
  defaultTaskPriority.disabled = activeProjectArchived;
  listSection.hidden = true;
  detailSection.hidden = false;
  await renderTasks();
}

async function renderTasks() {
  if (!activeProjectId) return;
  const [tasks, activeProjects] = await Promise.all([
    request(`/api/projects/${activeProjectId}/tasks`),
    request('/api/projects?archived=false'),
  ]);
  const destinations = activeProjects.filter((project) => String(project.id) !== activeProjectId);
  const visibleTasks = tasks.filter((task) => taskFilter.value === 'Deleted'
    ? Boolean(task.deleted)
    : !task.deleted && (taskFilter.value === 'All'
      || (taskFilter.value === 'Open' && !task.completed)
      || (taskFilter.value === 'Completed' && task.completed)))
    .filter((task) => priorityFilter.value === 'All' || task.priority === priorityFilter.value)
    .filter((task) => {
      if (!appliedDueRange.from && !appliedDueRange.through) return true;
      if (!task.dueDate) return false;
      return (!appliedDueRange.from || task.dueDate >= appliedDueRange.from)
        && (!appliedDueRange.through || task.dueDate <= appliedDueRange.through);
    });
  const query = normalizeSearchText(appliedTaskSearch);
  const searchedTasks = visibleTasks.filter((task) => normalizeSearchText(task.title).includes(query));
  taskContainer.replaceChildren(...searchedTasks.map((task) => {
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    const taskUnavailable = activeProjectArchived || Boolean(task.deleted);
    checkbox.disabled = taskUnavailable;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    const title = document.createElement('span');
    title.textContent = task.title;
    label.append(checkbox, title);
    const priorityLabel = document.createElement('label');
    priorityLabel.textContent = 'Task priority';
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    priority.disabled = taskUnavailable;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority;
    priority.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ priority: priority.value }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    priorityLabel.append(priority);
    const rename = document.createElement('form');
    rename.className = 'task-rename-form';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = taskUnavailable;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = taskUnavailable;
    rename.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextTitle = renameInput.value.trim();
      if (!nextTitle) { showTaskError(new Error('Task title is required')); return; }
      taskAlert.hidden = true;
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/title`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    rename.append(renameInput, renameButton);
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'text';
    dueDateInput.value = task.dueDate ?? '';
    dueDateInput.setAttribute('aria-label', 'Task due date');
    dueDateInput.disabled = taskUnavailable;
    const dueDateButton = document.createElement('button');
    dueDateButton.type = 'submit';
    dueDateButton.textContent = 'Save due date';
    dueDateButton.disabled = taskUnavailable;
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      taskAlert.hidden = true;
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/due-date`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dueDate: dueDateInput.value }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    dueDateForm.append(dueDateInput, dueDateButton);
    const notesForm = document.createElement('form');
    notesForm.className = 'task-notes-form';
    const notesInput = document.createElement('textarea');
    notesInput.value = task.notes ?? '';
    notesInput.setAttribute('aria-label', 'Task notes');
    notesInput.disabled = taskUnavailable;
    const notesButton = document.createElement('button');
    notesButton.type = 'submit';
    notesButton.textContent = 'Save notes';
    notesButton.disabled = taskUnavailable;
    notesForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/notes`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: notesInput.value }),
        });
        taskAlert.hidden = true;
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    notesForm.append(notesInput, notesButton);
    const destinationLabel = document.createElement('label');
    destinationLabel.textContent = 'Destination project';
    const destinationSelect = document.createElement('select');
    destinationSelect.setAttribute('aria-label', 'Destination project');
    for (const project of destinations) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      destinationSelect.append(option);
    }
    destinationSelect.disabled = taskUnavailable || destinations.length === 0;
    destinationLabel.append(destinationSelect);
    const moveButton = document.createElement('button');
    moveButton.type = 'button';
    moveButton.textContent = 'Move task';
    moveButton.disabled = taskUnavailable || destinations.length === 0;
    moveButton.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/move`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ destinationProjectId: Number(destinationSelect.value) }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    const deletionButton = document.createElement('button');
    deletionButton.type = 'button';
    deletionButton.textContent = task.deleted ? 'Restore task' : 'Delete task';
    deletionButton.disabled = activeProjectArchived;
    deletionButton.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/${task.deleted ? 'restore' : 'delete'}`, {
          method: 'PATCH',
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    row.append(label, priorityLabel, rename, dueDateForm, notesForm, destinationLabel, moveButton, deletionButton);
    return row;
  }));
}

function showTaskError(error) {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}

function navigate(path) {
  window.history.pushState({}, '', path);
  renderRoute().catch(showError);
}

function showError(error) {
  alertMessage.textContent = error.message;
  alertMessage.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showError(new Error('Project name is required'));
    return;
  }
  alertMessage.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await renderProjects();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  appliedProjectSearch = '';
  projectSearchInput.value = '';
  navigate('/');
});
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    return;
  }
  renameAlert.hidden = true;
  try {
    const project = await request(`/api/projects/${activeProjectId}/name`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    detailTitle.textContent = project.name;
    renameInput.value = '';
  } catch (error) {
    renameAlert.textContent = error.message;
    renameAlert.hidden = false;
  }
});
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) { showTaskError(new Error('Task title is required')); return; }
  taskAlert.hidden = true;
  try {
    await request(`/api/projects/${activeProjectId}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    taskInput.value = '';
    await renderTasks();
  } catch (error) { showTaskError(error); }
});
taskFilter.addEventListener('change', () => renderTasks().catch(showTaskError));
priorityFilter.addEventListener('change', () => renderTasks().catch(showTaskError));
dueRangeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const from = dueFromInput.value.trim();
  const through = dueThroughInput.value.trim();
  if ((from && !isValidDueDate(from)) || (through && !isValidDueDate(through))) {
    showTaskError(new Error('Due range must use valid YYYY-MM-DD dates'));
    return;
  }
  if (from && through && from > through) {
    showTaskError(new Error('Due from must not be after Due through'));
    return;
  }
  taskAlert.hidden = true;
  appliedDueRange = { from, through };
  renderTasks().catch(showTaskError);
});
defaultTaskPriority.addEventListener('change', async () => {
  try {
    await request(`/api/projects/${activeProjectId}/default-task-priority`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priority: defaultTaskPriority.value }),
    });
  } catch (error) {
    showTaskError(error);
    renderRoute().catch(showError);
  }
});
projectFilter.addEventListener('change', () => renderProjects().catch(showError));
projectSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  appliedProjectSearch = projectSearchInput.value.trim();
  renderProjects().catch(showError);
});
taskSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  appliedTaskSearch = taskSearchInput.value.trim();
  renderTasks().catch(showTaskError);
});
window.addEventListener('popstate', () => renderRoute().catch(showError));
renderRoute().catch(showError);
