import { validDueDate } from './dates.js';

const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  const alert = document.querySelector('#alert');
  alert.textContent = message;
  alert.hidden = !message;
}

function projectRow(project, refresh) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    showAlert('');
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      refresh();
    } catch (error) { showAlert(error.message); }
    finally { archive.disabled = false; }
  });
  row.append(name, summary, open, archive);
  return row;
}

function renderRename(project) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label for="new-project-name">New project name</label>
    <div class="create-controls">
      <input id="new-project-name" type="text" autocomplete="off">
      <button type="submit">Rename project</button>
    </div>`;
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  input.value = project.name;
  input.disabled = submit.disabled = Boolean(project.archived);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const name = input.value.trim();
    if (!name) { showAlert('Project name is required'); return; }
    showAlert('');
    submit.disabled = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      Object.assign(project, saved);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      input.value = project.name;
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = Boolean(project.archived); }
  });
  app.append(form);
}

async function renderTasks(project) {
  const section = document.createElement('section');
  section.innerHTML = `
    <label for="default-task-priority" class="filter-label">Default task priority</label>
    <select id="default-task-priority">
      <option>Low</option><option>Normal</option><option>High</option>
    </select>
    <form id="task-form">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <label for="task-filter" class="filter-label">Task filter</label>
    <select id="task-filter">
      <option>All</option><option>Open</option><option>Completed</option>
    </select>
    <label for="priority-filter" class="filter-label">Priority filter</label>
    <select id="priority-filter">
      <option>All</option><option>Low</option><option>Normal</option><option>High</option>
    </select>
    <form id="due-range-form">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <section id="tasks" aria-label="Tasks"></section>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('#task-title');
  const submit = form.querySelector('button');
  const filter = section.querySelector('#task-filter');
  const priorityFilter = section.querySelector('#priority-filter');
  const list = section.querySelector('#tasks');
  const rangeForm = section.querySelector('#due-range-form');
  const dueFrom = section.querySelector('#due-from');
  const dueThrough = section.querySelector('#due-through');
  // Draft inputs do not change membership until a valid range is applied.
  let appliedFrom = '';
  let appliedThrough = '';
  rangeForm.addEventListener('submit', event => {
    event.preventDefault();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if ((from && !validDueDate(from)) || (through && !validDueDate(through))) {
      showAlert('Due range must use valid YYYY-MM-DD dates');
      return;
    }
    if (from && through && from > through) {
      showAlert('Due from must not be after Due through');
      return;
    }
    appliedFrom = dueFrom.value = from;
    appliedThrough = dueThrough.value = through;
    showAlert('');
    displayTasks();
  });
  const defaultPriority = section.querySelector('#default-task-priority');
  defaultPriority.value = project.default_priority;
  defaultPriority.disabled = Boolean(project.archived);
  defaultPriority.addEventListener('change', async () => {
    defaultPriority.disabled = true;
    showAlert('');
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_priority: defaultPriority.value }),
      });
      Object.assign(project, saved);
    } catch (error) { showAlert(error.message); }
    finally {
      defaultPriority.value = project.default_priority;
      defaultPriority.disabled = Boolean(project.archived);
    }
  });
  const path = `/api/projects/${project.id}/tasks`;
  let tasks = await api(path);
  const destinations = (await api('/api/projects'))
    .filter(candidate => !candidate.archived && candidate.id !== project.id);

  function displayTasks() {
    const visible = tasks.filter(task =>
      (filter.value === 'All' ||
        (filter.value === 'Completed' ? task.completed : !task.completed)) &&
      (priorityFilter.value === 'All' || task.priority === priorityFilter.value) &&
      ((!appliedFrom && !appliedThrough) ||
        (task.due_date && (!appliedFrom || task.due_date >= appliedFrom) &&
          (!appliedThrough || task.due_date <= appliedThrough))));
    list.replaceChildren(...visible.map(task => {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = Boolean(project.archived);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        showAlert('');
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showAlert(error.message);
        } finally { checkbox.disabled = false; }
      });
      const renameForm = document.createElement('form');
      renameForm.className = 'task-rename';
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      renameLabel.textContent = 'New task title';
      const renameInput = document.createElement('input');
      renameInput.id = renameLabel.htmlFor;
      renameInput.type = 'text';
      renameInput.value = task.title;
      renameInput.disabled = Boolean(project.archived);
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = Boolean(project.archived);
      renameForm.append(renameLabel, renameInput, renameButton);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (renameButton.disabled) return;
        const newTitle = renameInput.value.trim();
        if (!newTitle) { showAlert('Task title is required'); return; }
        showAlert('');
        renameButton.disabled = true;
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) { showAlert(error.message); }
        finally { renameButton.disabled = Boolean(project.archived); }
      });
      const priorityLabel = document.createElement('label');
      priorityLabel.htmlFor = `task-priority-${task.id}`;
      priorityLabel.textContent = 'Task priority';
      const priority = document.createElement('select');
      priority.id = priorityLabel.htmlFor;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = option.textContent = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.disabled = Boolean(project.archived);
      priority.addEventListener('change', async () => {
        priority.disabled = true;
        showAlert('');
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) {
          priority.value = task.priority;
          showAlert(error.message);
        } finally { priority.disabled = Boolean(project.archived); }
      });
      const dueForm = document.createElement('form');
      const dueLabel = document.createElement('label');
      dueLabel.htmlFor = `task-due-date-${task.id}`;
      dueLabel.textContent = 'Task due date';
      const dueInput = document.createElement('input');
      dueInput.id = dueLabel.htmlFor;
      dueInput.type = 'text';
      dueInput.value = task.due_date || '';
      dueInput.disabled = Boolean(project.archived);
      const dueButton = document.createElement('button');
      dueButton.type = 'submit';
      dueButton.textContent = 'Save due date';
      dueButton.disabled = Boolean(project.archived);
      dueForm.append(dueLabel, dueInput, dueButton);
      dueForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (dueButton.disabled) return;
        showAlert('');
        dueButton.disabled = true;
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: dueInput.value }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) { showAlert(error.message); }
        finally { dueButton.disabled = Boolean(project.archived); }
      });
      const moveForm = document.createElement('form');
      const destinationLabel = document.createElement('label');
      destinationLabel.htmlFor = `destination-project-${task.id}`;
      destinationLabel.textContent = 'Destination project';
      const destination = document.createElement('select');
      destination.id = destinationLabel.htmlFor;
      for (const candidate of destinations) {
        const option = document.createElement('option');
        option.value = String(candidate.id);
        option.textContent = candidate.name;
        destination.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      destination.disabled = moveButton.disabled = Boolean(project.archived) || destinations.length === 0;
      moveForm.append(destinationLabel, destination, moveButton);
      moveForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (moveButton.disabled) return;
        moveButton.disabled = true;
        showAlert('');
        try {
          await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_project_id: Number(destination.value) }),
          });
          tasks = tasks.filter(candidate => candidate.id !== task.id);
          displayTasks();
        } catch (error) { showAlert(error.message); }
        finally { moveButton.disabled = Boolean(project.archived) || destinations.length === 0; }
      });
      row.append(checkbox, title, renameForm, priorityLabel, priority, dueForm, moveForm);
      return row;
    }));
  }
  displayTasks();
  filter.addEventListener('change', displayTasks);
  priorityFilter.addEventListener('change', displayTasks);
  submit.disabled = Boolean(project.archived);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const title = input.value.trim();
    if (!title) { showAlert('Task title is required'); return; }
    showAlert('');
    submit.disabled = true;
    try {
      const task = await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="back">Projects</button><h1></h1><p id="alert" role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await api(`/api/projects/${match[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      if (project.archived) {
        const notice = document.createElement('p');
        notice.textContent = 'Archived project';
        app.append(notice);
      }
      renderRename(project);
      await renderTasks(project);
    } catch (error) { showAlert(error.message); }
    return;
  }

  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p id="alert" role="alert" hidden></p>
    <label for="project-filter" class="filter-label">Project filter</label>
    <select id="project-filter"><option>Active</option><option>Archived</option></select>
    <section aria-label="Projects" id="projects"></section>`;
  const list = document.querySelector('#projects');
  const form = document.querySelector('form');
  const input = document.querySelector('#project-name');
  const submit = form.querySelector('button');
  const filter = document.querySelector('#project-filter');
  let projects = [];
  function displayProjects() {
    const archived = filter.value === 'Archived';
    list.replaceChildren(...projects.filter(project => Boolean(project.archived) === archived)
      .map(project => projectRow(project, displayProjects)));
  }
  filter.addEventListener('change', displayProjects);
  // Register creation only after loading existing projects to preserve row order.
  submit.disabled = true;
  try {
    projects = await api('/api/projects');
    displayProjects();
    submit.disabled = false;
  } catch (error) { showAlert(error.message); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const name = input.value.trim();
    if (!name) { showAlert('Project name is required'); return; }
    showAlert('');
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      displayProjects();
      input.value = '';
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
}

render();
