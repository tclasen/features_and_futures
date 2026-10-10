const heading = document.querySelector('#heading');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const form = document.querySelector('#create-project');
const nameInput = document.querySelector('#project-name');
const renameForm = document.querySelector('#rename-project');
const newNameInput = document.querySelector('#new-project-name');
const taskForm = document.querySelector('#create-task');
const titleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');
const tasksElement = document.querySelector('#tasks');
const projectId = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/)?.[1];
let tasks = [];
let projectItems = [];
let archived = false;
const projectFilter = document.querySelector('#project-filter');

function showError(message) {
  alert.textContent = message;
  alert.hidden = false;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function renderProjects() {
  const items = projectItems.filter((project) => project.archived === (projectFilter.value === 'archived'));
  projects.replaceChildren();
  document.querySelector('#empty').hidden = items.length > 0;
  for (const project of items) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      window.location.assign(`/projects/${project.id}`);
    });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
    const archiveButton = document.createElement('button');
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    archiveButton.addEventListener('click', async () => {
      alert.hidden = true;
      archiveButton.disabled = true;
      try {
        await request(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        await loadProjects();
      } catch (error) {
        showError(error.message);
      } finally {
        archiveButton.disabled = false;
      }
    });
    row.append(name, summary, open, archiveButton);
    projects.append(row);
  }
}

async function loadProjects() {
  projectItems = await request('/api/projects');
  renderProjects();
}

projectFilter.addEventListener('change', renderProjects);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  alert.hidden = true;
  const name = nameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await loadProjects();
    nameInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

function showProjectName(name) {
  heading.textContent = name;
  document.title = `${name} — Workboard`;
}

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  alert.hidden = true;
  const name = newNameInput.value.trim();
  if (!name) {
    showError('Project name is required');
    return;
  }
  const button = renameForm.querySelector('button');
  button.disabled = true;
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    showProjectName(project.name);
    newNameInput.value = '';
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = archived;
  }
});

function renderTasks() {
  tasksElement.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
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
    checkbox.addEventListener('change', async () => {
      alert.hidden = true;
      checkbox.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        task.completed = saved.completed;
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error.message);
      } finally {
        checkbox.disabled = false;
      }
    });
    const renameTaskForm = document.createElement('form');
    renameTaskForm.className = 'rename-task';
    const label = document.createElement('label');
    label.htmlFor = `new-task-title-${task.id}`;
    label.textContent = 'New task title';
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'text';
    input.disabled = archived;
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Rename task';
    button.disabled = archived;
    renameTaskForm.append(label, input, button);
    renameTaskForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (archived) return;
      alert.hidden = true;
      const newTitle = input.value.trim();
      if (!newTitle) {
        showError('Task title is required');
        return;
      }
      button.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        task.title = saved.title;
        title.textContent = saved.title;
        checkbox.setAttribute('aria-label', `Complete ${saved.title}`);
        input.value = '';
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = archived;
      }
    });
    const priorityLabel = document.createElement('label');
    priorityLabel.htmlFor = `task-priority-${task.id}`;
    priorityLabel.textContent = 'Task priority';
    const prioritySelect = document.createElement('select');
    prioritySelect.id = priorityLabel.htmlFor;
    prioritySelect.disabled = archived;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      prioritySelect.append(option);
    }
    prioritySelect.value = task.priority;
    prioritySelect.addEventListener('change', async () => {
      alert.hidden = true;
      prioritySelect.disabled = true;
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: prioritySelect.value }),
        });
        task.priority = saved.priority;
      } catch (error) {
        showError(error.message);
      } finally {
        prioritySelect.value = task.priority;
        prioritySelect.disabled = archived;
      }
    });
    row.append(checkbox, title, renameTaskForm, priorityLabel, prioritySelect);
    tasksElement.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  alert.hidden = true;
  const title = titleInput.value.trim();
  if (!title) {
    showError('Task title is required');
    return;
  }
  const button = taskForm.querySelector('button');
  button.disabled = true;
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    titleInput.value = '';
    renderTasks();
    titleInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back').addEventListener('click', () => window.location.assign('/'));

async function loadPage() {
  if (projectId) {
    const project = await request(`/api/projects/${projectId}`);
    archived = project.archived;
    document.querySelector('#archived-notice').hidden = !archived;
    taskForm.querySelector('button').disabled = archived;
    newNameInput.disabled = archived;
    renameForm.querySelector('button').disabled = archived;
    showProjectName(project.name);
    tasks = await request(`/api/projects/${projectId}/tasks`);
    renderTasks();
    detail.hidden = false;
  } else {
    list.hidden = false;
    await loadProjects();
  }
}

loadPage().catch((error) => showError(error.message));
