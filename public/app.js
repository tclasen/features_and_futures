const heading = document.querySelector('#heading');
const alert = document.querySelector('#error');
const listPage = document.querySelector('#project-list');
const detailPage = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskRows = document.querySelector('#tasks');
const projectFilter = document.querySelector('#project-filter');
let projectId;
let archived = false;
let allProjects = [];
let tasks = [];

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function appendProject(project) {
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
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    showError('');
    try {
      const updated = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      allProjects = allProjects.map((item) => item.id === updated.id ? updated : item);
      renderProjects();
    } catch (error) {
      showError(error.message);
      archive.disabled = false;
    }
  });
  row.append(name, summary, open, archive);
  projects.append(row);
}

function renderProjects() {
  projects.replaceChildren();
  const showArchived = projectFilter.value === 'archived';
  allProjects.filter((project) => Boolean(project.archived) === showArchived).forEach(appendProject);
}

projectFilter.addEventListener('change', renderProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    nameInput.focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    allProjects.push(project);
    renderProjects();
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

function renderTasks() {
  taskRows.replaceChildren();
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
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      showError('');
      try {
        const updated = await api(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        tasks = tasks.map((item) => item.id === updated.id ? updated : item);
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error.message);
      } finally {
        checkbox.disabled = archived;
      }
    });
    row.append(title, checkbox);
    taskRows.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  if (archived) return;
  const title = titleInput.value.trim();
  if (!title) {
    showError('Task title is required');
    titleInput.focus();
    return;
  }
  const button = taskForm.querySelector('button');
  button.disabled = true;
  try {
    const task = await api(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    renderTasks();
    titleInput.value = '';
    titleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    detailPage.hidden = false;
    try {
      const project = await api(`/api/projects/${match[1]}`);
      heading.textContent = project.name;
      document.title = `${project.name} — Workboard`;
      projectId = project.id;
      archived = project.archived;
      document.querySelector('#archived-notice').hidden = !archived;
      taskForm.querySelector('button').disabled = archived;
      tasks = await api(`/api/projects/${projectId}/tasks`);
      renderTasks();
      document.querySelector('#task-board').hidden = false;
    } catch (error) {
      heading.textContent = 'Project unavailable';
      showError(error.message);
    }
  } else {
    try {
      allProjects = await api('/api/projects');
      renderProjects();
    } catch (error) {
      showError(error.message);
    }
    listPage.hidden = false;
  }
}

loadPage();
