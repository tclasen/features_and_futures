const alert = document.querySelector('#alert');
const projectList = document.querySelector('#project-list');
const projectDetail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskList = document.querySelector('#tasks');
const projectFilter = document.querySelector('#project-filter');
let projectRecords = [];
let archived = false;
let projectId;
let tasks = [];

function showError(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
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
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed_count}/${project.total_count} completed`;
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
  for (const project of projectRecords) {
    if (project.archived === (projectFilter.value === 'archived')) appendProject(project);
  }
}
projectFilter.addEventListener('change', renderProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
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
    projectRecords.push(project);
    renderProjects();
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

function renderTasks() {
  taskList.replaceChildren();
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
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    const title = document.createElement('span');
    title.textContent = task.title;
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      showError('');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        Object.assign(task, saved);
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error.message);
      } finally {
        checkbox.disabled = archived;
      }
    });
    label.append(checkbox, title);
    row.append(label);
    taskList.append(row);
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
    renderTasks();
    titleInput.value = '';
    titleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = archived;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    projectList.hidden = true;
    projectDetail.hidden = false;
    const project = await request(`/api/projects/${match[1]}`);
    document.querySelector('#heading').textContent = project.name;
    document.title = `${project.name} — Workboard`;
    projectId = project.id;
    archived = Boolean(project.archived);
    document.querySelector('#archived-notice').hidden = !archived;
    titleInput.disabled = archived;
    tasks = await request(`/api/projects/${projectId}/tasks`);
    renderTasks();
    taskForm.querySelector('button').disabled = archived;
  } else {
    projectRecords = await request('/api/projects');
    renderProjects();
    form.querySelector('button').disabled = false;
  }
}

initialize().catch((error) => showError(error.message));
