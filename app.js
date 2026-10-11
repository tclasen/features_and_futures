const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function normalizeSearchQuery(value) {
  return normalizeSearchText(value.trim());
}

function normalizeSearchText(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function projectRow(project, refresh) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  row.append(element('span', project.name, { class: 'project-name' }));
  row.append(element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' }));
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => {
    history.pushState({}, '', `/projects/${project.id}`);
    renderProject(project.id);
  });
  row.append(open);
  if (project.archived) {
    const restore = element('button', 'Restore project', { type: 'button' });
    restore.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: false }) });
      refresh();
    });
    row.append(restore);
  } else {
    const archive = element('button', 'Archive project', { type: 'button' });
    archive.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: true }) });
      refresh();
    });
    row.append(archive);
  }
  return row;
}

async function renderList() {
  app.replaceChildren();
  app.append(element('h1', 'Workboard'));

  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', autocomplete: 'off' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(input, submit);
  const alert = element('p', '', { id: 'alert', role: 'alert', hidden: '' });
  const projects = element('section', undefined, { id: 'projects', 'aria-label': 'Projects' });
  const importForm = element('form');
  const importJson = element('textarea', undefined, { 'aria-label': 'Project JSON', rows: '8' });
  const importName = element('input', undefined, { type: 'text', 'aria-label': 'Imported project name', autocomplete: 'off' });
  const importButton = element('button', 'Import project', { type: 'submit' });
  importForm.append(importJson, importName, importButton);
  const importAlert = element('p', '', { role: 'alert', hidden: '' });
  const directoryButton = element('button', 'Task directory', { type: 'button' });
  directoryButton.addEventListener('click', () => {
    history.pushState({}, '', '/directory');
    renderDirectory();
  });
  importForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!importName.value.trim()) {
      importAlert.textContent = 'Project name is required';
      importAlert.hidden = false;
      return;
    }
    const result = await fetch('/api/import', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: importJson.value, name: importName.value }),
    });
    if (!result.ok) {
      const error = await result.json();
      importAlert.textContent = error.error === 'Project name is required' ? error.error : 'Invalid project JSON';
      importAlert.hidden = false;
      return;
    }
    const imported = await result.json();
    history.pushState({}, '', `/projects/${imported.id}`);
    renderProject(imported.id);
  });
  const filter = element('select', undefined, { 'aria-label': 'Project filter' });
  filter.append(element('option', 'Active', { value: 'active' }), element('option', 'Archived', { value: 'archived' }));
  const searchForm = element('form');
  const searchInput = element('input', undefined, { type: 'text', 'aria-label': 'Project search', autocomplete: 'off' });
  const searchButton = element('button', 'Search projects', { type: 'submit' });
  searchForm.append(searchInput, searchButton);
  let appliedQuery = '';
  app.append(form, alert, directoryButton, filter, projects, importForm, importAlert);

  const drawProjects = async () => {
    const allProjects = await loadProjects();
    const rows = document.createDocumentFragment();
    for (const project of allProjects) {
      if (project.archived !== (filter.value === 'archived')) continue;
      if (!normalizeSearchText(project.name).includes(appliedQuery)) continue;
      rows.append(projectRow(project, drawProjects));
    }
    projects.replaceChildren(rows);
  };
  filter.addEventListener('change', drawProjects);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedQuery = normalizeSearchQuery(searchInput.value);
    drawProjects();
  });
  app.insertBefore(searchForm, projects);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.textContent = '';
    alert.hidden = true;
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const project = await response.json();
    input.value = '';
    await drawProjects();
  });

  await drawProjects();
}

async function renderDirectory() {
  app.replaceChildren();
  const view = element('section', undefined, { id: 'directory-view' });
  view.append(element('h1', 'Task directory'));
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => {
    history.pushState({}, '', '/');
    renderList();
  });
  const scope = element('select', undefined, { 'aria-label': 'Project scope' });
  for (const value of ['Active', 'Archived']) scope.append(element('option', value, { value }));
  const filter = element('select', undefined, { 'aria-label': 'Task filter' });
  for (const [value, label] of [['all', 'All'], ['open', 'Open'], ['completed', 'Completed'], ['deleted', 'Deleted']]) filter.append(element('option', label, { value }));
  const priority = element('select', undefined, { 'aria-label': 'Priority filter' });
  for (const value of ['All', 'Low', 'Normal', 'High']) priority.append(element('option', value, { value }));
  const searchForm = element('form');
  const searchInput = element('input', undefined, { type: 'text', 'aria-label': 'Directory search', autocomplete: 'off' });
  searchForm.append(searchInput, element('button', 'Search directory', { type: 'submit' }));
  const rangeForm = element('form');
  const fromInput = element('input', undefined, { type: 'text', 'aria-label': 'Due from', placeholder: 'YYYY-MM-DD' });
  const throughInput = element('input', undefined, { type: 'text', 'aria-label': 'Due through', placeholder: 'YYYY-MM-DD' });
  rangeForm.append(fromInput, throughInput, element('button', 'Apply due range', { type: 'submit' }));
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const results = element('section', undefined, { 'aria-label': 'Directory tasks' });
  results.className = 'task-list';
  let rows = [];
  let query = '';
  let dueFrom = '';
  let dueThrough = '';
  const validDateValue = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  };
  const draw = () => {
    results.replaceChildren();
    for (const task of rows) {
      if (task.projectArchived !== (scope.value === 'Archived')) continue;
      if (filter.value === 'deleted' ? !task.deleted : task.deleted) continue;
      if (filter.value === 'open' && task.completed || filter.value === 'completed' && !task.completed) continue;
      if (priority.value !== 'All' && task.priority !== priority.value) continue;
      if (!normalizeSearchText(task.title).includes(query)) continue;
      if ((dueFrom || dueThrough) && !task.dueDate) continue;
      if (dueFrom && task.dueDate < dueFrom || dueThrough && task.dueDate > dueThrough) continue;
      const row = element('div', undefined, { 'data-testid': 'directory-task-row', class: 'task-row' });
      row.append(element('span', task.title, { 'data-testid': 'directory-task-title' }));
      row.append(element('span', task.projectName, { 'data-testid': 'directory-project-name' }));
      row.append(element('span', task.completed ? 'Completed' : 'Open', { 'data-testid': 'directory-task-completion' }));
      row.append(element('span', task.priority || 'Normal', { 'data-testid': 'directory-task-priority' }));
      row.append(element('span', task.dueDate || '', { 'data-testid': 'directory-task-due-date' }));
      row.append(element('span', task.notes || '', { 'data-testid': 'directory-task-notes' }));
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => {
        history.pushState({}, '', `/projects/${task.projectId}`);
        renderProject(task.projectId);
      });
      row.append(open);
      results.append(row);
    }
  };
  for (const control of [scope, filter, priority]) control.addEventListener('change', draw);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    query = normalizeSearchQuery(searchInput.value);
    draw();
  });
  rangeForm.addEventListener('submit', event => {
    event.preventDefault();
    const from = fromInput.value.trim(), through = throughInput.value.trim();
    if ((from && !validDateValue(from)) || (through && !validDateValue(through))) {
      alert.textContent = 'Due range must use valid YYYY-MM-DD dates'; alert.hidden = false; return;
    }
    if (from && through && from > through) {
      alert.textContent = 'Due from must not be after Due through'; alert.hidden = false; return;
    }
    dueFrom = from; dueThrough = through; alert.hidden = true; draw();
  });
  view.append(back, scope, filter, priority, searchForm, rangeForm, alert, results);
  app.append(view);
  const response = await fetch('/api/directory');
  if (response.ok) rows = await response.json();
  draw();
}

async function renderProject(id) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return renderList();
  }
  const project = await response.json();
  const projectListResponse = await fetch('/api/projects');
  const projectChoices = projectListResponse.ok ? await projectListResponse.json() : [];
  const view = element('section', undefined, { id: 'project-view' });
  view.append(element('h1', project.name));
  if (project.archived) view.append(element('p', 'Archived project'));
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => {
    history.pushState({}, '', '/');
    renderList();
  });
  const download = element('button', 'Download project', { type: 'button' });
  download.addEventListener('click', async () => {
    const result = await fetch(`/api/projects/${encodeURIComponent(id)}/export`);
    if (!result.ok) return;
    const file = new Blob([await result.text()], { type: 'application/json;charset=utf-8' });
    const fileUrl = URL.createObjectURL(file);
    const link = element('a', undefined, { href: fileUrl, download: 'workboard-project.json' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  });
  const renameForm = element('form');
  const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New project name', autocomplete: 'off' });
  const renameButton = element('button', 'Rename project', { type: 'submit' });
  renameInput.disabled = project.archived;
  renameButton.disabled = project.archived;
  renameForm.append(renameInput, renameButton);
  const renameAlert = element('p', '', { role: 'alert', hidden: '' });
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) {
      renameAlert.textContent = 'Project name is required';
      renameAlert.hidden = false;
      return;
    }
    const result = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!result.ok) {
      renameAlert.textContent = 'Project name is required';
      renameAlert.hidden = false;
      return;
    }
    project.name = name;
    view.querySelector('h1').textContent = name;
  });
  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Task title', autocomplete: 'off' });
  const submit = element('button', 'Create task', { type: 'submit' });
  if (project.archived) {
    input.disabled = true;
    submit.disabled = true;
  }
  form.append(input, submit);
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const filter = element('select', undefined, { 'aria-label': 'Task filter' });
  for (const [value, label] of [['all', 'All'], ['open', 'Open'], ['completed', 'Completed'], ['deleted', 'Deleted']]) {
    filter.append(element('option', label, { value }));
  }
  const priorityFilter = element('select', undefined, { 'aria-label': 'Priority filter' });
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    priorityFilter.append(element('option', value, { value }));
  }
  const dueRangeForm = element('form');
  const dueFromInput = element('input', undefined, { type: 'text', 'aria-label': 'Due from', placeholder: 'YYYY-MM-DD', autocomplete: 'off' });
  const dueThroughInput = element('input', undefined, { type: 'text', 'aria-label': 'Due through', placeholder: 'YYYY-MM-DD', autocomplete: 'off' });
  const applyDueRange = element('button', 'Apply due range', { type: 'submit' });
  dueRangeForm.append(dueFromInput, dueThroughInput, applyDueRange);
  const dueRangeAlert = element('p', '', { role: 'alert', hidden: '' });
  const searchForm = element('form');
  const searchInput = element('input', undefined, { type: 'text', 'aria-label': 'Task search', autocomplete: 'off' });
  const searchButton = element('button', 'Search tasks', { type: 'submit' });
  searchForm.append(searchInput, searchButton);
  let appliedQuery = '';
  let appliedDueFrom = '';
  let appliedDueThrough = '';
  const validDate = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= days[month - 1];
  };
  dueRangeForm.addEventListener('submit', event => {
    event.preventDefault();
    const from = dueFromInput.value.trim();
    const through = dueThroughInput.value.trim();
    if ((from && !validDate(from)) || (through && !validDate(through))) {
      dueRangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
      dueRangeAlert.hidden = false;
      return;
    }
    if (from && through && from > through) {
      dueRangeAlert.textContent = 'Due from must not be after Due through';
      dueRangeAlert.hidden = false;
      return;
    }
    appliedDueFrom = from;
    appliedDueThrough = through;
    dueRangeAlert.textContent = '';
    dueRangeAlert.hidden = true;
    drawTasks();
  });
  const defaultPriority = element('select', undefined, { 'aria-label': 'Default task priority' });
  for (const value of ['Low', 'Normal', 'High']) {
    defaultPriority.append(element('option', value, { value }));
  }
  defaultPriority.value = project.defaultTaskPriority || 'Normal';
  defaultPriority.disabled = project.archived;
  defaultPriority.addEventListener('change', async () => {
    const previousPriority = project.defaultTaskPriority || 'Normal';
    const result = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultTaskPriority: defaultPriority.value }),
    });
    if (result.ok) project.defaultTaskPriority = defaultPriority.value;
    else defaultPriority.value = previousPriority;
  });
  const tasks = element('section', undefined, { 'aria-label': 'Tasks' });
  tasks.className = 'task-list';
  let taskData = [];
  const drawTasks = () => {
    tasks.replaceChildren();
    const mode = filter.value;
    const selectedPriority = priorityFilter.value;
    for (const task of taskData) {
      if (mode === 'deleted' ? !task.deleted : task.deleted) continue;
      if (mode === 'open' && task.completed || mode === 'completed' && !task.completed) continue;
      if (selectedPriority !== 'All' && task.priority !== selectedPriority) continue;
      if (!normalizeSearchText(task.title).includes(appliedQuery)) continue;
      if ((appliedDueFrom || appliedDueThrough) && !task.dueDate) continue;
      if (task.dueDate && appliedDueFrom && task.dueDate < appliedDueFrom) continue;
      if (task.dueDate && appliedDueThrough && task.dueDate > appliedDueThrough) continue;
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'task-row' });
      row.append(element('span', task.title));
      const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived || task.deleted;
      checkbox.addEventListener('change', async () => {
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (result.ok) {
          task.completed = checkbox.checked;
          drawTasks();
        } else {
          checkbox.checked = task.completed;
        }
      });
      row.append(checkbox);
      const priority = element('select', undefined, { 'aria-label': 'Task priority' });
      for (const value of ['Low', 'Normal', 'High']) {
        priority.append(element('option', value, { value }));
      }
      priority.value = task.priority || 'Normal';
      priority.disabled = project.archived || task.deleted;
      priority.addEventListener('change', async () => {
        const previousPriority = task.priority || 'Normal';
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ priority: priority.value }),
        });
        if (result.ok) {
          task.priority = priority.value;
          drawTasks();
        }
        else priority.value = previousPriority;
      });
      row.append(priority);
      const renameForm = element('form');
      const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New task title', autocomplete: 'off' });
      const renameButton = element('button', 'Rename task', { type: 'submit' });
      renameInput.disabled = project.archived || task.deleted;
      renameButton.disabled = project.archived || task.deleted;
      const renameAlert = element('span', '', { role: 'alert', hidden: '' });
      renameForm.append(renameInput, renameButton);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        const title = renameInput.value.trim();
        if (!title) {
          renameAlert.textContent = 'Task title is required';
          renameAlert.hidden = false;
          return;
        }
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
        });
        if (!result.ok) {
          renameAlert.textContent = 'Task title is required';
          renameAlert.hidden = false;
          return;
        }
        task.title = title;
        drawTasks();
      });
      row.append(renameForm, renameAlert);
      const dueDateForm = element('form');
      const dueDateInput = element('input', undefined, { type: 'text', 'aria-label': 'Task due date', placeholder: 'YYYY-MM-DD', autocomplete: 'off' });
      dueDateInput.value = task.dueDate || '';
      const dueDateButton = element('button', 'Save due date', { type: 'submit' });
      dueDateInput.disabled = project.archived || task.deleted;
      dueDateButton.disabled = project.archived || task.deleted;
      const dueDateAlert = element('span', '', { role: 'alert', hidden: '' });
      dueDateForm.append(dueDateInput, dueDateButton);
      dueDateForm.addEventListener('submit', async event => {
        event.preventDefault();
        const dueDate = dueDateInput.value.trim();
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dueDate }),
        });
        if (!result.ok) {
          dueDateAlert.textContent = 'Due date must be a valid YYYY-MM-DD date';
          dueDateAlert.hidden = false;
          dueDateInput.value = task.dueDate || '';
          return;
        }
        const saved = await result.json();
        task.dueDate = saved.dueDate;
        dueDateAlert.hidden = true;
        drawTasks();
      });
      row.append(dueDateForm, dueDateAlert);
      const notesForm = element('form');
      const notesInput = element('textarea', undefined, { 'aria-label': 'Task notes', rows: '3' });
      notesInput.value = task.notes || '';
      notesInput.disabled = project.archived || task.deleted;
      const notesButton = element('button', 'Save notes', { type: 'submit' });
      notesButton.disabled = project.archived || task.deleted;
      notesForm.append(notesInput, notesButton);
      notesForm.addEventListener('submit', async event => {
        event.preventDefault();
        const notes = notesInput.value;
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes }),
        });
        if (result.ok) {
          task.notes = notes;
          drawTasks();
        }
      });
      row.append(notesForm);
      const destinations = projectChoices.filter(choice => !choice.archived && choice.id !== project.id);
      const moveForm = element('form');
      const destination = element('select', undefined, { 'aria-label': 'Destination project' });
      for (const choice of destinations) destination.append(element('option', choice.name, { value: choice.id }));
      const moveButton = element('button', 'Move task', { type: 'submit' });
      destination.disabled = project.archived || task.deleted || destinations.length === 0;
      moveButton.disabled = project.archived || task.deleted || destinations.length === 0;
      moveForm.append(destination, moveButton);
      moveForm.addEventListener('submit', async event => {
        event.preventDefault();
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}/move`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
        });
        if (result.ok) {
          taskData = taskData.filter(item => item.id !== task.id);
          drawTasks();
        }
      });
      row.append(moveForm);
      const deleteButton = element('button', task.deleted ? 'Restore task' : 'Delete task', { type: 'button' });
      deleteButton.disabled = project.archived;
      deleteButton.addEventListener('click', async () => {
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deleted: !task.deleted }),
        });
        if (result.ok) {
          task.deleted = !task.deleted;
          drawTasks();
        }
      });
      row.append(deleteButton);
      tasks.append(row);
    }
  };
  filter.addEventListener('change', drawTasks);
  priorityFilter.addEventListener('change', drawTasks);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedQuery = normalizeSearchQuery(searchInput.value);
    drawTasks();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      return;
    }
    const result = await fetch(`/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (!result.ok) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    input.value = '';
    taskData.push(await result.json());
    drawTasks();
  });
  const taskResponse = await fetch(`/api/projects/${id}/tasks`);
  if (taskResponse.ok) taskData = await taskResponse.json();
  drawTasks();
  view.append(back, download, renameForm, renameAlert, defaultPriority, form, alert, filter, priorityFilter, dueRangeForm, dueRangeAlert, searchForm, tasks);
  app.replaceChildren(view);
}

function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (location.pathname === '/directory') return renderDirectory();
  return match ? renderProject(match[1]) : renderList();
}

window.addEventListener('popstate', renderRoute);
renderRoute();
