const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.testId) node.dataset.testid = options.testId;
  if (options.className) node.className = options.className;
  return node;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function renderList(archived = false) {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text'; input.id = 'project-name'; input.autocomplete = 'off'; label.htmlFor = input.id;
  const create = element('button', { text: 'Create project' }); create.type = 'submit';
  const alert = element('p', { className: 'alert' }); alert.setAttribute('role', 'alert'); alert.hidden = true;
  form.append(label, input, create, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      await renderList();
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
  app.append(form);
  const filterLabel = element('label', { text: 'Project filter' }); filterLabel.htmlFor = 'project-filter';
  const filter = element('select'); filter.id = 'project-filter';
  for (const [value, text] of [['false', 'Active'], ['true', 'Archived']]) { const option = element('option', { text }); option.value = value; filter.append(option); }
  filter.value = String(archived);
  filter.addEventListener('change', () => renderList(filter.value === 'true'));
  app.append(filterLabel, filter);
  const list = element('section', { className: 'project-list' });
  for (const project of await request(`/api/projects?archived=${archived}`)) {
    const row = element('article', { testId: 'project-row', className: 'project-row' });
    row.append(element('span', { text: project.name }));
    const summary = element('span', { text: `${project.completedCount}/${project.totalCount} completed`, testId: 'project-summary' });
    row.append(summary);
    const open = element('button', { text: 'Open project' }); open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(open);
    const archive = element('button', { text: archived ? 'Restore project' : 'Archive project' }); archive.type = 'button';
    archive.addEventListener('click', async () => {
      await request(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !archived }) });
      await renderList(archived);
    });
    row.append(archive); list.append(row);
  }
  app.append(list);
}

async function renderProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  app.replaceChildren();
  const back = element('button', { text: 'Projects' }); back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', { text: project.name }));
  if (project.archived) app.append(element('p', { text: 'Archived project' }));

  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Task title' });
  const input = element('input'); input.type = 'text'; input.id = 'task-title'; input.autocomplete = 'off'; label.htmlFor = input.id;
  const create = element('button', { text: 'Create task' }); create.type = 'submit'; create.disabled = Boolean(project.archived);
  const alert = element('p', { className: 'alert' }); alert.setAttribute('role', 'alert'); alert.hidden = true;
  form.append(label, input, create, alert);
  const filterLabel = element('label', { text: 'Task filter' }); filterLabel.htmlFor = 'task-filter';
  const filter = element('select'); filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) { const option = element('option', { text: value }); option.value = value; filter.append(option); }
  const list = element('section', { className: 'task-list' });
  async function refreshTasks() {
    list.replaceChildren();
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = element('article', { testId: 'task-row', className: 'task-row' });
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(task.completed);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`); checkbox.disabled = Boolean(project.archived);
      checkbox.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await refreshTasks();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      row.append(checkbox, element('span', { text: task.title })); list.append(row);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
      await refreshTasks(); input.value = ''; alert.hidden = true;
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
  filter.addEventListener('change', refreshTasks);
  app.append(form, filterLabel, filter, list);
  await refreshTasks();
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]).catch(() => { location.href = '/'; });
else renderList().catch(error => { app.replaceChildren(element('p', { text: error.message, className: 'alert' })); });
