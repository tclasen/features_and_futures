const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
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
let projectData = [];
let archived = false;

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
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  const archiveButton = document.createElement('button');
  archiveButton.type = 'button';
  archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
  archiveButton.addEventListener('click', async () => {
    archiveButton.disabled = true;
    showError();
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      projectData = projectData.map((item) => item.id === saved.id ? saved : item);
      renderProjects();
    } catch (failure) {
      showError(failure.message);
      archiveButton.disabled = false;
    }
  });
  row.append(name, summary, button, archiveButton);
  return row;
}

function renderProjects() {
  const filtered = projectData.filter((project) => Boolean(project.archived) === (projectFilter.value === 'Archived'));
  projects.replaceChildren(...filtered.map(projectRow));
}

projectFilter.addEventListener('change', renderProjects);

function taskRow(task) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.testid = 'task-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `task-${task.id}`;
  checkbox.checked = task.completed;
  checkbox.disabled = archived;
  checkbox.setAttribute('aria-label', `Complete ${task.title}`);
  const title = document.createElement('label');
  title.htmlFor = checkbox.id;
  title.textContent = task.title;
  checkbox.addEventListener('change', async () => {
    if (archived) return;
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
      checkbox.disabled = archived;
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
  if (archived) return;
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
    button.disabled = archived;
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
    projectData.push(project);
    renderProjects();
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
      archived = Boolean(project.archived);
      document.querySelector('#archived-project').hidden = !archived;
      taskForm.querySelector('button').disabled = archived;
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      tasks = await request(tasksPath);
      renderTasks();
    } else {
      projectData = await request('/api/projects');
      renderProjects();
    }
  } catch (failure) {
    showError(failure.message);
  }
}

await load();
