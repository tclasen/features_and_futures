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
  const summary = element('span', `${project.completed}/${project.total} completed`);
  summary.dataset.testid = 'project-summary';
  row.append(summary);
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
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
      onArchiveChange(saved);
    } catch (error) {
      showAlert(error.message);
      archive.disabled = false;
    }
  });
  row.append(open, archive);
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
  filters.className = 'project-filters';
  filters.append(filterLabel, filter);
  app.append(form, filters, list);

  // Load before enabling creation so new rows cannot race the initial list.
  create.disabled = true;
  const projects = await api('/api/projects');
  function renderProjects() {
    list.replaceChildren(...projects
      .filter(project => project.archived === (filter.value === 'Archived'))
      .map(project => projectRow(project, saved => {
        Object.assign(project, saved);
        renderProjects();
      })));
  }
  filter.addEventListener('change', renderProjects);
  renderProjects();
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
}

async function renderProject(id) {
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const project = await api(`/api/projects/${id}`);
  const heading = element('h1', project.name);
  app.prepend(heading);
  document.title = `${project.name} · Workboard`;
  if (project.archived) app.append(element('p', 'Archived project'));

  const renameForm = element('form');
  const nameLabel = element('label', 'New project name');
  nameLabel.htmlFor = 'new-project-name';
  const nameInput = element('input');
  nameInput.type = 'text';
  nameInput.id = 'new-project-name';
  nameInput.name = 'name';
  nameInput.value = project.name;
  nameInput.disabled = project.archived;
  const rename = element('button', 'Rename project');
  rename.type = 'submit';
  rename.disabled = project.archived;
  renameForm.append(nameLabel, nameInput, rename);
  app.append(renameForm);
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    app.querySelector('[role="alert"]')?.remove();
    const name = nameInput.value.trim();
    if (!name) {
      showAlert('Project name is required');
      return;
    }
    rename.disabled = true;
    try {
      const saved = await api(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      Object.assign(project, saved);
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      nameInput.value = project.name;
    } catch (error) {
      showAlert(error.message);
    } finally {
      rename.disabled = project.archived;
    }
  });

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
  async function saveTask(task, changes) {
    if (project.archived || pendingTasks.has(task.id)) return;
    pendingTasks.add(task.id);
    app.querySelector('[role="alert"]')?.remove();
    renderTasks();
    try {
      const saved = await api(`/api/projects/${id}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      Object.assign(task, saved);
    } catch (error) {
      showAlert(error.message);
    } finally {
      pendingTasks.delete(task.id);
      renderTasks();
    }
  }
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
      checkbox.disabled = project.archived || pendingTasks.has(task.id);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      row.append(checkbox, element('span', task.title));
      checkbox.addEventListener('change', () => {
        saveTask(task, { completed: checkbox.checked });
      });
      const taskRenameForm = element('form');
      const renameLabel = element('label', 'New task title');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      const renameInput = element('input');
      renameInput.type = 'text';
      renameInput.id = renameLabel.htmlFor;
      renameInput.name = 'title';
      renameInput.value = task.title;
      renameInput.disabled = checkbox.disabled;
      const renameButton = element('button', 'Rename task');
      renameButton.type = 'submit';
      renameButton.disabled = checkbox.disabled;
      taskRenameForm.append(renameLabel, renameInput, renameButton);
      taskRenameForm.addEventListener('submit', event => {
        event.preventDefault();
        if (project.archived || pendingTasks.has(task.id)) return;
        app.querySelector('[role="alert"]')?.remove();
        const title = renameInput.value.trim();
        if (!title) {
          showAlert('Task title is required');
          return;
        }
        saveTask(task, { title });
      });
      const priorityLabel = element('label', 'Task priority');
      priorityLabel.htmlFor = `task-priority-${task.id}`;
      const priority = element('select');
      priority.id = priorityLabel.htmlFor;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', value);
        option.value = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.disabled = checkbox.disabled;
      priority.addEventListener('change', () => {
        saveTask(task, { priority: priority.value });
      });
      row.append(taskRenameForm, priorityLabel, priority);
      list.append(row);
    }
  }
  filter.addEventListener('change', renderTasks);
  renderTasks();
  create.disabled = project.archived;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
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
      create.disabled = project.archived;
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
