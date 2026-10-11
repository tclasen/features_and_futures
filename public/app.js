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

function projectRow(project, onArchive, onError) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const name = element('span', project.name, { class: 'project-name' });
  const button = element('button', 'Open project', { type: 'button', class: 'secondary' });
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const summary = element('span', `${project.completed}/${project.total} completed`, { 'data-testid': 'project-summary', class: 'project-summary' });
  const details = element('div', '', { class: 'project-details' });
  details.append(name, summary);
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button', class: 'secondary' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const updated = await api(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, updated);
      onArchive();
    } catch (error) {
      onError(error);
      archive.disabled = false;
    }
  });
  const actions = element('div', '', { class: 'project-actions' });
  actions.append(button, archive);
  row.append(details, actions);
  return row;
}

async function renderTasks(project) {
  const projectId = project.id;
  const form = element('form');
  const input = element('input', '', { id: 'task-title', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create task', { type: 'submit' });
  create.disabled = project.archived;
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
      checkbox.disabled = project.archived;
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
          checkbox.disabled = project.archived;
        }
      });
      row.append(checkbox, element('span', task.title, { class: 'task-title' }));
      list.append(row);
    }
  }

  filter.addEventListener('change', showTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
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
      create.disabled = project.archived;
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
    if (project.archived) app.append(element('p', 'Archived project', { class: 'archive-notice' }));
    await renderTasks(project);
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
  const filter = element('select', '', { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'task-filters' });
  filters.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  app.append(form, filters, list);
  const projects = await api('/api/projects');
  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
  function showProjects() {
    alert.hidden = true;
    const visible = projects.filter((project) => project.archived === (filter.value === 'Archived'));
    list.replaceChildren(...visible.map((project) => projectRow(project, showProjects, showError)));
    if (!visible.length) list.append(element('p', filter.value === 'Active' ? 'No active projects. Create a project above.' : 'No archived projects.', { class: 'empty' }));
  }
  filter.addEventListener('change', showProjects);
  showProjects();
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
      projects.push(project);
      showProjects();
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
