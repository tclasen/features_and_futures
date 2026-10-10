const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#project-view');
const list = document.querySelector('#project-list');
const error = document.querySelector('#error');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskList = document.querySelector('#task-list');
const detailError = document.querySelector('#detail-error');
let activeProjectId = null;
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
      document.title = `${project.name} · Workboard`;
      const savedTasks = await request(`/api/projects/${project.id}/tasks`);
      if (version !== renderVersion) return;
      activeProjectId = project.id;
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
    for (const project of projects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'secondary';
      open.textContent = 'Open project';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(name, open);
      list.append(row);
    }
    document.querySelector('#empty').hidden = projects.length > 0;
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
      } finally { checkbox.disabled = false; }
    });
    row.append(checkbox, title);
    taskList.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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
  finally { button.disabled = false; }
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
