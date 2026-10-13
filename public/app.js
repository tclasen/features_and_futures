import { orderDirectoryTasks } from './directory-order.js';

const app = document.querySelector('#app');

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function matchesSearch(value, query) {
  return asciiLower(value.replace(/[ \t]+/g, ' '))
    .includes(asciiLower(query.replace(/[ \t]+/g, ' ')));
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(error) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = error.message;
}

function validRangeDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function matchesTask(task, completion, priority, from, through, query) {
  return matchesSearch(task.title, query) &&
    (completion === 'deleted' ? task.deleted : !task.deleted &&
      (completion === 'all' || (completion === 'completed' ? task.completed : !task.completed))) &&
    (priority === 'all' || task.priority === priority) &&
    ((!from && !through) || (task.due_date !== '' &&
      (!from || task.due_date >= from) && (!through || task.due_date <= through)));
}

async function renderDirectory() {
  document.title = 'Task directory · Workboard';
  app.innerHTML = `
    <button type="button" id="back">Projects</button>
    <h1>Task directory</h1>
    <label for="project-scope">Project scope</label>
    <select id="project-scope">
      <option value="active">Active</option>
      <option value="archived">Archived</option>
    </select>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
      <option value="deleted">Deleted</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option value="all">All</option>
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>
    <label for="directory-order">Directory order</label>
    <select id="directory-order">
      <option value="original">Original</option>
      <option value="priority">Priority</option>
      <option value="due-date">Due date</option>
      <option value="title">Title</option>
    </select>
    <form id="directory-search-form">
      <label for="directory-search">Directory search</label>
      <input id="directory-search" type="text" autocomplete="off">
      <button type="submit">Search directory</button>
    </form>
    <form id="due-range">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <button type="button" id="complete-visible" disabled>Complete visible tasks</button>
    <button type="button" id="reopen-visible" disabled>Reopen visible tasks</button>
    <p id="directory-summary" data-testid="directory-summary" hidden></p>
    <p id="empty-directory" role="status" hidden>No matching tasks</p>
    <ul id="directory-tasks" aria-label="Task directory"></ul>`;
  app.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
  const scope = app.querySelector('#project-scope');
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const order = app.querySelector('#directory-order');
  const search = app.querySelector('#directory-search');
  const from = app.querySelector('#due-from');
  const through = app.querySelector('#due-through');
  const list = app.querySelector('#directory-tasks');
  const complete = app.querySelector('#complete-visible');
  const reopen = app.querySelector('#reopen-visible');
  let query = '';
  let appliedFrom = '';
  let appliedThrough = '';
  let tasks = [];
  let loading = true;
  let resolved = false;
  function draw() {
    list.replaceChildren();
    const visible = orderDirectoryTasks(tasks.filter((task) => task.archived === (scope.value === 'archived') &&
      matchesTask(task, completion.value, priority.value, appliedFrom, appliedThrough, query)), order.value);
    const summary = app.querySelector('#directory-summary');
    summary.hidden = loading || !resolved;
    if (!summary.hidden) {
      summary.textContent = `${visible.filter((task) => task.completed).length}/${visible.length} completed`;
    }
    app.querySelector('#empty-directory').hidden = loading || !resolved || visible.length > 0;
    list.setAttribute('aria-busy', String(loading));
    const readOnly = loading || scope.value === 'archived' || completion.value === 'deleted';
    complete.disabled = readOnly || !visible.some((task) => !task.completed);
    reopen.disabled = readOnly || !visible.some((task) => task.completed);
    for (const task of visible) {
      const row = document.createElement('li');
      row.dataset.testid = 'directory-task-row';
      for (const [field, value] of [
        ['task-title', task.title], ['project-name', task.project_name],
        ['task-completion', task.completed ? 'Completed' : 'Open'],
        ['task-priority', task.priority], ['task-due-date', task.due_date],
        ['task-notes', task.notes],
      ]) {
        const text = document.createElement('span');
        text.dataset.testid = `directory-${field}`;
        text.textContent = value;
        row.append(text);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { window.location.href = `/projects/${task.project_id}`; });
      row.append(open);
      list.append(row);
    }
  }
  async function setVisibleCompletion(value) {
    if ((value ? complete : reopen).disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    const filters = { completed: value, scope: scope.value, filter: completion.value,
      priority: priority.value, from: appliedFrom, through: appliedThrough, query };
    loading = true;
    draw();
    try {
      tasks = await request('/api/task-directory/completion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      resolved = true;
    } catch (error) { showError(error); }
    finally { loading = false; draw(); }
  }
  complete.addEventListener('click', () => setVisibleCompletion(true));
  reopen.addEventListener('click', () => setVisibleCompletion(false));
  for (const select of [scope, completion, priority, order]) select.addEventListener('change', draw);
  app.querySelector('#directory-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    query = search.value.trim();
    search.value = query;
    draw();
  });
  app.querySelector('#due-range').addEventListener('submit', (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const start = from.value.trim();
    const end = through.value.trim();
    if (!validRangeDate(start) || !validRangeDate(end)) {
      return showError(new Error('Due range must use valid YYYY-MM-DD dates'));
    }
    if (start && end && start > end) {
      return showError(new Error('Due from must not be after Due through'));
    }
    appliedFrom = start;
    appliedThrough = end;
    from.value = start;
    through.value = end;
    draw();
  });
  draw();
  try {
    tasks = await request('/api/task-directory');
    resolved = true;
  } catch (error) { showError(error); }
  finally { loading = false; draw(); }
}

function appendProject(project, onArchive) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    app.querySelector('[role="alert"]')?.remove();
    archive.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      onArchive();
    } catch (error) { archive.disabled = false; showError(error); }
  });
  row.append(name, summary, button, archive);
  app.querySelector('#projects').append(row);
  app.querySelector('#empty').hidden = true;
}

function renderRename(project) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label for="new-project-name">New project name</label>
    <div class="create-controls">
      <input id="new-project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Rename project</button>
    </div>`;
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  input.disabled = project.archived;
  submit.disabled = project.archived;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) return showError(new Error('Project name is required'));
    submit.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      Object.assign(project, saved);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = '';
      input.focus();
    } catch (error) { showError(error); }
    finally { submit.disabled = project.archived; }
  });
  app.append(form);
}

function renderDefaultPriority(project) {
  const controls = document.createElement('div');
  controls.innerHTML = `
    <label for="default-task-priority">Default task priority</label>
    <select id="default-task-priority">
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>`;
  const select = controls.querySelector('select');
  select.value = project.default_priority;
  select.disabled = project.archived;
  select.addEventListener('change', async () => {
    if (select.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    select.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_priority: select.value }),
      });
      Object.assign(project, saved);
    } catch (error) { showError(error); }
    finally {
      select.value = project.default_priority;
      select.disabled = project.archived;
    }
  });
  app.append(controls);
}

async function renderTasks(project) {
  const projectId = project.id;
  const section = document.createElement('section');
  section.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <h2>Tasks</h2>
    <form id="task-search-form">
      <label for="task-search">Task search</label>
      <input id="task-search" type="text" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
      <option value="deleted">Deleted</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option value="all">All</option>
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>
    <form id="due-range">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <p id="empty-tasks">No tasks to show.</p>
    <ul id="tasks" aria-label="Tasks"></ul>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const submit = form.querySelector('button');
  const filter = section.querySelector('#task-filter');
  const priorityFilter = section.querySelector('#priority-filter');
  const rangeForm = section.querySelector('#due-range');
  const dueFrom = section.querySelector('#due-from');
  const dueThrough = section.querySelector('#due-through');
  const searchForm = section.querySelector('#task-search-form');
  const searchInput = section.querySelector('#task-search');
  let appliedQuery = '';
  let appliedFrom = '';
  let appliedThrough = '';
  const list = section.querySelector('ul');
  const endpoint = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  let destinations = [];

  function drawTasks() {
    list.replaceChildren();
    const visible = tasks.filter((task) => matchesTask(task, filter.value,
      priorityFilter.value, appliedFrom, appliedThrough, appliedQuery));
    section.querySelector('#empty-tasks').hidden = visible.length > 0;
    for (const task of visible) {
      const readOnly = project.archived || Boolean(task.deleted);
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = readOnly;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        if (checkbox.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        checkbox.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          checkbox.disabled = readOnly;
          showError(error);
        }
      });
      const renameForm = document.createElement('form');
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      renameLabel.textContent = 'New task title';
      const renameControls = document.createElement('div');
      renameControls.className = 'create-controls';
      const renameInput = document.createElement('input');
      renameInput.id = renameLabel.htmlFor;
      renameInput.type = 'text';
      renameInput.name = 'title';
      renameInput.autocomplete = 'off';
      renameInput.disabled = readOnly;
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = readOnly;
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (renameButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        if (!renameInput.value.trim()) return showError(new Error('Task title is required'));
        renameButton.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: renameInput.value }),
          });
          Object.assign(task, saved);
          title.textContent = task.title;
          checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          renameInput.value = '';
          renameInput.focus();
          drawTasks();
        } catch (error) { showError(error); }
        finally { renameButton.disabled = readOnly; }
      });
      renameControls.append(renameInput, renameButton);
      renameForm.append(renameLabel, renameControls);
      const priorityControls = document.createElement('div');
      const priorityLabel = document.createElement('label');
      priorityLabel.htmlFor = `task-priority-${task.id}`;
      priorityLabel.textContent = 'Task priority';
      const priority = document.createElement('select');
      priority.id = priorityLabel.htmlFor;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.disabled = readOnly;
      priority.addEventListener('change', async () => {
        if (priority.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        priority.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) { showError(error); }
        finally {
          priority.value = task.priority;
          priority.disabled = readOnly;
        }
      });
      priorityControls.append(priorityLabel, priority);
      const dueForm = document.createElement('form');
      const dueLabel = document.createElement('label');
      dueLabel.htmlFor = `task-due-date-${task.id}`;
      dueLabel.textContent = 'Task due date';
      const dueControls = document.createElement('div');
      dueControls.className = 'create-controls';
      const dueInput = document.createElement('input');
      dueInput.id = dueLabel.htmlFor;
      dueInput.type = 'text';
      dueInput.name = 'due_date';
      dueInput.autocomplete = 'off';
      dueInput.value = task.due_date;
      dueInput.disabled = readOnly;
      const dueButton = document.createElement('button');
      dueButton.type = 'submit';
      dueButton.textContent = 'Save due date';
      dueButton.disabled = readOnly;
      dueForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (dueButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        dueButton.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: dueInput.value }),
          });
          Object.assign(task, saved);
          dueInput.value = task.due_date;
          drawTasks();
        } catch (error) { showError(error); }
        finally { dueButton.disabled = readOnly; }
      });
      dueControls.append(dueInput, dueButton);
      dueForm.append(dueLabel, dueControls);
      const moveForm = document.createElement('form');
      const destinationLabel = document.createElement('label');
      destinationLabel.htmlFor = `destination-project-${task.id}`;
      destinationLabel.textContent = 'Destination project';
      const destinationSelect = document.createElement('select');
      destinationSelect.id = destinationLabel.htmlFor;
      for (const destination of destinations) {
        const option = document.createElement('option');
        option.value = String(destination.id);
        option.textContent = destination.name;
        destinationSelect.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      destinationSelect.disabled = readOnly || destinations.length === 0;
      moveButton.disabled = destinationSelect.disabled;
      moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (moveButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        moveButton.disabled = true;
        destinationSelect.disabled = true;
        try {
          await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_project_id: Number(destinationSelect.value) }),
          });
          tasks = tasks.filter((item) => item.id !== task.id);
          drawTasks();
        } catch (error) { showError(error); }
        finally {
          destinationSelect.disabled = readOnly || destinations.length === 0;
          moveButton.disabled = destinationSelect.disabled;
        }
      });
      moveForm.append(destinationLabel, destinationSelect, moveButton);
      const notesForm = document.createElement('form');
      const notesLabel = document.createElement('label');
      notesLabel.htmlFor = `task-notes-${task.id}`;
      notesLabel.textContent = 'Task notes';
      const notesInput = document.createElement('textarea');
      notesInput.id = notesLabel.htmlFor;
      notesInput.name = 'notes';
      notesInput.rows = 4;
      notesInput.value = task.notes;
      notesInput.disabled = readOnly;
      const notesButton = document.createElement('button');
      notesButton.type = 'submit';
      notesButton.textContent = 'Save notes';
      notesButton.disabled = readOnly;
      notesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (notesButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        notesButton.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesInput.value }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) { showError(error); }
        finally { notesButton.disabled = readOnly; }
      });
      notesForm.append(notesLabel, notesInput, notesButton);
      const deletionButton = document.createElement('button');
      deletionButton.type = 'button';
      deletionButton.textContent = task.deleted ? 'Restore task' : 'Delete task';
      deletionButton.disabled = project.archived;
      deletionButton.addEventListener('click', async () => {
        if (deletionButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        deletionButton.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted: !task.deleted }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) { showError(error); }
        finally { deletionButton.disabled = project.archived; }
      });
      row.append(title, checkbox, priorityControls, renameForm, dueForm, moveForm, notesForm, deletionButton);
      list.append(row);
    }
  }

  filter.addEventListener('change', drawTasks);
  priorityFilter.addEventListener('change', drawTasks);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedQuery = searchInput.value.trim();
    searchInput.value = appliedQuery;
    drawTasks();
  });
  rangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if (!validRangeDate(from) || !validRangeDate(through)) {
      return showError(new Error('Due range must use valid YYYY-MM-DD dates'));
    }
    if (from && through && from > through) {
      return showError(new Error('Due from must not be after Due through'));
    }
    appliedFrom = from;
    appliedThrough = through;
    dueFrom.value = from;
    dueThrough.value = through;
    drawTasks();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) return showError(new Error('Task title is required'));
    submit.disabled = true;
    try {
      const task = await request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) { showError(error); }
    finally { submit.disabled = project.archived; }
  });
  try {
    const [savedTasks, projects] = await Promise.all([request(endpoint), request('/api/projects')]);
    tasks = savedTasks;
    destinations = projects.filter((item) => !item.archived && item.id !== projectId);
    drawTasks();
    submit.disabled = project.archived;
  } catch (error) { showError(error); }
}

async function render() {
  if (window.location.pathname === '/task-directory') {
    await renderDirectory();
    app.setAttribute('aria-busy', 'false');
    return;
  }
  const projectPath = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectPath) {
    app.innerHTML = '<button type="button" id="back">Projects</button><h1>Loading project…</h1>';
    app.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await request(`/api/projects/${projectPath[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      const download = document.createElement('button');
      download.type = 'button';
      download.textContent = 'Download project';
      download.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = `/api/projects/${project.id}/export`;
        link.download = 'workboard-project.json';
        link.click();
      });
      app.append(download);
      if (project.archived) {
        const notice = document.createElement('p');
        notice.textContent = 'Archived project';
        app.append(notice);
      }
      renderRename(project);
      renderDefaultPriority(project);
      await renderTasks(project);
    } catch (error) {
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(error);
    }
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <button type="button" id="task-directory">Task directory</button>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <form id="project-import-form">
        <label for="project-json">Project JSON</label>
        <textarea id="project-json" rows="8"></textarea>
        <label for="imported-project-name">Imported project name</label>
        <input id="imported-project-name" type="text" autocomplete="off">
        <button type="submit">Import project</button>
      </form>
      <h2>Projects</h2>
      <form id="project-search-form">
        <label for="project-search">Project search</label>
        <input id="project-search" type="text" autocomplete="off">
        <button type="submit">Search projects</button>
      </form>
      <label for="project-filter">Project filter</label>
      <select id="project-filter">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <p id="empty">No projects yet.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    app.querySelector('#task-directory').addEventListener('click', () => {
      window.location.href = '/task-directory';
    });
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    const importForm = app.querySelector('#project-import-form');
    const importButton = importForm.querySelector('button');
    importForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (importButton.disabled) return;
      app.querySelector('[role="alert"]')?.remove();
      importButton.disabled = true;
      try {
        const project = await request('/api/projects/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: importForm.querySelector('#imported-project-name').value,
            document: importForm.querySelector('#project-json').value,
          }),
        });
        window.location.href = `/projects/${project.id}`;
      } catch (error) { showError(error); }
      finally { importButton.disabled = false; }
    });
    const filter = app.querySelector('#project-filter');
    const searchForm = app.querySelector('#project-search-form');
    const searchInput = app.querySelector('#project-search');
    let appliedQuery = '';
    let projects = [];
    function drawProjects() {
      app.querySelector('#projects').replaceChildren();
      const visible = projects.filter((project) =>
        project.archived === (filter.value === 'archived') && matchesSearch(project.name, appliedQuery));
      app.querySelector('#empty').hidden = visible.length > 0;
      app.querySelector('#empty').textContent = 'No projects to show.';
      visible.forEach((project) => appendProject(project, drawProjects));
    }
    filter.addEventListener('change', drawProjects);
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      appliedQuery = searchInput.value.trim();
      searchInput.value = appliedQuery;
      drawProjects();
    });
    // Register after loading so creations always follow the persisted rows.
    try {
      submit.disabled = true;
      projects = await request('/api/projects');
      drawProjects();
    } catch (error) { showError(error); }
    finally { submit.disabled = false; }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      app.querySelector('[role="alert"]')?.remove();
      if (!input.value.trim()) return showError(new Error('Project name is required'));
      submit.disabled = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value }),
        });
        projects.push(project);
        drawProjects();
        input.value = '';
        input.focus();
      } catch (error) { showError(error); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
