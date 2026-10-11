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

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
}

function normalizeSearch(value) {
  return asciiLower(value).replace(/[ \t]+/g, ' ');
}

async function renderList() {
  let appliedSearch = '';
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

  const searchForm = element('form', 'project-search-form');
  const searchInput = element('input');
  searchInput.type = 'text';
  searchInput.autocomplete = 'off';
  searchInput.setAttribute('aria-label', 'Project search');
  const searchButton = element('button', 'secondary', 'Search projects');
  searchButton.type = 'submit';
  searchForm.append(searchInput, searchButton);
  app.append(searchForm);

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
    for (const project of projects.filter((item) => Boolean(item.archived) === (filter.value === 'archived') &&
      normalizeSearch(item.name).includes(normalizeSearch(appliedSearch)))) {
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
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedSearch = searchInput.value.trim();
    renderProjects();
  });
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

async function renderProject(id, viewState = {}) {
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
      await renderProject(id, {
        taskFilter: filter.value,
        priorityFilter: priorityFilter.value,
        appliedRange,
        taskSearch: appliedTaskSearch,
      });
    } catch (error) {
      renameAlert.textContent = error.message;
      renameAlert.hidden = false;
    }
  });

  const defaultPriorityLabel = element('label', 'filter-label', 'Default task priority');
  defaultPriorityLabel.htmlFor = 'default-task-priority';
  const defaultPriority = element('select', 'default-task-priority');
  defaultPriority.id = 'default-task-priority';
  for (const value of ['Low', 'Normal', 'High']) {
    const option = element('option', '', value);
    option.value = value;
    defaultPriority.append(option);
  }
  defaultPriority.value = project.defaultPriority || 'Normal';
  defaultPriority.disabled = Boolean(project.archived);
  defaultPriorityLabel.append(defaultPriority);
  app.append(defaultPriorityLabel);
  defaultPriority.addEventListener('change', async () => {
    defaultPriority.disabled = true;
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/default-priority`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: defaultPriority.value }),
      });
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
      defaultPriority.value = project.defaultPriority || 'Normal';
    } finally {
      defaultPriority.disabled = Boolean(project.archived);
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

  let appliedTaskSearch = viewState.taskSearch || '';
  const taskSearchForm = element('form', 'task-search-form');
  const taskSearchInput = element('input');
  taskSearchInput.type = 'text';
  taskSearchInput.autocomplete = 'off';
  taskSearchInput.setAttribute('aria-label', 'Task search');
  taskSearchInput.value = appliedTaskSearch;
  const taskSearchButton = element('button', 'secondary', 'Search tasks');
  taskSearchButton.type = 'submit';
  taskSearchForm.append(taskSearchInput, taskSearchButton);
  app.append(taskSearchForm);

  const filterLabel = element('label', 'filter-label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select', 'task-filter');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed', 'Deleted']) {
    const option = element('option', '', value);
    option.value = value.toLowerCase();
    filter.append(option);
  }
  filter.value = viewState.taskFilter || 'all';
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
  priorityFilter.value = viewState.priorityFilter || 'all';
  priorityFilterLabel.append(priorityFilter);
  app.append(priorityFilterLabel);

  let appliedRange = viewState.appliedRange || { from: '', through: '' };
  const dueRangeForm = element('form', 'due-range-form');
  const dueFromLabel = element('label', '', 'Due from');
  const dueFrom = element('input');
  dueFrom.type = 'text';
  dueFrom.autocomplete = 'off';
  dueFrom.setAttribute('aria-label', 'Due from');
  dueFrom.value = appliedRange.from;
  dueFromLabel.append(dueFrom);
  const dueThroughLabel = element('label', '', 'Due through');
  const dueThrough = element('input');
  dueThrough.type = 'text';
  dueThrough.autocomplete = 'off';
  dueThrough.setAttribute('aria-label', 'Due through');
  dueThrough.value = appliedRange.through;
  dueThroughLabel.append(dueThrough);
  const applyDueRange = element('button', 'secondary', 'Apply due range');
  applyDueRange.type = 'submit';
  dueRangeForm.append(dueFromLabel, dueThroughLabel, applyDueRange);
  app.append(dueRangeForm);
  function validCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }

  const list = element('div', 'task-list');
  list.setAttribute('aria-label', 'Tasks');
  app.append(list);

  async function renderTasks() {
    const [tasks, projects] = await Promise.all([
      request(`/api/projects/${encodeURIComponent(id)}/tasks`),
      request('/api/projects'),
    ]);
    const destinations = projects.filter((item) => !item.archived && item.id !== id);
    list.replaceChildren();
    const visible = tasks.filter((task) =>
      (filter.value === 'deleted' ? Boolean(task.deleted) : !task.deleted &&
        (filter.value === 'all' || (filter.value === 'completed') === Boolean(task.completed))) &&
      (priorityFilter.value === 'all' || (task.priority || 'Normal').toLowerCase() === priorityFilter.value) &&
      normalizeSearch(task.title).includes(normalizeSearch(appliedTaskSearch)) &&
      ((!appliedRange.from && !appliedRange.through) || (Boolean(task.dueDate) &&
        (!appliedRange.from || task.dueDate >= appliedRange.from) &&
        (!appliedRange.through || task.dueDate <= appliedRange.through))));
    for (const task of visible) {
      const deleted = Boolean(task.deleted);
      const locked = Boolean(project.archived) || deleted;
      const row = element('article', 'task-row');
      row.dataset.testid = 'task-row';
      if (deleted) row.classList.add('deleted-task');
      row.append(element('span', 'task-title', task.title));
      const checkboxLabel = element('label', 'task-check');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.disabled = locked;
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
      renameInput.disabled = locked;
      const renameButton = element('button', 'secondary', 'Rename task');
      renameButton.type = 'submit';
      renameButton.disabled = locked;
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
      priority.disabled = locked;
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

      const dueDateForm = element('form', 'task-due-date-form');
      const dueDateInput = element('input');
      dueDateInput.type = 'text';
      dueDateInput.value = task.dueDate || '';
      dueDateInput.autocomplete = 'off';
      dueDateInput.setAttribute('aria-label', 'Task due date');
      dueDateInput.disabled = locked;
      const dueDateButton = element('button', 'secondary', 'Save due date');
      dueDateButton.type = 'submit';
      dueDateButton.disabled = locked;
      dueDateForm.append(dueDateInput, dueDateButton);
      dueDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        alert.hidden = true;
        const dueDate = dueDateInput.value.trim();
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dueDate }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(dueDateForm);

      const notesForm = element('form', 'task-notes-form');
      const notesInput = element('textarea');
      notesInput.value = task.notes || '';
      notesInput.setAttribute('aria-label', 'Task notes');
      notesInput.disabled = locked;
      const notesButton = element('button', 'secondary', 'Save notes');
      notesButton.type = 'submit';
      notesButton.disabled = locked;
      notesForm.append(notesInput, notesButton);
      notesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        alert.hidden = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ notes: notesInput.value }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      row.append(notesForm);

      const destinationLabel = element('label', 'task-destination-label', 'Destination project');
      const destinationSelect = element('select', 'task-destination');
      destinationSelect.setAttribute('aria-label', 'Destination project');
      for (const destination of destinations) {
        const option = element('option', '', destination.name);
        option.value = destination.id;
        destinationSelect.append(option);
      }
      const moveButton = element('button', 'secondary', 'Move task');
      moveButton.type = 'button';
      destinationSelect.disabled = locked || destinations.length === 0;
      moveButton.disabled = locked || destinations.length === 0;
      destinationLabel.append(destinationSelect);
      moveButton.addEventListener('click', async () => {
        moveButton.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}/move`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: destinationSelect.value }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
          moveButton.disabled = Boolean(project.archived) || destinations.length === 0;
        }
      });
      row.append(destinationLabel, moveButton);
      const stateButton = element('button', 'secondary', deleted ? 'Restore task' : 'Delete task');
      stateButton.type = 'button';
      stateButton.disabled = Boolean(project.archived);
      stateButton.addEventListener('click', async () => {
        stateButton.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ deleted: !deleted }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
          stateButton.disabled = Boolean(project.archived);
        }
      });
      row.append(stateButton);
      list.append(row);
    }
  }

  filter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
  taskSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedTaskSearch = taskSearchInput.value.trim();
    renderTasks();
  });
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    alert.hidden = true;
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if ((from && !validCalendarDate(from)) || (through && !validCalendarDate(through))) {
      alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
      alert.hidden = false;
      return;
    }
    if (from && through && from > through) {
      alert.textContent = 'Due from must not be after Due through';
      alert.hidden = false;
      return;
    }
    appliedRange = { from, through };
    renderTasks();
  });
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
