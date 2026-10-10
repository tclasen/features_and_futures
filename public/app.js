const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const tasksElement = document.querySelector('#tasks');
const projectId = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/)?.[1];
let tasks = [];

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function renderProjects(items) {
  projects.replaceChildren();
  document.querySelector('#empty').hidden = items.length > 0;
  for (const project of items) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      window.location.assign(`/projects/${project.id}`);
    });
    row.append(name, open);
    projects.append(row);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    renderProjects(await request('/api/projects'));
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

function renderTasks() {
  tasksElement.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      alert.hidden = true;
      checkbox.disabled = true;
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
        showError(error.message);
      } finally {
        checkbox.disabled = false;
      }
    });
    row.append(checkbox, title);
    tasksElement.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const title = titleInput.value.trim();
  if (!title) {
    showError('Task title is required');
    return;
  }
  const button = taskForm.querySelector('button');
  button.disabled = true;
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    titleInput.value = '';
    renderTasks();
    titleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function loadPage() {
  if (projectId) {
    const project = await request(`/api/projects/${projectId}`);
    heading.textContent = project.name;
    document.title = `${project.name} — Workboard`;
    tasks = await request(`/api/projects/${projectId}/tasks`);
    renderTasks();
    detail.hidden = false;
  } else {
    list.hidden = false;
    renderProjects(await request('/api/projects'));
  }
}

loadPage().catch((error) => showError(error.message));
