import { matchesTaskFilters, normalizeDueRange } from './task-filters.js';
import { matchesProjectFilters, normalizeSearchQuery } from './search.js';

const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project, onArchiveChange) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.textContent = 'Open project';
  button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      app.querySelector('[role="alert"]').hidden = true;
      onArchiveChange();
    } catch (error) {
      showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, button, archive);
  return row;
}

async function showProjects() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <label for="project-filter">Project filter</label>
    <select id="project-filter">
      <option>Active</option>
      <option>Archived</option>
    </select>
    <form id="project-search-form">
      <label for="project-search">Project search</label>
      <input id="project-search" type="text" autocomplete="off">
      <button type="submit">Search projects</button>
    </form>
    <ul class="projects"></ul>
  `;
  const list = app.querySelector('ul');
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const submit = form.querySelector('button');
  const filter = app.querySelector('select');
  let projects = [];
  let searchQuery = '';
  const searchInput = app.querySelector('#project-search');
  app.querySelector('#project-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    searchQuery = normalizeSearchQuery(searchInput.value);
    searchInput.value = searchQuery;
    renderProjects();
  });
  function renderProjects() {
    list.replaceChildren(...projects.filter((project) => matchesProjectFilters(project, filter.value, searchQuery))
      .map((project) => projectRow(project, renderProjects)));
  }
  filter.addEventListener('change', renderProjects);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      renderProjects();
      input.value = '';
      app.querySelector('[role="alert"]').hidden = true;
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  // Load existing rows before allowing new submissions, preserving creation order.
  submit.disabled = true;
  try {
    projects = await api('/api/projects');
    renderProjects();
  } finally {
    submit.disabled = false;
  }
}

async function showProject(id) {
  app.innerHTML = '<button type="button">Projects</button><h1></h1><p role="alert" hidden></p>';
  app.querySelector('button').addEventListener('click', () => location.assign('/'));
  const project = await api(`/api/projects/${id}`);
  const destinations = (await api('/api/projects'))
    .filter((candidate) => !candidate.archived && candidate.id !== project.id);
  app.querySelector('h1').textContent = project.name;
  document.title = `${project.name} — Workboard`;
  const renameForm = document.createElement('form');
  renameForm.innerHTML = `
    <label for="new-project-name">New project name</label>
    <div class="create-controls">
      <input id="new-project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Rename project</button>
    </div>
  `;
  const renameInput = renameForm.querySelector('input');
  const renameButton = renameForm.querySelector('button');
  renameInput.disabled = Boolean(project.archived);
  renameButton.disabled = Boolean(project.archived);
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    const name = renameInput.value.trim();
    if (!name) return showError('Project name is required');
    renameButton.disabled = true;
    try {
      const saved = await api(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      Object.assign(project, saved);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      renameInput.value = '';
      app.querySelector('[role="alert"]').hidden = true;
    } catch (error) {
      showError(error.message);
    } finally {
      renameButton.disabled = Boolean(project.archived);
    }
  });
  app.append(renameForm);
  const section = document.createElement('section');
  section.innerHTML = `
    <label for="default-task-priority">Default task priority</label>
    <select id="default-task-priority">
      <option>Low</option>
      <option>Normal</option>
      <option>High</option>
    </select>
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option>
      <option>Open</option>
      <option>Completed</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option>All</option>
      <option>Low</option>
      <option>Normal</option>
      <option>High</option>
    </select>
    <form id="due-range-form">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form id="task-search-form">
      <label for="task-search">Task search</label>
      <input id="task-search" type="text" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <ul class="tasks"></ul>
  `;
  if (project.archived) {
    const notice = document.createElement('p');
    notice.textContent = 'Archived project';
    app.append(notice);
  }
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const submit = form.querySelector('button');
  const filter = section.querySelector('#task-filter');
  const priorityFilter = section.querySelector('#priority-filter');
  const defaultPriority = section.querySelector('#default-task-priority');
  defaultPriority.value = project.default_task_priority;
  defaultPriority.disabled = true;
  defaultPriority.addEventListener('change', async () => {
    if (project.archived) return;
    defaultPriority.disabled = true;
    // Keep task creation behind the pending default write so it inherits the displayed value.
    submit.disabled = true;
    try {
      const saved = await api(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_task_priority: defaultPriority.value }),
      });
      Object.assign(project, saved);
      app.querySelector('[role="alert"]').hidden = true;
    } catch (error) {
      showError(error.message);
    } finally {
      defaultPriority.value = project.default_task_priority;
      defaultPriority.disabled = Boolean(project.archived);
      submit.disabled = Boolean(project.archived);
    }
  });
  const list = section.querySelector('ul');
  const endpoint = `/api/projects/${id}/tasks`;
  let tasks = [];
  const pendingUpdates = new Set();
  let dueRange = normalizeDueRange('', '');
  let searchQuery = '';
  const searchInput = section.querySelector('#task-search');
  section.querySelector('#task-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    searchQuery = normalizeSearchQuery(searchInput.value);
    searchInput.value = searchQuery;
    renderTasks();
  });
  const dueRangeForm = section.querySelector('#due-range-form');
  const dueFrom = section.querySelector('#due-from');
  const dueThrough = section.querySelector('#due-through');
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      // Validate before replacing the applied range; draft input never changes membership.
      dueRange = normalizeDueRange(dueFrom.value, dueThrough.value);
      dueFrom.value = dueRange.from;
      dueThrough.value = dueRange.through;
      app.querySelector('[role="alert"]').hidden = true;
      renderTasks();
    } catch (error) {
      showError(error.message);
    }
  });

  function renderTasks() {
    const visible = tasks.filter((task) => matchesTaskFilters(task, filter.value, priorityFilter.value, dueRange, searchQuery));
    list.replaceChildren(...visible.map((task) => {
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = Boolean(project.archived) || pendingUpdates.has(task.id);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      const renameForm = document.createElement('form');
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      renameLabel.textContent = 'New task title';
      const renameInput = document.createElement('input');
      renameInput.id = renameLabel.htmlFor;
      renameInput.type = 'text';
      renameInput.autocomplete = 'off';
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameInput.disabled = checkbox.disabled;
      renameButton.disabled = checkbox.disabled;
      renameForm.append(renameLabel, renameInput, renameButton);
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
      priority.disabled = checkbox.disabled;
      const dueDateForm = document.createElement('form');
      const dueDateLabel = document.createElement('label');
      dueDateLabel.htmlFor = `task-due-date-${task.id}`;
      dueDateLabel.textContent = 'Task due date';
      const dueDateInput = document.createElement('input');
      dueDateInput.id = dueDateLabel.htmlFor;
      dueDateInput.type = 'text';
      dueDateInput.value = task.due_date;
      dueDateInput.autocomplete = 'off';
      dueDateInput.disabled = checkbox.disabled;
      const dueDateButton = document.createElement('button');
      dueDateButton.type = 'submit';
      dueDateButton.textContent = 'Save due date';
      dueDateButton.disabled = checkbox.disabled;
      dueDateForm.append(dueDateLabel, dueDateInput, dueDateButton);

      const moveForm = document.createElement('form');
      const destinationLabel = document.createElement('label');
      destinationLabel.htmlFor = `destination-project-${task.id}`;
      destinationLabel.textContent = 'Destination project';
      const destination = document.createElement('select');
      destination.id = destinationLabel.htmlFor;
      for (const project of destinations) {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        destination.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      destination.disabled = moveButton.disabled = checkbox.disabled || destinations.length === 0;
      moveForm.append(destinationLabel, destination, moveButton);

      async function saveTask(update, moving = false) {
        if (project.archived || pendingUpdates.has(task.id)) return;
        pendingUpdates.add(task.id);
        checkbox.disabled = renameInput.disabled = renameButton.disabled = priority.disabled =
          dueDateInput.disabled = dueDateButton.disabled = destination.disabled = moveButton.disabled = true;
        try {
          const saved = await api(`${endpoint}/${task.id}${moving ? '/move' : ''}`, {
            method: moving ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
          });
          if (moving) tasks = tasks.filter((candidate) => candidate.id !== task.id);
          else Object.assign(task, saved);
          app.querySelector('[role="alert"]').hidden = true;
        } catch (error) {
          showError(error.message);
        } finally {
          pendingUpdates.delete(task.id);
          renderTasks();
        }
      }
      checkbox.addEventListener('change', () => saveTask({ completed: checkbox.checked }));
      renameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (project.archived || pendingUpdates.has(task.id)) return;
        const title = renameInput.value.trim();
        if (!title) return showError('Task title is required');
        saveTask({ title });
      });
      priority.addEventListener('change', () => saveTask({ priority: priority.value }));
      dueDateForm.addEventListener('submit', (event) => {
        event.preventDefault();
        saveTask({ due_date: dueDateInput.value });
      });
      moveForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (destinations.length === 0) return;
        saveTask({ destination_project_id: Number(destination.value) }, true);
      });
      row.append(title, checkbox, renameForm, priorityLabel, priority, dueDateForm, moveForm);
      return row;
    }));
  }

  filter.addEventListener('change', renderTasks);
  priorityFilter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    submit.disabled = true;
    defaultPriority.disabled = true;
    try {
      const task = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      app.querySelector('[role="alert"]').hidden = true;
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = Boolean(project.archived);
      defaultPriority.disabled = Boolean(project.archived);
    }
  });
  tasks = await api(endpoint);
  renderTasks();
  submit.disabled = Boolean(project.archived);
  defaultPriority.disabled = Boolean(project.archived);
}

try {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showError(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
