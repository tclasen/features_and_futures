import { normalizeDueRange, matchesDueRange } from './due-date.js';
import { matchesSearch } from './search.js';

const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
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
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}

function searchForm(id, label, buttonLabel, onSearch) {
  const form = element('form', '', { class: 'search-form' });
  const input = element('input', '', { id, type: 'text' });
  form.append(element('label', label, { for: id }), input,
    element('button', buttonLabel, { type: 'submit' }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    input.value = query;
    onSearch(query);
  });
  return form;
}

function projectRow(project, onArchiveChange) {
  const row = element('li', '', { 'data-testid': 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      app.querySelector('[role="alert"]')?.remove();
      onArchiveChange();
    } catch (error) {
      showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  const details = element('div', '', { class: 'project-details' });
  details.append(element('span', project.name), element('span',
    `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' }));
  const actions = element('div', '', { class: 'project-actions' });
  actions.append(open, archive);
  row.append(details, actions);
  return row;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  let projects = [];
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text' });
  const create = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, create);
  const list = element('ul', '', { 'aria-label': 'Projects', class: 'projects' });
  const filter = element('select', '', { id: 'project-filter' });
  for (const option of ['Active', 'Archived']) {
    filter.append(element('option', option, { value: option }));
  }
  const filters = element('div', '', { class: 'project-filters' });
  filters.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  let searchQuery = '';
  const search = searchForm('project-search', 'Project search', 'Search projects', (query) => {
    searchQuery = query;
    renderProjects();
  });
  function renderProjects() {
    const visible = projects.filter((project) => project.archived === (filter.value === 'Archived')
      && matchesSearch(project.name, searchQuery));
    list.replaceChildren(...visible.map((project) => projectRow(project, renderProjects)));
  }
  filter.addEventListener('change', renderProjects);
  app.append(form, filters, search, list);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (create.disabled) return;
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      renderProjects();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      create.disabled = false;
    }
  });
  // Load the persisted list before allowing writes so initial rows stay in order.
  create.disabled = true;
  try {
    projects = await request('/api/projects');
    renderProjects();
    create.disabled = false;
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

async function showProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  try {
    const project = await request(`/api/projects/${id}`);
    const heading = element('h1', project.name);
    app.append(heading);
    document.title = `${project.name} · Workboard`;
    if (project.archived) app.append(element('p', 'Archived project'));
    showProjectRename(project, heading);
    showProjectDefaultPriority(project);
    await showTasks(id, project.archived);
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

function showProjectRename(project, heading) {
  const form = element('form', '', { class: 'project-rename' });
  const input = element('input', '', { id: 'new-project-name', name: 'name', type: 'text' });
  const rename = element('button', 'Rename project', { type: 'submit' });
  input.value = project.name;
  input.disabled = project.archived;
  rename.disabled = project.archived;
  form.append(element('label', 'New project name', { for: 'new-project-name' }), input, rename);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (rename.disabled) return;
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    rename.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = saved.name;
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = project.name;
      app.querySelector('[role="alert"]')?.remove();
    } catch (error) {
      showError(error.message);
    } finally {
      rename.disabled = project.archived;
    }
  });
  app.append(form);
}

function showProjectDefaultPriority(project) {
  const control = element('div', '', { class: 'project-default-priority' });
  const select = element('select', '', { id: 'default-task-priority' });
  for (const priority of ['Low', 'Normal', 'High']) {
    select.append(element('option', priority, { value: priority }));
  }
  select.value = project.defaultPriority;
  select.disabled = project.archived;
  select.addEventListener('change', async () => {
    if (select.disabled) return;
    select.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPriority: select.value }),
      });
      project.defaultPriority = saved.defaultPriority;
      app.querySelector('[role="alert"]')?.remove();
    } catch (error) {
      showError(error.message);
    } finally {
      select.value = project.defaultPriority;
      select.disabled = project.archived;
    }
  });
  control.append(element('label', 'Default task priority', { for: 'default-task-priority' }), select);
  app.append(control);
}

function taskRenameForm(task, path, archived, onRename) {
  const form = element('form', '', { class: 'task-rename' });
  const inputId = `new-task-title-${task.id}`;
  const input = element('input', '', { id: inputId, name: 'title', type: 'text' });
  const rename = element('button', 'Rename task', { type: 'submit' });
  input.value = task.title;
  input.disabled = archived;
  rename.disabled = archived;
  form.append(element('label', 'New task title', { for: inputId }), input, rename);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (rename.disabled) return;
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    rename.disabled = true;
    try {
      const saved = await request(`${path}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      task.title = saved.title;
      app.querySelector('[role="alert"]')?.remove();
      onRename();
    } catch (error) {
      showError(error.message);
    } finally {
      rename.disabled = archived;
    }
  });
  return form;
}

function taskPriorityControl(task, path, archived, onPriorityChange) {
  const control = element('div', '', { class: 'task-priority' });
  const inputId = `task-priority-${task.id}`;
  const select = element('select', '', { id: inputId });
  for (const priority of ['Low', 'Normal', 'High']) {
    select.append(element('option', priority, { value: priority }));
  }
  select.value = task.priority;
  select.disabled = archived;
  select.addEventListener('change', async () => {
    if (select.disabled) return;
    select.disabled = true;
    try {
      const saved = await request(`${path}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: select.value }),
      });
      // This write only changes priority; other controls may have saved meanwhile.
      task.priority = saved.priority;
      app.querySelector('[role="alert"]')?.remove();
      onPriorityChange();
    } catch (error) {
      showError(error.message);
    } finally {
      select.value = task.priority;
      select.disabled = archived;
    }
  });
  control.append(element('label', 'Task priority', { for: inputId }), select);
  return control;
}

function taskDueDateForm(task, path, archived, onDueDateChange) {
  const form = element('form', '', { class: 'task-due-date' });
  const inputId = `task-due-date-${task.id}`;
  const input = element('input', '', { id: inputId, name: 'dueDate', type: 'text', placeholder: 'YYYY-MM-DD' });
  const save = element('button', 'Save due date', { type: 'submit' });
  input.value = task.dueDate ?? '';
  input.disabled = archived;
  save.disabled = archived;
  form.append(element('label', 'Task due date', { for: inputId }), input, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    try {
      const saved = await request(`${path}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: input.value }),
      });
      // Preserve any concurrent changes saved by the other task controls.
      task.dueDate = saved.dueDate;
      input.value = task.dueDate;
      app.querySelector('[role="alert"]')?.remove();
      onDueDateChange();
    } catch (error) {
      showError(error.message);
    } finally {
      save.disabled = archived;
    }
  });
  return form;
}

function taskNotesForm(task, path, archived, onNotesChange) {
  const form = element('form', '', { class: 'task-notes' });
  const inputId = `task-notes-${task.id}`;
  const input = element('textarea', '', { id: inputId, name: 'notes', rows: '4' });
  const save = element('button', 'Save notes', { type: 'submit' });
  input.value = task.notes ?? '';
  input.disabled = archived;
  save.disabled = archived;
  form.append(element('label', 'Task notes', { for: inputId }), input, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    try {
      const saved = await request(`${path}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: input.value }),
      });
      // Update only notes so concurrent saves from other controls are retained.
      task.notes = saved.notes;
      app.querySelector('[role="alert"]')?.remove();
      onNotesChange();
    } catch (error) {
      showError(error.message);
    } finally {
      save.disabled = archived;
    }
  });
  return form;
}

function taskMoveForm(task, path, archived, destinations, onMove) {
  const form = element('form', '', { class: 'task-move' });
  const inputId = `destination-project-${task.id}`;
  const select = element('select', '', { id: inputId });
  for (const project of destinations) {
    select.append(element('option', project.name, { value: String(project.id) }));
  }
  const move = element('button', 'Move task', { type: 'submit' });
  const disabled = archived || destinations.length === 0;
  select.disabled = disabled;
  move.disabled = disabled;
  form.append(element('label', 'Destination project', { for: inputId }), select, move);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (move.disabled) return;
    select.disabled = true;
    move.disabled = true;
    try {
      await request(`${path}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationProjectId: Number(select.value) }),
      });
      app.querySelector('[role="alert"]')?.remove();
      onMove();
    } catch (error) {
      showError(error.message);
    } finally {
      select.disabled = disabled;
      move.disabled = disabled;
    }
  });
  return form;
}

async function showTasks(projectId, archived) {
  const path = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  let destinations = [];
  const form = element('form');
  const input = element('input', '', { id: 'task-title', name: 'title', type: 'text' });
  const create = element('button', 'Create task', { type: 'submit' });
  create.disabled = true;
  form.append(element('label', 'Task title', { for: 'task-title' }), input, create);
  const filter = element('select', '', { id: 'task-filter' });
  for (const option of ['All', 'Open', 'Completed']) {
    filter.append(element('option', option, { value: option }));
  }
  const priorityFilter = element('select', '', { id: 'priority-filter' });
  for (const option of ['All', 'Low', 'Normal', 'High']) {
    priorityFilter.append(element('option', option, { value: option }));
  }
  const filters = element('div', '', { class: 'task-filters' });
  filters.append(element('label', 'Task filter', { for: 'task-filter' }), filter,
    element('label', 'Priority filter', { for: 'priority-filter' }), priorityFilter);
  let dueRange = { from: '', through: '' };
  const dueRangeForm = element('form', '', { class: 'due-range' });
  const dueFrom = element('input', '', { id: 'due-from', type: 'text', placeholder: 'YYYY-MM-DD' });
  const dueThrough = element('input', '', { id: 'due-through', type: 'text', placeholder: 'YYYY-MM-DD' });
  dueRangeForm.append(element('label', 'Due from', { for: 'due-from' }), dueFrom,
    element('label', 'Due through', { for: 'due-through' }), dueThrough,
    element('button', 'Apply due range', { type: 'submit' }));
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const range = normalizeDueRange(dueFrom.value, dueThrough.value);
    if (range.error) return showError(range.error);
    dueRange = range;
    dueFrom.value = range.from;
    dueThrough.value = range.through;
    app.querySelector('[role="alert"]')?.remove();
    renderTasks();
  });
  const list = element('ul', '', { 'aria-label': 'Tasks', class: 'tasks' });
  let searchQuery = '';
  const search = searchForm('task-search', 'Task search', 'Search tasks', (query) => {
    searchQuery = query;
    renderTasks();
  });
  app.append(form, filters, dueRangeForm, search, list);

  function renderTasks() {
    const visible = tasks.filter((task) =>
      (filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed))
      && (priorityFilter.value === 'All' || task.priority === priorityFilter.value)
      && matchesDueRange(task.dueDate, dueRange)
      && matchesSearch(task.title, searchQuery));
    list.replaceChildren(...visible.map((task) => {
      const row = element('li', '', { 'data-testid': 'task-row' });
      const checkbox = element('input', '', {
        type: 'checkbox', 'aria-label': `Complete ${task.title}`,
      });
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const saved = await request(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          app.querySelector('[role="alert"]')?.remove();
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = archived;
        }
      });
      const details = element('div', '', { class: 'task-details' });
      details.append(element('span', task.title), taskRenameForm(task, path, archived, renderTasks),
        taskPriorityControl(task, path, archived, renderTasks), taskDueDateForm(task, path, archived, renderTasks),
        taskNotesForm(task, path, archived, renderTasks),
        taskMoveForm(task, path, archived, destinations, () => {
          tasks = tasks.filter((remaining) => remaining.id !== task.id);
          renderTasks();
        }));
      row.append(checkbox, details);
      return row;
    }));
  }

  filter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (create.disabled) return;
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    create.disabled = true;
    try {
      const task = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      create.disabled = archived;
    }
  });
  const [savedTasks, projects] = await Promise.all([request(path), request('/api/projects')]);
  tasks = savedTasks;
  destinations = projects.filter((project) => !project.archived && project.id !== Number(projectId));
  renderTasks();
  create.disabled = archived;
}

const projectRoute = window.location.pathname.match(/^\/projects\/(\d+)$/);
try {
  if (projectRoute) await showProject(projectRoute[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
}
