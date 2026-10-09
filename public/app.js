const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const projects = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
let projectItems = [];
let archived = false;
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const tasksElement = document.querySelector('#tasks');
const projectId = window.location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
let tasks = [];

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function addProject(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    alert.hidden = true;
    archive.disabled = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
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
  const items = projectItems.filter((project) => project.archived === (projectFilter.value === 'Archived'));
  items.forEach(addProject);
  document.querySelector('#empty').hidden = items.length !== 0;
}

projectFilter.addEventListener('change', renderProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  if (!nameInput.value.trim()) {
    showError('Project name is required');
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value }),
    });
    projectItems.push(project);
    renderProjects();
    nameInput.value = '';
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

function renderTasks() {
  tasksElement.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'Open' && task.completed) continue;
    if (taskFilter.value === 'Completed' && !task.completed) continue;
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
      alert.hidden = true;
      checkbox.disabled = true;
      try {
        const saved = await api(`/api/projects/${projectId}/tasks/${task.id}`, {
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
    row.append(title, checkbox);
    tasksElement.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  if (archived) return;
  if (!titleInput.value.trim()) {
    showError('Task title is required');
    return;
  }
  const submit = taskForm.querySelector('button');
  submit.disabled = true;
  try {
    const task = await api(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleInput.value }),
    });
    tasks.push(task);
    renderTasks();
    titleInput.value = '';
    titleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = archived;
  }
});

document.querySelector('#back').addEventListener('click', () => {
  window.location.href = '/';
});

async function loadPage() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    document.querySelector('#project-detail').hidden = false;
    const project = await api(`/api/projects/${match[1]}`);
    archived = project.archived;
    document.querySelector('#archived-notice').hidden = !archived;
    taskForm.querySelector('button').disabled = archived;
    titleInput.disabled = archived;
    heading.textContent = project.name;
    document.title = `${project.name} · Workboard`;
    tasks = await api(`/api/projects/${project.id}/tasks`);
    renderTasks();
  } else {
    document.querySelector('#project-list').hidden = false;
    projectItems = await api('/api/projects');
    renderProjects();
  }
}

loadPage().catch((error) => showError(error.message));
