import { validDueDate } from './date.js';

const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
const projectSearchForm = document.querySelector('#search-projects');
const projectSearch = document.querySelector('#project-search');
const form = document.querySelector('#create-project');
const input = document.querySelector('#project-name');
const error = document.querySelector('#error');
const renameForm = document.querySelector('#rename-project');
const renameInput = document.querySelector('#new-project-name');
const taskForm = document.querySelector('#create-task');
const taskInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const taskSearchForm = document.querySelector('#search-tasks');
const taskSearch = document.querySelector('#task-search');
const dueRangeForm = document.querySelector('#due-range');
const dueFrom = document.querySelector('#due-from');
const dueThrough = document.querySelector('#due-through');
const defaultPriority = document.querySelector('#default-task-priority');
const tasksContainer = document.querySelector('#tasks');
const projectMatch = window.location.pathname.match(/^\/projects\/(\d+)$/);
const tasksPath = projectMatch ? `/api/projects/${projectMatch[1]}/tasks` : null;
let appliedDueFrom = '';
let appliedDueThrough = '';
let appliedProjectQuery = '';
let appliedTaskQuery = '';
let tasks = [];
let projectData = [];
let archived = false;
let savedDefaultPriority = 'Normal';

function showError(message = '') {
  error.textContent = message;
  error.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  const archiveButton = document.createElement('button');
  archiveButton.type = 'button';
  archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
  archiveButton.addEventListener('click', async () => {
    archiveButton.disabled = true;
    showError();
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      projectData = projectData.map((item) => item.id === saved.id ? saved : item);
      renderProjects();
    } catch (failure) {
      showError(failure.message);
      archiveButton.disabled = false;
    }
  });
  row.append(name, summary, button, archiveButton);
  return row;
}

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function renderProjects() {
  const filtered = projectData.filter((project) =>
    Boolean(project.archived) === (projectFilter.value === 'Archived')
    && asciiLower(project.name).includes(appliedProjectQuery));
  projects.replaceChildren(...filtered.map(projectRow));
}

projectFilter.addEventListener('change', renderProjects);
projectSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  projectSearch.value = projectSearch.value.trim();
  appliedProjectQuery = asciiLower(projectSearch.value);
  showError();
  renderProjects();
});
taskSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  taskSearch.value = taskSearch.value.trim();
  appliedTaskQuery = asciiLower(taskSearch.value);
  showError();
  renderTasks();
});

function taskRow(task) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.testid = 'task-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `task-${task.id}`;
  checkbox.checked = task.completed;
  checkbox.disabled = archived;
  checkbox.setAttribute('aria-label', `Complete ${task.title}`);
  const title = document.createElement('label');
  title.htmlFor = checkbox.id;
  title.textContent = task.title;
  checkbox.addEventListener('change', async () => {
    if (archived) return;
    checkbox.disabled = true;
    showError();
    try {
      const saved = await request(`${tasksPath}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      tasks = tasks.map((item) => item.id === saved.id ? saved : item);
      renderTasks();
    } catch (failure) {
      checkbox.checked = task.completed;
      showError(failure.message);
    } finally {
      checkbox.disabled = archived;
    }
  });
  const renameTaskForm = document.createElement('form');
  renameTaskForm.className = 'rename-task';
  const renameLabel = document.createElement('label');
  const renameTitle = document.createElement('input');
  renameTitle.type = 'text';
  renameTitle.id = `new-task-title-${task.id}`;
  renameTitle.value = task.title;
  renameTitle.disabled = archived;
  renameLabel.htmlFor = renameTitle.id;
  renameLabel.textContent = 'New task title';
  const renameButton = document.createElement('button');
  renameButton.type = 'submit';
  renameButton.textContent = 'Rename task';
  renameButton.disabled = archived;
  const controls = document.createElement('div');
  controls.className = 'form-controls';
  controls.append(renameTitle, renameButton);
  renameTaskForm.append(renameLabel, controls);
  renameTaskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (archived) return;
    const newTitle = renameTitle.value.trim();
    if (!newTitle) return showError('Task title is required');
    showError();
    renameButton.disabled = true;
    try {
      const saved = await request(`${tasksPath}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      tasks = tasks.map((item) => item.id === saved.id ? saved : item);
      renderTasks();
    } catch (failure) {
      showError(failure.message);
    } finally {
      renameButton.disabled = archived;
    }
  });
  const priorityControls = document.createElement('div');
  priorityControls.className = 'task-priority';
  const priorityLabel = document.createElement('label');
  const priority = document.createElement('select');
  priority.id = `task-priority-${task.id}`;
  priorityLabel.htmlFor = priority.id;
  priorityLabel.textContent = 'Task priority';
  for (const value of ['Low', 'Normal', 'High']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    priority.append(option);
  }
  priority.value = task.priority;
  priority.disabled = archived;
  priority.addEventListener('change', async () => {
    if (archived) return;
    priority.disabled = true;
    showError();
    try {
      const saved = await request(`${tasksPath}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: priority.value }),
      });
      tasks = tasks.map((item) => item.id === saved.id ? saved : item);
      renderTasks();
    } catch (failure) {
      priority.value = task.priority;
      showError(failure.message);
    } finally {
      priority.disabled = archived;
    }
  });
  priorityControls.append(priorityLabel, priority);
  const dueDateForm = document.createElement('form');
  dueDateForm.className = 'task-due-date';
  const dueDateLabel = document.createElement('label');
  const dueDate = document.createElement('input');
  dueDate.type = 'text';
  dueDate.id = `task-due-date-${task.id}`;
  dueDate.value = task.due_date || '';
  dueDate.disabled = archived;
  dueDateLabel.htmlFor = dueDate.id;
  dueDateLabel.textContent = 'Task due date';
  const saveDueDate = document.createElement('button');
  saveDueDate.type = 'submit';
  saveDueDate.textContent = 'Save due date';
  saveDueDate.disabled = archived;
  const dueDateControls = document.createElement('div');
  dueDateControls.className = 'form-controls';
  dueDateControls.append(dueDate, saveDueDate);
  dueDateForm.append(dueDateLabel, dueDateControls);
  dueDateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (archived) return;
    showError();
    saveDueDate.disabled = true;
    try {
      const saved = await request(`${tasksPath}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: dueDate.value.trim() }),
      });
      tasks = tasks.map((item) => item.id === saved.id ? saved : item);
      renderTasks();
    } catch (failure) {
      showError(failure.message);
    } finally {
      saveDueDate.disabled = archived;
    }
  });
  const moveForm = document.createElement('form');
  moveForm.className = 'move-task';
  const destinationLabel = document.createElement('label');
  const destination = document.createElement('select');
  destination.id = `destination-project-${task.id}`;
  destinationLabel.htmlFor = destination.id;
  destinationLabel.textContent = 'Destination project';
  const eligibleProjects = projectData.filter((project) => !project.archived && project.id !== Number(projectMatch[1]));
  for (const project of eligibleProjects) {
    const option = document.createElement('option');
    option.value = String(project.id);
    option.textContent = project.name;
    destination.append(option);
  }
  if (eligibleProjects.length) destination.value = String(eligibleProjects[0].id);
  const movingDisabled = archived || !eligibleProjects.length;
  destination.disabled = movingDisabled;
  const moveButton = document.createElement('button');
  moveButton.type = 'submit';
  moveButton.textContent = 'Move task';
  moveButton.disabled = movingDisabled;
  const moveControls = document.createElement('div');
  moveControls.className = 'form-controls';
  moveControls.append(destination, moveButton);
  moveForm.append(destinationLabel, moveControls);
  moveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (movingDisabled) return;
    moveButton.disabled = true;
    destination.disabled = true;
    showError();
    try {
      await request(`${tasksPath}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_project_id: Number(destination.value) }),
      });
      tasks = tasks.filter((item) => item.id !== task.id);
      renderTasks();
    } catch (failure) {
      showError(failure.message);
    } finally {
      moveButton.disabled = movingDisabled;
      destination.disabled = movingDisabled;
    }
  });
  row.append(checkbox, title, renameTaskForm, priorityControls, dueDateForm, moveForm);
  return row;
}

function renderTasks() {
  const filtered = tasks.filter((task) => {
    const matchesCompletion = taskFilter.value === 'All'
      || (taskFilter.value === 'Completed' ? task.completed : !task.completed);
    const matchesPriority = priorityFilter.value === 'All' || task.priority === priorityFilter.value;
    const matchesDueRange = (!appliedDueFrom && !appliedDueThrough)
      || (Boolean(task.due_date)
        && (!appliedDueFrom || task.due_date >= appliedDueFrom)
        && (!appliedDueThrough || task.due_date <= appliedDueThrough));
    const matchesSearch = asciiLower(task.title).includes(appliedTaskQuery);
    return matchesCompletion && matchesPriority && matchesDueRange && matchesSearch;
  });
  tasksContainer.replaceChildren(...filtered.map(taskRow));
}

dueRangeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const from = dueFrom.value.trim();
  const through = dueThrough.value.trim();
  if (!validDueDate(from) || !validDueDate(through)) {
    return showError('Due range must use valid YYYY-MM-DD dates');
  }
  if (from && through && from > through) {
    return showError('Due from must not be after Due through');
  }
  appliedDueFrom = from;
  appliedDueThrough = through;
  dueFrom.value = from;
  dueThrough.value = through;
  showError();
  renderTasks();
});

taskFilter.addEventListener('change', renderTasks);
priorityFilter.addEventListener('change', renderTasks);
defaultPriority.addEventListener('change', async () => {
  if (archived || !projectMatch) return;
  defaultPriority.disabled = true;
  showError();
  try {
    const project = await request(`/api/projects/${projectMatch[1]}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_priority: defaultPriority.value }),
    });
    savedDefaultPriority = project.default_priority;
    defaultPriority.value = savedDefaultPriority;
  } catch (failure) {
    defaultPriority.value = savedDefaultPriority;
    showError(failure.message);
  } finally {
    defaultPriority.disabled = archived;
  }
});
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived || !projectMatch) return;
  const name = renameInput.value.trim();
  if (!name) return showError('Project name is required');
  showError();
  const button = renameForm.querySelector('button');
  button.disabled = true;
  try {
    const project = await request(`/api/projects/${projectMatch[1]}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    document.querySelector('#project-heading').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    renameInput.value = project.name;
  } catch (failure) {
    showError(failure.message);
  } finally {
    button.disabled = archived;
  }
});
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  const title = taskInput.value.trim();
  if (!title) return showError('Task title is required');
  showError();
  const button = taskForm.querySelector('button');
  button.disabled = true;
  try {
    const task = await request(tasksPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
  } catch (failure) {
    showError(failure.message);
  } finally {
    button.disabled = archived;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return showError('Project name is required');
  showError();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    projectData.push(project);
    renderProjects();
    input.value = '';
    input.focus();
  } catch (failure) {
    showError(failure.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  window.location.assign('/');
});

async function load() {
  const match = projectMatch;
  list.hidden = Boolean(match);
  detail.hidden = !match;
  try {
    if (match) {
      const project = await request(`/api/projects/${match[1]}`);
      archived = Boolean(project.archived);
      savedDefaultPriority = project.default_priority;
      defaultPriority.value = savedDefaultPriority;
      defaultPriority.disabled = archived;
      renameInput.value = project.name;
      renameInput.disabled = archived;
      renameForm.querySelector('button').disabled = archived;
      document.querySelector('#archived-project').hidden = !archived;
      taskForm.querySelector('button').disabled = archived;
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      projectData = await request('/api/projects');
      tasks = await request(tasksPath);
      renderTasks();
    } else {
      projectData = await request('/api/projects');
      renderProjects();
    }
  } catch (failure) {
    showError(failure.message);
  }
}

await load();
