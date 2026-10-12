const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectsNode = document.querySelector('#projects');
const alertNode = document.querySelector('#form-alert');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const tasksNode = document.querySelector('#tasks');
const taskFilter = document.querySelector('#task-filter');
const projectFilter = document.querySelector('#project-filter');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
let activeProjectId = null;
let currentTasks = [];
let activeProjectArchived = false;

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  history.pushState({}, '', '/');
  loadProjects();
}

async function loadProjects() {
  const projects = await request('/api/projects');
  projectsNode.replaceChildren();
  const visibleProjects = projects.filter(project => project.archived === (projectFilter.value === 'Archived'));
  document.querySelector('#project-count').textContent = visibleProjects.length ? String(visibleProjects.length).padStart(2, '0') : '';
  if (!visibleProjects.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<span class="empty-icon" aria-hidden="true">◇</span><strong>No ${projectFilter.value.toLowerCase()} projects</strong><span>${projectFilter.value === 'Active' ? 'Create your first project to get started.' : 'Archived projects will appear here.'}</span>`;
    projectsNode.append(empty);
    return;
  }
  for (const project of visibleProjects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;
    const summary = document.createElement('span');
    summary.className = 'project-summary';
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const button = document.createElement('button');
    button.className = 'open-button';
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => openProject(project.id));
    const actions = document.createElement('div');
    actions.className = 'project-actions';
    const archiveButton = document.createElement('button');
    archiveButton.className = 'open-button';
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    archiveButton.addEventListener('click', async () => {
      await request(`/api/projects/${encodeURIComponent(project.id)}/archive`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived })
      });
      await loadProjects();
    });
    actions.append(button, archiveButton);
    row.append(name, summary, actions);
    projectsNode.append(row);
  }
}

async function openProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  document.querySelector('#detail-name').textContent = project.name;
  activeProjectId = project.id;
  setProjectArchived(project.archived);
  listView.hidden = true;
  detailView.hidden = false;
  history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
  await loadTasks();
}

function setProjectArchived(archived) {
  activeProjectArchived = archived;
  document.querySelector('#archived-label').hidden = !archived;
  taskInput.disabled = archived;
  taskForm.querySelector('button[type="submit"]').disabled = archived;
  taskForm.setAttribute('aria-disabled', String(archived));
  renameInput.disabled = archived;
  renameForm.querySelector('button[type="submit"]').disabled = archived;
}

function drawTasks() {
  tasksNode.replaceChildren();
  const filter = taskFilter.value;
  const visible = currentTasks.filter(task => filter === 'All' || (filter === 'Open' ? !task.completed : task.completed));
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'task-empty';
    empty.textContent = currentTasks.length ? 'No tasks match this filter.' : 'No tasks yet.';
    tasksNode.append(empty);
  }
  for (const task of visible) {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    const label = document.createElement('label');
    label.className = 'task-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = activeProjectArchived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        task.completed = checkbox.checked;
        drawTasks();
      } catch { checkbox.checked = task.completed; }
    });
    label.append(checkbox);
    row.append(title, label);
    tasksNode.append(row);
  }
}

async function loadTasks() {
  if (!activeProjectId) return;
  currentTasks = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`);
  drawTasks();
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/([^/]+)$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  try {
    const project = await request(`/api/projects/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    document.querySelector('#detail-name').textContent = project.name;
    activeProjectId = project.id;
    setProjectArchived(project.archived);
    listView.hidden = true;
    detailView.hidden = false;
    await loadTasks();
  } catch {
    activeProjectId = null;
    history.replaceState({}, '', '/');
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alertNode.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value })
    });
    nameInput.value = '';
    await loadProjects();
  } catch (error) {
    alertNode.textContent = error.message;
    alertNode.hidden = false;
  }
});

document.querySelector('#back-button').addEventListener('click', showList);
renameForm.addEventListener('submit', async event => {
  event.preventDefault();
  renameAlert.hidden = true;
  try {
    const project = await request(`/api/projects/${encodeURIComponent(activeProjectId)}/rename`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: renameInput.value })
    });
    document.querySelector('#detail-name').textContent = project.name;
    renameInput.value = '';
  } catch (error) {
    renameAlert.textContent = error.message;
    renameAlert.hidden = false;
  }
});
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  taskAlert.hidden = true;
  try {
    await request(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: taskInput.value })
    });
    taskInput.value = '';
    await loadTasks();
  } catch (error) {
    taskAlert.textContent = error.message;
    taskAlert.hidden = false;
  }
});
taskFilter.addEventListener('change', drawTasks);
projectFilter.addEventListener('change', loadProjects);
window.addEventListener('popstate', renderRoute);
renderRoute();
