const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const errorMessage = document.querySelector('#error-message');
const projectsElement = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
const taskForm = document.querySelector('#task-form');
const taskTitleInput = document.querySelector('#task-title');
const taskErrorMessage = document.querySelector('#task-error-message');
const taskFilter = document.querySelector('#task-filter');
const tasksElement = document.querySelector('#tasks');
let activeProjectId = null;
let activeTasks = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Something went wrong');
  return value;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  activeProjectId = null;
  document.title = 'Workboard';
}

async function renderProjects() {
  const projects = await request('/api/projects');
  projectsElement.replaceChildren();
  for (const project of projects.filter((item) => item.archived === (projectFilter.value === 'Archived'))) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
      renderRoute();
    });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      await request(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      await renderProjects();
    });
    row.append(name, summary, open, archive);
    projectsElement.append(row);
  }
}

function renderTasks() {
  const filter = taskFilter.value;
  const visibleTasks = activeTasks.filter((task) => filter === 'All' || (filter === 'Open' ? !task.completed : task.completed));
  tasksElement.replaceChildren();
  for (const task of visibleTasks) {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const label = document.createElement('label');
    label.className = 'task-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = taskForm.querySelector('button').disabled;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        task.completed = checkbox.checked;
        renderTasks();
      } catch {
        checkbox.checked = task.completed;
        checkbox.disabled = false;
      }
    });
    label.append(checkbox, document.createTextNode('Completed'));
    row.append(title, label);
    tasksElement.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) {
    showList();
    await renderProjects();
    return;
  }
  try {
    const projectId = decodeURIComponent(match[1]);
    const project = await request(`/api/projects/${encodeURIComponent(projectId)}`);
    activeProjectId = project.id;
    document.querySelector('#project-title').textContent = project.name;
    document.querySelector('#archived-notice').hidden = !project.archived;
    taskForm.querySelector('input').disabled = project.archived;
    taskForm.querySelector('button').disabled = project.archived;
    document.title = `${project.name} · Workboard`;
    listView.hidden = true;
    detailView.hidden = false;
    activeTasks = await request(`/api/projects/${encodeURIComponent(project.id)}/tasks`);
    renderTasks();
  } catch {
    history.replaceState({}, '', '/');
    showList();
    await renderProjects();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    errorMessage.textContent = 'Project name is required';
    errorMessage.hidden = false;
    nameInput.focus();
    return;
  }
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    form.reset();
    await renderProjects();
    nameInput.focus();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  taskErrorMessage.hidden = true;
  const title = taskTitleInput.value.trim();
  if (!title) {
    taskErrorMessage.textContent = 'Task title is required';
    taskErrorMessage.hidden = false;
    taskTitleInput.focus();
    return;
  }
  try {
    const task = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    activeTasks.push(task);
    taskForm.reset();
    renderTasks();
    taskTitleInput.focus();
  } catch (error) {
    taskErrorMessage.textContent = error.message;
    taskErrorMessage.hidden = false;
  }
});

taskFilter.addEventListener('change', renderTasks);
projectFilter.addEventListener('change', renderProjects);
document.querySelector('#back-button').addEventListener('click', () => {
  history.pushState({}, '', '/');
  renderRoute();
});
window.addEventListener('popstate', renderRoute);
renderRoute();
