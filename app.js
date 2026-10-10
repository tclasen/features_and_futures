const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Something went wrong');
  return value;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', {}, 'Workboard'));

  const form = element('form', { class: 'project-form' });
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { class: 'alert', role: 'alert', hidden: '' });
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      alert.hidden = true;
      await renderProjects();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  app.append(form, alert, element('div', { id: 'project-list', class: 'project-list' }));
  await renderProjects();
}

async function renderProjects() {
  const list = document.querySelector('#project-list');
  if (!list) return;
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(open);
    list.append(row);
  }
}

async function showProject(id) {
  app.replaceChildren();
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    app.append(element('h1', {}, project.name));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const form = element('form', { class: 'task-form' });
    const label = element('label', { for: 'task-title' }, 'Task title');
    const input = element('input', { id: 'task-title', name: 'title', type: 'text' });
    const submit = element('button', { type: 'submit' }, 'Create task');
    const alert = element('p', { class: 'alert', role: 'alert', hidden: '' });
    form.append(label, input, submit);
    const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
    const filter = element('select', { id: 'task-filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', { value }, value));
    const list = element('div', { class: 'task-list' });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        alert.textContent = 'Task title is required';
        alert.hidden = false;
        return;
      }
      try {
        await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
        });
        input.value = '';
        alert.hidden = true;
        await renderTasks(id, filter.value, list);
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    filter.addEventListener('change', () => renderTasks(id, filter.value, list));
    app.append(form, alert, filterLabel, filter, list);
    await renderTasks(id, filter.value, list);
  } catch {
    app.append(element('h1', {}, 'Project not found'));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

async function renderTasks(projectId, filter, list) {
  const tasks = await request(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
  list.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
    const row = element('div', { 'data-testid': 'task-row', class: 'task-row' });
    row.append(element('span', {}, task.title));
    const checkboxId = `task-${task.id}`;
    const checkbox = element('input', { id: checkboxId, type: 'checkbox' });
    checkbox.checked = task.completed;
    const label = element('label', { for: checkboxId }, `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }),
        });
        await renderTasks(projectId, filter, list);
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        console.error(error);
      }
    });
    row.append(checkbox, label);
    list.append(row);
  }
}

const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
