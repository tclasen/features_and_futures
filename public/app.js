const app = document.querySelector('#app');
let listRenderId = 0;
let projectRenderId = 0;

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

async function getTasks(projectId) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) throw new Error('Unable to load tasks');
  return response.json();
}

function isValidDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function makeButton(label, onClick, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

async function renderList(errorMessage = '', selectedFilter = 'active') {
  const renderId = ++listRenderId;
  app.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Workboard';
  app.append(heading);

  if (errorMessage) {
    const alert = document.createElement('p');
    alert.className = 'alert';
    alert.setAttribute('role', 'alert');
    alert.textContent = errorMessage;
    app.append(alert);
  }

  const form = document.createElement('form');
  form.className = 'project-form';
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  field.append(label, input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  form.append(field, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      await renderList('Project name is required');
      document.querySelector('#project-name')?.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      await renderList('Unable to create project');
      return;
    }
    await renderList();
  });
  app.append(form);

  const filterField = document.createElement('div');
  filterField.className = 'filter-field';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'project-filter';
  filterLabel.textContent = 'Project filter';
  const filter = document.createElement('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = document.createElement('option');
    option.value = value.toLowerCase();
    option.textContent = value;
    filter.append(option);
  }
  filter.value = selectedFilter;
  filterField.append(filterLabel, filter);
  app.append(filterField);

  try {
    const projects = await getProjects();
    // Several list renders can overlap (for example after a filter change and
    // a mutation). Only the newest render owns the rows in the shared app node.
    if (renderId !== listRenderId) return;
    for (const project of projects) {
      if (filter.value === 'active' && project.archived) continue;
      if (filter.value === 'archived' && !project.archived) continue;
      const row = document.createElement('section');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.className = 'project-name';
      name.textContent = project.name;
      const summary = document.createElement('span');
      summary.dataset.testid = 'project-summary';
      summary.textContent = `${project.completed_count}/${project.total_count} completed`;
      row.append(name, summary, makeButton('Open project', () => {
        history.pushState({}, '', `/projects/${project.id}`);
        renderRoute();
      }));
      row.append(makeButton(project.archived ? 'Restore project' : 'Archive project', async () => {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        if (response.ok) renderList('', filter.value);
      }));
      app.append(row);
    }
    filter.addEventListener('change', () => renderList('', filter.value));
  } catch {
    if (renderId !== listRenderId) return;
    const error = document.createElement('p');
    error.className = 'alert';
    error.setAttribute('role', 'alert');
    error.textContent = 'Unable to load projects';
    app.append(error);
  }
}

async function renderProject(id, selectedFilter = 'all', selectedPriority = 'all', dueRange = { from: '', through: '' }) {
  const renderId = ++projectRenderId;
  const projects = await getProjects();
  if (renderId !== projectRenderId) return;
  const project = projects.find((item) => String(item.id) === id);
  if (!project) return renderList('Project not found');
  app.replaceChildren();
  app.append(makeButton('Projects', () => {
    history.pushState({}, '', '/');
    renderRoute();
  }, 'back-button'));
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  app.append(heading);
  if (project.archived) {
    const status = document.createElement('p');
    status.textContent = 'Archived project';
    app.append(status);
  }

  const renameForm = document.createElement('form');
  renameForm.className = 'project-form';
  const renameField = document.createElement('div');
  renameField.className = 'field';
  const renameLabel = document.createElement('label');
  renameLabel.htmlFor = 'new-project-name';
  renameLabel.textContent = 'New project name';
  const renameInput = document.createElement('input');
  renameInput.id = 'new-project-name';
  renameInput.name = 'name';
  renameInput.type = 'text';
  renameInput.value = project.name;
  renameInput.disabled = project.archived;
  renameField.append(renameLabel, renameInput);
  const renameButton = document.createElement('button');
  renameButton.type = 'submit';
  renameButton.textContent = 'Rename project';
  renameButton.disabled = project.archived;
  renameForm.append(renameField, renameButton);
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) return renderProjectWithAlert(id, 'Project name is required', filter.value, priorityFilter.value, dueRange);
    const response = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return renderProjectWithAlert(id, 'Unable to rename project', filter.value, priorityFilter.value, dueRange);
    renderProject(id, filter.value, priorityFilter.value, dueRange);
  });
  app.append(renameForm);

  const defaultPriorityField = document.createElement('div');
  defaultPriorityField.className = 'filter-field';
  const defaultPriorityLabel = document.createElement('label');
  defaultPriorityLabel.htmlFor = 'default-task-priority';
  defaultPriorityLabel.textContent = 'Default task priority';
  const defaultPriority = document.createElement('select');
  defaultPriority.id = 'default-task-priority';
  defaultPriority.disabled = project.archived;
  for (const value of ['Low', 'Normal', 'High']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    defaultPriority.append(option);
  }
  defaultPriority.value = project.default_task_priority || 'Normal';
  defaultPriority.addEventListener('change', async () => {
    const previousValue = project.default_task_priority || 'Normal';
    defaultPriority.disabled = true;
    const response = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_task_priority: defaultPriority.value }),
    });
    if (response.ok) {
      project.default_task_priority = defaultPriority.value;
    } else {
      defaultPriority.value = previousValue;
    }
    defaultPriority.disabled = project.archived;
  });
  defaultPriorityField.append(defaultPriorityLabel, defaultPriority);
  app.append(defaultPriorityField);

  const form = document.createElement('form');
  form.className = 'task-form';
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = 'task-title';
  label.textContent = 'Task title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  field.append(label, input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create task';
  submit.disabled = project.archived;
  input.disabled = project.archived;
  form.append(field, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    const currentFilter = document.querySelector('#task-filter')?.value || 'all';
    const currentPriority = document.querySelector('#priority-filter')?.value || 'all';
    if (!title) return renderProjectWithAlert(id, 'Task title is required', currentFilter, currentPriority, dueRange);
    const response = await fetch(`/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (!response.ok) return renderProjectWithAlert(id, 'Unable to create task', currentFilter, currentPriority, dueRange);
    renderProject(id, currentFilter, currentPriority, dueRange);
  });
  app.append(form);

  const filterField = document.createElement('div');
  filterField.className = 'filter-field';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'task-filter';
  filterLabel.textContent = 'Task filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = document.createElement('option');
    option.value = value.toLowerCase();
    option.textContent = value;
    filter.append(option);
  }
  filter.value = selectedFilter;
  filterField.append(filterLabel, filter);
  app.append(filterField);

  const priorityFilterField = document.createElement('div');
  priorityFilterField.className = 'filter-field';
  const priorityFilterLabel = document.createElement('label');
  priorityFilterLabel.htmlFor = 'priority-filter';
  priorityFilterLabel.textContent = 'Priority filter';
  const priorityFilter = document.createElement('select');
  priorityFilter.id = 'priority-filter';
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = document.createElement('option');
    option.value = value.toLowerCase();
    option.textContent = value;
    priorityFilter.append(option);
  }
  priorityFilter.value = selectedPriority;
  priorityFilterField.append(priorityFilterLabel, priorityFilter);
  app.append(priorityFilterField);

  const dueRangeForm = document.createElement('form');
  dueRangeForm.className = 'due-range-form';
  const fromField = document.createElement('div');
  fromField.className = 'field';
  const fromLabel = document.createElement('label');
  fromLabel.htmlFor = 'due-from';
  fromLabel.textContent = 'Due from';
  const fromInput = document.createElement('input');
  fromInput.id = 'due-from';
  fromInput.type = 'text';
  fromInput.value = dueRange.from;
  fromField.append(fromLabel, fromInput);
  const throughField = document.createElement('div');
  throughField.className = 'field';
  const throughLabel = document.createElement('label');
  throughLabel.htmlFor = 'due-through';
  throughLabel.textContent = 'Due through';
  const throughInput = document.createElement('input');
  throughInput.id = 'due-through';
  throughInput.type = 'text';
  throughInput.value = dueRange.through;
  throughField.append(throughLabel, throughInput);
  const applyRange = document.createElement('button');
  applyRange.type = 'submit';
  applyRange.textContent = 'Apply due range';
  dueRangeForm.append(fromField, throughField, applyRange);
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const from = fromInput.value.trim();
    const through = throughInput.value.trim();
    const showRangeAlert = (message) => {
      app.querySelectorAll('[role="alert"]').forEach((alert) => alert.remove());
      const alert = document.createElement('p');
      alert.className = 'alert';
      alert.setAttribute('role', 'alert');
      alert.textContent = message;
      dueRangeForm.after(alert);
    };
    if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
      return showRangeAlert('Due range must use valid YYYY-MM-DD dates');
    }
    if (from && through && from > through) {
      return showRangeAlert('Due from must not be after Due through');
    }
    renderProject(id, filter.value, priorityFilter.value, { from, through });
  });
  app.append(dueRangeForm);

  const taskList = document.createElement('div');
  taskList.className = 'task-list';
  app.append(taskList);
  const activeDestinations = projects.filter((item) => !item.archived && String(item.id) !== id);
  let tasks;
  try {
    tasks = await getTasks(id);
  } catch {
    if (renderId !== projectRenderId) return;
    taskList.textContent = 'Unable to load tasks';
    taskList.className = 'alert';
    return;
  }
  if (renderId !== projectRenderId) return;
  const renderTasks = () => {
    taskList.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'open' && task.completed) continue;
      if (filter.value === 'completed' && !task.completed) continue;
      if (priorityFilter.value !== 'all' && task.priority.toLowerCase() !== priorityFilter.value) continue;
      if ((dueRange.from || dueRange.through) && !task.due_date) continue;
      if (dueRange.from && task.due_date < dueRange.from) continue;
      if (dueRange.through && task.due_date > dueRange.through) continue;
      const row = document.createElement('section');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.title;
      const checkboxLabel = document.createElement('label');
      checkboxLabel.className = 'completion-control';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (response.ok) {
          task.completed = checkbox.checked;
          renderTasks();
        } else {
          checkbox.checked = task.completed;
          checkbox.disabled = false;
        }
      });
      checkboxLabel.append(checkbox);
      const renameForm = document.createElement('form');
      renameForm.className = 'task-rename-form';
      const renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.value = task.title;
      renameInput.setAttribute('aria-label', 'New task title');
      renameInput.disabled = project.archived;
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = project.archived;
      renameForm.append(renameInput, renameButton);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const newTitle = renameInput.value.trim();
        const selected = filter.value;
        const selectedPriority = priorityFilter.value;
        if (!newTitle) return renderProjectWithAlert(id, 'Task title is required', selected, selectedPriority, dueRange);
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        if (!response.ok) return renderProjectWithAlert(id, 'Unable to rename task', selected, selectedPriority, dueRange);
        task.title = newTitle;
        renderTasks();
      });
      const priorityField = document.createElement('div');
      priorityField.className = 'task-priority-field';
      const priorityLabel = document.createElement('label');
      const prioritySelect = document.createElement('select');
      const priorityId = `task-priority-${task.id}`;
      priorityLabel.htmlFor = priorityId;
      priorityLabel.textContent = 'Task priority';
      prioritySelect.id = priorityId;
      prioritySelect.disabled = project.archived;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        prioritySelect.append(option);
      }
      prioritySelect.value = task.priority;
      prioritySelect.addEventListener('change', async () => {
        const previousPriority = task.priority;
        prioritySelect.disabled = true;
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: prioritySelect.value }),
        });
        if (response.ok) {
          task.priority = prioritySelect.value;
          prioritySelect.disabled = project.archived;
          renderTasks();
        } else {
          prioritySelect.value = previousPriority;
          prioritySelect.disabled = project.archived;
        }
      });
      priorityField.append(priorityLabel, prioritySelect);
      const dueDateForm = document.createElement('form');
      dueDateForm.className = 'task-due-date-form';
      const dueDateInput = document.createElement('input');
      dueDateInput.type = 'text';
      dueDateInput.value = task.due_date || '';
      dueDateInput.setAttribute('aria-label', 'Task due date');
      dueDateInput.disabled = project.archived;
      const dueDateButton = document.createElement('button');
      dueDateButton.type = 'submit';
      dueDateButton.textContent = 'Save due date';
      dueDateButton.disabled = project.archived;
      dueDateForm.append(dueDateInput, dueDateButton);
      dueDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_date: dueDateInput.value }),
        });
        if (response.ok) {
          const updated = await response.json();
          task.due_date = updated.due_date;
          dueDateInput.value = task.due_date || '';
          renderTasks();
        } else {
          let message = 'Unable to save due date';
          try {
            const result = await response.json();
            if (result.error === 'Due date must be a valid YYYY-MM-DD date') message = result.error;
          } catch { /* Keep the generic message for non-JSON failures. */ }
          renderProjectWithAlert(id, message, filter.value, priorityFilter.value, dueRange);
        }
      });
      const moveForm = document.createElement('form');
      moveForm.className = 'task-move-form';
      const destination = document.createElement('select');
      destination.setAttribute('aria-label', 'Destination project');
      for (const candidate of activeDestinations) {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = candidate.name;
        destination.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      destination.disabled = project.archived || activeDestinations.length === 0;
      moveButton.disabled = project.archived || activeDestinations.length === 0;
      moveForm.append(destination, moveButton);
      moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!destination.value) return;
        moveButton.disabled = true;
        const response = await fetch(`/api/projects/${id}/tasks/${task.id}/move`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination_project_id: Number(destination.value) }),
        });
        if (response.ok) {
          renderProject(id, filter.value, priorityFilter.value, dueRange);
        } else {
          moveButton.disabled = false;
          renderProjectWithAlert(id, 'Unable to move task', filter.value, priorityFilter.value, dueRange);
        }
      });
      row.append(title, checkboxLabel, renameForm, priorityField, dueDateForm, moveForm);
      taskList.append(row);
    }
  };
  filter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
  renderTasks();
}

async function renderProjectWithAlert(id, message, filter = 'all', priority = 'all', dueRange = { from: '', through: '' }) {
  await renderProject(id, filter, priority, dueRange);
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  app.insertBefore(alert, app.querySelector('.task-form'));
}

async function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  try {
    if (match) await renderProject(match[1]);
    else await renderList();
  } catch {
    await renderList('Unable to load projects');
  }
}

window.addEventListener('popstate', renderRoute);
renderRoute();
