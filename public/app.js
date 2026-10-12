const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', undefined, { role: 'alert', class: 'alert' });
    app.querySelector('form').after(alert);
  }
  alert.textContent = message;
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', name: 'name' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(input, create);
  app.append(form);
  const filter = element('select', undefined, { 'aria-label': 'Project filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  app.append(filter);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(list);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const error = await response.json();
      showError(error.error || 'Could not create project');
      return;
    }
    const project = await response.json();
    input.value = '';
    app.querySelector('[role="alert"]')?.remove();
    await renderProjects();
  });
  const renderProjects = async () => {
    const projects = await loadProjects();
    list.replaceChildren();
    for (const project of projects) {
      if (filter.value === 'Active' && project.archived || filter.value === 'Archived' && !project.archived) continue;
      list.append(projectRow(project, renderProjects));
    }
  };
  filter.addEventListener('change', () => renderProjects().catch(() => showError('Could not load projects')));
  await renderProjects();
}

function projectRow(project, refresh) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  row.append(element('span', project.name));
  row.append(element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' }));
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
  row.append(open);
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    const response = await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
    if (response.ok) await refresh();
  });
  row.append(archive);
  return row;
}

async function renderProject(id) {
  const projects = await loadProjects();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    app.append(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    return;
  }
  const heading = element('h1', project.name);
  app.append(heading);
  if (project.archived) app.append(element('p', 'Archived project'));
  const renameForm = element('form');
  const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New project name', name: 'name' });
  const renameButton = element('button', 'Rename project', { type: 'submit' });
  renameInput.disabled = project.archived;
  renameButton.disabled = project.archived;
  renameForm.append(renameInput, renameButton);
  app.append(renameForm);
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) { showError('Project name is required'); renameInput.focus(); return; }
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) { const error = await response.json(); showError(error.error || 'Could not rename project'); return; }
    heading.textContent = name;
    renameInput.value = '';
    app.querySelector('[role="alert"]')?.remove();
  });
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);

  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Task title', name: 'title' });
  const createTask = element('button', 'Create task', { type: 'submit' });
  createTask.disabled = project.archived;
  input.disabled = project.archived;
  form.append(input, createTask);
  app.append(form);
  const filterLabel = element('label', 'Task filter');
  const filter = element('select', undefined, { 'aria-label': 'Task filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  filterLabel.append(filter);
  app.append(filterLabel);
  const list = element('section', undefined, { 'aria-label': 'Tasks' });
  app.append(list);

  const renderTasks = async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`);
    if (!response.ok) throw new Error('Could not load tasks');
    const tasks = await response.json();
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'project-row' });
      row.append(element('span', task.title));
      const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.addEventListener('change', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
        });
        if (!update.ok) showError('Could not update task');
        else await renderTasks();
      });
      row.append(checkbox);
      list.append(row);
    }
  };
  filter.addEventListener('change', () => renderTasks().catch(() => showError('Could not load tasks')));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) { showError('Task title is required'); input.focus(); return; }
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
    });
    if (!response.ok) { const error = await response.json(); showError(error.error || 'Could not create task'); return; }
    input.value = '';
    app.querySelector('[role="alert"]')?.remove();
    await renderTasks();
  });
  await renderTasks();
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1])).catch(() => showError('Could not load project'));
else renderList().catch(() => showError('Could not load projects'));
