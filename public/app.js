const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.testId) node.dataset.testid = options.testId;
  return node;
}

function matchesSearch(value, query) {
  const asciiLower = (text) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const normalizeWhitespace = (text) => text.replace(/[ \t]+/g, ' ');
  return asciiLower(normalizeWhitespace(value)).includes(
    asciiLower(normalizeWhitespace(query.trim())),
  );
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
  let appliedDueRange = { from: '', through: '' };
  const dueRangeForm = element('form', { className: 'due-range-form' });
  const dueFromLabel = element('label', { text: 'Due from' });
  const dueFromInput = element('input');
  dueFromInput.type = 'text';
  dueFromLabel.append(dueFromInput);
  const dueThroughLabel = element('label', { text: 'Due through' });
  const dueThroughInput = element('input');
  dueThroughInput.type = 'text';
  dueThroughLabel.append(dueThroughInput);
  const applyDueRange = element('button', { text: 'Apply due range' });
  applyDueRange.type = 'submit';
  dueRangeForm.append(dueFromLabel, dueThroughLabel, applyDueRange);
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const from = dueFromInput.value.trim();
    const through = dueThroughInput.value.trim();
    if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
      alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
      alert.hidden = false;
      return;
    }
    if (from && through && from > through) {
      alert.textContent = 'Due from must not be after Due through';
      alert.hidden = false;
      return;
    }
    appliedDueRange = { from, through };
    alert.hidden = true;
    loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; });
  });
  app.append(dueRangeForm);
  let appliedTaskSearch = '';
  const taskSearchForm = element('form', { className: 'search-form' });
  const taskSearchLabel = element('label', { text: 'Task search' });
  const taskSearchInput = element('input');
  taskSearchInput.type = 'text';
  taskSearchLabel.append(taskSearchInput);
  const taskSearchButton = element('button', { text: 'Search tasks' });
  taskSearchButton.type = 'submit';
  taskSearchForm.append(taskSearchLabel, taskSearchButton);
  taskSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedTaskSearch = taskSearchInput.value.trim();
    alert.hidden = true;
    loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; });
  });
  app.append(taskSearchForm);
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
      priorityFilter.value === 'All' || task.priority === priorityFilter.value).filter((task) => {
      if (!appliedDueRange.from && !appliedDueRange.through) return true;
      if (!task.dueDate) return false;
      return (!appliedDueRange.from || task.dueDate >= appliedDueRange.from)
        && (!appliedDueRange.through || task.dueDate <= appliedDueRange.through);
    }).filter((task) => matchesSearch(task.title, appliedTaskSearch));
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
      const dueDateForm = element('form', { className: 'due-date-form' });
      const dueDateLabel = element('label', { text: 'Task due date', className: 'due-date-label' });
      const dueDateInput = element('input');
      dueDateInput.type = 'text';
      dueDateInput.name = `dueDate-${task.id}`;
      dueDateInput.value = task.dueDate ?? '';
      dueDateInput.disabled = project.archived;
      dueDateLabel.append(dueDateInput);
      const saveDueDate = element('button', { text: 'Save due date', className: 'secondary-button' });
      saveDueDate.type = 'submit';
      saveDueDate.disabled = project.archived;
      dueDateForm.append(dueDateLabel, saveDueDate);
      dueDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const previousDueDate = task.dueDate ?? '';
        const dueDate = dueDateInput.value.trim();
        saveDueDate.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dueDate }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            if (result.error === 'Due date must be a valid YYYY-MM-DD date') {
              dueDateInput.value = previousDueDate;
              alert.textContent = result.error;
              alert.hidden = false;
              return;
            }
            throw new Error('Could not save due date');
          }
          task.dueDate = dueDate || null;
          dueDateInput.value = task.dueDate ?? '';
          alert.hidden = true;
          await loadTasks();
        } catch {
          dueDateInput.value = previousDueDate;
          alert.textContent = 'Could not save due date';
          alert.hidden = false;
        } finally {
          saveDueDate.disabled = project.archived;
        }
      });
      row.append(dueDateForm);
      const destinations = activeProjects.filter((candidate) => String(candidate.id) !== projectId);
      const moveForm = element('form', { className: 'task-move-form' });
      const destinationLabel = element('label', { text: 'Destination project' });
      const destinationSelect = element('select');
      destinationSelect.setAttribute('aria-label', 'Destination project');
      for (const destination of destinations) {
        const option = element('option', { text: destination.name });
        option.value = String(destination.id);
        destinationSelect.append(option);
      }
      destinationSelect.disabled = project.archived || destinations.length === 0;
      destinationLabel.append(destinationSelect);
      const moveButton = element('button', { text: 'Move task', className: 'secondary-button' });
      moveButton.type = 'submit';
      moveButton.disabled = project.archived || destinations.length === 0;
      moveForm.append(destinationLabel, moveButton);
      moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!destinationSelect.value) return;
        moveButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/move`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: Number(destinationSelect.value) }),
          });
          if (!response.ok) throw new Error('Could not move task');
          alert.hidden = true;
          await loadTasks();
        } catch {
          alert.textContent = 'Could not move task';
          alert.hidden = false;
          moveButton.disabled = project.archived || destinations.length === 0;
        }
      });
      row.append(moveForm);
      taskList.append(row);
    }
  }
  filter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  priorityFilter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  await loadTasks();
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
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
  let appliedProjectSearch = '';
  const searchForm = element('form', { className: 'search-form' });
  const searchLabel = element('label', { text: 'Project search' });
  const searchInput = element('input');
  searchInput.type = 'text';
  searchLabel.append(searchInput);
  const searchButton = element('button', { text: 'Search projects' });
  searchButton.type = 'submit';
  searchForm.append(searchLabel, searchButton);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedProjectSearch = searchInput.value.trim();
    alert.hidden = true;
    renderProjects().catch(() => { alert.textContent = 'Could not load projects'; alert.hidden = false; });
  });
  app.append(searchForm);
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
    input.value = '';
    alert.hidden = true;
    await renderProjects();
  });
  app.append(form);

  async function renderProjects() {
    const projects = await loadProjects(filter.value);
    projectList.replaceChildren();
    for (const project of projects.filter((item) => matchesSearch(item.name, appliedProjectSearch))) {
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
