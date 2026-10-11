const listSection = document.querySelector('#project-list');
const detailSection = document.querySelector('#project-detail');
const projectContainer = document.querySelector('#projects');
const projectFilter = document.querySelector('#project-filter');
const form = document.querySelector('#create-project-form');
const nameInput = document.querySelector('#project-name');
const alertMessage = document.querySelector('#form-alert');
const detailTitle = document.querySelector('#detail-title');
const renameForm = document.querySelector('#rename-project-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
const taskForm = document.querySelector('#create-task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const defaultTaskPriority = document.querySelector('#default-task-priority');
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
    activeProjectId = null;
    await renderProjects();
    return;
  }
  const project = await request(`/api/projects/${match[1]}`);
  if (activeProjectId !== match[1]) {
    taskFilter.value = 'All';
    priorityFilter.value = 'All';
  }
  activeProjectId = match[1];
  activeProjectArchived = Boolean(project.archived);
  detailTitle.textContent = project.name;
  renameInput.value = '';
  renameInput.disabled = activeProjectArchived;
  renameForm.querySelector('button').disabled = activeProjectArchived;
  renameAlert.hidden = true;
  archivedNotice.hidden = !activeProjectArchived;
  taskForm.querySelector('button').disabled = activeProjectArchived;
  defaultTaskPriority.value = project.defaultTaskPriority;
  defaultTaskPriority.disabled = activeProjectArchived;
  listSection.hidden = true;
  detailSection.hidden = false;
  await renderTasks();
}

async function renderTasks() {
  if (!activeProjectId) return;
  const tasks = await request(`/api/projects/${activeProjectId}/tasks`);
  const visibleTasks = tasks.filter((task) => taskFilter.value === 'All'
    || (taskFilter.value === 'Open' && !task.completed)
    || (taskFilter.value === 'Completed' && task.completed))
    .filter((task) => priorityFilter.value === 'All' || task.priority === priorityFilter.value);
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
    const priorityLabel = document.createElement('label');
    priorityLabel.textContent = 'Task priority';
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    priority.disabled = activeProjectArchived;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority;
    priority.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ priority: priority.value }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    priorityLabel.append(priority);
    const rename = document.createElement('form');
    rename.className = 'task-rename-form';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = task.title;
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = activeProjectArchived;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = activeProjectArchived;
    rename.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextTitle = renameInput.value.trim();
      if (!nextTitle) { showTaskError(new Error('Task title is required')); return; }
      taskAlert.hidden = true;
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/title`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    rename.append(renameInput, renameButton);
    const dueDateForm = document.createElement('form');
    dueDateForm.className = 'task-due-date-form';
    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'text';
    dueDateInput.value = task.dueDate ?? '';
    dueDateInput.setAttribute('aria-label', 'Task due date');
    dueDateInput.disabled = activeProjectArchived;
    const dueDateButton = document.createElement('button');
    dueDateButton.type = 'submit';
    dueDateButton.textContent = 'Save due date';
    dueDateButton.disabled = activeProjectArchived;
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      taskAlert.hidden = true;
      try {
        await request(`/api/projects/${activeProjectId}/tasks/${task.id}/due-date`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dueDate: dueDateInput.value }),
        });
        await renderTasks();
      } catch (error) { showTaskError(error); }
    });
    dueDateForm.append(dueDateInput, dueDateButton);
    row.append(label, priorityLabel, rename, dueDateForm);
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
renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = renameInput.value.trim();
  if (!name) {
    renameAlert.textContent = 'Project name is required';
    renameAlert.hidden = false;
    return;
  }
  renameAlert.hidden = true;
  try {
    const project = await request(`/api/projects/${activeProjectId}/name`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    detailTitle.textContent = project.name;
    renameInput.value = '';
  } catch (error) {
    renameAlert.textContent = error.message;
    renameAlert.hidden = false;
  }
});
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
priorityFilter.addEventListener('change', () => renderTasks().catch(showTaskError));
defaultTaskPriority.addEventListener('change', async () => {
  try {
    await request(`/api/projects/${activeProjectId}/default-task-priority`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priority: defaultTaskPriority.value }),
    });
  } catch (error) {
    showTaskError(error);
    renderRoute().catch(showError);
  }
});
projectFilter.addEventListener('change', () => renderProjects().catch(showError));
window.addEventListener('popstate', () => renderRoute().catch(showError));
renderRoute().catch(showError);
