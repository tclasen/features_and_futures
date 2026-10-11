const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function renderList() {
  app.replaceChildren();
  const title = element('h1', '', 'Workboard');
  app.append(title);

  const filterLabel = element('label', 'filter-label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select', 'project-filter');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);

  const form = element('form', 'create-form');
  const label = element('label', '', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  input.required = true;
  const submit = element('button', 'primary', 'Create project');
  submit.type = 'submit';
  const alert = element('p', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  app.append(form);

  const list = element('div', 'project-list');
  list.setAttribute('aria-label', 'Projects');
  async function renderProjects() {
    const projects = await request('/api/projects');
    list.replaceChildren();
    for (const project of projects.filter((item) => Boolean(item.archived) === (filter.value === 'archived'))) {
    const row = element('article', 'project-row');
    row.dataset.testid = 'project-row';
    row.append(element('span', 'project-name', project.name));
    const summary = element('span', 'project-summary', `${project.completedCount}/${project.totalCount} completed`);
    summary.dataset.testid = 'project-summary';
    row.append(summary);
    const open = element('button', 'secondary', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${encodeURIComponent(project.id)}`; });
    row.append(open);
    const archive = element('button', 'secondary', project.archived ? 'Restore project' : 'Archive project');
    archive.type = 'button';
    archive.addEventListener('click', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(project.id)}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
        await renderProjects();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    row.append(archive);
    list.append(row);
    }
  }
  app.append(list);
  filter.addEventListener('change', renderProjects);
  await renderProjects();

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
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await renderList();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

async function renderProject(id) {
  app.replaceChildren();
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  const back = element('button', 'back', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', '', project.name));
  if (project.archived) app.append(element('p', 'archived-notice', 'Archived project'));

  const renameForm = element('form', 'create-form rename-form');
  const renameLabel = element('label', '', 'New project name');
  renameLabel.htmlFor = 'new-project-name';
  const renameInput = element('input');
  renameInput.id = 'new-project-name';
  renameInput.name = 'name';
  renameInput.type = 'text';
  renameInput.autocomplete = 'off';
  renameInput.value = project.name;
  renameInput.disabled = Boolean(project.archived);
  const renameButton = element('button', 'secondary', 'Rename project');
  renameButton.type = 'submit';
  renameButton.disabled = Boolean(project.archived);
  const renameAlert = element('p', 'alert');
  renameAlert.setAttribute('role', 'alert');
  renameAlert.hidden = true;
  renameForm.append(renameLabel, renameInput, renameButton, renameAlert);
  app.append(renameForm);
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    renameAlert.hidden = true;
    const name = renameInput.value.trim();
    if (!name) {
      renameAlert.textContent = 'Project name is required';
      renameAlert.hidden = false;
      renameInput.focus();
      return;
    }
    try {
      await request(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await renderProject(id);
    } catch (error) {
      renameAlert.textContent = error.message;
      renameAlert.hidden = false;
    }
  });

  const form = element('form', 'create-form');
  const label = element('label', '', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  input.autocomplete = 'off';
  input.required = true;
  input.disabled = Boolean(project.archived);
  const submit = element('button', 'primary', 'Create task');
  submit.type = 'submit';
  submit.disabled = Boolean(project.archived);
  const alert = element('p', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  app.append(form);

  const filterLabel = element('label', 'filter-label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select', 'task-filter');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);

  const priorityFilterLabel = element('label', 'filter-label', 'Priority filter');
  priorityFilterLabel.htmlFor = 'priority-filter';
  const priorityFilter = element('select', 'priority-filter');
  priorityFilter.id = 'priority-filter';
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    priorityFilter.append(option);
  }
  priorityFilterLabel.append(priorityFilter);
  app.append(priorityFilterLabel);

  const list = element('div', 'task-list');
  list.setAttribute('aria-label', 'Tasks');
  app.append(list);

  async function renderTasks() {
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    list.replaceChildren();
    const visible = tasks.filter((task) =>
      (filter.value === 'all' || (filter.value === 'completed') === Boolean(task.completed)) &&
      (priorityFilter.value === 'all' || (task.priority || 'Normal').toLowerCase() === priorityFilter.value));
    for (const task of visible) {
      const row = element('article', 'task-row');
      row.dataset.testid = 'task-row';
      row.append(element('span', 'task-title', task.title));
      const checkboxLabel = element('label', 'task-check');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.disabled = Boolean(project.archived);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          await renderTasks();
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          alert.textContent = error.message;
          alert.hidden = false;
          checkbox.disabled = false;
        }
      });
      checkboxLabel.append(checkbox);
      row.append(checkboxLabel);
      const renameForm = element('form', 'task-rename-form');
      const renameInput = element('input');
      renameInput.type = 'text';
      renameInput.value = task.title;
      renameInput.autocomplete = 'off';
      renameInput.setAttribute('aria-label', 'New task title');
      renameInput.disabled = Boolean(project.archived);
      const renameButton = element('button', 'secondary', 'Rename task');
      renameButton.type = 'submit';
      renameButton.disabled = Boolean(project.archived);
      renameForm.append(renameInput, renameButton);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        alert.hidden = true;
        const title = renameInput.value.trim();
        if (!title) {
          alert.textContent = 'Task title is required';
          alert.hidden = false;
          renameInput.focus();
          return;
        }
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(renameForm);
      const priorityLabel = element('label', 'task-priority-label', 'Task priority');
      const priority = element('select', 'task-priority');
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', '', value);
        option.value = value;
        priority.append(option);
      }
      priority.value = task.priority || 'Normal';
      priority.disabled = Boolean(project.archived);
      priorityLabel.append(priority);
      priority.addEventListener('change', async () => {
        priority.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
          priority.value = task.priority || 'Normal';
        } finally {
          priority.disabled = Boolean(project.archived);
        }
      });
      row.append(priorityLabel);
      list.append(row);
    }
  }

  filter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      input.value = '';
      await renderTasks();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  await renderTasks();
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  try {
    if (match) await renderProject(decodeURIComponent(match[1]));
    else await renderList();
  } catch (error) {
    app.replaceChildren();
    app.append(element('h1', '', 'Workboard'));
    const alert = element('p', 'alert', error.message);
    alert.setAttribute('role', 'alert');
    app.append(alert);
    const back = element('button', 'secondary', 'Projects');
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back);
  }
}

render();
