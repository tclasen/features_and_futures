const errorMessage = document.querySelector('#error');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const rows = document.querySelector('#project-rows');
const taskForm = document.querySelector('#create-task');
const taskTitleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskRows = document.querySelector('#task-rows');
const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(window.location.pathname);
const tasksPath = projectMatch ? `/api/projects/${projectMatch[1]}/tasks` : null;
let tasks = [];

function showError(message = '') {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Unable to complete request');
  return data;
}

function addProjectRow(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  rows.append(row);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    addProjectRow(project);
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => {
  window.location.href = '/';
});

function renderTasks() {
  taskRows.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    const title = document.createElement('span');
    title.textContent = task.title;
    checkbox.addEventListener('change', async () => {
      showError();
      checkbox.disabled = true;
      try {
        const saved = await request(`${tasksPath}/${task.id}`, {
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
    label.append(checkbox, title);
    row.append(label);
    taskRows.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  const title = taskTitleInput.value.trim();
  if (!title) {
    showError('Task title is required');
    return;
  }
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
    taskTitleInput.value = '';
    taskTitleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

async function initialize() {
  if (projectMatch) {
    document.querySelector('#project-detail').hidden = false;
    const project = await request(`/api/projects/${projectMatch[1]}`);
    document.querySelector('#project-title').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    tasks = await request(tasksPath);
    renderTasks();
  } else {
    const projects = await request('/api/projects');
    projects.forEach(addProjectRow);
    document.querySelector('#project-list').hidden = false;
  }
}
initialize().catch((error) => showError(error.message));
