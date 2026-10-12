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

function projectRow(project) {
  const row = element('li', '', { 'data-testid': 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), open);
  return row;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, create);
  const list = element('ul', '', { 'aria-label': 'Projects', class: 'projects' });
  app.append(form, list);
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
      list.append(projectRow(project));
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
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
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
    await showTasks(id);
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

async function showTasks(projectId) {
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
          checkbox.disabled = false;
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
      create.disabled = false;
    }
  });
  tasks = await request(path);
  renderTasks();
  create.disabled = false;
}

const projectRoute = window.location.pathname.match(/^\/projects\/(\d+)$/);
try {
  if (projectRoute) await showProject(projectRoute[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
}
