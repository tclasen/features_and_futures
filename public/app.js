const heading = document.querySelector('h1');
const alert = document.querySelector('#alert');
const projectsView = document.querySelector('#projects');
const detailView = document.querySelector('#project-detail');
const list = document.querySelector('#project-list');
const form = document.querySelector('#create-project');
const input = document.querySelector('#project-name');
const taskForm = document.querySelector('#create-task');
const taskInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const taskList = document.querySelector('#task-list');
const projectFilter = document.querySelector('#project-filter');
const archivedNotice = document.querySelector('#archived-notice');
let projects = [];
let archived = false;
let projectId = null;
let tasks = [];
let renderVersion = 0;

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to save or load data');
  return data;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed_count}/${project.total_count} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => navigate(`/projects/${project.id}`));
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    const version = renderVersion;
    archive.disabled = true;
    alert.hidden = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      if (version !== renderVersion) return;
      projects = projects.map(item => item.id === saved.id ? saved : item);
      renderProjects();
    } catch (error) {
      if (version === renderVersion) showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, open, archive);
  return row;
}

function renderProjects() {
  list.replaceChildren(...projects.filter(project =>
    Boolean(project.archived) === (projectFilter.value === 'Archived')).map(projectRow));
}

function renderTasks() {
  const visible = tasks.filter(task => taskFilter.value === 'All' ||
    (taskFilter.value === 'Completed' ? task.completed : !task.completed));
  taskList.replaceChildren(...visible.map(task => {
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
    const owner = projectId;
    const version = renderVersion;
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      alert.hidden = true;
      try {
        const saved = await api(`/api/projects/${owner}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (version !== renderVersion) return;
        tasks = tasks.map(item => item.id === saved.id ? saved : item);
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        if (version === renderVersion) showError(error.message);
      } finally {
        checkbox.disabled = archived;
      }
    });
    row.append(checkbox, title);
    return row;
  }));
}

async function render() {
  const version = ++renderVersion;
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  projectsView.hidden = Boolean(match);
  detailView.hidden = !match;
  heading.textContent = match ? 'Loading project…' : 'Workboard';
  projectId = null;
  archived = false;
  archivedNotice.hidden = true;
  tasks = [];
  taskInput.value = '';
  taskFilter.value = 'All';
  taskList.replaceChildren();
  taskForm.querySelector('button').disabled = true;
  try {
    if (match) {
      const [project, savedTasks] = await Promise.all([
        api(`/api/projects/${match[1]}`),
        api(`/api/projects/${match[1]}/tasks`),
      ]);
      if (version !== renderVersion) return;
      projectId = project.id;
      archived = Boolean(project.archived);
      archivedNotice.hidden = !archived;
      tasks = savedTasks;
      renderTasks();
      taskForm.querySelector('button').disabled = archived;
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } else {
      document.title = 'Workboard';
      projectFilter.value = 'Active';
      const savedProjects = await api('/api/projects');
      if (version !== renderVersion) return;
      projects = savedProjects;
      renderProjects();
    }
  } catch (error) {
    if (version !== renderVersion) return;
    heading.textContent = 'Workboard';
    showError(error.message);
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const name = input.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    projects.push(project);
    renderProjects();
    input.value = '';
    input.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const title = taskInput.value.trim();
  if (!title) return showError('Task title is required');
  if (projectId === null || archived) return;
  const owner = projectId;
  const version = renderVersion;
  const submit = taskForm.querySelector('button');
  submit.disabled = true;
  try {
    const task = await api(`/api/projects/${owner}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (version !== renderVersion) return;
    tasks.push(task);
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
  } catch (error) {
    if (version === renderVersion) showError(error.message);
  } finally {
    if (version === renderVersion) submit.disabled = archived;
  }
});

taskFilter.addEventListener('change', renderTasks);
projectFilter.addEventListener('change', renderProjects);
document.querySelector('#back').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', render);
render();
