const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) {
    try {
      const projects = await request('/api/projects');
      const project = projects.find(item => item.id === decodeURIComponent(match[1]));
      if (project) {
        renderProject(project);
        return;
      }
    } catch { /* Render the list if project lookup is unavailable. */ }
  }
  app.innerHTML = `<h1>Workboard</h1>
    <label for="project-filter">Project filter</label><select id="project-filter"><option>Active</option><option>Archived</option></select>
    <form id="create-form"><label for="project-name">Project name</label><div class="create-line"><input id="project-name" name="name" type="text"><button type="submit">Create project</button></div></form>
    <p id="alert" class="alert" role="alert" hidden></p><section id="projects" aria-label="Projects"></section>`;
  document.querySelector('#create-form').addEventListener('submit', createProject);
  document.querySelector('#project-filter').addEventListener('change', loadProjects);
  await loadProjects();
}

function renderProject(project) {
  app.innerHTML = `<button class="back" id="back">Projects</button><h1>${escapeHtml(project.name)}</h1>
    ${project.archived ? '<p>Archived project</p>' : ''}
    <form id="rename-form"><label for="new-project-name">New project name</label><div class="create-line"><input id="new-project-name" type="text"><button type="submit">Rename project</button></div></form>
    <p id="rename-alert" class="alert" role="alert" hidden></p>
    <form id="task-form"><label for="task-title">Task title</label><div class="create-line"><input id="task-title" type="text"><button type="submit">Create task</button></div></form>
    <p id="task-alert" class="alert" role="alert" hidden></p>
    <label for="task-filter">Task filter</label><select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select>
    <section id="tasks" aria-label="Tasks"></section>`;
  document.querySelector('#task-form button').disabled = project.archived;
  document.querySelector('#rename-form input').disabled = project.archived;
  document.querySelector('#rename-form button').disabled = project.archived;
  document.querySelector('#rename-form').addEventListener('submit', event => renameProject(event, project.id));
  document.querySelector('#back').addEventListener('click', () => navigate('/'));
  document.querySelector('#task-form').addEventListener('submit', event => createTask(event, project.id));
  document.querySelector('#task-filter').addEventListener('change', () => loadTasks(project.id, project.archived));
  loadTasks(project.id, project.archived);
}

async function loadTasks(projectId, archived = false) {
  const tasks = await request(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
  const filter = document.querySelector('#task-filter').value;
  const list = document.querySelector('#tasks');
  list.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    row.className = 'project-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = task.completed;
    checkbox.disabled = archived;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
      await loadTasks(projectId, archived);
    });
    label.append(checkbox);
    row.append(title, label);
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.disabled = archived;
    const renameButton = document.createElement('button');
    renameButton.textContent = 'Rename task';
    renameButton.disabled = archived;
    renameButton.addEventListener('click', async () => {
      const newTitle = renameInput.value.trim();
      if (!newTitle) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
      try {
        await request(`/api/tasks/${encodeURIComponent(task.id)}/rename`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
        await loadTasks(projectId, archived);
      } catch (error) { alert.textContent = error.message; alert.hidden = false; }
    });
    const alert = document.querySelector('#task-alert');
    row.append(renameInput, renameButton);
    list.append(row);
  }
}

async function renameProject(event, projectId) {
  event.preventDefault();
  const input = document.querySelector('#new-project-name');
  const alert = document.querySelector('#rename-alert');
  const name = input.value.trim();
  if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  alert.hidden = true;
  try {
    await request(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    await render();
  } catch (error) { alert.textContent = error.message; alert.hidden = false; }
}

async function createTask(event, projectId) {
  event.preventDefault();
  const input = document.querySelector('#task-title');
  const alert = document.querySelector('#task-alert');
  const title = input.value.trim();
  if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
  alert.hidden = true;
  try {
    await request(`/api/projects/${encodeURIComponent(projectId)}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    input.value = '';
    await loadTasks(projectId);
  } catch (error) { alert.textContent = error.message; alert.hidden = false; }
}

async function loadProjects() {
  const projects = await request('/api/projects');
  const filter = document.querySelector('#project-filter').value;
  const visibleProjects = projects.filter(project => project.archived === (filter === 'Archived'));
  const list = document.querySelector('#projects');
  list.replaceChildren();
  for (const project of visibleProjects) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.textContent = 'Open project';
    button.addEventListener('click', () => navigate(`/projects/${encodeURIComponent(project.id)}`));
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const stateButton = document.createElement('button');
    stateButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    stateButton.addEventListener('click', async () => {
      await request(`/api/projects/${encodeURIComponent(project.id)}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
      await loadProjects();
    });
    row.append(name, summary, button, stateButton);
    list.append(row);
  }
}

async function createProject(event) {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const alert = document.querySelector('#alert');
  const name = input.value.trim();
  if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  alert.hidden = true;
  try {
    await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    input.value = '';
    await loadProjects();
  } catch (error) { alert.textContent = error.message; alert.hidden = false; }
}

function navigate(path) { history.pushState({}, '', path); render(); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
window.addEventListener('popstate', render);
render().catch(error => { app.innerHTML = `<h1>Workboard</h1><p role="alert">${escapeHtml(error.message)}</p>`; });
