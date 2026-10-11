const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const alertBox = document.querySelector('#alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, button);
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
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
      await loadTasks(projectId);
    });
    row.append(title, checkbox);
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
document.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
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
