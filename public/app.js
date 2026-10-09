const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#error');
const taskForm = document.querySelector('#create-task');
const taskTitleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskList = document.querySelector('#tasks');
const projectFilter = document.querySelector('#project-filter');
const renameForm = document.querySelector('#rename-project');
const newNameInput = document.querySelector('#new-project-name');
let projectId;
let archived = false;
let projectData = [];
let tasks = [];

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function appendProject(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    showError('');
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      renderProjects();
    } catch (error) {
      showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, open, archive);
  projects.append(row);
}

function renderProjects() {
  projects.replaceChildren();
  for (const project of projectData) {
    if (project.archived === (projectFilter.value === 'archived')) appendProject(project);
  }
}

projectFilter.addEventListener('change', renderProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = nameInput.value.trim();
  if (!name) return showError('Project name is required');
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
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });

function renderTasks() {
  taskList.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      if (archived) return;
      checkbox.disabled = true;
      showError('');
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
        checkbox.disabled = archived;
      }
    });
    row.append(title, checkbox);
    taskList.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  showError('');
  const title = taskTitleInput.value.trim();
  if (!title) return showError('Task title is required');
  const button = taskForm.querySelector('button');
  button.disabled = true;
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
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
    button.disabled = archived;
  }
});

function showProjectName(name) {
  document.querySelector('#project-title').textContent = name;
  document.title = `${name} — Workboard`;
}

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  showError('');
  const name = newNameInput.value.trim();
  if (!name) return showError('Project name is required');
  const button = renameForm.querySelector('button');
  button.disabled = true;
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    showProjectName(project.name);
    newNameInput.value = '';
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = archived;
  }
});

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  try {
    if (match) {
      detailView.hidden = false;
      const project = await request(`/api/projects/${match[1]}`);
      showProjectName(project.name);
      projectId = project.id;
      archived = Boolean(project.archived);
      document.querySelector('#archived-notice').hidden = !archived;
      taskForm.querySelector('button').disabled = archived;
      newNameInput.disabled = archived;
      renameForm.querySelector('button').disabled = archived;
      tasks = await request(`/api/projects/${projectId}/tasks`);
      renderTasks();
    } else {
      listView.hidden = false;
      projectData = await request('/api/projects');
      renderProjects();
    }
  } catch (error) {
    showError(error.message);
  }
}

loadPage();
