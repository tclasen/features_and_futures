const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const errorMessage = document.querySelector('#project-error');
const taskContainer = document.querySelector('#tasks');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskError = document.querySelector('#task-error');
const taskFilter = document.querySelector('#task-filter');
let activeProject = null;
let tasks = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}

function showList() {
  activeProject = null;
  listView.hidden = false;
  detailView.hidden = true;
  document.title = 'Workboard';
}

function showProject(project) {
  activeProject = project;
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#project-title').textContent = project.name;
  document.title = `${project.name} · Workboard`;
  taskFilter.value = 'All';
  refreshTasks();
}

function renderTasks() {
  taskContainer.replaceChildren();
  const visibleTasks = tasks.filter((task) => taskFilter.value === 'All'
    || (taskFilter.value === 'Open' && !task.completed)
    || (taskFilter.value === 'Completed' && task.completed));
  for (const task of visibleTasks) {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const label = document.createElement('label');
    label.className = 'task-completion';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${activeProject.id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        task.completed = checkbox.checked;
        renderTasks();
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        taskError.textContent = error.message;
        taskError.hidden = false;
      }
    });
    label.append(checkbox);
    row.append(title, label);
    taskContainer.append(row);
  }
}

async function refreshTasks() {
  if (!activeProject) return;
  try {
    tasks = await request(`/api/projects/${activeProject.id}/tasks`);
    renderTasks();
  } catch (error) {
    taskError.textContent = error.message;
    taskError.hidden = false;
  }
}

function renderProjects(projects) {
  projectContainer.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${project.id}`);
      showProject(project);
    });
    row.append(name, open);
    projectContainer.append(row);
  }
}

async function refreshProjects() {
  renderProjects(await request('/api/projects'));
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) {
    showList();
    await refreshProjects();
    return;
  }
  try {
    const projects = await request('/api/projects');
    const project = projects.find((item) => item.id === Number(match[1]));
    if (!project) {
      history.replaceState({}, '', '/');
      showList();
      await refreshProjects();
      return;
    }
    showProject(project);
  } catch {
    showList();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim() })
    });
    nameInput.value = '';
    await refreshProjects();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  taskError.hidden = true;
  try {
    await request(`/api/projects/${activeProject.id}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: taskInput.value.trim() })
    });
    taskInput.value = '';
    await refreshTasks();
  } catch (error) {
    taskError.textContent = error.message;
    taskError.hidden = false;
  }
});

taskFilter.addEventListener('change', renderTasks);

document.querySelector('#back-to-projects').addEventListener('click', () => {
  history.pushState({}, '', '/');
  showList();
  refreshProjects();
});

window.addEventListener('popstate', renderRoute);
renderRoute();
