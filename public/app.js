const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#project-view');
const list = document.querySelector('#project-list');
const error = document.querySelector('#error');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');
const projectFilter = document.querySelector('#project-filter');
const archivedNotice = document.querySelector('#archived-notice');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const dueRangeForm = document.querySelector('#due-range-form');
const dueFrom = document.querySelector('#due-from');
const dueThrough = document.querySelector('#due-through');
let appliedDueFrom = '';
let appliedDueThrough = '';
const defaultTaskPriority = document.querySelector('#default-task-priority');
const taskList = document.querySelector('#task-list');
const detailError = document.querySelector('#detail-error');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameButton = renameForm.querySelector('button');
let activeProjectId = null;
let archivedProject = false;
let savedDefaultPriority = 'Normal';
let tasks = [];
let renderVersion = 0;

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  const version = ++renderVersion;
  const currentPath = location.pathname;
  const match = currentPath.match(/^\/projects\/(\d+)$/);
  listView.hidden = Boolean(match);
  detailView.hidden = !match;
  document.title = 'Workboard';
  activeProjectId = null;
  archivedProject = false;
  defaultTaskPriority.disabled = true;
  archivedNotice.hidden = true;
  renameForm.hidden = true;
  renameInput.disabled = true;
  renameButton.disabled = true;
  taskForm.querySelector('button').disabled = true;
  tasks = [];
  taskList.replaceChildren();
  taskInput.value = '';
  taskFilter.value = 'All';
  priorityFilter.value = 'All';
  dueFrom.value = '';
  dueThrough.value = '';
  appliedDueFrom = '';
  appliedDueThrough = '';
  document.querySelector('#task-controls').hidden = true;
  if (match) {
    const title = document.querySelector('#project-title');
    title.textContent = '';
    showError(detailError, '');
    try {
      const project = await request(`/api/projects/${match[1]}`);
      if (version !== renderVersion) return;
      title.textContent = project.name;
      archivedProject = Boolean(project.archived);
      archivedNotice.hidden = !archivedProject;
      taskForm.querySelector('button').disabled = archivedProject;
      document.title = `${project.name} · Workboard`;
      const savedTasks = await request(`/api/projects/${project.id}/tasks`);
      if (version !== renderVersion) return;
      activeProjectId = project.id;
      savedDefaultPriority = project.default_priority;
      defaultTaskPriority.value = savedDefaultPriority;
      defaultTaskPriority.disabled = archivedProject;
      renameInput.value = project.name;
      renameInput.disabled = archivedProject;
      renameButton.disabled = archivedProject;
      renameForm.hidden = false;
      tasks = savedTasks;
      document.querySelector('#task-controls').hidden = false;
      renderTasks();
    } catch (err) { if (version === renderVersion) showError(detailError, err.message); }
    return;
  }
  showError(error, '');
  try {
    const projects = await request('/api/projects');
    if (version !== renderVersion) return;
    list.replaceChildren();
    const visibleProjects = projects.filter((project) => Boolean(project.archived) === (projectFilter.value === 'Archived'));
    for (const project of visibleProjects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const summary = document.createElement('span');
      summary.className = 'project-summary';
      summary.dataset.testid = 'project-summary';
      summary.textContent = `${project.completed}/${project.total} completed`;
      const information = document.createElement('div');
      information.className = 'project-information';
      information.append(name, summary);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'secondary';
      open.textContent = 'Open project';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.className = 'secondary';
      archive.textContent = project.archived ? 'Restore project' : 'Archive project';
      archive.addEventListener('click', async () => {
        archive.disabled = true;
        showError(error, '');
        try {
          await request(`/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !project.archived }),
          });
          await render();
        } catch (err) { showError(error, err.message); }
        finally { archive.disabled = false; }
      });
      const actions = document.createElement('div');
      actions.className = 'project-actions';
      actions.append(open, archive);
      row.append(information, actions);
      list.append(row);
    }
    const empty = document.querySelector('#empty');
    empty.hidden = visibleProjects.length > 0;
    empty.textContent = projectFilter.value === 'Archived' ? 'No archived projects.' : 'No active projects. Create a project above.';
  } catch (err) { showError(error, err.message); }
}

function renderTasks() {
  taskList.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'Open' && task.completed) continue;
    if (taskFilter.value === 'Completed' && !task.completed) continue;
    if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
    if (appliedDueFrom || appliedDueThrough) {
      if (!task.due_date) continue;
      if (appliedDueFrom && task.due_date < appliedDueFrom) continue;
      if (appliedDueThrough && task.due_date > appliedDueThrough) continue;
    }
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = archivedProject;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    const title = document.createElement('span');
    title.textContent = task.title;
    checkbox.addEventListener('change', async () => {
      const projectId = activeProjectId;
      const version = renderVersion;
      checkbox.disabled = true;
      showError(detailError, '');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (version !== renderVersion) return;
        tasks = tasks.map((item) => item.id === saved.id ? saved : item);
        renderTasks();
      } catch (err) {
        if (version !== renderVersion) return;
        checkbox.checked = task.completed;
        showError(detailError, err.message);
      } finally { checkbox.disabled = archivedProject; }
    });
    const information = document.createElement('div');
    information.className = 'task-information';
    information.append(checkbox, title);
    const priorityControls = document.createElement('div');
    const priorityLabel = document.createElement('label');
    priorityLabel.htmlFor = `task-priority-${task.id}`;
    priorityLabel.textContent = 'Task priority';
    const priority = document.createElement('select');
    priority.id = priorityLabel.htmlFor;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority;
    priority.disabled = archivedProject;
    priority.addEventListener('change', async () => {
      if (archivedProject || activeProjectId === null) return;
      const projectId = activeProjectId;
      const version = renderVersion;
      priority.disabled = true;
      showError(detailError, '');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: priority.value }),
        });
        if (version !== renderVersion) return;
        tasks = tasks.map((item) => item.id === saved.id ? saved : item);
        renderTasks();
      } catch (err) {
        if (version !== renderVersion) return;
        priority.value = task.priority;
        showError(detailError, err.message);
      } finally { priority.disabled = archivedProject; }
    });
    priorityControls.append(priorityLabel, priority);
    const taskRenameForm = document.createElement('form');
    taskRenameForm.className = 'task-rename-form';
    const label = document.createElement('label');
    label.htmlFor = `new-task-title-${task.id}`;
    label.textContent = 'New task title';
    const newTitle = document.createElement('input');
    newTitle.id = label.htmlFor;
    newTitle.type = 'text';
    newTitle.value = task.title;
    newTitle.disabled = archivedProject;
    const rename = document.createElement('button');
    rename.type = 'submit';
    rename.textContent = 'Rename task';
    rename.disabled = archivedProject;
    const controls = document.createElement('div');
    controls.className = 'form-controls';
    controls.append(newTitle, rename);
    taskRenameForm.append(label, controls);
    taskRenameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (archivedProject || activeProjectId === null) return;
      const title = newTitle.value.trim();
      if (!title) {
        showError(detailError, 'Task title is required');
        newTitle.focus();
        return;
      }
      const projectId = activeProjectId;
      const version = renderVersion;
      rename.disabled = true;
      showError(detailError, '');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (version !== renderVersion) return;
        tasks = tasks.map((item) => item.id === saved.id ? saved : item);
        renderTasks();
      } catch (err) { if (version === renderVersion) showError(detailError, err.message); }
      finally { rename.disabled = archivedProject; }
    });
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateLabel = document.createElement('label');
    dueDateLabel.htmlFor = `task-due-date-${task.id}`;
    dueDateLabel.textContent = 'Task due date';
    const dueDate = document.createElement('input');
    dueDate.id = dueDateLabel.htmlFor;
    dueDate.type = 'text';
    dueDate.placeholder = 'YYYY-MM-DD';
    dueDate.value = task.due_date || '';
    dueDate.disabled = archivedProject;
    const saveDueDate = document.createElement('button');
    saveDueDate.type = 'submit';
    saveDueDate.textContent = 'Save due date';
    saveDueDate.disabled = archivedProject;
    const dueDateControls = document.createElement('div');
    dueDateControls.className = 'form-controls';
    dueDateControls.append(dueDate, saveDueDate);
    dueDateForm.append(dueDateLabel, dueDateControls);
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (archivedProject || activeProjectId === null) return;
      const projectId = activeProjectId;
      const version = renderVersion;
      saveDueDate.disabled = true;
      showError(detailError, '');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_date: dueDate.value }),
        });
        if (version !== renderVersion) return;
        tasks = tasks.map((item) => item.id === saved.id ? saved : item);
        renderTasks();
      } catch (err) { if (version === renderVersion) showError(detailError, err.message); }
      finally { saveDueDate.disabled = archivedProject; }
    });
    row.append(information, priorityControls, taskRenameForm, dueDateForm);
    taskList.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
priorityFilter.addEventListener('change', renderTasks);
function validRangeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

dueRangeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const from = dueFrom.value.trim();
  const through = dueThrough.value.trim();
  if ((from && !validRangeDate(from)) || (through && !validRangeDate(through))) {
    showError(detailError, 'Due range must use valid YYYY-MM-DD dates');
    return;
  }
  if (from && through && from > through) {
    showError(detailError, 'Due from must not be after Due through');
    return;
  }
  appliedDueFrom = from;
  appliedDueThrough = through;
  dueFrom.value = from;
  dueThrough.value = through;
  showError(detailError, '');
  renderTasks();
});
defaultTaskPriority.addEventListener('change', async () => {
  if (archivedProject || activeProjectId === null) return;
  const projectId = activeProjectId;
  const version = renderVersion;
  defaultTaskPriority.disabled = true;
  showError(detailError, '');
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_priority: defaultTaskPriority.value }),
    });
    if (version !== renderVersion) return;
    savedDefaultPriority = project.default_priority;
    defaultTaskPriority.value = savedDefaultPriority;
  } catch (err) {
    if (version !== renderVersion) return;
    defaultTaskPriority.value = savedDefaultPriority;
    showError(detailError, err.message);
  } finally {
    if (version === renderVersion) defaultTaskPriority.disabled = archivedProject || activeProjectId === null;
  }
});
projectFilter.addEventListener('change', render);
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archivedProject || activeProjectId === null) return;
  const name = renameInput.value.trim();
  if (!name) {
    showError(detailError, 'Project name is required');
    renameInput.focus();
    return;
  }
  const projectId = activeProjectId;
  const version = renderVersion;
  renameButton.disabled = true;
  showError(detailError, '');
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (version !== renderVersion) return;
    document.querySelector('#project-title').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    renameInput.value = project.name;
  } catch (err) { if (version === renderVersion) showError(detailError, err.message); }
  finally {
    if (version === renderVersion) renameButton.disabled = archivedProject || activeProjectId === null;
  }
});
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archivedProject || activeProjectId === null) return;
  const title = taskInput.value.trim();
  if (!title) {
    showError(detailError, 'Task title is required');
    taskInput.focus();
    return;
  }
  const projectId = activeProjectId;
  const version = renderVersion;
  const button = taskForm.querySelector('button');
  button.disabled = true;
  showError(detailError, '');
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (version !== renderVersion) return;
    tasks.push(task);
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
  } catch (err) { if (version === renderVersion) showError(detailError, err.message); }
  finally { button.disabled = archivedProject || activeProjectId === null; }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    showError(error, 'Project name is required');
    input.focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  showError(error, '');
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    input.value = '';
    await render();
    input.focus();
  } catch (err) { showError(error, err.message); }
  finally { button.disabled = false; }
});
document.querySelector('#back').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', render);
render();
