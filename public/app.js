const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) {
    let project;
    try { project = await request(`/api/projects/${encodeURIComponent(match[1])}`); }
    catch { project = null; }
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { history.pushState({}, '', '/'); render(); });
    app.append(back);
    if (!project) {
      app.append(element('p', { role: 'alert' }, 'Project not found'));
      return;
    }
    app.append(element('h1', {}, project.name));
    const form = element('form');
    const label = element('label', { for: 'task-title' }, 'Task title');
    const input = element('input', { id: 'task-title', name: 'title', type: 'text' });
    const submit = element('button', { type: 'submit' }, 'Create task');
    const alert = element('p', { role: 'alert', hidden: '' });
    form.append(label, input, submit, alert);
    const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
    const filter = element('select', { id: 'task-filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', { value }, value));
    const tasks = element('section', { 'aria-label': 'Tasks' });
    app.append(form, filterLabel, filter, tasks);
    const refresh = async () => {
      const items = await request(`/api/projects/${encodeURIComponent(match[1])}/tasks`);
      tasks.replaceChildren();
      for (const task of items) {
        if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
        const row = element('div', { 'data-testid': 'task-row', class: 'project-row' });
        row.append(element('span', {}, task.title));
        const checkbox = element('input', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
        checkbox.checked = Boolean(task.completed);
        checkbox.addEventListener('change', async () => {
          await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await refresh();
        });
        row.append(checkbox);
        tasks.append(row);
      }
    };
    filter.addEventListener('change', refresh);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        alert.textContent = 'Task title is required';
        alert.hidden = false;
        input.focus();
        return;
      }
      try {
        await request(`/api/projects/${encodeURIComponent(match[1])}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
        input.value = '';
        alert.hidden = true;
        await refresh();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    await refresh();
    return;
  }

  app.append(element('h1', {}, 'Workboard'));
  const form = element('form');
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text', required: 'true' });
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', hidden: '' });
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async event => {
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
  app.append(form);
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(list);
  await showProjects(list);
}

async function showProjects(list) {
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
      render();
    });
    row.append(open);
    list.append(row);
  }
}

window.addEventListener('popstate', render);
render().catch(error => {
  app.replaceChildren(element('p', { role: 'alert' }, error.message));
});
