const app = document.querySelector('#app');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    try {
      const project = await request(`/api/projects/${match[1]}`);
      const back = element('button', 'Projects', 'secondary');
      back.type = 'button';
      back.addEventListener('click', () => go('/'));
      app.append(back, element('h1', project.name));
      await showTasks(app, project.id);
    } catch {
      app.append(element('h1', 'Project not found'));
      const back = element('button', 'Projects', 'secondary');
      back.addEventListener('click', () => go('/'));
      app.append(back);
    }
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  const alert = element('p', undefined, 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      input.value = '';
      alert.hidden = true;
      await showProjects(list);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  const list = element('section', undefined, 'projects');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, list);
  await showProjects(list);
}

async function showTasks(container, projectId) {
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  const alert = element('p', undefined, 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) filter.append(new Option(value, value));
  const list = element('section', undefined, 'tasks');
  list.setAttribute('aria-label', 'Tasks');

  async function refresh() {
    const tasks = await request(`/api/projects/${projectId}/tasks`);
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = element('article', undefined, 'task-row');
      row.dataset.testid = 'task-row';
      row.append(element('span', task.title));
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await refresh();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      row.append(checkbox);
      list.append(row);
    }
  }
  filter.addEventListener('change', refresh);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
    try {
      await request(`/api/projects/${projectId}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      input.value = '';
      alert.hidden = true;
      await refresh();
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
  container.append(form, filterLabel, filter, list);
  try { await refresh(); } catch (error) { list.append(element('p', error.message, 'alert')); }
}

async function showProjects(list) {
  try {
    const projects = await request('/api/projects');
    list.replaceChildren();
    for (const project of projects) {
      const row = element('article', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name));
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => go(`/projects/${project.id}`));
      row.append(open);
      list.append(row);
    }
  } catch (error) {
    list.replaceChildren(element('p', error.message, 'alert'));
  }
}

window.addEventListener('popstate', render);
render();
