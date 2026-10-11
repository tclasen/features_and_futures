const projectsView = document.querySelector('#projects-view');
const projectView = document.querySelector('#project-view');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');
const alert = document.querySelector('#alert');
const list = document.querySelector('#project-list');
const projectFilter = document.querySelector('#project-filter');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#new-project-name');
const renameAlert = document.querySelector('#rename-alert');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskAlert = document.querySelector('#task-alert');
const taskFilter = document.querySelector('#task-filter');
const priorityFilter = document.querySelector('#priority-filter');
const defaultTaskPriority = document.querySelector('#default-task-priority');
const taskList = document.querySelector('#task-list');
let projectId;
let savedDefaultTaskPriority;
let archived = false;
let projects = [];
let tasks = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  alert.textContent = message;
  alert.hidden = !message;
}

function addProject(project) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => {
    window.location.href = `/projects/${encodeURIComponent(project.id)}`;
  });
  const archiveButton = document.createElement('button');
  archiveButton.type = 'button';
  archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
  archiveButton.addEventListener('click', async () => {
    archiveButton.disabled = true;
    showAlert('');
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      renderProjects();
    } catch (error) {
      showAlert(error.message);
      archiveButton.disabled = false;
    }
  });
  row.append(name, summary, button, archiveButton);
  list.append(row);
}

function renderProjects() {
  list.replaceChildren();
  projects.filter(project => project.archived === (projectFilter.value === 'archived')).forEach(addProject);
}

projectFilter.addEventListener('change', renderProjects);

function showRenameAlert(message) {
  renameAlert.textContent = message;
  renameAlert.hidden = !message;
}

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!projectId || archived) return;
  const name = renameInput.value.trim();
  if (!name) {
    showRenameAlert('Project name is required');
    return;
  }
  const button = renameForm.querySelector('button');
  button.disabled = true;
  showRenameAlert('');
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    document.querySelector('#project-heading').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    renameInput.value = '';
    renameInput.focus();
  } catch (error) {
    showRenameAlert(error.message);
  } finally {
    button.disabled = archived;
  }
});

function showTaskAlert(message) {
  taskAlert.textContent = message;
  taskAlert.hidden = !message;
}

function renderTasks() {
  taskList.replaceChildren();
  for (const task of tasks) {
    if (taskFilter.value === 'open' && task.completed) continue;
    if (taskFilter.value === 'completed' && !task.completed) continue;
    if (priorityFilter.value !== 'all' && task.priority !== priorityFilter.value) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'task-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    const title = document.createElement('span');
    title.textContent = task.title;
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      showTaskAlert('');
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
        showTaskAlert(error.message);
      } finally {
        checkbox.disabled = false;
      }
    });
    const taskRenameForm = document.createElement('form');
    taskRenameForm.className = 'create-fields';
    taskRenameForm.noValidate = true;
    const taskRenameInput = document.createElement('input');
    taskRenameInput.type = 'text';
    taskRenameInput.setAttribute('aria-label', 'New task title');
    taskRenameInput.disabled = archived;
    const taskRenameButton = document.createElement('button');
    taskRenameButton.type = 'submit';
    taskRenameButton.textContent = 'Rename task';
    taskRenameButton.disabled = archived;
    taskRenameForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (archived) return;
      const newTitle = taskRenameInput.value.trim();
      if (!newTitle) {
        showTaskAlert('Task title is required');
        return;
      }
      taskRenameButton.disabled = true;
      taskRenameInput.disabled = true;
      showTaskAlert('');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        task.title = saved.title;
        title.textContent = task.title;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        taskRenameInput.value = '';
      } catch (error) {
        showTaskAlert(error.message);
      } finally {
        taskRenameButton.disabled = archived;
        taskRenameInput.disabled = archived;
      }
    });
    taskRenameForm.append(taskRenameInput, taskRenameButton);
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    priority.disabled = archived;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority;
    priority.addEventListener('change', async () => {
      if (archived) return;
      priority.disabled = true;
      showTaskAlert('');
      try {
        const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: priority.value }),
        });
        task.priority = saved.priority;
        renderTasks();
      } catch (error) {
        showTaskAlert(error.message);
      } finally {
        priority.value = task.priority;
        priority.disabled = archived;
      }
    });
    row.append(checkbox, title, taskRenameForm, priority);
    taskList.append(row);
  }
}

taskFilter.addEventListener('change', renderTasks);
priorityFilter.addEventListener('change', renderTasks);

defaultTaskPriority.addEventListener('change', async () => {
  if (!projectId || archived) return;
  defaultTaskPriority.disabled = true;
  showTaskAlert('');
  try {
    const project = await request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_task_priority: defaultTaskPriority.value }),
    });
    savedDefaultTaskPriority = project.default_task_priority;
  } catch (error) {
    showTaskAlert(error.message);
  } finally {
    defaultTaskPriority.value = savedDefaultTaskPriority;
    defaultTaskPriority.disabled = archived;
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (archived) return;
  const title = taskInput.value.trim();
  if (!title) {
    showTaskAlert('Task title is required');
    return;
  }
  const button = taskForm.querySelector('button');
  button.disabled = true;
  showTaskAlert('');
  try {
    const task = await request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    tasks.push(task);
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
  } catch (error) {
    showTaskAlert(error.message);
  } finally {
    button.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    showAlert('Project name is required');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  showAlert('');
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    projects.push(project);
    renderProjects();
    input.value = '';
    input.focus();
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  window.location.href = '/';
});

async function initialize() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  if (match) {
    projectsView.hidden = true;
    projectView.hidden = false;
    try {
      const project = await request(`/api/projects/${match[1]}`);
      projectId = project.id;
      archived = Boolean(project.archived);
      savedDefaultTaskPriority = project.default_task_priority;
      defaultTaskPriority.value = savedDefaultTaskPriority;
      defaultTaskPriority.disabled = archived;
      document.querySelector('#archived-message').hidden = !archived;
      document.querySelector('#project-heading').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      renameForm.hidden = false;
      renameInput.disabled = archived;
      renameForm.querySelector('button').disabled = archived;
      tasks = await request(`/api/projects/${projectId}/tasks`);
      renderTasks();
      document.querySelector('#task-controls').hidden = false;
      taskForm.querySelector('button').disabled = archived;
    } catch (error) {
      const projectError = document.querySelector('#project-error');
      projectError.textContent = error.message;
      projectError.hidden = false;
    }
  } else {
    form.querySelector('button').disabled = true;
    try {
      projects = await request('/api/projects');
      renderProjects();
    } catch (error) {
      showAlert(error.message);
    } finally {
      form.querySelector('button').disabled = false;
    }
  }
}

initialize();
