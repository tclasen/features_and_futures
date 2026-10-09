const app = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function getTasks(projectId) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) throw new Error('Could not load tasks');
  return response.json();
}

function heading(text) {
  const h = document.createElement('h1');
  h.textContent = text;
  return h;
}

async function showList() {
  app.replaceChildren(heading('Workboard'));
  const panel = document.createElement('section');
  panel.className = 'panel';
  const form = document.createElement('form');
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  field.append(label, input);
  const create = document.createElement('button');
  create.type = 'submit';
  create.textContent = 'Create project';
  form.append(field, create);
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    alert.hidden = true;
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const error = await response.json();
      alert.textContent = error.error || 'Could not create project';
      alert.hidden = false;
      return;
    }
    input.value = '';
    await render();
  });
  const rows = document.createElement('div');
  rows.className = 'rows';
  const projects = await getProjects();
  if (!projects.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No projects yet.';
    rows.append(empty);
  }
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(name, open);
    rows.append(row);
  }
  panel.append(form, alert, rows);
  app.append(panel);
}

async function showProject(id) {
  const projects = await getProjects();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    app.replaceChildren(heading('Project not found'));
    return;
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'back';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  const panel = document.createElement('section');
  panel.className = 'panel';
  const form = document.createElement('form');
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'task-title';
  label.textContent = 'Task title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  field.append(label, input);
  const create = document.createElement('button');
  create.type = 'submit';
  create.textContent = 'Create task';
  form.append(field, create);
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const filterField = document.createElement('div');
  filterField.className = 'filter-field';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'task-filter';
  filterLabel.textContent = 'Task filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    filter.append(option);
  }
  filterField.append(filterLabel, filter);
  const rows = document.createElement('div');
  rows.className = 'rows';
  let tasks = await getTasks(id);
  const drawTasks = () => {
    rows.replaceChildren();
    const visible = tasks.filter(task => filter.value === 'All' || (filter.value === 'Completed') === task.completed);
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No tasks yet.';
      rows.append(empty);
      return;
    }
    for (const task of visible) {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const name = document.createElement('span');
      name.className = 'task-title';
      name.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        if (response.ok) {
          task.completed = checkbox.checked;
          drawTasks();
        }
      });
      row.append(name, checkbox);
      rows.append(row);
    }
  };
  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    alert.hidden = true;
    const response = await fetch(`/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
    });
    if (!response.ok) {
      const error = await response.json();
      alert.textContent = error.error || 'Could not create task';
      alert.hidden = false;
      return;
    }
    tasks.push(await response.json());
    input.value = '';
    drawTasks();
  });
  drawTasks();
  panel.append(form, alert, filterField, rows);
  app.replaceChildren(back, heading(project.name), panel);
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) await showProject(decodeURIComponent(match[1]));
  else await showList();
}

render().catch(() => {
  app.replaceChildren(heading('Workboard'), Object.assign(document.createElement('p'), { textContent: 'Unable to load Workboard.' }));
});
