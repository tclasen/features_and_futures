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

function projectRow(project, onArchiveChange) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  row.append(element('span', project.name));
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const summary = element('span', `${project.completedCount}/${project.totalCount} completed`);
  summary.dataset.testid = 'project-summary';
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
  archive.type = 'button';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    app.querySelector('[role="alert"]')?.remove();
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      onArchiveChange();
    } catch (error) {
      showAlert(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(summary, open, archive);
  return row;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
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
  let projects = [];
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  const filters = element('div');
  filters.className = 'project-filter';
  filters.append(filterLabel, filter);
  function renderProjects() {
    list.replaceChildren(...projects
      .filter((project) => Boolean(project.archived) === (filter.value === 'Archived'))
      .map((project) => projectRow(project, renderProjects)));
  }
  filter.addEventListener('change', renderProjects);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (create.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) {
      showAlert('Project name is required');
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      renderProjects();
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      create.disabled = false;
    }
  });
  app.append(form, filters, list);
  // Enable creation only after the initial list has loaded, preserving ordering.
  create.disabled = true;
  try {
    projects = await api('/api/projects');
    renderProjects();
    create.disabled = false;
  } catch (error) {
    showAlert(error.message);
  }
}

async function showTasks(projectId, archived) {
  const endpoint = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  const saving = new Set();
  const form = element('form');
  const titleLabel = element('label', 'Task title');
  titleLabel.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  const create = element('button', 'Create task');
  create.type = 'submit';
  create.disabled = true;
  form.append(titleLabel, input, create);

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
  filters.className = 'task-filter';
  filters.append(filterLabel, filter);
  const list = element('ul');
  list.className = 'tasks';

  function renderTasks() {
    const visible = tasks.filter((task) => filter.value === 'All'
      || (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map((task) => {
      const row = element('li');
      row.dataset.testid = 'task-row';
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = archived || saving.has(task.id);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        saving.add(task.id);
        checkbox.disabled = true;
        app.querySelector('[role="alert"]')?.remove();
        try {
          const saved = await api(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
        } catch (error) {
          checkbox.checked = task.completed;
          showAlert(error.message);
        } finally {
          saving.delete(task.id);
          renderTasks();
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
    app.querySelector('[role="alert"]')?.remove();
    const title = input.value.trim();
    if (!title) {
      showAlert('Task title is required');
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      const task = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      create.disabled = archived;
    }
  });
  app.append(form, filters, list);
  tasks = await api(endpoint);
  renderTasks();
  create.disabled = archived;
}

async function showProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => location.assign('/'));
  app.append(back);
  try {
    const project = await api(`/api/projects/${id}`);
    document.title = `${project.name} — Workboard`;
    app.prepend(element('h1', project.name));
    if (project.archived) app.append(element('p', 'Archived project'));
    await showTasks(id, Boolean(project.archived));
  } catch (error) {
    if (!app.querySelector('h1')) app.prepend(element('h1', 'Workboard'));
    showAlert(error.message);
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)$/);
(match ? showProject(match[1]) : showProjects()).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
