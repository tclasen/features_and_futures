const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#detail-view');
const list = document.querySelector('#project-list');
const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#project-name');
const alert = document.querySelector('#alert');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskList = document.querySelector('#task-list');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const projectFilter = document.querySelector('#project-filter');
const taskCreateButton = taskForm.querySelector('button');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameButton = renameForm.querySelector('button');
const renameAlert = document.querySelector('#rename-alert');
let currentProjectId = null;

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function renderList() {
  currentProjectId = null;
  listView.hidden = false;
  detailView.hidden = true;
  const projects = await request('/api/projects');
  list.replaceChildren();
  const showingArchived = projectFilter.value === 'Archived';
  for (const project of projects) {
    if (Boolean(project.archived) !== showingArchived) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${project.id}/archive`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !Boolean(project.archived) })
        });
        await renderList();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    row.append(name, summary, open, archive);
    list.append(row);
  }
}

async function renderTasks() {
  const tasks = await request(`/api/projects/${currentProjectId}/tasks`);
  taskList.replaceChildren();
  const filter = taskFilter.value;
  const selectedPriority = priorityFilter.value;
  for (const task of tasks) {
    if ((filter === 'Open' && task.completed) || (filter === 'Completed' && !task.completed)) continue;
    if (selectedPriority !== 'All' && task.priority !== selectedPriority) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'project-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = Boolean(window.currentProjectArchived);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = Boolean(window.currentProjectArchived);
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = Boolean(window.currentProjectArchived);
    renameButton.addEventListener('click', async () => {
      const newTitle = renameInput.value.trim();
      if (!newTitle) {
        taskAlert.textContent = 'Task title is required';
        taskAlert.hidden = false;
        return;
      }
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        });
        taskAlert.hidden = true;
        await renderTasks();
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    priority.disabled = Boolean(window.currentProjectArchived);
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority || 'Normal';
    priority.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${currentProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: priority.value })
        });
      } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
    });
    row.append(title, checkbox, renameInput, renameButton, priority);
    taskList.append(row);
  }
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (!match) return renderList();
  try {
    const project = await request(`/api/projects/${match[1]}`);
    currentProjectId = project.id;
    listView.hidden = true;
    detailView.hidden = false;
    document.querySelector('#project-title').textContent = project.name;
    renameInput.value = project.name;
    window.currentProjectArchived = Boolean(project.archived);
    renameInput.disabled = window.currentProjectArchived;
    renameButton.disabled = window.currentProjectArchived;
    document.querySelector('#archived-notice').hidden = !window.currentProjectArchived;
    taskCreateButton.disabled = window.currentProjectArchived;
    await renderTasks();
  } catch {
    history.replaceState(null, '', '/');
    await renderList();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    alert.hidden = false;
    return;
  }
  alert.textContent = '';
  alert.hidden = true;
  try {
    await request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    nameInput.value = '';
    await renderList();
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
});

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskAlert.textContent = 'Task title is required';
    taskAlert.hidden = false;
    return;
  }
  try {
    await request(`/api/projects/${currentProjectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    taskInput.value = '';
    taskAlert.hidden = true;
    await renderTasks();
  } catch (error) { taskAlert.textContent = error.message; taskAlert.hidden = false; }
});
projectFilter.addEventListener('change', () => renderList().catch(error => {
  alert.textContent = error.message;
  alert.hidden = false;
}));
taskFilter.addEventListener('change', () => renderTasks().catch(error => {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}));
priorityFilter.addEventListener('change', () => renderTasks().catch(error => {
  taskAlert.textContent = error.message;
  taskAlert.hidden = false;
}));
renameForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    return;
  }
  try {
    const project = await request(`/api/projects/${currentProjectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    document.querySelector('#project-title').textContent = project.name;
    renameInput.value = project.name;
    renameAlert.hidden = true;
  } catch (error) {
    renameAlert.textContent = error.message;
    renameAlert.hidden = false;
  }
});
document.querySelector('#back-button').addEventListener('click', () => { location.href = '/'; });
window.addEventListener('popstate', renderRoute);
renderRoute().catch(() => {
  alert.textContent = 'Unable to load projects';
  alert.hidden = false;
});
