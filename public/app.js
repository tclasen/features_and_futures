const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}
function alertMessage(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}
function projectRow(project, onUpdate) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onUpdate(saved);
      app.querySelector('[role="alert"]')?.remove();
    } catch (error) { alertMessage(error.message); }
    finally { archive.disabled = false; }
  });
  row.append(element('span', project.name),
    element('span', `${project.completed}/${project.total} completed`, { 'data-testid': 'project-summary' }),
    open, archive);
  return row;
}
function renderRename(project, heading) {
  const form = element('form');
  const input = element('input', '', { id: 'new-project-name', type: 'text', autocomplete: 'off' });
  const rename = element('button', 'Rename project', { type: 'submit' });
  input.value = project.name;
  input.disabled = Boolean(project.archived);
  rename.disabled = Boolean(project.archived);
  form.append(element('label', 'New project name', { for: 'new-project-name' }), input, rename);
  app.append(form);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const name = input.value.trim();
    if (!name) { alertMessage('Project name is required'); return; }
    rename.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = saved.name;
      heading.textContent = saved.name;
      document.title = `${saved.name} — Workboard`;
      input.value = saved.name;
      app.querySelector('[role="alert"]')?.remove();
    } catch (error) { alertMessage(error.message); }
    finally { rename.disabled = Boolean(project.archived); }
  });
}
async function renderTasks(project) {
  const path = `/api/projects/${project.id}/tasks`;
  const archived = Boolean(project.archived);
  let tasks = [];
  const form = element('form');
  const input = element('input', '', { id: 'task-title', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create task', { type: 'submit' });
  form.append(element('label', 'Task title', { for: 'task-title' }), input, create);
  const filter = element('select', '', { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'task-filters' });
  filters.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('section', '', { 'aria-label': 'Tasks' });
  app.append(form, filters, list);
  function draw() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', '', { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', '', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const saved = await request(`${path}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          app.querySelector('[role="alert"]')?.remove();
          draw();
        } catch (error) {
          checkbox.checked = task.completed;
          alertMessage(error.message);
        } finally { checkbox.disabled = false; }
      });
      row.append(checkbox, element('span', task.title));
      list.append(row);
    }
  }
  filter.addEventListener('change', draw);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (archived) return;
    const title = input.value.trim();
    if (!title) { alertMessage('Task title is required'); return; }
    create.disabled = true;
    try {
      tasks.push(await request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }));
      draw();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) { alertMessage(error.message); }
    finally { create.disabled = archived; }
  });
  create.disabled = true;
  try { tasks = await request(path); draw(); }
  catch (error) { alertMessage(error.message); }
  finally { create.disabled = archived; }
}
async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    try {
      const project = await request(`/api/projects/${match[1]}`);
      document.title = `${project.name} — Workboard`;
      const heading = element('h1', project.name);
      app.append(heading);
      if (project.archived) app.append(element('p', 'Archived project'));
      renderRename(project, heading);
      await renderTasks(project);
    } catch (error) { alertMessage(error.message); }
    return;
  }
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, create);
  const list = element('section', '', { 'aria-label': 'Projects', class: 'projects' });
  const filter = element('select', '', { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'task-filters' });
  filters.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  let projects = [];
  function drawProjects() {
    list.replaceChildren();
    for (const project of projects) {
      if (Boolean(project.archived) !== (filter.value === 'Archived')) continue;
      list.append(projectRow(project, saved => {
        projects = projects.map(item => item.id === saved.id ? saved : item);
        drawProjects();
      }));
    }
  }
  filter.addEventListener('change', drawProjects);
  app.append(form, filters, list);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alertMessage('Project name is required'); return; }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) { alertMessage(error.message); }
    finally { create.disabled = false; }
  });
  create.disabled = true;
  try {
    projects = await request('/api/projects');
    drawProjects();
  } catch (error) { alertMessage(error.message); }
  finally { create.disabled = false; }
}
render();
