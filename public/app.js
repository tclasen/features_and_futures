const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#form-alert');
const projectsContainer = document.querySelector('#projects');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskFilter = document.querySelector('#task-filter');
const tasksContainer = document.querySelector('#tasks');
let activeProjectId = null;

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  document.title = 'Workboard';
}

async function renderProjects() {
  const projects = await request('/api/projects');
  projectsContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open project';
    openButton.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, openButton);
    projectsContainer.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    showList();
    await renderProjects();
    return;
  }
  const project = await request(`/api/projects/${match[1]}`);
  activeProjectId = project.id;
  document.querySelector('#project-title').textContent = project.name;
  document.title = `${project.name} · Workboard`;
  listView.hidden = true;
  detailView.hidden = false;
  await renderTasks();
}

async function renderTasks() {
  if (activeProjectId === null) return;
  const tasks = await request(`/api/projects/${activeProjectId}/tasks`);
  const filter = taskFilter.value;
  tasksContainer.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed) continue;
    if (filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await renderTasks();
      } catch (error) {
        taskAlert.textContent = error.message;
        taskAlert.hidden = false;
      }
    });
    label.append(checkbox);
    row.append(title, label);
    tasksContainer.append(row);
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  renderRoute().catch(showList);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value }),
    });
    nameInput.value = '';
    await renderProjects();
    nameInput.focus();
    return project;
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => navigate('/'));
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  taskAlert.hidden = true;
  try {
    await request(`/api/projects/${activeProjectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: taskInput.value }),
    });
    taskInput.value = '';
    await renderTasks();
    taskInput.focus();
  } catch (error) {
    taskAlert.textContent = error.message;
    taskAlert.hidden = false;
  }
});
taskFilter.addEventListener('change', () => renderTasks().catch((error) => {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}));
window.addEventListener('popstate', () => renderRoute().catch(showList));
renderRoute().catch(showList);
