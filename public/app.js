const app = document.querySelector('#app');

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function heading(text) {
  const h = document.createElement('h1');
  h.textContent = text;
  return h;
}

async function renderTasks(projectId) {
  const form = document.createElement('form');
  form.className = 'create-form';
  const label = document.createElement('label');
  label.htmlFor = 'task-title';
  label.textContent = 'Task title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.type = 'text';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Create task';
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  app.append(form);

  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'task-filter';
  filterLabel.textContent = 'Task filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = document.createElement('option');
    option.textContent = value;
    option.value = value;
    filter.append(option);
  }
  app.append(filterLabel, filter);
  const list = document.createElement('section');
  list.className = 'task-list';
  app.append(list);
  let tasks = await request(`/api/projects/${projectId}/tasks`);
  const draw = () => {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
        task.completed = checkbox.checked ? 1 : 0;
        draw();
      });
      row.append(title, checkbox);
      list.append(row);
    }
  };
  filter.addEventListener('change', draw);
  draw();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
    try {
      tasks.push(await request(`/api/projects/${projectId}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }));
      input.value = '';
      alert.hidden = true;
      draw();
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.append(heading(project.name));
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
      await renderTasks(match[1]);
      return;
    } catch {
      app.append(heading('Project not found'));
    }
    return;
  }

  app.append(heading('Workboard'));
  const form = document.createElement('form');
  form.className = 'create-form';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'projectName';
  input.type = 'text';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Create project';
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  app.append(form);

  const list = document.createElement('section');
  list.className = 'project-list';
  list.setAttribute('aria-label', 'Projects');
  app.append(list);
  const projects = await request('/api/projects');
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, open);
    list.append(row);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      render();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
render();
