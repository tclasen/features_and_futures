const projectsView = document.querySelector('#projects-view');
const projectView = document.querySelector('#project-view');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskFilter = document.querySelector('#task-filter');
const taskList = document.querySelector('#task-list');
let projectId;
let tasks = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

function addProject(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.href = `/projects/${encodeURIComponent(project.id)}`;
  });
  row.append(name, button);
  list.append(row);
}

function showTaskAlert(message) {
  taskAlert.textContent = message;
  taskAlert.hidden = !message;
}

function renderTasks() {
  taskList.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    const title = document.createElement('span');
    title.textContent = task.title;
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      showTaskAlert('');
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
        showTaskAlert(error.message);
      } finally {
        checkbox.disabled = false;
      }
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
    showTaskAlert('Task title is required');
    return;
  }
  const button = taskForm.querySelector('button');
  button.disabled = true;
  showTaskAlert('');
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
  } catch (error) {
    showTaskAlert(error.message);
  } finally {
    button.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    showAlert('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  showAlert('');
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    addProject(project);
    input.value = '';
    input.focus();
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  window.location.href = '/';
});

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  if (match) {
    projectsView.hidden = true;
    projectView.hidden = false;
    try {
      const project = await request(`/api/projects/${match[1]}`);
      projectId = project.id;
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      tasks = await request(`/api/projects/${projectId}/tasks`);
      renderTasks();
      document.querySelector('#task-controls').hidden = false;
      taskForm.querySelector('button').disabled = false;
    } catch (error) {
      const projectError = document.querySelector('#project-error');
      projectError.textContent = error.message;
      projectError.hidden = false;
    }
  } else {
    form.querySelector('button').disabled = true;
    try {
      const projects = await request('/api/projects');
      projects.forEach(addProject);
    } catch (error) {
      showAlert(error.message);
    } finally {
      form.querySelector('button').disabled = false;
    }
  }
}

initialize();
