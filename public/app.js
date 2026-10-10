const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
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
    alert = element('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project, drawProjects) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const summary = element('span', `${project.completed_count}/${project.total_count} completed`);
  summary.dataset.testid = 'project-summary';
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
  archive.type = 'button';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      drawProjects();
      app.querySelector('[role="alert"]')?.remove();
    } catch (error) {
      showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(element('span', project.name), summary, open, archive);
  return row;
}

async function renderTasks(project) {
  const endpoint = `/api/projects/${project.id}/tasks`;
  const form = element('form');
  const titleLabel = element('label', 'Task title');
  titleLabel.htmlFor = 'task-title';
  const titleInput = element('input');
  titleInput.id = 'task-title';
  titleInput.name = 'title';
  titleInput.type = 'text';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  submit.disabled = true;
  form.append(titleLabel, titleInput, submit);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  filter.value = 'All';
  const filterControls = element('div');
  filterControls.className = 'task-filter';
  filterControls.append(filterLabel, filter);
  const list = element('ul');
  list.setAttribute('aria-label', 'Tasks');
  app.append(form, filterControls, list);
  const tasks = await request(endpoint);

  function matchesFilter(task) {
    return filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed);
  }

  function taskRow(task) {
    const row = element('li');
    row.dataset.testid = 'task-row';
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.disabled = Boolean(project.archived);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      if (project.archived) return;
      checkbox.disabled = true;
      try {
        const saved = await request(`${endpoint}/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        task.completed = saved.completed;
        drawTasks();
        app.querySelector('[role="alert"]')?.remove();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error.message);
      } finally {
        checkbox.disabled = Boolean(project.archived);
      }
    });
    const renameForm = element('form');
    const renameLabel = element('label', 'New task title');
    renameLabel.htmlFor = `new-task-title-${task.id}`;
    const renameInput = element('input');
    renameInput.id = renameLabel.htmlFor;
    renameInput.name = 'title';
    renameInput.type = 'text';
    renameInput.disabled = Boolean(project.archived);
    const renameButton = element('button', 'Rename task');
    renameButton.type = 'submit';
    renameButton.disabled = Boolean(project.archived);
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (project.archived) return;
      const title = renameInput.value.trim();
      if (!title) return showError('Task title is required');
      renameButton.disabled = true;
      try {
        const saved = await request(`${endpoint}/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        task.title = saved.title;
        drawTasks();
        app.querySelector('[role="alert"]')?.remove();
      } catch (error) {
        showError(error.message);
      } finally {
        renameButton.disabled = Boolean(project.archived);
      }
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
    priority.disabled = Boolean(project.archived);
    priority.addEventListener('change', async () => {
      if (project.archived) return;
      priority.disabled = true;
      try {
        const saved = await request(`${endpoint}/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: priority.value }),
        });
        task.priority = saved.priority;
        priority.value = saved.priority;
        app.querySelector('[role="alert"]')?.remove();
      } catch (error) {
        priority.value = task.priority;
        showError(error.message);
      } finally {
        priority.disabled = Boolean(project.archived);
      }
    });
    const priorityControls = element('div');
    priorityControls.className = 'task-priority';
    priorityControls.append(priorityLabel, priority);
    row.append(element('span', task.title), checkbox, renameForm, priorityControls);
    return row;
  }

  function drawTasks() {
    list.replaceChildren(...tasks.filter(matchesFilter).map(taskRow));
  }

  drawTasks();
  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    const title = titleInput.value.trim();
    if (!title) return showError('Task title is required');
    submit.disabled = true;
    try {
      const task = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      drawTasks();
      titleInput.value = '';
      app.querySelector('[role="alert"]')?.remove();
      titleInput.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = Boolean(project.archived);
    }
  });
  submit.disabled = Boolean(project.archived);
}

function renderRename(project, heading) {
  const form = element('form');
  const label = element('label', 'New project name');
  label.htmlFor = 'new-project-name';
  const input = element('input');
  input.id = 'new-project-name';
  input.name = 'name';
  input.type = 'text';
  input.disabled = Boolean(project.archived);
  const submit = element('button', 'Rename project');
  submit.type = 'submit';
  submit.disabled = Boolean(project.archived);
  form.append(label, input, submit);
  app.append(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      Object.assign(project, saved);
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = Boolean(project.archived);
    }
  });
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await request(`/api/projects/${match[1]}`);
    const heading = element('h1', project.name);
    app.append(heading);
    document.title = `${project.name} · Workboard`;
    if (project.archived) app.append(element('p', 'Archived project'));
    await renderTasks(project);
    renderRename(project, heading);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  submit.disabled = true;
  const list = element('ul');
  list.setAttribute('aria-label', 'Projects');
  form.append(label, input, submit);
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  filter.value = 'Active';
  const filterControls = element('div');
  filterControls.className = 'project-filter';
  filterControls.append(filterLabel, filter);
  app.append(form, filterControls, list);
  const projects = await request('/api/projects');
  function drawProjects() {
    list.replaceChildren(...projects
      .filter((project) => Boolean(project.archived) === (filter.value === 'Archived'))
      .map((project) => projectRow(project, drawProjects)));
  }
  drawProjects();
  filter.addEventListener('change', drawProjects);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  submit.disabled = false;
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
