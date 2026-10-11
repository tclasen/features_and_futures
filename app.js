const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectsContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const tasksContainer = document.querySelector('#tasks');
const taskFilter = document.querySelector('#task-filter');
let currentProjectId = null;

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  projectsContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, open);
    projectsContainer.append(row);
  }
}

async function showRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    listView.hidden = false;
    detailView.hidden = true;
    await loadProjects();
    return;
  }
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find((item) => String(item.id) === match[1]);
  if (!project) {
    navigate('/');
    return;
  }
  document.title = `${project.name} · Workboard`;
  document.querySelector('#project-heading').textContent = project.name;
  document.title = `${project.name} · Workboard`;
  currentProjectId = project.id;
  listView.hidden = true;
  detailView.hidden = false;
  await loadTasks();
}

async function loadTasks() {
  if (currentProjectId === null) return;
  const response = await fetch(`/api/projects/${currentProjectId}/tasks`);
  const tasks = await response.json();
  tasksContainer.replaceChildren();
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
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      await loadTasks();
    });
    row.append(title, checkbox);
    tasksContainer.append(row);
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  showRoute();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alertMessage.textContent = 'Project name is required';
    alertMessage.hidden = false;
    return;
  }
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return;
  alertMessage.hidden = true;
  nameInput.value = '';
  await loadProjects();
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  const response = await fetch(`/api/projects/${currentProjectId}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) return;
  taskAlert.hidden = true;
  taskInput.value = '';
  taskFilter.value = 'All';
  await loadTasks();
});
taskFilter.addEventListener('change', loadTasks);
window.addEventListener('popstate', showRoute);
showRoute();
