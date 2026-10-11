const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function projectsButton() {
  const button = element('button', 'Projects', { type: 'button', class: 'secondary' });
  button.addEventListener('click', () => { window.location.href = '/'; });
  return button;
}

function projectRow(project) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const name = element('span', project.name, { class: 'project-name' });
  const button = element('button', 'Open project', { type: 'button', class: 'secondary' });
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, button);
  return row;
}

async function renderTasks(projectId) {
  const form = element('form');
  const input = element('input', '', { id: 'task-title', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create task', { type: 'submit' });
  const fields = element('div', '', { class: 'fields' });
  fields.append(input, create);
  const alert = element('p', '', { role: 'alert', hidden: '' });
  form.append(element('label', 'Task title', { for: 'task-title' }), fields, alert);
  const filter = element('select', '', { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) {
    filter.append(element('option', value, { value }));
  }
  const filters = element('div', '', { class: 'task-filters' });
  filters.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('section', '', { 'aria-label': 'Tasks', class: 'projects' });
  app.append(form, filters, list);
  const path = `/api/projects/${projectId}/tasks`;
  const tasks = await api(path);

  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }

  function showTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', '', { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', '', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const updated = await api(`${path}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = updated.completed;
          showTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(checkbox, element('span', task.title, { class: 'task-title' }));
      list.append(row);
    }
  }

  filter.addEventListener('change', showTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) {
      showError(new Error('Task title is required'));
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      tasks.push(await api(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }));
      showTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error);
    } finally {
      create.disabled = false;
    }
  });
  showTasks();
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  app.replaceChildren();
  if (match) {
    app.append(projectsButton());
    const project = await api(`/api/projects/${match[1]}`);
    app.append(element('h1', project.name));
    document.title = `${project.name} · Workboard`;
    await renderTasks(project.id);
    return;
  }
  app.append(element('h1', 'Workboard'), element('p', 'A home for your projects.', { class: 'subtitle' }));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit' });
  const fields = element('div', '', { class: 'fields' });
  fields.append(input, create);
  const alert = element('p', '', { role: 'alert', hidden: '' });
  form.append(label, fields, alert);
  const list = element('section', '', { 'aria-label': 'Projects', class: 'projects' });
  const empty = element('p', 'No projects yet. Create your first project above.', { class: 'empty' });
  app.append(form, list);
  const projects = await api('/api/projects');
  list.append(...projects.map(projectRow));
  if (!projects.length) list.append(empty);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      empty.remove();
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      create.disabled = false;
    }
  });
}

render().catch((error) => {
  app.append(element('p', error.message, { role: 'alert' }));
}).finally(() => app.setAttribute('aria-busy', 'false'));
