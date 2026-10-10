const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const input = document.querySelector('#project-name');
const error = document.querySelector('#error');
const taskForm = document.querySelector('#create-task');
const taskInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const tasksContainer = document.querySelector('#tasks');
const projectMatch = window.location.pathname.match(/^\/projects\/(\d+)$/);
const tasksPath = projectMatch ? `/api/projects/${projectMatch[1]}/tasks` : null;
let tasks = [];

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
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, button);
  return row;
}

function taskRow(task) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.testid = 'task-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `task-${task.id}`;
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `Complete ${task.title}`);
  const title = document.createElement('label');
  title.htmlFor = checkbox.id;
  title.textContent = task.title;
  checkbox.addEventListener('change', async () => {
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
      checkbox.disabled = false;
    }
  });
  row.append(checkbox, title);
  return row;
}

function renderTasks() {
  const filtered = tasks.filter((task) => taskFilter.value === 'All'
    || (taskFilter.value === 'Completed' ? task.completed : !task.completed));
  tasksContainer.replaceChildren(...filtered.map(taskRow));
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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
    button.disabled = false;
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
    projects.append(projectRow(project));
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
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      tasks = await request(tasksPath);
      renderTasks();
    } else {
      const data = await request('/api/projects');
      projects.replaceChildren(...data.map(projectRow));
    }
  } catch (failure) {
    showError(failure.message);
  }
}

await load();
