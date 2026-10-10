const view = document.querySelector('#project-view');

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

function heading(text) {
  const element = document.createElement('h1');
  element.textContent = text;
  return element;
}

function foldAsciiCase(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

async function showProjects() {
  view.replaceChildren(heading('Workboard'));
  const form = document.createElement('form');
  form.className = 'project-form';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'project-filter';
  filterLabel.textContent = 'Project filter';
  const filter = document.createElement('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = document.createElement('option');
    option.value = value === 'Archived' ? 'archived' : 'active';
    option.textContent = value;
    filter.append(option);
  }
  const searchForm = document.createElement('form');
  searchForm.className = 'project-form';
  const searchLabel = document.createElement('label');
  searchLabel.htmlFor = 'project-search';
  searchLabel.textContent = 'Project search';
  const searchInput = document.createElement('input');
  searchInput.id = 'project-search';
  searchInput.type = 'text';
  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.textContent = 'Search projects';
  searchForm.append(searchLabel, searchInput, searchButton);
  let appliedProjectSearch = '';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  const list = document.createElement('section');
  list.className = 'project-list';
  list.setAttribute('aria-label', 'Projects');
  view.append(form, filterLabel, filter, searchForm, list);

  async function refresh() {
    const projects = await request(`/api/projects?archived=${filter.value === 'archived'}`);
    const query = foldAsciiCase(appliedProjectSearch);
    list.replaceChildren(...projects.filter((project) => foldAsciiCase(project.name).includes(query)).map((project) => {
      const row = document.createElement('article');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const summary = document.createElement('span');
      summary.dataset.testid = 'project-summary';
      summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
      row.append(name, summary, open);
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.textContent = project.archived ? 'Restore project' : 'Archive project';
      archive.addEventListener('click', async () => {
        await request(`/api/projects/${encodeURIComponent(project.id)}/archive`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        await refresh();
      });
      row.append(archive);
      return row;
    }));
  }

  filter.addEventListener('change', () => refresh().catch((error) => {
    alert.textContent = error.message;
    alert.hidden = false;
  }));
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedProjectSearch = searchInput.value.trim();
    refresh().catch((error) => { alert.textContent = error.message; alert.hidden = false; });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      input.value = '';
      await refresh();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  await refresh();
}

async function showProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  view.replaceChildren(heading(project.name));
  if (project.archived) {
    const archivedNotice = document.createElement('p');
    archivedNotice.textContent = 'Archived project';
    view.append(archivedNotice);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { window.location.href = '/'; });
  const renameForm = document.createElement('form');
  renameForm.className = 'project-form';
  const renameLabel = document.createElement('label');
  renameLabel.htmlFor = 'new-project-name';
  renameLabel.textContent = 'New project name';
  const renameInput = document.createElement('input');
  renameInput.id = 'new-project-name';
  renameInput.name = 'name';
  renameInput.type = 'text';
  renameInput.autocomplete = 'off';
  renameInput.disabled = project.archived;
  const renameButton = document.createElement('button');
  renameButton.type = 'submit';
  renameButton.textContent = 'Rename project';
  renameButton.disabled = project.archived;
  const renameAlert = document.createElement('p');
  renameAlert.className = 'alert';
  renameAlert.setAttribute('role', 'alert');
  renameAlert.hidden = true;
  renameForm.append(renameLabel, renameInput, renameButton, renameAlert);
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    renameAlert.hidden = true;
    try {
      const renamed = await request(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: renameInput.value }),
      });
      headingElement.textContent = renamed.name;
      renameInput.value = '';
    } catch (error) {
      renameAlert.textContent = error.message;
      renameAlert.hidden = false;
    }
  });
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
  defaultPriority.value = project.defaultPriority;
  defaultPriority.addEventListener('change', async () => {
    defaultPriority.disabled = true;
    try {
      const updatedProject = await request(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaultPriority: defaultPriority.value }),
      });
      project.defaultPriority = updatedProject.defaultPriority;
    } catch (error) {
      defaultPriority.value = project.defaultPriority;
      renameAlert.textContent = error.message;
      renameAlert.hidden = false;
    } finally {
      defaultPriority.disabled = project.archived;
    }
  });
  const headingElement = view.querySelector('h1');
  const activeProjects = await request('/api/projects');
  const destinations = activeProjects.filter((candidate) => candidate.id !== id);
  const form = document.createElement('form');
  form.className = 'task-form';
  const label = document.createElement('label');
  label.htmlFor = 'task-title';
  label.textContent = 'Task title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create task';
  submit.disabled = project.archived;
  input.disabled = project.archived;
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);

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
  const taskSearchForm = document.createElement('form');
  taskSearchForm.className = 'project-form';
  const taskSearchLabel = document.createElement('label');
  taskSearchLabel.htmlFor = 'task-search';
  taskSearchLabel.textContent = 'Task search';
  const taskSearchInput = document.createElement('input');
  taskSearchInput.id = 'task-search';
  taskSearchInput.type = 'text';
  const taskSearchButton = document.createElement('button');
  taskSearchButton.type = 'submit';
  taskSearchButton.textContent = 'Search tasks';
  taskSearchForm.append(taskSearchLabel, taskSearchInput, taskSearchButton);
  let appliedTaskSearch = '';
  const dueRange = document.createElement('form');
  dueRange.className = 'due-range';
  const dueFromLabel = document.createElement('label');
  dueFromLabel.htmlFor = 'due-from';
  dueFromLabel.textContent = 'Due from';
  const dueFrom = document.createElement('input');
  dueFrom.id = 'due-from';
  dueFrom.type = 'text';
  dueFrom.placeholder = 'YYYY-MM-DD';
  const dueThroughLabel = document.createElement('label');
  dueThroughLabel.htmlFor = 'due-through';
  dueThroughLabel.textContent = 'Due through';
  const dueThrough = document.createElement('input');
  dueThrough.id = 'due-through';
  dueThrough.type = 'text';
  dueThrough.placeholder = 'YYYY-MM-DD';
  const applyDueRange = document.createElement('button');
  applyDueRange.type = 'submit';
  applyDueRange.textContent = 'Apply due range';
  dueRange.append(dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange);
  let appliedDueRange = { from: '', through: '' };
  const list = document.createElement('section');
  list.className = 'task-list';
  list.setAttribute('aria-label', 'Tasks');
  view.append(back, renameForm, defaultPriorityLabel, defaultPriority, form, filterLabel, filter, priorityFilterLabel, priorityFilter, taskSearchForm, dueRange, list);

  async function refresh() {
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    const visible = tasks.filter((task) =>
      (filter.value === 'all' || (filter.value === 'completed') === task.completed)
      && (priorityFilter.value === 'all' || priorityFilter.value === task.priority.toLowerCase())
      && (!appliedDueRange.from && !appliedDueRange.through || Boolean(task.dueDate))
      && (!appliedDueRange.from || task.dueDate >= appliedDueRange.from)
      && (!appliedDueRange.through || task.dueDate <= appliedDueRange.through));
    const query = foldAsciiCase(appliedTaskSearch);
    const searched = visible.filter((task) => foldAsciiCase(task.title).includes(query));
    list.replaceChildren(...searched.map((task) => {
      const row = document.createElement('article');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          await refresh();
        } catch (error) {
          checkbox.checked = task.completed;
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      const title = document.createElement('span');
      title.textContent = task.title;
      const priority = document.createElement('select');
      priority.setAttribute('aria-label', 'Task priority');
      priority.disabled = project.archived;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.addEventListener('change', async () => {
        priority.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          await refresh();
        } catch (error) {
          priority.value = task.priority;
          showTaskError(error);
          priority.disabled = project.archived;
        }
      });
      const renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.setAttribute('aria-label', 'New task title');
      renameInput.autocomplete = 'off';
      renameInput.disabled = project.archived;
      const renameButton = document.createElement('button');
      renameButton.type = 'button';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = project.archived;
      renameButton.addEventListener('click', async () => {
        alert.hidden = true;
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: renameInput.value }),
          });
          await refresh();
        } catch (error) { showTaskError(error); }
      });
      const dueDateInput = document.createElement('input');
      dueDateInput.type = 'text';
      dueDateInput.setAttribute('aria-label', 'Task due date');
      dueDateInput.placeholder = 'YYYY-MM-DD';
      dueDateInput.value = task.dueDate || '';
      dueDateInput.disabled = project.archived;
      const saveDueDate = document.createElement('button');
      saveDueDate.type = 'button';
      saveDueDate.textContent = 'Save due date';
      saveDueDate.disabled = project.archived;
      saveDueDate.addEventListener('click', async () => {
        alert.hidden = true;
        try {
          const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dueDate: dueDateInput.value }),
          });
          task.dueDate = updated.dueDate;
          dueDateInput.value = updated.dueDate || '';
          await refresh();
        } catch (error) { showTaskError(error); }
      });
      const destination = document.createElement('select');
      destination.setAttribute('aria-label', 'Destination project');
      for (const candidate of destinations) {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = candidate.name;
        destination.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'button';
      moveButton.textContent = 'Move task';
      destination.disabled = project.archived || destinations.length === 0;
      moveButton.disabled = project.archived || destinations.length === 0;
      moveButton.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}/move`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: destination.value }),
          });
          await refresh();
        } catch (error) { showTaskError(error); }
      });
      row.append(checkbox, title, priority, renameInput, renameButton, dueDateInput, saveDueDate, destination, moveButton);
      return row;
    }));
  }

  filter.addEventListener('change', () => refresh().catch(showTaskError));
  priorityFilter.addEventListener('change', () => refresh().catch(showTaskError));
  taskSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedTaskSearch = taskSearchInput.value.trim();
    refresh().catch(showTaskError);
  });
  dueRange.addEventListener('submit', async (event) => {
    event.preventDefault();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    alert.hidden = true;
    if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
      showTaskError(new Error('Due range must use valid YYYY-MM-DD dates'));
      return;
    }
    if (from && through && from > through) {
      showTaskError(new Error('Due from must not be after Due through'));
      return;
    }
    appliedDueRange = { from, through };
    try { await refresh(); } catch (error) { showTaskError(error); }
  });
  function showTaskError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      input.value = '';
      await refresh();
    } catch (error) { showTaskError(error); }
  });
  await refresh();
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) {
  showProject(decodeURIComponent(match[1])).catch(() => { window.location.href = '/'; });
} else {
  showProjects().catch((error) => {
    view.replaceChildren(heading('Workboard'));
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = error.message;
    view.append(message);
  });
}
