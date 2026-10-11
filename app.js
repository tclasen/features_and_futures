const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = document.createElement('form');
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  input.setAttribute('aria-label', 'Project name');
  form.append(input, element('button', 'Create project', { type: 'submit' }));
  const error = element('p', '', { id: 'error', role: 'alert', hidden: '' });
  const filterLabel = element('label', 'Project filter', { for: 'project-filter' });
  const filter = element('select', undefined, { id: 'project-filter' });
  filter.setAttribute('aria-label', 'Project filter');
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  const filterForList = filter;
  filter.addEventListener('change', () => populateProjects(list, filter.value === 'Archived').catch(() => {}));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      input.value = '';
      await populateProjects(list, filter.value === 'Archived');
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
    }
  });
  app.append(form, error, filterLabel, filter, list);
  await populateProjects(list, false);
}

let projectListRequest = 0;
const projectRows = new Map();
async function populateProjects(list, archived) {
  const requestId = ++projectListRequest;
  const projects = await request(`/api/projects?archived=${archived}`);
  // A slower response for the previous filter must not replace the current rows.
  if (requestId !== projectListRequest) return;
  const visibleIds = new Set(projects.map(project => String(project.id)));
  for (const [id, row] of projectRows) {
    if (!visibleIds.has(id)) {
      row.remove();
      projectRows.delete(id);
    }
  }
  for (const project of projects) {
    const id = String(project.id);
    let row = projectRows.get(id);
    if (row) {
      row.querySelector('[data-testid="project-summary"]').textContent = `${project.completedCount}/${project.totalCount} completed`;
      continue;
    }
    row = element('div', undefined, { 'data-testid': 'project-row' });
    const name = element('span', project.name);
    const summary = element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' });
    const open = element('button', 'Open project', { type: 'button' });
    open.addEventListener('click', () => { location.href = `/projects/${encodeURIComponent(project.id)}`; });
    const toggle = element('button', archived ? 'Restore project' : 'Archive project', { type: 'button' });
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        await request(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !archived }) });
        await populateProjects(list, filterForList.value === 'Archived');
      } catch { toggle.disabled = false; }
    });
    row.append(name, summary, open, toggle);
    projectRows.set(id, row);
    list.append(row);
  }
}

async function renderProject(id) {
  const project = await Promise.all([request('/api/projects?archived=false'), request('/api/projects?archived=true')]).then(groups => groups.flat().find(item => String(item.id) === id));
  if (!project) { location.replace('/'); return; }
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { location.href = '/'; });
  const heading = element('h1', project.name);
  const form = document.createElement('form');
  const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
  input.setAttribute('aria-label', 'Task title');
  const createButton = element('button', 'Create task', { type: 'submit' });
  createButton.disabled = Boolean(project.archived);
  form.append(input, createButton);
  const error = element('p', '', { id: 'error', role: 'alert', hidden: '' });
  const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
  const filter = element('select', undefined, { id: 'task-filter' });
  filter.setAttribute('aria-label', 'Task filter');
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  const list = element('section', undefined, { 'aria-label': 'Tasks' });
  const refresh = async () => {
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    const shown = tasks.filter(task => filter.value === 'All' || (filter.value === 'Completed') === Boolean(task.completed));
    list.replaceChildren(...shown.map(task => {
      const row = element('div', undefined, { 'data-testid': 'task-row' });
      row.append(element('span', task.title));
      const checkbox = element('input', undefined, { type: 'checkbox' });
      checkbox.checked = Boolean(task.completed);
      checkbox.disabled = Boolean(project.archived);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await refresh();
        } catch { checkbox.checked = !checkbox.checked; }
      });
      row.append(checkbox);
      return row;
    }));
  };
  filter.addEventListener('change', () => refresh().catch(() => {}));
  form.addEventListener('submit', async event => {
    event.preventDefault(); error.hidden = true;
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
      input.value = ''; await refresh();
    } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  });
  app.replaceChildren(back, heading, ...(project.archived ? [element('p', 'Archived project')] : []), form, error, filterLabel, filter, list);
  await refresh();
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]).catch(() => { location.replace('/'); });
else renderList().catch(() => { app.textContent = 'Unable to load projects.'; });
