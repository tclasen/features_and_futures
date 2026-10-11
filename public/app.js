const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
  alert.hidden = !message;
}

function projectRow(project, onUpdate) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const updated = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, updated);
      showAlert('');
      onUpdate();
    } catch (error) { showAlert(error.message); archive.disabled = false; }
  });
  row.append(element('span', project.name),
    element('span', `${project.completed}/${project.total} completed`, { 'data-testid': 'project-summary' }),
    open, archive);
  return row;
}

async function renderTasks(project) {
  const endpoint = `/api/projects/${project.id}/tasks`;
  const form = element('form');
  const input = element('input', '', { id: 'task-title', type: 'text', autocomplete: 'off' });
  const submit = element('button', 'Create task', { type: 'submit' });
  submit.disabled = true;
  const controls = element('div', '', { class: 'controls' });
  controls.append(input, submit);
  form.append(element('label', 'Task title', { for: 'task-title' }), controls);
  const filter = element('select', '', { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'filters' });
  filters.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('section', '', { 'aria-label': 'Tasks', class: 'tasks' });
  app.append(form, element('p', '', { role: 'alert', hidden: '' }), filters, list);
  let tasks = [];
  function drawTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', '', { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', '', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = Boolean(project.archived);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const updated = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, updated);
          showAlert('');
        } catch (error) { showAlert(error.message); }
        finally { drawTasks(); }
      });
      row.append(checkbox, element('span', task.title));
      list.append(row);
    }
  }
  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const title = input.value.trim();
    if (!title) return showAlert('Task title is required');
    submit.disabled = true;
    try {
      tasks.push(await request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }));
      drawTasks();
      input.value = '';
      showAlert('');
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = Boolean(project.archived); }
  });
  tasks = await request(endpoint);
  drawTasks();
  submit.disabled = Boolean(project.archived);
}

async function render() {
  app.replaceChildren();
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await request(`/api/projects/${match[1]}`);
    document.title = `${project.name} · Workboard`;
    app.append(element('h1', project.name));
    if (project.archived) app.append(element('p', 'Archived project'));
    await renderTasks(project);
    return;
  }
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const submit = element('button', 'Create project', { type: 'submit' });
  submit.disabled = true;
  const controls = element('div', '', { class: 'controls' });
  controls.append(input, submit);
  form.append(label, controls);
  const list = element('section', '', { 'aria-label': 'Projects', class: 'projects' });
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const filter = element('select', '', { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'filters' });
  filters.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  app.append(form, alert, filters, list);
  let projects = [];
  function drawProjects() {
    list.replaceChildren();
    for (const project of projects) {
      if (Boolean(project.archived) === (filter.value === 'Archived')) {
        list.append(projectRow(project, drawProjects));
      }
    }
  }
  filter.addEventListener('change', drawProjects);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showAlert('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      showAlert('');
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
  projects = await request('/api/projects');
  drawProjects();
  submit.disabled = false;
}

render().catch(error => showAlert(error.message)).finally(() => app.setAttribute('aria-busy', 'false'));
