const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#detail-view');
const list = document.querySelector('#project-list');
const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#alert');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskList = document.querySelector('#task-list');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const defaultPriority = document.querySelector('#default-task-priority');
const projectFilter = document.querySelector('#project-filter');
const projectSearchForm = document.querySelector('#project-search-form');
const projectSearchInput = document.querySelector('#project-search');
const taskSearchForm = document.querySelector('#task-search-form');
const taskSearchInput = document.querySelector('#task-search');
let appliedProjectQuery = '';
let appliedTaskQuery = '';
const dueFrom = document.querySelector('#due-from');
const dueThrough = document.querySelector('#due-through');
let appliedDueRange = { from: '', through: '' };
const taskCreateButton = taskForm.querySelector('button');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameButton = renameForm.querySelector('button');
const renameAlert = document.querySelector('#rename-alert');
let currentProjectId = null;

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function renderList() {
  currentProjectId = null;
  listView.hidden = false;
  detailView.hidden = true;
  const projects = await request('/api/projects');
  projectSearchInput.value = appliedProjectQuery;
  list.replaceChildren();
  const showingArchived = projectFilter.value === 'Archived';
  for (const project of projects) {
    if (Boolean(project.archived) !== showingArchived) continue;
    if (!project.name.toLowerCase().includes(appliedProjectQuery.toLowerCase())) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${project.id}/archive`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !Boolean(project.archived) })
        });
        await renderList();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    row.append(name, summary, open, archive);
    list.append(row);
  }
}

async function renderTasks() {
  const [tasks, projects] = await Promise.all([
    request(`/api/projects/${currentProjectId}/tasks`), request('/api/projects')
  ]);
  taskList.replaceChildren();
  const destinations = projects.filter(project => !project.archived && project.id !== currentProjectId);
  const filter = taskFilter.value;
  const selectedPriority = priorityFilter.value;
  taskSearchInput.value = appliedTaskQuery;
  for (const task of tasks) {
    if (!task.title.toLowerCase().includes(appliedTaskQuery.toLowerCase())) continue;
    if ((filter === 'Open' && task.completed) || (filter === 'Completed' && !task.completed)) continue;
    if (selectedPriority !== 'All' && task.priority !== selectedPriority) continue;
    if (appliedDueRange.from || appliedDueRange.through) {
      if (!task.due_date) continue;
      if (appliedDueRange.from && task.due_date < appliedDueRange.from) continue;
      if (appliedDueRange.through && task.due_date > appliedDueRange.through) continue;
    }
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'project-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = Boolean(window.currentProjectArchived);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = Boolean(window.currentProjectArchived);
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = Boolean(window.currentProjectArchived);
    renameButton.addEventListener('click', async () => {
      const newTitle = renameInput.value.trim();
      if (!newTitle) {
        taskAlert.textContent = 'Task title is required';
        taskAlert.hidden = false;
        return;
      }
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        });
        taskAlert.hidden = true;
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    priority.disabled = Boolean(window.currentProjectArchived);
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority || 'Normal';
    priority.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: priority.value })
        });
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    const dueDate = document.createElement('input');
    dueDate.type = 'text';
    dueDate.value = task.due_date || '';
    dueDate.setAttribute('aria-label', 'Task due date');
    dueDate.disabled = Boolean(window.currentProjectArchived);
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'button';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = Boolean(window.currentProjectArchived);
    saveDueDate.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_date: dueDate.value })
        });
        taskAlert.hidden = true;
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', 'Destination project');
    for (const project of destinations) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      destination.append(option);
    }
    destination.disabled = Boolean(window.currentProjectArchived) || destinations.length === 0;
    const moveButton = document.createElement('button');
    moveButton.type = 'button';
    moveButton.textContent = 'Move task';
    moveButton.disabled = destination.disabled;
    moveButton.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination_project_id: Number(destination.value) })
        });
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    row.append(title, checkbox, renameInput, renameButton, priority, dueDate, saveDueDate, destination, moveButton);
    taskList.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) return renderList();
  try {
    const project = await request(`/api/projects/${match[1]}`);
    currentProjectId = project.id;
    appliedDueRange = { from: '', through: '' };
    appliedTaskQuery = '';
    taskSearchInput.value = '';
    dueFrom.value = '';
    dueThrough.value = '';
    listView.hidden = true;
    detailView.hidden = false;
    document.querySelector('#project-title').textContent = project.name;
    renameInput.value = project.name;
    window.currentProjectArchived = Boolean(project.archived);
    defaultPriority.value = project.default_priority || 'Normal';
    defaultPriority.disabled = window.currentProjectArchived;
    renameInput.disabled = window.currentProjectArchived;
    renameButton.disabled = window.currentProjectArchived;
    document.querySelector('#archived-notice').hidden = !window.currentProjectArchived;
    taskCreateButton.disabled = window.currentProjectArchived;
    await renderTasks();
  } catch {
    history.replaceState(null, '', '/');
    await renderList();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    return;
  }
  alert.textContent = '';
  alert.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    nameInput.value = '';
    await renderList();
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
});

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  try {
    await request(`/api/projects/${currentProjectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    taskInput.value = '';
    taskAlert.hidden = true;
    await renderTasks();
  } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
});
projectSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  appliedProjectQuery = projectSearchInput.value.trim();
  renderList().catch(error => { alert.textContent = error.message; alert.hidden = false; });
});
taskSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  appliedTaskQuery = taskSearchInput.value.trim();
  renderTasks().catch(error => { taskAlert.textContent = error.message; taskAlert.hidden = false; });
});
projectFilter.addEventListener('change', () => renderList().catch(error => {
  alert.textContent = error.message;
  alert.hidden = false;
}));
taskFilter.addEventListener('change', () => renderTasks().catch(error => {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}));
priorityFilter.addEventListener('change', () => renderTasks().catch(error => {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}));
document.querySelector('#apply-due-range').addEventListener('click', async () => {
  const from = dueFrom.value.trim();
  const through = dueThrough.value.trim();
  if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
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
  try { await renderTasks(); } catch (error) {
    taskAlert.textContent = error.message;
    taskAlert.hidden = false;
  }
});
renameForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    return;
  }
  try {
    const project = await request(`/api/projects/${currentProjectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    document.querySelector('#project-title').textContent = project.name;
    renameInput.value = project.name;
    renameAlert.hidden = true;
  } catch (error) {
    renameAlert.textContent = error.message;
    renameAlert.hidden = false;
  }
});
defaultPriority.addEventListener('change', async () => {
  try {
    await request(`/api/projects/${currentProjectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_priority: defaultPriority.value })
    });
  } catch (error) {
    taskAlert.textContent = error.message;
    taskAlert.hidden = false;
  }
});
document.querySelector('#back-button').addEventListener('click', () => { appliedProjectQuery = ''; location.href = '/'; });
window.addEventListener('popstate', renderRoute);
renderRoute().catch(() => {
  alert.textContent = 'Unable to load projects';
  alert.hidden = false;
});
