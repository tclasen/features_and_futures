const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project, onArchiveChange) {
  const row = element('li', '', { 'data-testid': 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      app.querySelector('[role="alert"]')?.remove();
      onArchiveChange();
    } catch (error) {
      showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  const details = element('div', '', { class: 'project-details' });
  details.append(element('span', project.name), element('span',
    `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' }));
  const actions = element('div', '', { class: 'project-actions' });
  actions.append(open, archive);
  row.append(details, actions);
  return row;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  let projects = [];
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, create);
  const list = element('ul', '', { 'aria-label': 'Projects', class: 'projects' });
  const filter = element('select', '', { id: 'project-filter' });
  for (const option of ['Active', 'Archived']) {
    filter.append(element('option', option, { value: option }));
  }
  const filters = element('div', '', { class: 'project-filters' });
  filters.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  function renderProjects() {
    const visible = projects.filter((project) => project.archived === (filter.value === 'Archived'));
    list.replaceChildren(...visible.map((project) => projectRow(project, renderProjects)));
  }
  filter.addEventListener('change', renderProjects);
  app.append(form, filters, list);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (create.disabled) return;
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      renderProjects();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      create.disabled = false;
    }
  });
  // Load the persisted list before allowing writes so initial rows stay in order.
  create.disabled = true;
  try {
    projects = await request('/api/projects');
    renderProjects();
    create.disabled = false;
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

async function showProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  try {
    const project = await request(`/api/projects/${id}`);
    app.append(element('h1', project.name));
    document.title = `${project.name} · Workboard`;
    if (project.archived) app.append(element('p', 'Archived project'));
    await showTasks(id, project.archived);
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

async function showTasks(projectId, archived) {
  const path = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  const form = element('form');
  const input = element('input', '', { id: 'task-title', name: 'title', type: 'text' });
  const create = element('button', 'Create task', { type: 'submit' });
  create.disabled = true;
  form.append(element('label', 'Task title', { for: 'task-title' }), input, create);
  const filter = element('select', '', { id: 'task-filter' });
  for (const option of ['All', 'Open', 'Completed']) {
    filter.append(element('option', option, { value: option }));
  }
  const filters = element('div', '', { class: 'task-filters' });
  filters.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('ul', '', { 'aria-label': 'Tasks', class: 'tasks' });
  app.append(form, filters, list);

  function renderTasks() {
    const visible = tasks.filter((task) => filter.value === 'All'
      || (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map((task) => {
      const row = element('li', '', { 'data-testid': 'task-row' });
      const checkbox = element('input', '', {
        type: 'checkbox', 'aria-label': `Complete ${task.title}`,
      });
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const saved = await request(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          app.querySelector('[role="alert"]')?.remove();
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = archived;
        }
      });
      row.append(checkbox, element('span', task.title));
      return row;
    }));
  }

  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (create.disabled) return;
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    create.disabled = true;
    try {
      const task = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      create.disabled = archived;
    }
  });
  tasks = await request(path);
  renderTasks();
  create.disabled = archived;
}

const projectRoute = window.location.pathname.match(/^\/projects\/(\d+)$/);
try {
  if (projectRoute) await showProject(projectRoute[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
}
