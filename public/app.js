const listPage = document.querySelector('#project-list');
const detailPage = document.querySelector('#project-detail');
const projectItems = document.querySelector('#project-list-items');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#project-count');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskList = document.querySelector('#task-list');
const taskFilter = document.querySelector('#task-filter');
let currentProjectId = null;
let currentTasks = [];

async function fetchProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function renderProjects(projects) {
  projectItems.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('article');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';

    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open-button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));

    row.append(name, open);
    projectItems.append(row);
  }
  count.textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;
  emptyState.hidden = projects.length > 0;
}

function showRoute() {
  const projectMatch = location.pathname.match(/^\/projects\/(\d+)$/);
  listPage.hidden = Boolean(projectMatch);
  detailPage.hidden = !projectMatch;
  if (projectMatch) {
    currentProjectId = projectMatch[1];
    currentTasks = [];
    renderTasks();
    fetchProjects().then((projects) => {
      const project = projects.find((item) => String(item.id) === projectMatch[1]);
      document.querySelector('#project-title').textContent = project?.name ?? 'Project not found';
    });
    fetch(`/api/projects/${projectMatch[1]}/tasks`).then((response) => {
      if (!response.ok) throw new Error('Could not load tasks');
      return response.json();
    }).then((tasks) => {
      if (currentProjectId === projectMatch[1]) {
        currentTasks = tasks;
        renderTasks();
      }
    }).catch(() => {
      taskAlert.textContent = 'Could not load tasks';
      taskAlert.hidden = false;
    });
  } else {
    currentProjectId = null;
  }
}

function renderTasks() {
  taskList.replaceChildren();
  const filter = taskFilter.value;
  const tasks = currentTasks.filter((task) => filter === 'All' || (filter === 'Open' ? !task.completed : task.completed));
  for (const task of tasks) {
    const row = document.createElement('article');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    const label = document.createElement('label');
    label.className = 'task-completion';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const response = await fetch(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      if (response.ok) {
        task.completed = checkbox.checked;
        renderTasks();
      } else {
        checkbox.checked = task.completed;
      }
    });
    label.append(checkbox, document.createTextNode('Completed'));
    row.append(title, label);
    taskList.append(row);
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
  alertMessage.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const result = await response.json();
    alertMessage.textContent = result.error || 'Could not create project';
    alertMessage.hidden = false;
    return;
  }
  nameInput.value = '';
  renderProjects(await fetchProjects());
  nameInput.focus();
});

document.querySelector('#back-to-projects').addEventListener('click', () => navigate('/'));
taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  taskAlert.hidden = true;
  const projectId = currentProjectId;
  const response = await fetch(`/api/projects/${projectId}/tasks`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const result = await response.json();
    taskAlert.textContent = result.error || 'Could not create task';
    taskAlert.hidden = false;
    return;
  }
  taskInput.value = '';
  currentTasks.push(await response.json());
  renderTasks();
  taskInput.focus();
});
window.addEventListener('popstate', showRoute);

fetchProjects().then(renderProjects).catch(() => {
  alertMessage.textContent = 'Could not load projects';
  alertMessage.hidden = false;
});
showRoute();
