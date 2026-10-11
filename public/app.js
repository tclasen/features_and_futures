const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.testId) node.dataset.testid = options.testId;
  return node;
}

async function loadProjects(filter = 'Active') {
  const response = await fetch(`/api/projects?filter=${filter}`);
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function showProject(projectId) {
  const [activeProjects, archivedProjects] = await Promise.all([
    loadProjects('Active'), loadProjects('Archived'),
  ]);
  const project = [...activeProjects, ...archivedProjects].find((item) => String(item.id) === projectId);
  if (!project) {
    history.replaceState(null, '', '/');
    await render();
    return;
  }

  app.replaceChildren();
  const back = element('button', { text: 'Projects', className: 'back-button' });
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  const heading = element('h1', { text: project.name });
  app.append(back, heading);
  if (project.archived) app.append(element('p', { text: 'Archived project', className: 'archive-notice' }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const renameForm = element('form');
  const renameLabel = element('label', { text: 'New project name' });
  const renameInput = element('input');
  renameInput.type = 'text';
  renameInput.name = 'newProjectName';
  renameInput.disabled = project.archived;
  renameLabel.append(renameInput);
  const renameButton = element('button', { text: 'Rename project' });
  renameButton.type = 'submit';
  renameButton.disabled = project.archived;
  renameForm.append(renameLabel, renameButton);
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      renameInput.focus();
      return;
    }
    renameButton.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/rename`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('Could not rename project');
      heading.textContent = name;
      renameInput.value = '';
      alert.hidden = true;
    } catch {
      alert.textContent = 'Could not rename project';
      alert.hidden = false;
    } finally {
      renameButton.disabled = project.archived;
    }
  });
  app.append(renameForm);

  const defaultPriorityLabel = element('label', { text: 'Default task priority', className: 'filter-label' });
  const defaultPriority = element('select');
  defaultPriority.setAttribute('aria-label', 'Default task priority');
  defaultPriority.disabled = project.archived;
  for (const value of ['Low', 'Normal', 'High']) {
    const option = element('option', { text: value });
    option.value = value;
    option.selected = value === project.defaultTaskPriority;
    defaultPriority.append(option);
  }
  defaultPriority.addEventListener('change', async () => {
    const previousPriority = project.defaultTaskPriority;
    defaultPriority.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/default-priority`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: defaultPriority.value }),
      });
      if (!response.ok) throw new Error('Could not update default task priority');
      project.defaultTaskPriority = defaultPriority.value;
      alert.hidden = true;
    } catch {
      defaultPriority.value = previousPriority;
      alert.textContent = 'Could not update default task priority';
      alert.hidden = false;
    } finally {
      defaultPriority.disabled = project.archived;
    }
  });
  defaultPriorityLabel.append(defaultPriority);
  app.append(defaultPriorityLabel);

  const form = element('form');
  const label = element('label', { text: 'Task title' });
  const input = element('input');
  input.type = 'text';
  input.name = 'taskTitle';
  label.append(input);
  const create = element('button', { text: 'Create task' });
  create.type = 'submit';
  create.disabled = project.archived;
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error('Could not create task');
      await loadTasks();
      input.value = '';
      alert.hidden = true;
    } catch {
      alert.textContent = 'Could not create task';
      alert.hidden = false;
    }
  });
  app.append(form);

  const filterLabel = element('label', { text: 'Task filter', className: 'filter-label' });
  const filter = element('select');
  filter.setAttribute('aria-label', 'Task filter');
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);
  const priorityFilterLabel = element('label', { text: 'Priority filter', className: 'filter-label' });
  const priorityFilter = element('select');
  priorityFilter.setAttribute('aria-label', 'Priority filter');
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = element('option', { text: value });
    option.value = value;
    priorityFilter.append(option);
  }
  priorityFilterLabel.append(priorityFilter);
  app.append(priorityFilterLabel);
  const taskList = element('section', { className: 'task-list', testId: 'task-list' });
  app.append(taskList);

  async function loadTasks() {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    if (!response.ok) throw new Error('Could not load tasks');
    const tasks = await response.json();
    taskList.replaceChildren();
    const visibleTasks = tasks.filter((task) => filter.value === 'All'
      || (filter.value === 'Open' && !task.completed)
      || (filter.value === 'Completed' && task.completed)).filter((task) =>
      priorityFilter.value === 'All' || task.priority === priorityFilter.value);
    for (const task of visibleTasks) {
      const row = element('div', { className: 'task-row', testId: 'task-row' });
      const checkboxLabel = element('label', { className: 'task-checkbox' });
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const update = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          if (!update.ok) throw new Error('Could not update task');
          await loadTasks();
        } catch {
          checkbox.checked = task.completed;
          checkbox.disabled = false;
          alert.textContent = 'Could not update task';
          alert.hidden = false;
        }
      });
      checkboxLabel.append(checkbox, element('span', { text: task.title }));
      row.append(checkboxLabel);
      const renameForm = element('form', { className: 'task-rename-form' });
      const renameLabel = element('label', { text: 'New task title' });
      const renameInput = element('input');
      renameInput.type = 'text';
      renameInput.name = `newTaskTitle-${task.id}`;
      renameInput.disabled = project.archived;
      renameLabel.append(renameInput);
      const renameButton = element('button', { text: 'Rename task', className: 'secondary-button' });
      renameButton.type = 'submit';
      renameButton.disabled = project.archived;
      renameForm.append(renameLabel, renameButton);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = renameInput.value.trim();
        if (!title) {
          alert.textContent = 'Task title is required';
          alert.hidden = false;
          renameInput.focus();
          return;
        }
        renameButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/rename`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title }),
          });
          if (!response.ok) throw new Error('Could not rename task');
          await loadTasks();
          alert.hidden = true;
        } catch {
          alert.textContent = 'Could not rename task';
          alert.hidden = false;
          renameButton.disabled = project.archived;
        }
      });
      row.append(renameForm);
      const priorityLabel = element('label', { text: 'Task priority', className: 'priority-label' });
      const priority = element('select');
      priority.setAttribute('aria-label', 'Task priority');
      priority.disabled = project.archived;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', { text: value });
        option.value = value;
        option.selected = value === task.priority;
        priority.append(option);
      }
      priority.addEventListener('change', async () => {
        const previousPriority = task.priority;
        priority.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          if (!response.ok) throw new Error('Could not update task priority');
          task.priority = priority.value;
          alert.hidden = true;
          await loadTasks();
        } catch {
          priority.value = previousPriority;
          alert.textContent = 'Could not update task priority';
          alert.hidden = false;
        } finally {
          priority.disabled = project.archived;
        }
      });
      priorityLabel.append(priority);
      row.append(priorityLabel);
      taskList.append(row);
    }
  }
  filter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  priorityFilter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  await loadTasks();
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const filterLabel = element('label', { text: 'Project filter', className: 'filter-label' });
  const filter = element('select');
  filter.setAttribute('aria-label', 'Project filter');
  for (const value of ['Active', 'Archived']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);
  const projectList = element('section', { className: 'project-list' });
  app.append(projectList);

  const form = element('form');
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text';
  input.name = 'projectName';
  label.append(input);
  const create = element('button', { text: 'Create project' });
  create.type = 'submit';
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Could not create project';
      alert.hidden = false;
      return;
    }
    await render();
  });
  app.append(form);

  async function renderProjects() {
    const projects = await loadProjects(filter.value);
    projectList.replaceChildren();
    for (const project of projects) {
      const row = element('div', { className: 'project-row', testId: 'project-row' });
      const details = element('div', { className: 'project-details' });
      details.append(element('span', { text: project.name, className: 'project-name' }));
      details.append(element('span', { text: `${project.completedCount}/${project.totalCount} completed`, testId: 'project-summary' }));
      const actions = element('div', { className: 'project-actions' });
      const open = element('button', { text: 'Open project' });
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      const stateButton = element('button', { text: project.archived ? 'Restore project' : 'Archive project', className: 'secondary-button' });
      stateButton.type = 'button';
      stateButton.addEventListener('click', async () => {
        stateButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${project.id}/archive`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: !project.archived }),
          });
          if (!response.ok) throw new Error('Could not update project');
          await renderProjects();
        } catch {
          stateButton.disabled = false;
          alert.textContent = 'Could not update project';
          alert.hidden = false;
        }
      });
      actions.append(open, stateButton);
      row.append(details, actions);
      projectList.append(row);
    }
  }
  filter.addEventListener('change', () => { renderProjects().catch(() => { alert.textContent = 'Could not load projects'; alert.hidden = false; }); });
  await renderProjects();
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
}

render().catch(() => {
  app.replaceChildren(element('p', { text: 'Workboard could not be loaded.' }));
});
