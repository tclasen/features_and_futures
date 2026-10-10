const content = document.querySelector('#content');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function projectIdFromPath() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  return match ? match[1] : null;
}

async function renderList() {
  content.replaceChildren();
  content.append(element('h1', '', 'Workboard'));

  const filterField = element('div', 'filter-field');
  const filterLabel = element('label', '', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    filter.append(option);
  }
  filterField.append(filterLabel, filter);

  const form = element('form', 'create-form');
  const field = element('div', 'field');
  const label = element('label', '', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  field.append(label, input);
  const submit = element('button', '', 'Create project');
  submit.type = 'submit';
  form.append(field, submit);
  const alert = element('p', 'alert');
  alert.hidden = true;
  alert.setAttribute('role', 'alert');
  content.append(form, alert);

  const projects = await request('/api/projects');
  const title = element('h2', 'section-title', 'Projects');
  const list = element('div', 'project-list');
  function drawProjects() {
    list.replaceChildren();
    const shown = projects.filter(project => project.archived === (filter.value === 'archived'));
    if (!shown.length) {
      list.append(element('p', 'empty', projects.length ? 'No projects in this filter.' : 'No projects yet. Create one to get started.'));
      return;
    }
    for (const project of shown) {
      const row = element('div', 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', 'project-name', project.name));
      const summary = element('span', 'project-summary', `${project.completedCount}/${project.totalCount} completed`);
      summary.dataset.testid = 'project-summary';
      row.append(summary);
      const open = element('button', '', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      const archive = element('button', 'archive-button', project.archived ? 'Restore project' : 'Archive project');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
          project.archived = !project.archived;
          drawProjects();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(archive);
      list.append(row);
    }
  }
  filter.addEventListener('change', drawProjects);
  drawProjects();
  content.append(filterField, title, list);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      navigate('/');
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

async function renderProject(id) {
  const project = await request(`/api/projects/${id}`);
  const tasks = await request(`/api/projects/${id}/tasks`);
  const projects = await request('/api/projects');
  const destinations = projects.filter(candidate => !candidate.archived && String(candidate.id) !== String(id));
  content.replaceChildren();
  const back = element('button', 'back-button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => navigate('/'));
  const heading = element('h1', '', project.name);
  content.append(back, heading);
  if (project.archived) content.append(element('p', 'archived-notice', 'Archived project'));

  const renameForm = element('form', 'create-form');
  const renameField = element('div', 'field');
  const renameLabel = element('label', '', 'New project name');
  renameLabel.htmlFor = 'new-project-name';
  const renameInput = element('input');
  renameInput.id = 'new-project-name';
  renameInput.name = 'name';
  renameInput.type = 'text';
  renameInput.autocomplete = 'off';
  renameInput.disabled = project.archived;
  renameField.append(renameLabel, renameInput);
  const renameButton = element('button', '', 'Rename project');
  renameButton.type = 'submit';
  renameButton.disabled = project.archived;
  renameForm.append(renameField, renameButton);

  const form = element('form', 'create-form');
  const field = element('div', 'field');
  const label = element('label', '', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  input.autocomplete = 'off';
  field.append(label, input);
  const submit = element('button', '', 'Create task');
  submit.type = 'submit';
  submit.disabled = project.archived;
  form.append(field, submit);
  const defaultPriorityField = element('div', 'filter-field');
  const defaultPriorityLabel = element('label', '', 'Default task priority');
  defaultPriorityLabel.htmlFor = 'default-task-priority';
  const defaultPriority = element('select');
  defaultPriority.id = 'default-task-priority';
  for (const value of ['Low', 'Normal', 'High']) {
    const option = element('option', '', value);
    option.value = value;
    defaultPriority.append(option);
  }
  defaultPriority.value = project.defaultPriority || 'Normal';
  defaultPriority.disabled = project.archived;
  defaultPriority.addEventListener('change', async () => {
    const previous = project.defaultPriority || 'Normal';
    try {
      const updated = await request(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPriority: defaultPriority.value }),
      });
      project.defaultPriority = updated.defaultPriority;
    } catch (error) {
      defaultPriority.value = previous;
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  defaultPriorityField.append(defaultPriorityLabel, defaultPriority);
  const alert = element('p', 'alert');
  alert.hidden = true;
  alert.setAttribute('role', 'alert');

  const filterField = element('div', 'filter-field');
  const filterLabel = element('label', '', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    filter.append(option);
  }
  filterField.append(filterLabel, filter);
  const priorityFilterField = element('div', 'filter-field');
  const priorityFilterLabel = element('label', '', 'Priority filter');
  priorityFilterLabel.htmlFor = 'priority-filter';
  const priorityFilter = element('select');
  priorityFilter.id = 'priority-filter';
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    priorityFilter.append(option);
  }
  priorityFilterField.append(priorityFilterLabel, priorityFilter);
  const dueRangeField = element('div', 'due-range-field');
  const dueFromLabel = element('label', '', 'Due from');
  dueFromLabel.htmlFor = 'due-from';
  const dueFrom = element('input');
  dueFrom.id = 'due-from';
  dueFrom.type = 'text';
  dueFrom.autocomplete = 'off';
  const dueThroughLabel = element('label', '', 'Due through');
  dueThroughLabel.htmlFor = 'due-through';
  const dueThrough = element('input');
  dueThrough.id = 'due-through';
  dueThrough.type = 'text';
  dueThrough.autocomplete = 'off';
  const applyDueRange = element('button', '', 'Apply due range');
  applyDueRange.type = 'button';
  dueRangeField.append(dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange);
  let appliedDueFrom = '';
  let appliedDueThrough = '';
  const list = element('div', 'task-list');
  function drawTasks() {
    list.replaceChildren();
    const shown = tasks.filter(task =>
      (filter.value === 'all' || (filter.value === 'completed') === task.completed) &&
      (priorityFilter.value === 'all' || (task.priority || 'Normal').toLowerCase() === priorityFilter.value) &&
      ((!appliedDueFrom && !appliedDueThrough) || (Boolean(task.dueDate) &&
        (!appliedDueFrom || task.dueDate >= appliedDueFrom) &&
        (!appliedDueThrough || task.dueDate <= appliedDueThrough))));
    if (!shown.length) list.append(element('p', 'empty', tasks.length ? 'No tasks match this filter.' : 'No tasks yet.'));
    for (const task of shown) {
      const row = element('div', 'task-row');
      row.dataset.testid = 'task-row';
      const checkbox = element('input', 'task-checkbox');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = checkbox.checked;
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(checkbox, element('span', 'task-title', task.title));
      const renameForm = element('form', 'task-rename-form');
      const renameInput = element('input', 'task-rename-input');
      renameInput.type = 'text';
      renameInput.value = task.title;
      renameInput.setAttribute('aria-label', 'New task title');
      renameInput.disabled = project.archived;
      const renameButton = element('button', 'task-rename-button', 'Rename task');
      renameButton.type = 'submit';
      renameButton.disabled = project.archived;
      renameForm.append(renameInput, renameButton);
      renameForm.addEventListener('submit', async event => {
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
          const updated = await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
          });
          task.title = updated.title;
          drawTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(renameForm);
      const priorityLabel = element('label', 'priority-field', 'Task priority');
      const priority = element('select', 'task-priority');
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', '', value);
        option.value = value;
        priority.append(option);
      }
      priority.value = task.priority || 'Normal';
      priority.disabled = project.archived;
      priorityLabel.append(priority);
      priority.addEventListener('change', async () => {
        const previous = task.priority || 'Normal';
        try {
          const updated = await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          task.priority = updated.priority;
          drawTasks();
        } catch (error) {
          priority.value = previous;
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(priorityLabel);
      const dueDateForm = element('form', 'due-date-form');
      const dueDateInput = element('input', 'due-date-input');
      dueDateInput.type = 'text';
      dueDateInput.value = task.dueDate || '';
      dueDateInput.setAttribute('aria-label', 'Task due date');
      dueDateInput.disabled = project.archived;
      const dueDateButton = element('button', 'due-date-button', 'Save due date');
      dueDateButton.type = 'submit';
      dueDateButton.disabled = project.archived;
      dueDateForm.append(dueDateInput, dueDateButton);
      dueDateForm.addEventListener('submit', async event => {
        event.preventDefault();
        alert.hidden = true;
        const dueDate = dueDateInput.value.trim();
        try {
          const updated = await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dueDate }),
          });
          task.dueDate = updated.dueDate;
          drawTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(dueDateForm);
      const destinationLabel = element('label', 'destination-field', 'Destination project');
      const destination = element('select', 'task-destination');
      destination.setAttribute('aria-label', 'Destination project');
      for (const candidate of destinations) {
        const option = element('option', '', candidate.name);
        option.value = candidate.id;
        destination.append(option);
      }
      const moveButton = element('button', 'move-task-button', 'Move task');
      moveButton.type = 'button';
      destination.disabled = project.archived || !destinations.length;
      moveButton.disabled = project.archived || !destinations.length;
      moveButton.addEventListener('click', async () => {
        if (!destination.value) return;
        try {
          await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
          });
          const index = tasks.findIndex(item => item.id === task.id);
          if (index !== -1) tasks.splice(index, 1);
          drawTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      destinationLabel.append(destination);
      row.append(destinationLabel, moveButton);
      list.append(row);
    }
  }
  filter.addEventListener('change', drawTasks);
  priorityFilter.addEventListener('change', drawTasks);
  applyDueRange.addEventListener('click', () => {
    alert.hidden = true;
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
      alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
      alert.hidden = false;
      return;
    }
    if (from && through && from > through) {
      alert.textContent = 'Due from must not be after Due through';
      alert.hidden = false;
      return;
    }
    appliedDueFrom = from;
    appliedDueThrough = through;
    drawTasks();
  });
  drawTasks();
  content.append(renameForm, defaultPriorityField, form, alert, filterField, priorityFilterField, dueRangeField, list);
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    alert.hidden = true;
    const name = renameInput.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      renameInput.focus();
      return;
    }
    try {
      const updated = await request(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = updated.name;
      heading.textContent = updated.name;
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    if (project.archived) return;
    try {
      tasks.push(await request(`/api/projects/${id}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      input.value = '';
      drawTasks();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  try {
    const id = projectIdFromPath();
    if (id) await renderProject(id);
    else await renderList();
  } catch {
    content.replaceChildren(element('p', 'alert', 'Unable to load this page.'));
  }
}

window.addEventListener('popstate', render);
render();
