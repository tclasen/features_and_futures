import { normalizeDueDate } from './due-date.js';

const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const renameForm = document.querySelector('#rename-project');
const newNameInput = document.querySelector('#new-project-name');
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const dueRangeForm = document.querySelector('#due-range');
const dueFromInput = document.querySelector('#due-from');
const dueThroughInput = document.querySelector('#due-through');
let dueFrom = '';
let dueThrough = '';
const defaultPrioritySelect = document.querySelector('#default-task-priority');
let defaultTaskPriority = 'Normal';
const tasksElement = document.querySelector('#tasks');
const projectId = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/)?.[1];
let tasks = [];
let projectItems = [];
let archived = false;
let pendingWrites = 0;
let stateVersion = 0;
const destinationSelections = new Map();
const taskRows = new Map();
const projectFilter = document.querySelector('#project-filter');

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function request(path, options) {
  if (options) {
    pendingWrites++;
    stateVersion++;
  }
  try {
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  } finally {
    if (options) pendingWrites--;
  }
}

function renderProjects() {
  const items = projectItems.filter((project) => project.archived === (projectFilter.value === 'archived'));
  projects.replaceChildren();
  document.querySelector('#empty').hidden = items.length > 0;
  for (const project of items) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      window.location.assign(`/projects/${project.id}`);
    });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const archiveButton = document.createElement('button');
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    archiveButton.addEventListener('click', async () => {
      alert.hidden = true;
      archiveButton.disabled = true;
      try {
        await request(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        await loadProjects();
      } catch (error) {
        showError(error.message);
      } finally {
        archiveButton.disabled = false;
      }
    });
    row.append(name, summary, open, archiveButton);
    projects.append(row);
  }
}

async function loadProjects() {
  projectItems = await request('/api/projects');
  renderProjects();
}

projectFilter.addEventListener('change', renderProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await loadProjects();
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

function showProjectName(name) {
  heading.textContent = name;
  document.title = `${name} — Workboard`;
}

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  alert.hidden = true;
  const name = newNameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = renameForm.querySelector('button');
  button.disabled = true;
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    showProjectName(project.name);
    newNameInput.value = '';
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = archived;
  }
});

defaultPrioritySelect.addEventListener('change', async () => {
  if (archived) return;
  alert.hidden = true;
  defaultPrioritySelect.disabled = true;
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultTaskPriority: defaultPrioritySelect.value }),
    });
    defaultTaskPriority = project.defaultTaskPriority;
  } catch (error) {
    showError(error.message);
  } finally {
    defaultPrioritySelect.value = defaultTaskPriority;
    defaultPrioritySelect.disabled = archived;
  }
});

dueRangeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  alert.hidden = true;
  const from = normalizeDueDate(dueFromInput.value);
  const through = normalizeDueDate(dueThroughInput.value);
  if (from === null || through === null) {
    showError('Due range must use valid YYYY-MM-DD dates');
    return;
  }
  if (from && through && from > through) {
    showError('Due from must not be after Due through');
    return;
  }
  dueFrom = from;
  dueThrough = through;
  dueFromInput.value = from;
  dueThroughInput.value = through;
  renderTasks();
});

function renderTasks() {
  const visibleRows = [];
  const context = JSON.stringify([archived, destinationOptions(projectItems)]);
  for (const id of taskRows.keys()) {
    if (!tasks.some((task) => task.id === id)) taskRows.delete(id);
  }
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    if (priorityFilter.value !== 'all' && task.priority !== priorityFilter.value) continue;
    if ((dueFrom || dueThrough) && !task.dueDate) continue;
    if (dueFrom && task.dueDate < dueFrom) continue;
    if (dueThrough && task.dueDate > dueThrough) continue;
    const existing = taskRows.get(task.id);
    if (existing && existing.task === task && existing.context === context) {
      existing.update();
      visibleRows.push(existing.row);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      alert.hidden = true;
      checkbox.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        task.completed = saved.completed;
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error.message);
      } finally {
        checkbox.disabled = false;
      }
    });
    const renameTaskForm = document.createElement('form');
    renameTaskForm.className = 'rename-task';
    const label = document.createElement('label');
    label.htmlFor = `new-task-title-${task.id}`;
    label.textContent = 'New task title';
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'text';
    input.disabled = archived;
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Rename task';
    button.disabled = archived;
    renameTaskForm.append(label, input, button);
    renameTaskForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (archived) return;
      alert.hidden = true;
      const newTitle = input.value.trim();
      if (!newTitle) {
        showError('Task title is required');
        return;
      }
      button.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        task.title = saved.title;
        title.textContent = saved.title;
        checkbox.setAttribute('aria-label', `Complete ${saved.title}`);
        input.value = '';
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = archived;
      }
    });
    const priorityLabel = document.createElement('label');
    priorityLabel.htmlFor = `task-priority-${task.id}`;
    priorityLabel.textContent = 'Task priority';
    const prioritySelect = document.createElement('select');
    prioritySelect.id = priorityLabel.htmlFor;
    prioritySelect.disabled = archived;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      prioritySelect.append(option);
    }
    prioritySelect.value = task.priority;
    prioritySelect.addEventListener('change', async () => {
      alert.hidden = true;
      prioritySelect.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: prioritySelect.value }),
        });
        task.priority = saved.priority;
        renderTasks();
      } catch (error) {
        showError(error.message);
      } finally {
        prioritySelect.value = task.priority;
        prioritySelect.disabled = archived;
      }
    });
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date';
    const dueDateLabel = document.createElement('label');
    dueDateLabel.htmlFor = `task-due-date-${task.id}`;
    dueDateLabel.textContent = 'Task due date';
    const dueDateInput = document.createElement('input');
    dueDateInput.id = dueDateLabel.htmlFor;
    dueDateInput.type = 'text';
    dueDateInput.value = task.dueDate;
    dueDateInput.disabled = archived;
    const saveDueDateButton = document.createElement('button');
    saveDueDateButton.type = 'submit';
    saveDueDateButton.textContent = 'Save due date';
    saveDueDateButton.disabled = archived;
    dueDateForm.append(dueDateLabel, dueDateInput, saveDueDateButton);
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (archived) return;
      alert.hidden = true;
      saveDueDateButton.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: dueDateInput.value }),
        });
        task.dueDate = saved.dueDate;
        dueDateInput.value = saved.dueDate;
        renderTasks();
      } catch (error) {
        dueDateInput.value = task.dueDate;
        showError(error.message);
      } finally {
        saveDueDateButton.disabled = archived;
      }
    });
    const moveForm = document.createElement('form');
    moveForm.className = 'move-task';
    const destinationLabel = document.createElement('label');
    destinationLabel.htmlFor = `destination-project-${task.id}`;
    destinationLabel.textContent = 'Destination project';
    const destinationSelect = document.createElement('select');
    destinationSelect.id = destinationLabel.htmlFor;
    const destinations = projectItems.filter((project) => !project.archived && String(project.id) !== projectId);
    for (const project of destinations) {
      const option = document.createElement('option');
      option.value = String(project.id);
      option.textContent = project.name;
      destinationSelect.append(option);
    }
    const selectedDestination = destinationSelections.get(task.id);
    if (destinations.length) {
      destinationSelect.value = destinations.some((project) => String(project.id) === selectedDestination)
        ? selectedDestination : String(destinations[0].id);
    }
    destinationSelect.addEventListener('change', () => {
      destinationSelections.set(task.id, destinationSelect.value);
    });
    const moveButton = document.createElement('button');
    moveButton.type = 'submit';
    moveButton.textContent = 'Move task';
    destinationSelect.disabled = moveButton.disabled = archived || destinations.length === 0;
    moveForm.append(destinationLabel, destinationSelect, moveButton);
    moveForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (archived || !destinations.length) return;
      alert.hidden = true;
      moveButton.disabled = true;
      try {
        await request(`/api/projects/${projectId}/tasks/${task.id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinationProjectId: Number(destinationSelect.value) }),
        });
        tasks = tasks.filter((item) => item.id !== task.id);
        destinationSelections.delete(task.id);
        renderTasks();
      } catch (error) {
        showError(error.message);
      } finally {
        moveButton.disabled = archived || destinations.length === 0;
      }
    });
    row.append(checkbox, title, renameTaskForm, priorityLabel, prioritySelect, dueDateForm, moveForm);
    let savedDueDate = task.dueDate;
    const update = () => {
      title.textContent = task.title;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.checked = task.completed;
      prioritySelect.value = task.priority;
      // Unrelated edits must not erase a due-date draft or detach its form.
      if (savedDueDate !== task.dueDate) {
        dueDateInput.value = task.dueDate;
        savedDueDate = task.dueDate;
      }
    };
    taskRows.set(task.id, { task, context, row, update });
    visibleRows.push(row);
  }
  const currentRows = Array.from(tasksElement.children);
  if (currentRows.length !== visibleRows.length || currentRows.some((row, index) => row !== visibleRows[index])) {
    tasksElement.replaceChildren(...visibleRows);
  }
}

taskFilter.addEventListener('change', renderTasks);
priorityFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  alert.hidden = true;
  const title = titleInput.value.trim();
  if (!title) {
    showError('Task title is required');
    return;
  }
  const button = taskForm.querySelector('button');
  button.disabled = true;
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    titleInput.value = '';
    renderTasks();
    titleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

function showProject(project) {
  archived = project.archived;
  defaultTaskPriority = project.defaultTaskPriority;
  defaultPrioritySelect.value = defaultTaskPriority;
  defaultPrioritySelect.disabled = archived;
  document.querySelector('#archived-notice').hidden = !archived;
  taskForm.querySelector('button').disabled = archived;
  newNameInput.disabled = archived;
  renameForm.querySelector('button').disabled = archived;
  showProjectName(project.name);
}

function destinationOptions(items) {
  return items.filter((project) => !project.archived && String(project.id) !== projectId)
    .map(({ id, name }) => ({ id, name }));
}

async function loadPage() {
  if (projectId) {
    const project = await request(`/api/projects/${projectId}`);
    showProject(project);
    projectItems = await request('/api/projects');
    tasks = await request(`/api/projects/${projectId}/tasks`);
    renderTasks();
    detail.hidden = false;
  } else {
    list.hidden = false;
    await loadProjects();
  }
}

// Keep separately opened pages current after transfers, without navigating or
// resetting filters. Ignore snapshots that overlap a local write.
let refreshing = false;
async function refreshPage() {
  if (refreshing || pendingWrites) return;
  refreshing = true;
  const version = stateVersion;
  try {
    const nextProjects = await request('/api/projects');
    const nextTasks = projectId ? await request(`/api/projects/${projectId}/tasks`) : null;
    if (pendingWrites || version !== stateVersion) return;
    const projectsChanged = JSON.stringify(nextProjects) !== JSON.stringify(projectItems);
    const destinationsChanged = JSON.stringify(destinationOptions(nextProjects)) !== JSON.stringify(destinationOptions(projectItems));
    projectItems = nextProjects;
    if (!projectId) {
      if (projectsChanged) renderProjects();
      return;
    }
    const project = projectItems.find((item) => String(item.id) === projectId);
    if (!project) return;
    const archiveChanged = archived !== project.archived;
    showProject(project);
    const tasksChanged = JSON.stringify(nextTasks) !== JSON.stringify(tasks);
    if (tasksChanged) {
      // Event handlers close over task objects. Reconcile snapshots in place so
      // a refresh cannot disconnect an existing row from the current model.
      const currentTasks = new Map(tasks.map((task) => [task.id, task]));
      tasks = nextTasks.map((next) => {
        const current = currentTasks.get(next.id);
        return current ? Object.assign(current, next) : next;
      });
    }
    if (tasksChanged || destinationsChanged || archiveChanged) renderTasks();
  } catch {
    // A temporary background connection failure must not interrupt editing.
    // Explicit user actions still report errors through the visible alert.
  } finally {
    refreshing = false;
  }
}

loadPage().then(() => {
  setInterval(refreshPage, 500);
  window.addEventListener('focus', refreshPage);
}).catch((error) => showError(error.message));
