const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const detailTitle = document.querySelector('#detail-title');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskFilter = document.querySelector('#task-filter');
const taskContainer = document.querySelector('#tasks');
const archivedNotice = document.querySelector('#archived-notice');
let activeProjectId = null;
let activeProjectArchived = false;

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed');
  return result;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => navigate(`/projects/${project.id}`));
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    try {
      await request(`/api/projects/${project.id}/archive`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      await renderProjects();
    } catch (error) { showError(error); }
  });
  row.append(name, summary, open, archive);
  return row;
}

async function renderProjects() {
  const projects = await request(`/api/projects?archived=${projectFilter.value === 'archived'}`);
  projectContainer.replaceChildren(...projects.map(projectRow));
}

async function renderRoute() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) {
    listSection.hidden = false;
    detailSection.hidden = true;
    await renderProjects();
    return;
  }
  const project = await request(`/api/projects/${match[1]}`);
  activeProjectId = match[1];
  activeProjectArchived = Boolean(project.archived);
  detailTitle.textContent = project.name;
  archivedNotice.hidden = !activeProjectArchived;
  taskForm.querySelector('button').disabled = activeProjectArchived;
  listSection.hidden = true;
  detailSection.hidden = false;
  await renderTasks();
}

async function renderTasks() {
  if (!activeProjectId) return;
  const tasks = await request(`/api/projects/${activeProjectId}/tasks`);
  const visibleTasks = tasks.filter((task) => taskFilter.value === 'All'
    || (taskFilter.value === 'Open' && !task.completed)
    || (taskFilter.value === 'Completed' && task.completed));
  taskContainer.replaceChildren(...visibleTasks.map((task) => {
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = activeProjectArchived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    const title = document.createElement('span');
    title.textContent = task.title;
    label.append(checkbox, title);
    row.append(label);
    return row;
  }));
}

function showTaskError(error) {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}

function navigate(path) {
  window.history.pushState({}, '', path);
  renderRoute().catch(showError);
}

function showError(error) {
  alertMessage.textContent = error.message;
  alertMessage.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showError(new Error('Project name is required'));
    return;
  }
  alertMessage.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await renderProjects();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) { showTaskError(new Error('Task title is required')); return; }
  taskAlert.hidden = true;
  try {
    await request(`/api/projects/${activeProjectId}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    taskInput.value = '';
    await renderTasks();
  } catch (error) { showTaskError(error); }
});
taskFilter.addEventListener('change', () => renderTasks().catch(showTaskError));
projectFilter.addEventListener('change', () => renderProjects().catch(showError));
window.addEventListener('popstate', () => renderRoute().catch(showError));
renderRoute().catch(showError);
