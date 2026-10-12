const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', undefined, { role: 'alert', class: 'alert' });
    app.querySelector('form').after(alert);
  }
  alert.textContent = message;
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', name: 'name' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(input, create);
  app.append(form);
  const importForm = element('form');
  const jsonInput = element('textarea', undefined, { 'aria-label': 'Project JSON', name: 'document' });
  const importedName = element('input', undefined, { type: 'text', 'aria-label': 'Imported project name', name: 'name' });
  const importButton = element('button', 'Import project', { type: 'submit' });
  importForm.append(jsonInput, importedName, importButton);
  app.append(importForm);
  const directoryLink = element('a', 'Task directory', { href: '/directory' });
  app.append(directoryLink);
  importForm.addEventListener('submit', async event => {
    event.preventDefault();
    let document;
    try { document = JSON.parse(jsonInput.value); } catch { showError('Invalid project JSON'); return; }
    if (!importedName.value.trim()) { showError('Project name is required'); importedName.focus(); return; }
    const response = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document, name: importedName.value }) });
    if (!response.ok) { const error = await response.json(); showError(error.error || 'Invalid project JSON'); return; }
    const result = await response.json();
    window.location.href = `/projects/${encodeURIComponent(result.id)}`;
  });
  const filter = element('select', undefined, { 'aria-label': 'Project filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  app.append(filter);
  const searchForm = element('form');
  const searchInput = element('input', undefined, { type: 'text', 'aria-label': 'Project search' });
  const searchButton = element('button', 'Search projects', { type: 'submit' });
  searchForm.append(searchInput, searchButton);
  app.append(searchForm);
  let appliedProjectQuery = '';
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(list);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const error = await response.json();
      showError(error.error || 'Could not create project');
      return;
    }
    const project = await response.json();
    input.value = '';
    app.querySelector('[role="alert"]')?.remove();
    await renderProjects();
  });
  const renderProjects = async () => {
    const projects = await loadProjects();
    list.replaceChildren();
    for (const project of projects) {
      if (filter.value === 'Active' && project.archived || filter.value === 'Archived' && !project.archived) continue;
      if (!searchMatches(project.name, appliedProjectQuery)) continue;
      list.append(projectRow(project, renderProjects));
    }
  };
  filter.addEventListener('change', () => renderProjects().catch(() => showError('Could not load projects')));
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedProjectQuery = searchInput.value.trim();
    renderProjects().catch(() => showError('Could not load projects'));
  });
  await renderProjects();
}

function projectRow(project, refresh) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  row.append(element('span', project.name));
  row.append(element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' }));
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
  row.append(open);
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    const response = await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
    if (response.ok) await refresh();
  });
  row.append(archive);
  return row;
}

async function renderProject(id) {
  const projects = await loadProjects();
  const project = projects.find(item => String(item.id) === id);
  if (!project) {
    app.append(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    return;
  }
  const heading = element('h1', project.name);
  app.append(heading);
  if (project.archived) app.append(element('p', 'Archived project'));
  const renameForm = element('form');
  const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New project name', name: 'name' });
  const renameButton = element('button', 'Rename project', { type: 'submit' });
  renameInput.disabled = project.archived;
  renameButton.disabled = project.archived;
  renameForm.append(renameInput, renameButton);
  app.append(renameForm);
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) { showError('Project name is required'); renameInput.focus(); return; }
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) { const error = await response.json(); showError(error.error || 'Could not rename project'); return; }
    heading.textContent = name;
    renameInput.value = '';
    app.querySelector('[role="alert"]')?.remove();
  });
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const download = element('a', 'Download project', { href: `/api/projects/${encodeURIComponent(id)}/export`, download: 'workboard-project.json' });
  app.append(download);

  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Task title', name: 'title' });
  const createTask = element('button', 'Create task', { type: 'submit' });
  createTask.disabled = project.archived;
  input.disabled = project.archived;
  form.append(input, createTask);
  app.append(form);
  const filterLabel = element('label', 'Task filter');
  const filter = element('select', undefined, { 'aria-label': 'Task filter' });
  for (const value of ['All', 'Open', 'Completed', 'Deleted']) filter.append(element('option', value, { value }));
  filterLabel.append(filter);
  app.append(filterLabel);
  const priorityFilterLabel = element('label', 'Priority filter');
  const priorityFilter = element('select', undefined, { 'aria-label': 'Priority filter' });
  for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', value, { value }));
  priorityFilterLabel.append(priorityFilter);
  app.append(priorityFilterLabel);
  const defaultPriorityLabel = element('label', 'Default task priority');
  const defaultPriority = element('select', undefined, { 'aria-label': 'Default task priority' });
  for (const value of ['Low', 'Normal', 'High']) {
    const option = element('option', value, { value });
    option.selected = project.defaultPriority === value;
    defaultPriority.append(option);
  }
  defaultPriority.disabled = project.archived;
  defaultPriorityLabel.append(defaultPriority);
  app.append(defaultPriorityLabel);
  defaultPriority.addEventListener('change', async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ defaultPriority: defaultPriority.value })
    });
    if (!response.ok) showError('Could not update default task priority');
    else app.querySelector('[role="alert"]')?.remove();
  });
  const dueRangeForm = element('form');
  const dueFrom = element('input', undefined, { type: 'text', 'aria-label': 'Due from' });
  const dueThrough = element('input', undefined, { type: 'text', 'aria-label': 'Due through' });
  const applyDueRange = element('button', 'Apply due range', { type: 'submit' });
  dueRangeForm.append(dueFrom, dueThrough, applyDueRange);
  app.append(dueRangeForm);
  let appliedDueFrom = '';
  let appliedDueThrough = '';
  const searchForm = element('form');
  const searchInput = element('input', undefined, { type: 'text', 'aria-label': 'Task search' });
  const searchButton = element('button', 'Search tasks', { type: 'submit' });
  searchForm.append(searchInput, searchButton);
  app.append(searchForm);
  let appliedTaskQuery = '';
  const list = element('section', undefined, { 'aria-label': 'Tasks' });
  app.append(list);

  const renderTasks = async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`);
    if (!response.ok) throw new Error('Could not load tasks');
    const tasks = await response.json();
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Deleted' ? !task.deleted : task.deleted) continue;
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
      if (!searchMatches(task.title, appliedTaskQuery)) continue;
      if ((appliedDueFrom || appliedDueThrough) && (!task.dueDate ||
          (appliedDueFrom && task.dueDate < appliedDueFrom) ||
          (appliedDueThrough && task.dueDate > appliedDueThrough))) continue;
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'project-row' });
      row.append(element('span', task.title));
      const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived || task.deleted;
      checkbox.addEventListener('change', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
        });
        if (!update.ok) showError('Could not update task');
        else await renderTasks();
      });
      row.append(checkbox);
      const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New task title', value: task.title });
      const renameButton = element('button', 'Rename task', { type: 'button' });
      renameInput.disabled = project.archived || task.deleted;
      renameButton.disabled = project.archived || task.deleted;
      renameButton.addEventListener('click', async () => {
        const title = renameInput.value.trim();
        if (!title) { showError('Task title is required'); renameInput.focus(); return; }
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (!update.ok) { const error = await update.json(); showError(error.error || 'Could not rename task'); return; }
        app.querySelector('[role="alert"]')?.remove();
        await renderTasks();
      });
      row.append(renameInput, renameButton);
      const priority = element('select', undefined, { 'aria-label': 'Task priority' });
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', value, { value });
        option.selected = task.priority === value;
        priority.append(option);
      }
      priority.disabled = project.archived || task.deleted;
      priority.addEventListener('change', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: priority.value })
        });
        if (!update.ok) showError('Could not update task priority');
        else await renderTasks();
      });
      row.append(priority);
      const dueDate = element('input', undefined, { type: 'text', 'aria-label': 'Task due date', value: task.dueDate || '' });
      const saveDueDate = element('button', 'Save due date', { type: 'button' });
      dueDate.disabled = project.archived || task.deleted;
      saveDueDate.disabled = project.archived || task.deleted;
      saveDueDate.addEventListener('click', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dueDate: dueDate.value })
        });
        if (!update.ok) {
          const error = await update.json();
          showError(error.error || 'Could not save due date');
        } else {
          app.querySelector('[role="alert"]')?.remove();
          await renderTasks();
        }
      });
      row.append(dueDate, saveDueDate);
      const notes = element('textarea', undefined, { 'aria-label': 'Task notes' });
      notes.value = task.notes || '';
      notes.disabled = project.archived || task.deleted;
      const saveNotes = element('button', 'Save notes', { type: 'button' });
      saveNotes.disabled = project.archived || task.deleted;
      saveNotes.addEventListener('click', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: notes.value })
        });
        if (!update.ok) {
          const error = await update.json();
          showError(error.error || 'Could not save notes');
        } else {
          app.querySelector('[role="alert"]')?.remove();
          await renderTasks();
        }
      });
      row.append(notes, saveNotes);
      const destination = element('select', undefined, { 'aria-label': 'Destination project' });
      const eligibleProjects = projects.filter(item => !item.archived && String(item.id) !== id);
      for (const candidate of eligibleProjects) {
        destination.append(element('option', candidate.name, { value: candidate.id }));
      }
      const moveButton = element('button', 'Move task', { type: 'button' });
      destination.disabled = project.archived || task.deleted || eligibleProjects.length === 0;
      moveButton.disabled = project.archived || task.deleted || eligibleProjects.length === 0;
      moveButton.addEventListener('click', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}/move`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ destinationProjectId: Number(destination.value) })
        });
        if (!update.ok) {
          const error = await update.json();
          showError(error.error || 'Could not move task');
        } else {
          app.querySelector('[role="alert"]')?.remove();
          await renderTasks();
        }
      });
      row.append(destination, moveButton);
      const lifecycleButton = element('button', task.deleted ? 'Restore task' : 'Delete task', { type: 'button' });
      lifecycleButton.disabled = project.archived;
      lifecycleButton.addEventListener('click', async () => {
        const update = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deleted: !task.deleted })
        });
        if (!update.ok) showError(task.deleted ? 'Could not restore task' : 'Could not delete task');
        else await renderTasks();
      });
      row.append(lifecycleButton);
      list.append(row);
    }
  };
  filter.addEventListener('change', () => renderTasks().catch(() => showError('Could not load tasks')));
  priorityFilter.addEventListener('change', () => renderTasks().catch(() => showError('Could not load tasks')));
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedTaskQuery = searchInput.value.trim();
    app.querySelector('[role="alert"]')?.remove();
    renderTasks().catch(() => showError('Could not load tasks'));
  });
  dueRangeForm.addEventListener('submit', event => {
    event.preventDefault();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
      showError('Due range must use valid YYYY-MM-DD dates');
      return;
    }
    if (from && through && from > through) {
      showError('Due from must not be after Due through');
      return;
    }
    appliedDueFrom = from;
    appliedDueThrough = through;
    app.querySelector('[role="alert"]')?.remove();
    renderTasks().catch(() => showError('Could not load tasks'));
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) { showError('Task title is required'); input.focus(); return; }
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
    });
    if (!response.ok) { const error = await response.json(); showError(error.error || 'Could not create task'); return; }
    input.value = '';
    app.querySelector('[role="alert"]')?.remove();
    await renderTasks();
  });
  await renderTasks();
}

function searchMatches(value, query) {
  const normalize = text => text
    .replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, character => character.toLowerCase());
  return normalize(value).includes(normalize(query));
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function renderDirectory() {
  app.replaceChildren(element('h1', 'Task directory'));
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const scope = element('select', undefined, { 'aria-label': 'Project scope' });
  for (const value of ['Active', 'Archived']) scope.append(element('option', value, { value }));
  const taskFilter = element('select', undefined, { 'aria-label': 'Task filter' });
  for (const value of ['All', 'Open', 'Completed', 'Deleted']) taskFilter.append(element('option', value, { value }));
  const priorityFilter = element('select', undefined, { 'aria-label': 'Priority filter' });
  for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', value, { value }));
  const searchForm = element('form');
  const search = element('input', undefined, { type: 'text', 'aria-label': 'Directory search' });
  searchForm.append(search, element('button', 'Search directory', { type: 'submit' }));
  const from = element('input', undefined, { type: 'text', 'aria-label': 'Due from' });
  const through = element('input', undefined, { type: 'text', 'aria-label': 'Due through' });
  const rangeForm = element('form');
  rangeForm.append(from, through, element('button', 'Apply due range', { type: 'submit' }));
  const completeVisible = element('button', 'Complete visible tasks', { type: 'button' });
  const reopenVisible = element('button', 'Reopen visible tasks', { type: 'button' });
  const empty = element('p', 'No matching tasks');
  const list = element('section', undefined, { 'aria-label': 'Directory tasks' });
  app.append(scope, taskFilter, priorityFilter, searchForm, rangeForm, completeVisible, reopenVisible, empty, list);
  let query = '', low = '', high = '';
  const render = async () => {
    empty.hidden = true;
    const response = await fetch('/api/directory');
    if (!response.ok) throw new Error('Could not load directory');
    const rows = await response.json(); list.replaceChildren();
    const visible = [];
    for (const task of rows) {
      if ((scope.value === 'Active' && task.archived) || (scope.value === 'Archived' && !task.archived)) continue;
      if (taskFilter.value === 'Deleted' ? !task.deleted : task.deleted) continue;
      if (taskFilter.value === 'Open' && task.completed || taskFilter.value === 'Completed' && !task.completed) continue;
      if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
      if (!searchMatches(task.title, query)) continue;
      if ((low || high) && (!task.dueDate || low && task.dueDate < low || high && task.dueDate > high)) continue;
      visible.push(task);
      const row = element('div', undefined, { 'data-testid': 'directory-task-row' });
      row.dataset.taskId = task.taskId;
      row.dataset.completed = String(task.completed);
      row.append(element('span', task.title, { 'data-testid': 'directory-task-title' }), element('span', task.projectName, { 'data-testid': 'directory-project-name' }));
      row.append(element('span', task.completed ? 'Completed' : 'Open', { 'data-testid': 'directory-task-completion' }), element('span', task.priority, { 'data-testid': 'directory-task-priority' }), element('span', task.dueDate, { 'data-testid': 'directory-task-due-date' }), element('span', task.notes, { 'data-testid': 'directory-task-notes' }));
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => { window.location.href = `/projects/${task.projectId}`; }); row.append(open); list.append(row);
    }
    empty.hidden = visible.length !== 0;
    const eligible = scope.value === 'Active' && taskFilter.value !== 'Deleted' ? visible.filter(task => !task.deleted) : [];
    completeVisible.disabled = !eligible.some(task => !task.completed);
    reopenVisible.disabled = !eligible.some(task => task.completed);
  };
  const bulkUpdate = async completed => {
    const response = await fetch('/api/directory/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskIds: [...list.querySelectorAll('[data-task-id]')].filter(row => (row.dataset.completed === 'true') !== completed).map(row => Number(row.dataset.taskId)), completed }) });
    if (!response.ok) { showError('Could not update tasks'); return; }
    await render();
  };
  completeVisible.addEventListener('click', () => bulkUpdate(true).catch(() => showError('Could not update tasks')));
  reopenVisible.addEventListener('click', () => bulkUpdate(false).catch(() => showError('Could not update tasks')));
  for (const control of [scope, taskFilter, priorityFilter]) control.addEventListener('change', () => render().catch(() => showError('Could not load directory')));
  searchForm.addEventListener('submit', event => { event.preventDefault(); query = search.value.trim(); render(); });
  rangeForm.addEventListener('submit', event => {
    event.preventDefault(); const a = from.value.trim(), b = through.value.trim();
    if (a && !isValidDate(a) || b && !isValidDate(b)) return showError('Due range must use valid YYYY-MM-DD dates');
    if (a && b && a > b) return showError('Due from must not be after Due through');
    low = a; high = b; render();
  });
  await render();
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1])).catch(() => showError('Could not load project'));
else if (window.location.pathname === '/directory') renderDirectory().catch(() => showError('Could not load directory'));
else renderList().catch(() => showError('Could not load projects'));
