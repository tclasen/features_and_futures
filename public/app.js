const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert', class: 'error' });
    app.append(alert);
  }
  alert.textContent = message;
}

async function renderTasks(project) {
  const archived = Boolean(project.archived);
  const path = `/api/projects/${project.id}/tasks`;
  const form = element('form');
  const input = element('input', undefined, { id: 'task-title', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create task', { type: 'submit' });
  form.append(element('label', 'Task title', { for: 'task-title' }), input, create);
  const controls = element('div', undefined, { class: 'task-controls' });
  const filter = element('select', undefined, { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  controls.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('section', undefined, { 'aria-label': 'Tasks', class: 'project-list' });
  app.append(form, controls, list);
  let tasks = [];

  function drawTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'project-row' });
      const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        app.querySelector('[role="alert"]')?.remove();
        try {
          const updated = await request(`${path}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked })
          });
          Object.assign(task, updated);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally { checkbox.disabled = false; }
      });
      row.append(element('span', task.title), checkbox);
      list.append(row);
    }
  }
  filter.addEventListener('change', drawTasks);
  create.disabled = true;
  try { tasks = await request(path); drawTasks(); }
  catch (error) { showError(error.message); }
  finally { create.disabled = archived; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (archived) return;
    app.querySelector('[role="alert"]')?.remove();
    const title = input.value.trim();
    if (!title) { showError('Task title is required'); return; }
    create.disabled = true;
    try {
      tasks.push(await request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
      }));
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) { showError(error.message); }
    finally { create.disabled = archived; }
  });
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects', { type: 'button', class: 'secondary' });
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back);
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.append(element('h1', project.name));
      document.title = `${project.name} · Workboard`;
      if (project.archived) app.append(element('p', 'Archived project'));
      await renderTasks(project);
    } catch (error) { showError(error.message); }
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, create);
  const list = element('section', undefined, { 'aria-label': 'Projects', class: 'project-list' });
  const controls = element('div', undefined, { class: 'task-controls' });
  const filter = element('select', undefined, { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  controls.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  app.append(form, controls, list);
  let projects = [];

  function drawProjects() {
    list.replaceChildren();
    projects.filter(project => Boolean(project.archived) === (filter.value === 'Archived')).forEach(addProject);
  }
  filter.addEventListener('change', drawProjects);

  function addProject(project) {
    const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
    const open = element('button', 'Open project', { type: 'button', class: 'secondary' });
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button', class: 'secondary' });
    archive.addEventListener('click', async () => {
      archive.disabled = true;
      app.querySelector('[role="alert"]')?.remove();
      try {
        Object.assign(project, await request(`/api/projects/${project.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived })
        }));
        drawProjects();
      } catch (error) { showError(error.message); }
      finally { archive.disabled = false; }
    });
    row.append(element('span', project.name),
      element('span', `${project.completed}/${project.total} completed`, { 'data-testid': 'project-summary' }), open, archive);
    list.append(row);
  }

  create.disabled = true;
  try {
    projects = await request('/api/projects');
    drawProjects();
  } catch (error) { showError(error.message); }
  create.disabled = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) { showError('Project name is required'); return; }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      input.focus();
    } catch (error) { showError(error.message); }
    finally { create.disabled = false; }
  });
}

render();
