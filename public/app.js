const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  row.append(element('span', project.name));
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  row.append(open);
  return row;
}

async function renderList() {
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const create = element('button', 'Create project');
  create.type = 'submit';
  form.append(label, input, create);
  const list = element('ul');
  list.className = 'projects';
  list.setAttribute('aria-label', 'Projects');
  app.append(form, list);

  // Load before enabling creation so new rows cannot race the initial list.
  create.disabled = true;
  const projects = await api('/api/projects');
  list.append(...projects.map(projectRow));
  create.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) {
      showAlert('Project name is required');
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      create.disabled = false;
    }
  });
}

async function renderProject(id) {
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const project = await api(`/api/projects/${id}`);
  app.prepend(element('h1', project.name));
  document.title = `${project.name} · Workboard`;

  const form = element('form');
  const titleLabel = element('label', 'Task title');
  titleLabel.htmlFor = 'task-title';
  const title = element('input');
  title.type = 'text';
  title.id = 'task-title';
  title.name = 'title';
  const create = element('button', 'Create task');
  create.type = 'submit';
  create.disabled = true;
  form.append(titleLabel, title, create);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  const filters = element('div');
  filters.className = 'task-filters';
  filters.append(filterLabel, filter);
  const list = element('ul');
  list.className = 'tasks';
  list.setAttribute('aria-label', 'Tasks');
  app.append(form, filters, list);

  const tasks = await api(`/api/projects/${id}/tasks`);
  const pendingTasks = new Set();
  function renderTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('li');
      row.dataset.testid = 'task-row';
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = pendingTasks.has(task.id);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      row.append(checkbox, element('span', task.title));
      checkbox.addEventListener('change', async () => {
        pendingTasks.add(task.id);
        checkbox.disabled = true;
        app.querySelector('[role="alert"]')?.remove();
        try {
          const saved = await api(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
        } catch (error) {
          showAlert(error.message);
        } finally {
          pendingTasks.delete(task.id);
          renderTasks();
        }
      });
      list.append(row);
    }
  }
  filter.addEventListener('change', renderTasks);
  renderTasks();
  create.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const trimmedTitle = title.value.trim();
    if (!trimmedTitle) {
      showAlert('Task title is required');
      return;
    }
    create.disabled = true;
    try {
      const task = await api(`/api/projects/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      tasks.push(task);
      renderTasks();
      title.value = '';
      title.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      create.disabled = false;
    }
  });
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await renderProject(match[1]);
  else await renderList();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
