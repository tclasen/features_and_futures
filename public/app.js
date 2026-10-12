const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const errorMessage = document.querySelector('#error-message');
const taskContainer = document.querySelector('#tasks');
const directorySection = document.querySelector('#directory');
let directoryRows = [];
let directoryRange = { from: '', through: '' };
let directoryQuery = '';
let activeProjectId = null;
let projectTasks = [];
let allProjects = [];
let appliedDueRange = { from: '', through: '' };
let appliedProjectQuery = '';
let appliedTaskQuery = '';

function normalizeSearch(value) {
  return value.replace(/[ \t]+/g, ' ').toLowerCase();
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  projectContainer.replaceChildren();
  const filter = document.querySelector('#project-filter').value;
  for (const project of projects.filter(p => Boolean(p.archived) === (filter === 'Archived') && normalizeSearch(p.name).includes(appliedProjectQuery))) {
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
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = project.archived ? 'Restore project' : 'Archive project';
    toggle.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
      await loadProjects();
    });
    row.append(name, summary, open, toggle);
    projectContainer.append(row);
  }
}

async function showRoute() {
  if (location.pathname === '/directory') {
    activeProjectId = null;
    listSection.hidden = true; detailSection.hidden = true; directorySection.hidden = false;
    document.querySelector('#directory-scope').value = 'Active';
    document.querySelector('#directory-task-filter').value = 'All';
    document.querySelector('#directory-priority-filter').value = 'All';
    document.querySelector('#directory-search').value = '';
    document.querySelector('#directory-due-from').value = '';
    document.querySelector('#directory-due-through').value = '';
    directoryQuery = ''; directoryRange = { from: '', through: '' };
    const response = await fetch('/api/directory'); directoryRows = await response.json(); renderDirectory(); return;
  }
  directorySection.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    activeProjectId = null;
    appliedProjectQuery = '';
    document.querySelector('#project-search').value = '';
    listSection.hidden = false;
    detailSection.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find(item => String(item.id) === match[1]);
  if (!project) {
    navigate('/', true);
    return;
  }
  if (String(activeProjectId) !== match[1]) {
    appliedTaskQuery = '';
    document.querySelector('#task-search').value = '';
    document.querySelector('#task-filter').value = 'All';
    document.querySelector('#priority-filter').value = 'All';
    appliedDueRange = { from: '', through: '' };
    document.querySelector('#due-from').value = '';
    document.querySelector('#due-through').value = '';
  }
  document.querySelector('#detail-name').textContent = project.name;
  document.querySelector('#download-project').href = `/api/projects/${project.id}/export`;
  document.querySelector('#archived-notice').hidden = !project.archived;
  document.querySelector('#task-title').disabled = Boolean(project.archived);
  document.querySelector('#task-form button').disabled = Boolean(project.archived);
  document.querySelector('#new-project-name').disabled = Boolean(project.archived);
  document.querySelector('#rename-form button').disabled = Boolean(project.archived);
  document.querySelector('#new-project-name').value = project.name;
  const defaultPriority = document.querySelector('#default-task-priority');
  defaultPriority.value = project.defaultPriority || 'Normal';
  defaultPriority.disabled = Boolean(project.archived);
  activeProjectId = project.id;
  listSection.hidden = true;
  detailSection.hidden = false;
  await loadTasks();
}

function renderDirectory() {
  const out = document.querySelector('#directory-results'); out.replaceChildren();
  const scope = document.querySelector('#directory-scope').value, filter = document.querySelector('#directory-task-filter').value, priority = document.querySelector('#directory-priority-filter').value;
  for (const task of directoryRows) {
    if (Boolean(task.projectArchived) !== (scope === 'Archived')) continue;
    if (filter === 'Deleted' ? !task.deleted : task.deleted) continue;
    if (filter === 'Open' && task.completed) continue;
    if (filter === 'Completed' && !task.completed) continue;
    if (priority !== 'All' && task.priority !== priority) continue;
    if (!normalizeSearch(task.title).includes(directoryQuery)) continue;
    if ((directoryRange.from || directoryRange.through) && !task.dueDate) continue;
    if (task.dueDate && ((directoryRange.from && task.dueDate < directoryRange.from) || (directoryRange.through && task.dueDate > directoryRange.through))) continue;
    const row = document.createElement('div'); row.dataset.testid = 'directory-task-row';
    const title = document.createElement('span'); title.dataset.testid = 'directory-task-title'; title.textContent = task.title;
    const owner = document.createElement('span'); owner.dataset.testid = 'directory-project-name'; owner.textContent = task.projectName;
    const completion = document.createElement('span'); completion.dataset.testid = 'directory-task-completion'; completion.textContent = task.completed ? 'Completed' : 'Open';
    const pr = document.createElement('span'); pr.dataset.testid = 'directory-task-priority'; pr.textContent = task.priority || 'Normal';
    const due = document.createElement('span'); due.dataset.testid = 'directory-task-due-date'; due.textContent = task.dueDate || '';
    const notes = document.createElement('span'); notes.dataset.testid = 'directory-task-notes'; notes.textContent = task.notes || '';
    const open = document.createElement('button'); open.textContent = 'Open project'; open.addEventListener('click', () => navigate(`/projects/${task.projectId}`));
    row.append(title, owner, completion, pr, due, notes, open); out.append(row);
  }
}
function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  showRoute();
}

document.querySelector('#import-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.querySelector('#import-error');
  error.hidden = true;
  const response = await fetch('/api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: document.querySelector('#project-json').value, name: document.querySelector('#imported-project-name').value }) });
  if (!response.ok) { error.textContent = (await response.json()).error || 'Invalid project JSON'; error.hidden = false; return; }
  const project = await response.json();
  navigate(`/projects/${project.id}`);
});

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  errorMessage.hidden = true;
  const input = document.querySelector('#project-name');
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    errorMessage.textContent = result.error || 'Unable to create project';
    errorMessage.hidden = false;
    return;
  }
  input.value = '';
  await loadProjects();
});

async function loadTasks() {
  const [response, projectsResponse] = await Promise.all([
    fetch(`/api/projects/${activeProjectId}/tasks`), fetch('/api/projects')
  ]);
  if (!response.ok || !projectsResponse.ok) return;
  projectTasks = await response.json();
  allProjects = await projectsResponse.json();
  renderTasks();
}

function renderTasks() {
  const filter = document.querySelector('#task-filter').value;
  const priorityFilter = document.querySelector('#priority-filter').value;
  taskContainer.replaceChildren();
  for (const task of projectTasks) {
    if (!normalizeSearch(task.title).includes(appliedTaskQuery)) continue;
    if ((filter === 'Deleted' && !task.deleted) || (filter !== 'Deleted' && task.deleted)) continue;
    if ((filter === 'Open' && task.completed) || (filter === 'Completed' && !task.completed)) continue;
    if (priorityFilter !== 'All' && task.priority !== priorityFilter) continue;
    if ((appliedDueRange.from || appliedDueRange.through) && !task.dueDate) continue;
    if (task.dueDate && ((appliedDueRange.from && task.dueDate < appliedDueRange.from) || (appliedDueRange.through && task.dueDate > appliedDueRange.through))) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = document.querySelector('#archived-notice').hidden === false || Boolean(task.deleted);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked })
      });
      if (response.ok) {
        const updated = await response.json();
        task.completed = updated.completed;
        renderTasks();
      }
    });
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    const archived = document.querySelector('#archived-notice').hidden === false;
    const deleted = Boolean(task.deleted);
    renameInput.disabled = archived || deleted;
    renameButton.disabled = archived || deleted;
    renameButton.addEventListener('click', async () => {
      const error = document.querySelector('#task-rename-error');
      error.hidden = true;
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameInput.value })
      });
      if (!response.ok) {
        const result = await response.json();
        error.textContent = result.error || 'Unable to rename task';
        error.hidden = false;
        return;
      }
      const updated = await response.json();
      task.title = updated.title;
      renderTasks();
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
    priority.disabled = archived || deleted;
    priority.addEventListener('change', async () => {
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: priority.value })
      });
      if (response.ok) {
        task.priority = (await response.json()).priority;
        renderTasks();
      }
    });
    const dueDate = document.createElement('input');
    dueDate.type = 'text';
    dueDate.value = task.dueDate || '';
    dueDate.setAttribute('aria-label', 'Task due date');
    dueDate.disabled = archived || deleted;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'button';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = archived || deleted;
    saveDueDate.addEventListener('click', async () => {
      const error = document.querySelector('#task-rename-error');
      error.hidden = true;
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: dueDate.value })
      });
      if (!response.ok) {
        const result = await response.json();
        error.textContent = result.error || 'Unable to save due date';
        error.hidden = false;
        return;
      }
      task.dueDate = (await response.json()).dueDate;
      dueDate.value = task.dueDate || '';
      renderTasks();
    });
    const notes = document.createElement('textarea');
    notes.setAttribute('aria-label', 'Task notes');
    notes.value = task.notes || '';
    notes.disabled = archived || deleted;
    const saveNotes = document.createElement('button');
    saveNotes.type = 'button';
    saveNotes.textContent = 'Save notes';
    saveNotes.disabled = archived || deleted;
    saveNotes.addEventListener('click', async () => {
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.value })
      });
      if (response.ok) task.notes = (await response.json()).notes;
    });
    const destinations = document.createElement('select');
    destinations.setAttribute('aria-label', 'Destination project');
    const eligible = allProjects.filter(item => !item.archived && item.id !== Number(activeProjectId));
    for (const destination of eligible) {
      const option = document.createElement('option');
      option.value = destination.id;
      option.textContent = destination.name;
      destinations.append(option);
    }
    const moveButton = document.createElement('button');
    moveButton.type = 'button';
    moveButton.textContent = 'Move task';
    destinations.disabled = archived || deleted || eligible.length === 0;
    moveButton.disabled = archived || deleted || eligible.length === 0;
    moveButton.addEventListener('click', async () => {
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(destinations.value) })
      });
      if (response.ok) await loadTasks();
    });
    const deletion = document.createElement('button');
    deletion.type = 'button';
    deletion.textContent = deleted ? 'Restore task' : 'Delete task';
    deletion.disabled = archived;
    deletion.addEventListener('click', async () => {
      const response = await fetch(`/api/projects/${activeProjectId}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: !deleted }) });
      if (response.ok) await loadTasks();
    });
    row.append(title, checkbox, renameInput, renameButton, priority, dueDate, saveDueDate, notes, saveNotes, destinations, moveButton, deletion);
    taskContainer.append(row);
  }
}

document.querySelector('#default-task-priority').addEventListener('change', async event => {
  const response = await fetch(`/api/projects/${activeProjectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultPriority: event.target.value })
  });
  if (!response.ok) await showRoute();
});
document.querySelector('#task-filter').addEventListener('change', renderTasks);
document.querySelector('#priority-filter').addEventListener('change', renderTasks);
document.querySelector('#apply-due-range').addEventListener('click', () => {
  const from = document.querySelector('#due-from').value.trim();
  const through = document.querySelector('#due-through').value.trim();
  const valid = value => {
    if (!value) return true;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  };
  const error = document.querySelector('#task-rename-error');
  if (!valid(from) || !valid(through)) { error.textContent = 'Due range must use valid YYYY-MM-DD dates'; error.hidden = false; return; }
  if (from && through && from > through) { error.textContent = 'Due from must not be after Due through'; error.hidden = false; return; }
  error.hidden = true;
  appliedDueRange = { from, through };
  renderTasks();
});
document.querySelector('#project-filter').addEventListener('change', loadProjects);
document.querySelector('#search-projects').addEventListener('click', () => {
  appliedProjectQuery = normalizeSearch(document.querySelector('#project-search').value.trim());
  loadProjects();
});
document.querySelector('#search-tasks').addEventListener('click', () => {
  appliedTaskQuery = normalizeSearch(document.querySelector('#task-search').value.trim());
  renderTasks();
});
document.querySelector('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.querySelector('#task-error-message');
  error.hidden = true;
  const input = document.querySelector('#task-title');
  const response = await fetch(`/api/projects/${activeProjectId}/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    error.textContent = result.error || 'Unable to create task';
    error.hidden = false;
    return;
  }
  input.value = '';
  await loadTasks();
});

document.querySelector('#rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.querySelector('#rename-error');
  error.hidden = true;
  const input = document.querySelector('#new-project-name');
  const response = await fetch(`/api/projects/${activeProjectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value })
  });
  if (!response.ok) {
    const result = await response.json();
    error.textContent = result.error || 'Unable to rename project';
    error.hidden = false;
    return;
  }
  await showRoute();
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
document.querySelector('#open-directory').addEventListener('click', () => navigate('/directory'));
document.querySelector('#directory-back').addEventListener('click', () => navigate('/'));
for (const id of ['directory-scope', 'directory-task-filter', 'directory-priority-filter']) document.querySelector(`#${id}`).addEventListener('change', renderDirectory);
document.querySelector('#search-directory').addEventListener('click', () => { directoryQuery = normalizeSearch(document.querySelector('#directory-search').value.trim()); renderDirectory(); });
document.querySelector('#directory-apply-range').addEventListener('click', () => {
  const from = document.querySelector('#directory-due-from').value.trim(), through = document.querySelector('#directory-due-through').value.trim();
  const valid = value => { if (!value) return true; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!m) return false; const y=+m[1], mo=+m[2], d=+m[3], leap=y%4===0&&(y%100!==0||y%400===0); return y>=1&&mo>=1&&mo<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][mo-1]; };
  const error = document.querySelector('#directory-error');
  if (!valid(from) || !valid(through)) { error.textContent = 'Due range must use valid YYYY-MM-DD dates'; error.hidden = false; return; }
  if (from && through && from > through) { error.textContent = 'Due from must not be after Due through'; error.hidden = false; return; }
  error.hidden = true; directoryRange = { from, through }; renderDirectory();
});
document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', showRoute);
showRoute();
