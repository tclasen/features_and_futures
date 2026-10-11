const listView = document.querySelector('#project-list');
const detailView = document.querySelector('#project-detail');
const alert = document.querySelector('#alert');
let activeProjectId = null;

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  const projects = await response.json();
  const filter = document.querySelector('#project-filter').value;
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects.filter(item => item.archived === (filter === 'Archived'))) {
    const row = document.createElement('div'); row.dataset.testid = 'project-row'; row.className = 'project-row';
    const name = document.createElement('span'); name.textContent = project.name;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Open project';
    button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const summary = document.createElement('span'); summary.dataset.testid = 'project-summary'; summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    row.append(name, summary, button);
    const stateButton = document.createElement('button'); stateButton.type = 'button'; stateButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    stateButton.addEventListener('click', async () => { const action = project.archived ? 'restore' : 'archive'; const result = await fetch(`/api/projects/${project.id}/${action}`, { method: 'POST' }); if (result.ok) await loadProjects(); });
    row.append(stateButton); container.append(row);
  }
}

async function loadTasks() {
  const response = await fetch(`/api/projects/${activeProjectId}/tasks`);
  if (!response.ok) throw new Error('Could not load tasks');
  const tasks = await response.json();
  const filter = document.querySelector('#task-filter').value;
  const shown = tasks.filter(task => filter === 'All' || (filter === 'Completed') === task.completed);
  const container = document.querySelector('#tasks'); container.replaceChildren();
  for (const task of shown) {
    const row = document.createElement('div'); row.dataset.testid = 'task-row'; row.className = 'project-row';
    const title = document.createElement('span'); title.textContent = task.title;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.completed; checkbox.disabled = Boolean(window.currentProjectArchived); checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      const result = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
      if (result.ok) await loadTasks(); else checkbox.checked = task.completed;
    });
    row.append(title, checkbox); container.append(row);
  }
}

async function showPage() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) { detailView.hidden = true; listView.hidden = false; await loadProjects(); return; }
  activeProjectId = match[1]; listView.hidden = true; detailView.hidden = false;
  const response = await fetch(`/api/projects/${activeProjectId}`);
  if (!response.ok) { document.querySelector('#project-title').textContent = 'Project not found'; return; }
  const project = await response.json(); window.currentProjectArchived = project.archived;
  document.querySelector('#project-title').textContent = project.name;
  const renameInput = document.querySelector('#new-project-name');
  renameInput.value = project.name;
  renameInput.disabled = project.archived;
  document.querySelector('#rename-form button').disabled = project.archived;
  document.querySelector('#archived-notice').hidden = !project.archived;
  document.querySelector('#task-title').disabled = project.archived;
  document.querySelector('#task-form button').disabled = project.archived;
  await loadTasks();
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault(); const input = document.querySelector('#project-name'); const name = input.value.trim();
  if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  const response = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  input.value = ''; alert.hidden = true; await loadProjects();
});

document.querySelector('#rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#new-project-name');
  const name = input.value.trim();
  const message = document.querySelector('#rename-alert');
  if (!name) { message.textContent = 'Project name is required'; message.hidden = false; return; }
  const response = await fetch(`/api/projects/${activeProjectId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) { message.textContent = response.status === 400 ? 'Project name is required' : 'Unable to rename project'; message.hidden = false; return; }
  message.hidden = true;
  await showPage();
});

document.querySelector('#task-form').addEventListener('submit', async event => {
  event.preventDefault(); const input = document.querySelector('#task-title'); const title = input.value.trim(); const message = document.querySelector('#task-alert');
  if (!title) { message.textContent = 'Task title is required'; message.hidden = false; return; }
  const response = await fetch(`/api/projects/${activeProjectId}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
  if (!response.ok) { message.textContent = 'Task title is required'; message.hidden = false; return; }
  input.value = ''; message.hidden = true; await loadTasks();
});
document.querySelector('#task-filter').addEventListener('change', loadTasks);
document.querySelector('#project-filter').addEventListener('change', loadProjects);
document.querySelector('#back-button').addEventListener('click', () => { location.href = '/'; });
showPage().catch(() => { alert.textContent = 'Unable to load Workboard'; alert.hidden = false; listView.hidden = false; });
