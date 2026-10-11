const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const directoryView = document.querySelector('#task-directory');
const projectsContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const importForm = document.querySelector('#import-project-form');
const importJsonInput = document.querySelector('#project-json');
const importNameInput = document.querySelector('#imported-project-name');
const importAlert = document.querySelector('#import-alert');
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
  const response = await fetch(`/api/projects?filter=${encodeURIComponent(projectFilter.value)}&search=${encodeURIComponent(appliedProjectQuery)}`);
  const projects = await response.json();
  projectsContainer.replaceChildren();
  for (const project of projects) {
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
  if (location.pathname === '/directory') {
    listView.hidden = true;
    detailView.hidden = true;
    directoryView.hidden = false;
    document.querySelector('#directory-project-scope').value = 'Active';
    document.querySelector('#directory-task-filter').value = 'All';
    document.querySelector('#directory-priority-filter').value = 'All';
    document.querySelector('#directory-order').value = 'Original';
    document.querySelector('#visible-tasks-priority').value = 'Normal';
    document.querySelector('#directory-due-from').value = '';
    document.querySelector('#directory-due-through').value = '';
    document.querySelector('#directory-search').value = '';
    appliedDirectoryQuery = '';
    appliedDirectoryFrom = '';
    appliedDirectoryThrough = '';
    await loadDirectory();
    return;
  }
  directoryView.hidden = true;
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

let appliedDirectoryQuery = '';
let appliedDirectoryFrom = '';
let appliedDirectoryThrough = '';
async function loadDirectory() {
  const emptyNotice = document.querySelector('#directory-empty');
  emptyNotice.hidden = true;
  const completeButton = document.querySelector('#complete-visible-tasks');
  const reopenButton = document.querySelector('#reopen-visible-tasks');
  const deleteButton = document.querySelector('#delete-visible-tasks');
  const restoreButton = document.querySelector('#restore-visible-tasks');
  const setPriorityButton = document.querySelector('#set-visible-priority');
  completeButton.disabled = true;
  reopenButton.disabled = true;
  deleteButton.disabled = true;
  restoreButton.disabled = true;
  setPriorityButton.disabled = true;
  const response = await fetch('/api/directory');
  const tasks = await response.json();
  const results = document.querySelector('#directory-results');
  const owners = document.querySelector('#directory-owners');
  const scope = document.querySelector('#directory-project-scope').value;
  const taskFilter = document.querySelector('#directory-task-filter').value;
  const priorityFilter = document.querySelector('#directory-priority-filter').value;
  const visibleOpenIds = [];
  const visibleCompletedIds = [];
  const visibleLiveIds = [];
  const visibleDeletedIds = [];
  const visibleLiveTaskIds = [];
  results.replaceChildren();
  const matchingTasks = [];
  for (const [originalIndex, task] of tasks.entries()) {
    if (task.archived !== (scope === 'Archived')) continue;
    if (taskFilter === 'Deleted' ? !task.deleted : task.deleted) continue;
    if (taskFilter === 'Open' && task.completed) continue;
    if (taskFilter === 'Completed' && !task.completed) continue;
    if (priorityFilter !== 'All' && task.priority !== priorityFilter) continue;
    if ((appliedDirectoryFrom || appliedDirectoryThrough) && !task.dueDate) continue;
    if (appliedDirectoryFrom && task.dueDate < appliedDirectoryFrom) continue;
    if (appliedDirectoryThrough && task.dueDate > appliedDirectoryThrough) continue;
    if (!normalizeSearchText(task.title).includes(normalizeSearchText(appliedDirectoryQuery))) continue;
    matchingTasks.push({ task, originalIndex });
  }
  const directoryOrder = document.querySelector('#directory-order').value;
  const priorityRank = { High: 0, Normal: 1, Low: 2 };
  const compareCodePoints = (left, right) => {
    const a = Array.from(left);
    const b = Array.from(right);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
      if (difference) return difference;
    }
    return a.length - b.length;
  };
  matchingTasks.sort((left, right) => {
    let difference = 0;
    if (directoryOrder === 'Priority') difference = priorityRank[left.task.priority] - priorityRank[right.task.priority];
    if (directoryOrder === 'Due date') {
      const leftDate = left.task.dueDate;
      const rightDate = right.task.dueDate;
      difference = leftDate && rightDate ? leftDate.localeCompare(rightDate) : leftDate ? -1 : rightDate ? 1 : 0;
    }
    if (directoryOrder === 'Title') difference = compareCodePoints(asciiLower(left.task.title), asciiLower(right.task.title));
    return difference || left.originalIndex - right.originalIndex;
  });
  const completedCount = matchingTasks.reduce((count, { task }) => count + Number(task.completed), 0);
  document.querySelector('[data-testid="directory-summary"]').textContent =
    `${completedCount}/${matchingTasks.length} completed`;
  owners.replaceChildren();
  const ownerTotals = new Map();
  for (const { task } of [...matchingTasks].sort((left, right) => left.originalIndex - right.originalIndex)) {
    let totals = ownerTotals.get(task.projectId);
    if (!totals) {
      totals = { name: task.projectName, completed: 0, total: 0 };
      ownerTotals.set(task.projectId, totals);
    }
    totals.total += 1;
    totals.completed += Number(task.completed);
  }
  for (const [projectId, totals] of ownerTotals) {
    const row = document.createElement('div');
    row.dataset.testid = 'directory-owner-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.dataset.testid = 'directory-owner-name';
    name.textContent = totals.name;
    const summary = document.createElement('span');
    summary.dataset.testid = 'directory-owner-summary';
    summary.textContent = `${totals.completed}/${totals.total} completed`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${projectId}`));
    row.append(name, summary, open);
    owners.append(row);
  }
  for (const { task } of matchingTasks) {
    if (task.deleted) visibleDeletedIds.push(task.id);
    else {
      visibleLiveTaskIds.push(task.id);
      visibleLiveIds.push(task.id);
      (task.completed ? visibleCompletedIds : visibleOpenIds).push(task.id);
    }
    const row = document.createElement('div'); row.dataset.testid = 'directory-task-row'; row.dataset.taskId = task.id; row.className = 'task-row';
    const title = document.createElement('span'); title.dataset.testid = 'directory-task-title'; title.textContent = task.title;
    const owner = document.createElement('span'); owner.dataset.testid = 'directory-project-name'; owner.textContent = task.projectName;
    const completion = document.createElement('span'); completion.dataset.testid = 'directory-task-completion'; completion.textContent = task.completed ? 'Completed' : 'Open';
    const priority = document.createElement('span'); priority.dataset.testid = 'directory-task-priority'; priority.textContent = task.priority;
    const dueDate = document.createElement('span'); dueDate.dataset.testid = 'directory-task-due-date'; dueDate.textContent = task.dueDate;
    const notes = document.createElement('span'); notes.dataset.testid = 'directory-task-notes'; notes.textContent = task.notes;
    const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open project'; open.addEventListener('click', () => navigate(`/projects/${task.projectId}`));
    row.append(title, owner, completion, priority, dueDate, notes, open); results.append(row);
  }
  const actionsAllowed = scope === 'Active' && taskFilter !== 'Deleted';
  completeButton.disabled = !actionsAllowed || visibleOpenIds.length === 0;
  reopenButton.disabled = !actionsAllowed || visibleCompletedIds.length === 0;
  deleteButton.disabled = scope !== 'Active' || taskFilter === 'Deleted' || visibleLiveIds.length === 0;
  restoreButton.disabled = scope !== 'Active' || taskFilter !== 'Deleted' || visibleDeletedIds.length === 0;
  setPriorityButton.disabled = scope !== 'Active' || taskFilter === 'Deleted' || visibleLiveTaskIds.length === 0;
  emptyNotice.hidden = results.childElementCount !== 0;
}

async function updateVisiblePriority() {
  const taskIds = [...document.querySelectorAll('[data-testid="directory-task-row"]')]
    .filter((row) => row.querySelector('[data-testid="directory-task-completion"]').textContent !== 'Deleted')
    .map((row) => Number(row.dataset.taskId));
  if (!taskIds.length) return;
  const response = await fetch('/api/directory/priority', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ priority: document.querySelector('#visible-tasks-priority').value, taskIds }),
  });
  if (response.ok) await loadDirectory();
}

async function updateVisibleCompletion(completed) {
  const rows = [...document.querySelectorAll('[data-testid="directory-task-row"]')];
  const taskIds = rows.filter((row) => row.querySelector('[data-testid="directory-task-completion"]').textContent === (completed ? 'Open' : 'Completed'))
    .map((row) => Number(row.dataset.taskId));
  if (!taskIds.length) return;
  const response = await fetch('/api/directory/completion', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed, taskIds }),
  });
  if (response.ok) await loadDirectory();
}

async function updateVisibleDeletion(deleted) {
  const rows = [...document.querySelectorAll('[data-testid="directory-task-row"]')];
  const taskIds = rows.map((row) => Number(row.dataset.taskId));
  if (!taskIds.length) return;
  const response = await fetch('/api/directory/deletion', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deleted, taskIds }),
  });
  if (response.ok) await loadDirectory();
}

async function loadTasks() {
  if (currentProjectId === null) return;
  const response = await fetch(`/api/projects/${currentProjectId}/tasks`);
  const tasks = await response.json();
  const projectsResponse = await fetch('/api/projects?filter=Active');
  const activeProjects = await projectsResponse.json();
  tasksContainer.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'Deleted' ? !task.deleted : task.deleted) continue;
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
    const taskReadOnly = currentProjectArchived || task.deleted;
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = taskReadOnly;
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
    priority.disabled = taskReadOnly;
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
    renameInput.disabled = taskReadOnly;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = taskReadOnly;
    const renameAlert = document.createElement('span');
    renameAlert.setAttribute('role', 'alert');
    renameAlert.hidden = true;
    renameForm.append(renameInput, renameButton, renameAlert);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (taskReadOnly) return;
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
    dueDateInput.disabled = taskReadOnly;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'submit';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = taskReadOnly;
    const dueDateAlert = document.createElement('span');
    dueDateAlert.setAttribute('role', 'alert');
    dueDateAlert.hidden = true;
    dueDateForm.append(dueDateInput, saveDueDate, dueDateAlert);
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (taskReadOnly) return;
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
    const notesForm = document.createElement('form');
    notesForm.className = 'task-notes-form';
    const notesInput = document.createElement('textarea');
    notesInput.setAttribute('aria-label', 'Task notes');
    notesInput.value = task.notes || '';
    notesInput.disabled = taskReadOnly;
    const saveNotes = document.createElement('button');
    saveNotes.type = 'submit';
    saveNotes.textContent = 'Save notes';
    saveNotes.disabled = taskReadOnly;
    notesForm.append(notesInput, saveNotes);
    notesForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (taskReadOnly) return;
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: notesInput.value }),
      });
      if (response.ok) await loadTasks();
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
    destination.disabled = taskReadOnly || noDestination;
    moveButton.disabled = taskReadOnly || noDestination;
    moveForm.append(destination, moveButton);
    moveForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (taskReadOnly || !destination.value) return;
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
      });
      if (response.ok) await loadTasks();
    });
    const taskAction = document.createElement('button');
    taskAction.type = 'button';
    taskAction.textContent = task.deleted ? 'Restore task' : 'Delete task';
    taskAction.disabled = currentProjectArchived;
    taskAction.addEventListener('click', async () => {
      if (currentProjectArchived) return;
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleted: !task.deleted }),
      });
      if (response.ok) await loadTasks();
    });
    row.append(title, checkbox, priority, renameForm, dueDateForm, notesForm, moveForm, taskAction);
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

importForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = importNameInput.value.trim();
  if (!name) {
    importAlert.textContent = 'Project name is required';
    importAlert.hidden = false;
    return;
  }
  let document;
  try {
    document = JSON.parse(importJsonInput.value);
  } catch {
    importAlert.textContent = 'Invalid project JSON';
    importAlert.hidden = false;
    return;
  }
  const response = await fetch('/api/projects/import', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document, name }),
  });
  if (!response.ok) {
    const result = await response.json();
    importAlert.textContent = result.error || 'Invalid project JSON';
    importAlert.hidden = false;
    return;
  }
  const created = await response.json();
  importAlert.hidden = true;
  navigate(`/projects/${created.id}`);
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
document.querySelector('#open-directory').addEventListener('click', () => navigate('/directory'));
document.querySelector('#directory-projects').addEventListener('click', () => navigate('/'));
document.querySelector('#complete-visible-tasks').addEventListener('click', () => updateVisibleCompletion(true));
document.querySelector('#reopen-visible-tasks').addEventListener('click', () => updateVisibleCompletion(false));
document.querySelector('#delete-visible-tasks').addEventListener('click', () => updateVisibleDeletion(true));
document.querySelector('#restore-visible-tasks').addEventListener('click', () => updateVisibleDeletion(false));
document.querySelector('#set-visible-priority').addEventListener('click', updateVisiblePriority);
for (const selector of ['#directory-project-scope', '#directory-task-filter', '#directory-priority-filter', '#directory-order']) {
  document.querySelector(selector).addEventListener('change', loadDirectory);
}
document.querySelector('#directory-search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  appliedDirectoryQuery = document.querySelector('#directory-search').value.trim();
  document.querySelector('#directory-search').value = appliedDirectoryQuery;
  await loadDirectory();
});
document.querySelector('#directory-apply-due-range').addEventListener('click', async () => {
  const from = document.querySelector('#directory-due-from').value.trim();
  const through = document.querySelector('#directory-due-through').value.trim();
  const alert = document.querySelector('#directory-range-alert');
  if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
    alert.textContent = 'Due range must use valid YYYY-MM-DD dates'; alert.hidden = false; return;
  }
  if (from && through && from > through) {
    alert.textContent = 'Due from must not be after Due through'; alert.hidden = false; return;
  }
  appliedDirectoryFrom = from; appliedDirectoryThrough = through;
  document.querySelector('#directory-due-from').value = from;
  document.querySelector('#directory-due-through').value = through;
  alert.hidden = true;
  await loadDirectory();
});
document.querySelector('#download-project').addEventListener('click', async () => {
  if (currentProjectId === null) return;
  const response = await fetch(`/api/projects/${currentProjectId}/export`);
  if (!response.ok) return;
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'workboard-project.json';
  link.click();
  URL.revokeObjectURL(downloadUrl);
});
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
