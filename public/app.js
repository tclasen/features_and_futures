const view = document.querySelector('#project-view');
const pathMatch = location.pathname.match(/^\/projects\/(\d+)\/?$/);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showProjects() {
  view.replaceChildren();
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const button = element('button', 'Create project');
  button.type = 'submit';
  const alert = element('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) filter.append(new Option(value, value));
  filterLabel.append(filter);
  const list = element('div', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  view.append(form, filterLabel, list);

  async function refresh() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    list.replaceChildren();
    for (const project of projects) {
      if (Boolean(project.archived) !== (filter.value === 'Archived')) continue;
      const row = element('article', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name, 'project-name'));
      const summary = element('span', `${project.completedCount}/${project.totalCount} completed`);
      summary.dataset.testid = 'project-summary';
      row.append(summary);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      const action = element('button', project.archived ? 'Restore project' : 'Archive project');
      action.type = 'button';
      action.addEventListener('click', async () => {
        await fetch(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
        await refresh();
      });
      row.append(action);
      list.append(row);
    }
  }
  filter.addEventListener('change', refresh);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const result = await response.json();
      alert.textContent = result.error;
      alert.hidden = false;
      return;
    }
    input.value = '';
    alert.hidden = true;
    await refresh();
  });
  await refresh();
}

async function showProject(id) {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    view.append(element('h2', 'Project not found'));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => { location.href = '/'; });
    view.append(back);
    return;
  }
  const back = element('button', 'Projects', 'back-button');
  back.addEventListener('click', () => { location.href = '/'; });
  view.append(back, element('h2', project.name));
  if (project.archived) view.append(element('p', 'Archived project'));

  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.type = 'text';
  input.autocomplete = 'off';
  const create = element('button', 'Create task');
  create.type = 'submit';
  const alert = element('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  if (project.archived) create.disabled = true;
  form.append(label, input, create, alert);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) filter.append(new Option(value, value));
  filterLabel.append(filter);
  const list = element('div', undefined, 'task-list');
  view.append(form, filterLabel, list);

  async function refresh() {
    const tasksResponse = await fetch(`/api/projects/${id}/tasks`);
    const tasks = await tasksResponse.json();
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = element('article', undefined, 'task-row');
      row.dataset.testid = 'task-row';
      row.append(element('span', task.title, 'project-name'));
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.disabled = Boolean(project.archived);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
        await refresh();
      });
      row.append(checkbox);
      list.append(row);
    }
  }
  filter.addEventListener('change', refresh);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      return;
    }
    const result = await fetch(`/api/projects/${id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!result.ok) {
      alert.textContent = (await result.json()).error;
      alert.hidden = false;
      return;
    }
    input.value = '';
    alert.hidden = true;
    await refresh();
  });
  await refresh();
}

if (pathMatch) showProject(pathMatch[1]);
else showProjects();
