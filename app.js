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
  const filter = element('select', undefined, { id: 'project-filter', 'aria-label': 'Project filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      input.value = '';
      await populateProjects(list, filter.value);
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
    }
  });
  filter.addEventListener('change', () => populateProjects(list, filter.value).catch(() => {}));
  app.append(form, error, filterLabel, filter, list);
  await populateProjects(list, filter.value);
}

let projectListRequest = 0;
async function populateProjects(list, filter = 'Active') {
  const requestId = ++projectListRequest;
  const projects = await request('/api/projects');
  // Ignore responses from an earlier filter/action request so stale data cannot
  // replace the current list after a faster request has already completed.
  if (requestId !== projectListRequest) return;
  list.replaceChildren(...projects.filter(project => Boolean(project.archived) === (filter === 'Archived')).map(project => {
    const row = element('div', undefined, { 'data-testid': 'project-row' });
    const summary = element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' });
    const open = element('button', 'Open project', { type: 'button' });
    open.addEventListener('click', () => { location.href = `/projects/${encodeURIComponent(project.id)}`; });
    const action = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
    action.addEventListener('click', async () => {
      await request(`/api/projects/${encodeURIComponent(project.id)}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
      await populateProjects(list, filter);
    });
    row.append(element('span', project.name), summary, open, action);
    return row;
  }));
}

async function renderProject(id) {
  const project = await request('/api/projects').then(projects => projects.find(item => String(item.id) === id));
  if (!project) { location.replace('/'); return; }
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { location.href = '/'; });
  const heading = element('h1', project.name);
  const archivedNotice = project.archived ? element('p', 'Archived project') : null;
  const form = document.createElement('form');
  const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
  input.setAttribute('aria-label', 'Task title');
  const createButton = element('button', 'Create task', { type: 'submit' });
  form.append(input, createButton);
  if (project.archived) { input.disabled = true; createButton.disabled = true; }
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
  app.replaceChildren(back, heading, ...(archivedNotice ? [archivedNotice] : []), form, error, filterLabel, filter, list);
  await refresh();
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]).catch(() => { location.replace('/'); });
else renderList().catch(() => { app.textContent = 'Unable to load projects.'; });
