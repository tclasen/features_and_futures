const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const alertBox = document.querySelector('#alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const filter = document.querySelector('#project-filter').value;
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects) {
    if (Boolean(project.archived) !== (filter === 'Archived')) continue;
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
      await loadProjects();
    });
    row.append(name, summary, button, archive);
    container.append(row);
  }
}

async function loadTasks(projectId) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) return;
  const tasks = await response.json();
  const filter = document.querySelector('#task-filter').value;
  const container = document.querySelector('#tasks');
  container.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = Boolean(document.querySelector('#archived-label').hidden === false);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
      await loadTasks(projectId);
    });
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.value = task.title;
    renameInput.disabled = checkbox.disabled;
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = checkbox.disabled;
    renameButton.addEventListener('click', async () => {
      const alert = document.querySelector('#task-alert');
      const newTitle = renameInput.value.trim();
      if (!newTitle) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
      alert.hidden = true;
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
      if (response.ok) await loadTasks(projectId);
    });
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority || 'Normal';
    priority.disabled = checkbox.disabled;
    priority.addEventListener('change', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
      if (!response.ok) await loadTasks(projectId);
    });
    row.append(title, checkbox, renameInput, renameButton, priority);
    container.append(row);
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    const response = await fetch(`/api/projects/${match[1]}`);
    if (response.ok) {
      const project = await response.json();
      document.querySelector('#project-title').textContent = project.name;
      document.querySelector('#archived-label').hidden = !project.archived;
      document.querySelector('#rename-form').querySelectorAll('input, button').forEach(control => { control.disabled = Boolean(project.archived); });
      document.querySelector('#task-form').querySelectorAll('input, button').forEach(control => { control.disabled = Boolean(project.archived); });
      list.hidden = true;
      detail.hidden = false;
      await loadTasks(project.id);
      return;
    }
  }
  detail.hidden = true;
  list.hidden = false;
  await loadProjects();
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    alertBox.textContent = 'Project name is required';
    alertBox.hidden = false;
    return;
  }
  alertBox.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (response.ok) {
    input.value = '';
    await loadProjects();
  }
});
document.querySelector('#rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#new-project-name');
  const alert = document.querySelector('#rename-alert');
  const name = input.value.trim();
  if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return;
  const response = await fetch(`/api/projects/${match[1]}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (response.ok) {
    input.value = '';
    document.querySelector('#project-title').textContent = name;
  }
});
document.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
document.querySelector('#project-filter').addEventListener('change', loadProjects);
document.querySelector('#task-filter').addEventListener('change', () => {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) loadTasks(match[1]);
});
document.querySelector('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#task-title');
  const title = input.value.trim();
  const alert = document.querySelector('#task-alert');
  if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return;
  const response = await fetch(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  if (response.ok) { input.value = ''; await loadTasks(match[1]); }
});
render();
