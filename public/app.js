const heading = document.querySelector('h1');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskList = document.querySelector('#tasks');
const projectId = window.location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
let tasks = [];

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
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
    showError('');
    checkbox.disabled = true;
    try {
      const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      tasks = tasks.map(existing => existing.id === saved.id ? saved : existing);
      renderTasks();
    } catch (error) {
      checkbox.checked = task.completed;
      showError(error.message);
    } finally { checkbox.disabled = false; }
  });
  row.append(checkbox, title);
  return row;
}

function renderTasks() {
  const matching = tasks.filter(task => taskFilter.value === 'all' ||
    (taskFilter.value === 'completed' ? task.completed : !task.completed));
  taskList.replaceChildren(...matching.map(taskRow));
  document.querySelector('#tasks-empty').hidden = matching.length > 0;
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  showError('');
  if (!titleInput.value.trim()) {
    showError('Task title is required');
    titleInput.focus();
    return;
  }
  const submit = taskForm.querySelector('button');
  submit.disabled = true;
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleInput.value }),
    });
    tasks.push(task);
    renderTasks();
    taskForm.reset();
    titleInput.focus();
  } catch (error) { showError(error.message); }
  finally { submit.disabled = false; }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  if (!nameInput.value.trim()) {
    showError('Project name is required');
    nameInput.focus();
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value }),
    });
    projects.append(projectRow(project));
    document.querySelector('#empty').hidden = true;
    form.reset();
    nameInput.focus();
  } catch (error) { showError(error.message); }
  finally { submit.disabled = false; }
});

document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });

async function load() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  list.hidden = Boolean(match);
  detail.hidden = !match;
  try {
    if (match) {
      const project = await request(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      tasks = await request(`/api/projects/${project.id}/tasks`);
      renderTasks();
    } else {
      const allProjects = await request('/api/projects');
      projects.replaceChildren(...allProjects.map(projectRow));
      document.querySelector('#empty').hidden = allProjects.length > 0;
    }
  } catch (error) { showError(error.message); }
}

load();
