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
const taskList = document.querySelector('#task-list');
const detailError = document.querySelector('#detail-error');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameButton = renameForm.querySelector('button');
let activeProjectId = null;
let archivedProject = false;
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
  archivedNotice.hidden = true;
  renameForm.hidden = true;
  renameInput.disabled = true;
  renameButton.disabled = true;
  taskForm.querySelector('button').disabled = true;
  tasks = [];
  taskList.replaceChildren();
  taskInput.value = '';
  taskFilter.value = 'All';
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
    row.append(checkbox, title);
    taskList.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
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
