const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const directoryView = document.querySelector('#task-directory');
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

function normalizeSearchText(value) {
  return asciiLower(value.replace(/[ \t]+/g, ' '));
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) return;
  const projects = await response.json();
  projectContainer.replaceChildren();
  for (const project of projects) {
    if (projectFilter.value === 'active' && project.archived) continue;
    if (projectFilter.value === 'archived' && !project.archived) continue;
    if (appliedProjectQuery && !normalizeSearchText(project.name).includes(normalizeSearchText(appliedProjectQuery))) continue;
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
  if (location.pathname === '/directory') {
    listView.hidden = true;
    detailView.hidden = true;
    directoryView.hidden = false;
    await loadDirectory();
    return;
  }
  directoryView.hidden = true;
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
  document.querySelector('#download-project').dataset.exportUrl = `/api/projects/${project.id}/export`;
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

const directoryScope = document.querySelector('#directory-scope');
const directoryTaskFilter = document.querySelector('#directory-task-filter');
const directoryPriority = document.querySelector('#directory-priority');
const directoryOrder = document.querySelector('#directory-order');
const directorySearch = document.querySelector('#directory-search');
const directoryResults = document.querySelector('#directory-results');
const directoryOwners = document.querySelector('#directory-owners');
const directoryEmpty = document.querySelector('#directory-empty');
const directorySummary = document.querySelector('[data-testid="directory-summary"]');
const completeVisibleButton = document.querySelector('#complete-visible-tasks');
const reopenVisibleButton = document.querySelector('#reopen-visible-tasks');
let directoryQuery = '';
let directoryRange = { from: '', through: '' };
let visibleDirectoryTasks = [];

async function loadDirectory() {
  directoryEmpty.hidden = true;
  completeVisibleButton.disabled = true;
  reopenVisibleButton.disabled = true;
  const response = await fetch('/api/directory');
  if (!response.ok) return;
  const tasks = await response.json();
  visibleDirectoryTasks = tasks.filter((task) => {
    if ((directoryScope.value === 'Active' && task.archived) || (directoryScope.value === 'Archived' && !task.archived)) return false;
    if (directoryTaskFilter.value === 'Deleted' ? !task.deleted : task.deleted) return false;
    if (directoryTaskFilter.value === 'Open' && task.completed) return false;
    if (directoryTaskFilter.value === 'Completed' && !task.completed) return false;
    if (directoryPriority.value !== 'All' && task.priority !== directoryPriority.value) return false;
    if (directoryQuery && !normalizeSearchText(task.title).includes(normalizeSearchText(directoryQuery))) return false;
    if ((directoryRange.from || directoryRange.through) && !task.dueDate) return false;
    if (directoryRange.from && task.dueDate < directoryRange.from) return false;
    if (directoryRange.through && task.dueDate > directoryRange.through) return false;
    return true;
  });
  const completedCount = visibleDirectoryTasks.reduce((count, task) => count + (task.completed ? 1 : 0), 0);
  directorySummary.textContent = `${completedCount}/${visibleDirectoryTasks.length} completed`;
  const ownersById = new Map();
  for (const task of visibleDirectoryTasks) {
    let owner = ownersById.get(task.projectId);
    if (!owner) {
      owner = { id: task.projectId, name: task.projectName, tasks: [] };
      ownersById.set(task.projectId, owner);
    }
    owner.tasks.push(task);
  }
  directoryOwners.replaceChildren();
  for (const owner of [...ownersById.values()].sort((a, b) => a.id - b.id)) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'directory-owner-row';
    const name = document.createElement('span');
    name.dataset.testid = 'directory-owner-name';
    name.textContent = owner.name;
    const completed = owner.tasks.reduce((count, task) => count + (task.completed ? 1 : 0), 0);
    const summary = document.createElement('span');
    summary.dataset.testid = 'directory-owner-summary';
    summary.textContent = `${completed}/${owner.tasks.length} completed`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      taskFilter.value = 'all';
      priorityFilter.value = 'all';
      appliedTaskQuery = '';
      taskSearchInput.value = '';
      history.pushState({}, '', `/projects/${owner.id}`);
      showRoute();
    });
    row.append(name, summary, open);
    directoryOwners.append(row);
  }
  const originalPosition = new Map(visibleDirectoryTasks.map((task, index) => [task.id, index]));
  const priorityRank = { High: 0, Normal: 1, Low: 2 };
  const compareCodePoints = (left, right) => {
    const a = Array.from(left), b = Array.from(right);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const difference = a[i].codePointAt(0) - b[i].codePointAt(0);
      if (difference) return difference;
    }
    return a.length - b.length;
  };
  if (directoryOrder.value === 'Priority') {
    visibleDirectoryTasks.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || originalPosition.get(a.id) - originalPosition.get(b.id));
  } else if (directoryOrder.value === 'Due date') {
    visibleDirectoryTasks.sort((a, b) => {
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && !b.dueDate) return -1;
      return (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) || originalPosition.get(a.id) - originalPosition.get(b.id);
    });
  } else if (directoryOrder.value === 'Title') {
    visibleDirectoryTasks.sort((a, b) => compareCodePoints(asciiLower(a.title), asciiLower(b.title)) || originalPosition.get(a.id) - originalPosition.get(b.id));
  }
  directoryResults.replaceChildren();
  for (const task of visibleDirectoryTasks) {
    const row = document.createElement('div');
    row.dataset.testid = 'directory-task-row';
    row.className = 'task-row directory-task-row';
    const title = document.createElement('span'); title.dataset.testid = 'directory-task-title'; title.textContent = task.title;
    const owner = document.createElement('span'); owner.dataset.testid = 'directory-project-name'; owner.textContent = task.projectName;
    const completion = document.createElement('span'); completion.dataset.testid = 'directory-task-completion'; completion.textContent = task.completed ? 'Completed' : 'Open';
    const priority = document.createElement('span'); priority.dataset.testid = 'directory-task-priority'; priority.textContent = task.priority;
    const due = document.createElement('span'); due.dataset.testid = 'directory-task-due-date'; due.textContent = task.dueDate || '';
    const notes = document.createElement('span'); notes.dataset.testid = 'directory-task-notes'; notes.textContent = task.notes || '';
    const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open project';
    open.addEventListener('click', () => {
      taskFilter.value = 'all'; priorityFilter.value = 'all';
      appliedTaskQuery = ''; taskSearchInput.value = '';
      history.pushState({}, '', `/projects/${task.projectId}`); showRoute();
    });
    row.append(title, owner, completion, priority, due, notes, open);
    directoryResults.append(row);
  }
  directoryEmpty.hidden = visibleDirectoryTasks.length !== 0;
  const eligible = directoryScope.value === 'Active' && directoryTaskFilter.value !== 'Deleted'
    ? visibleDirectoryTasks.filter((task) => !task.deleted) : [];
  completeVisibleButton.disabled = !eligible.some((task) => !task.completed);
  reopenVisibleButton.disabled = !eligible.some((task) => task.completed);
}

async function updateVisibleDirectoryTasks(completed) {
  const taskIds = visibleDirectoryTasks.filter((task) => !task.deleted && task.completed !== completed).map((task) => task.id);
  if (!taskIds.length) return;
  completeVisibleButton.disabled = true;
  reopenVisibleButton.disabled = true;
  const response = await fetch('/api/directory/bulk', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskIds, completed }),
  });
  if (response.ok) await loadDirectory();
}
completeVisibleButton.addEventListener('click', () => updateVisibleDirectoryTasks(true));
reopenVisibleButton.addEventListener('click', () => updateVisibleDirectoryTasks(false));

for (const control of [directoryScope, directoryTaskFilter, directoryPriority, directoryOrder]) control.addEventListener('change', loadDirectory);
document.querySelector('#directory-search-form').addEventListener('submit', (event) => { event.preventDefault(); directoryQuery = directorySearch.value.trim(); loadDirectory(); });
document.querySelector('#directory-apply-range').addEventListener('click', () => {
  const alert = document.querySelector('#directory-alert');
  const from = document.querySelector('#directory-due-from').value.trim();
  const through = document.querySelector('#directory-due-through').value.trim();
  if ((from && !validCalendarDate(from)) || (through && !validCalendarDate(through))) { alert.textContent = 'Due range must use valid YYYY-MM-DD dates'; alert.hidden = false; return; }
  if (from && through && from > through) { alert.textContent = 'Due from must not be after Due through'; alert.hidden = false; return; }
  directoryRange = { from, through }; alert.hidden = true; loadDirectory();
});
document.querySelector('#directory-button').addEventListener('click', () => {
  directoryScope.value = 'Active'; directoryTaskFilter.value = 'All'; directoryPriority.value = 'All';
  directoryOrder.value = 'Original';
  directorySearch.value = ''; directoryQuery = ''; directoryRange = { from: '', through: '' };
  document.querySelector('#directory-due-from').value = ''; document.querySelector('#directory-due-through').value = '';
  history.pushState({}, '', '/directory'); showRoute();
});
document.querySelector('#directory-back').addEventListener('click', () => { appliedProjectQuery = ''; projectSearchInput.value = ''; history.pushState({}, '', '/'); showRoute(); });

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
    if (taskFilter.value === 'deleted' ? !task.deleted : task.deleted) continue;
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    if (priorityFilter.value !== 'all' && task.priority !== priorityFilter.value) continue;
    if (appliedTaskQuery && !normalizeSearchText(task.title).includes(normalizeSearchText(appliedTaskQuery))) continue;
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
    renameInput.disabled = archived || Boolean(task.deleted);
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = archived || Boolean(task.deleted);
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
    priority.disabled = archived || Boolean(task.deleted);
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
    dueDate.disabled = archived || Boolean(task.deleted);
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'button';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = archived || Boolean(task.deleted);
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
    const notes = document.createElement('textarea');
    notes.value = task.notes || '';
    notes.setAttribute('aria-label', 'Task notes');
    notes.disabled = archived || Boolean(task.deleted);
    const saveNotes = document.createElement('button');
    saveNotes.type = 'button';
    saveNotes.textContent = 'Save notes';
    saveNotes.disabled = archived || Boolean(task.deleted);
    saveNotes.addEventListener('click', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: notes.value }),
      });
      if (response.ok) {
        taskAlert.hidden = true;
        await loadTasks(projectId, archived);
      } else {
        const error = await response.json();
        taskAlert.textContent = error.error || 'Unable to save notes';
        taskAlert.hidden = false;
      }
    });
    const label = document.createElement('label');
    label.className = 'task-check-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = archived || Boolean(task.deleted);
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
    destination.disabled = archived || Boolean(task.deleted) || eligible.length === 0;
    const move = document.createElement('button');
    move.type = 'button';
    move.textContent = 'Move task';
    move.disabled = archived || Boolean(task.deleted) || eligible.length === 0;
    move.addEventListener('click', async () => {
      const moved = await fetch(`/api/tasks/${task.id}/move`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
      });
      if (moved.ok) await loadTasks(projectId, archived);
    });
    const deleteRestore = document.createElement('button');
    deleteRestore.type = 'button';
    deleteRestore.textContent = task.deleted ? 'Restore task' : 'Delete task';
    deleteRestore.disabled = archived;
    deleteRestore.addEventListener('click', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleted: !task.deleted }),
      });
      if (response.ok) await loadTasks(projectId, archived);
    });
    row.append(title, renameInput, renameButton, priority, dueDate, saveDueDate, notes, saveNotes, destination, move, label, deleteRestore);
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

document.querySelector('#import-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const jsonInput = document.querySelector('#project-json');
  const nameInput = document.querySelector('#imported-project-name');
  const importAlert = document.querySelector('#import-alert');
  const importedName = nameInput.value.trim();
  if (!importedName) {
    importAlert.textContent = 'Project name is required';
    importAlert.hidden = false;
    nameInput.focus();
    return;
  }
  let documentValue;
  try { documentValue = JSON.parse(jsonInput.value); } catch {
    importAlert.textContent = 'Invalid project JSON';
    importAlert.hidden = false;
    return;
  }
  const response = await fetch('/api/projects/import', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document: documentValue, importedName }),
  });
  if (!response.ok) {
    const error = await response.json();
    importAlert.textContent = error.error || 'Invalid project JSON';
    importAlert.hidden = false;
    return;
  }
  const project = await response.json();
  importAlert.hidden = true;
  taskFilter.value = 'all';
  priorityFilter.value = 'all';
  appliedTaskQuery = '';
  taskSearchInput.value = '';
  history.pushState({}, '', `/projects/${project.id}`);
  await showRoute();
});

document.querySelector('#back-button').addEventListener('click', () => {
  appliedProjectQuery = '';
  projectSearchInput.value = '';
  history.pushState({}, '', '/');
  showRoute();
});
document.querySelector('#download-project').addEventListener('click', (event) => {
  const link = document.createElement('a');
  link.href = event.currentTarget.dataset.exportUrl;
  link.download = 'workboard-project.json';
  document.body.append(link);
  link.click();
  link.remove();
});
window.addEventListener('popstate', showRoute);
showRoute();
