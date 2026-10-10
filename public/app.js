import { matchesTaskFilters } from './task-filters.js';

const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete the request');
  return body;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

function projectRow(project, onArchiveChange, pending) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.disabled = pending;
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      await onArchiveChange(project);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, open, archive);
  return row;
}

async function renderProjects() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p role="alert" hidden></p>
      <div class="project-filter">
        <label for="project-filter">Project filter</label>
        <select id="project-filter">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <ul aria-label="Projects"></ul>
    </section>`;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const button = form.querySelector('button');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('ul');
  const filter = app.querySelector('select');
  let projects = [];
  const pendingArchives = new Set();

  async function changeArchive(project) {
    if (pendingArchives.has(project.id)) return;
    pendingArchives.add(project.id);
    alert.hidden = true;
    try {
      const updated = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, updated);
    } catch (error) {
      showError(alert, error.message);
    } finally {
      pendingArchives.delete(project.id);
      renderList();
    }
  }

  function renderList() {
    list.replaceChildren(...projects
      .filter((project) => project.archived === (filter.value === 'archived'))
      .map((project) => projectRow(project, changeArchive, pendingArchives.has(project.id))));
  }
  filter.addEventListener('change', renderList);
  // Load before accepting writes so a late list response cannot duplicate a new row.
  button.disabled = true;
  try {
    projects = await api('/api/projects');
    renderList();
    button.disabled = false;
  } catch (error) {
    showError(alert, error.message);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      showError(alert, 'Project name is required');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      renderList();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = false;
    }
  });
}

async function renderProject(id) {
  app.innerHTML = '<button type="button">Projects</button><h1></h1><p role="alert" hidden></p>';
  app.querySelector('button').addEventListener('click', () => window.location.assign('/'));
  try {
    const project = await api(`/api/projects/${id}`);
    app.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    if (project.archived) {
      const notice = document.createElement('p');
      notice.textContent = 'Archived project';
      app.append(notice);
    }
    renderRename(project);
    renderDefaultTaskPriority(project);
    await renderTasks(id, project.archived);
  } catch (error) {
    app.querySelector('h1').textContent = 'Project unavailable';
    showError(app.querySelector('[role="alert"]'), error.message);
  }
}

function renderDefaultTaskPriority(project) {
  const section = document.createElement('section');
  section.innerHTML = `
    <label for="default-task-priority">Default task priority</label>
    <select id="default-task-priority">
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>
    <p role="alert" hidden></p>`;
  const select = section.querySelector('select');
  const alert = section.querySelector('[role="alert"]');
  select.value = project.defaultTaskPriority;
  select.disabled = project.archived;
  select.addEventListener('change', async () => {
    if (select.disabled) return;
    select.disabled = true;
    alert.hidden = true;
    try {
      const updated = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultTaskPriority: select.value }),
      });
      project.defaultTaskPriority = updated.defaultTaskPriority;
    } catch (error) {
      showError(alert, error.message);
    } finally {
      select.value = project.defaultTaskPriority;
      select.disabled = project.archived;
    }
  });
  app.append(section);
}

function renderRename(project) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Rename project');
  section.innerHTML = `
    <form>
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Rename project</button>
      </div>
    </form>
    <p role="alert" hidden></p>`;
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const button = section.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  input.value = project.name;
  input.disabled = project.archived;
  button.disabled = project.archived;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      showError(alert, 'Project name is required');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const updated = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = updated.name;
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = project.name;
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = project.archived;
    }
  });
  app.append(section);
}

async function renderTasks(projectId, archived) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Tasks');
  section.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <div class="task-filter">
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <div class="task-filter">
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter">
        <option value="all">All</option>
        <option value="Low">Low</option>
        <option value="Normal">Normal</option>
        <option value="High">High</option>
      </select>
    </div>
    <ul aria-label="Tasks"></ul>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const button = form.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  const filter = section.querySelector('#task-filter');
  const priorityFilter = section.querySelector('#priority-filter');
  const list = section.querySelector('ul');
  const path = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  const pendingUpdates = new Set();

  async function updateTask(task, changes) {
    pendingUpdates.add(task.id);
    alert.hidden = true;
    try {
      const updated = await api(`${path}/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      Object.assign(task, updated);
    } catch (error) {
      showError(alert, error.message);
    } finally {
      pendingUpdates.delete(task.id);
    }
  }

  function renderList() {
    const matching = tasks.filter((task) => matchesTaskFilters(task, filter.value, priorityFilter.value));
    list.replaceChildren(...matching.map((task) => {
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
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
      const renameForm = document.createElement('form');
      renameForm.className = 'task-rename';
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
      renameInput.value = task.title;
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameControls.append(renameInput, renameButton);
      renameForm.append(renameLabel, renameControls);
      const dueDateForm = document.createElement('form');
      dueDateForm.className = 'task-due-date';
      const dueDateLabel = document.createElement('label');
      dueDateLabel.htmlFor = `task-due-date-${task.id}`;
      dueDateLabel.textContent = 'Task due date';
      const dueDateControls = document.createElement('div');
      dueDateControls.className = 'create-controls';
      const dueDateInput = document.createElement('input');
      dueDateInput.id = dueDateLabel.htmlFor;
      dueDateInput.type = 'text';
      dueDateInput.name = 'dueDate';
      dueDateInput.placeholder = 'YYYY-MM-DD';
      dueDateInput.autocomplete = 'off';
      dueDateInput.value = task.dueDate;
      const dueDateButton = document.createElement('button');
      dueDateButton.type = 'submit';
      dueDateButton.textContent = 'Save due date';
      dueDateControls.append(dueDateInput, dueDateButton);
      dueDateForm.append(dueDateLabel, dueDateControls);
      function setDisabled(pending) {
        checkbox.disabled = archived || pending;
        priority.disabled = archived || pending;
        renameInput.disabled = archived || pending;
        renameButton.disabled = archived || pending;
        dueDateInput.disabled = archived || pending;
        dueDateButton.disabled = archived || pending;
      }
      setDisabled(pendingUpdates.has(task.id));
      priority.addEventListener('change', async () => {
        if (archived || pendingUpdates.has(task.id)) return;
        setDisabled(true);
        await updateTask(task, { priority: priority.value });
        priority.value = task.priority;
        setDisabled(false);
        if (!row.isConnected || !matchesTaskFilters(task, filter.value, priorityFilter.value)) renderList();
      });
      checkbox.addEventListener('change', async () => {
        if (archived || pendingUpdates.has(task.id)) return;
        setDisabled(true);
        await updateTask(task, { completed: checkbox.checked });
        checkbox.checked = task.completed;
        setDisabled(false);
        // Remove rows that no longer match; otherwise preserve the focused checkbox.
        if (!row.isConnected || !matchesTaskFilters(task, filter.value, priorityFilter.value)) renderList();
      });
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (archived || pendingUpdates.has(task.id)) return;
        alert.hidden = true;
        const newTitle = renameInput.value.trim();
        if (!newTitle) {
          showError(alert, 'Task title is required');
          renameInput.focus();
          return;
        }
        setDisabled(true);
        await updateTask(task, { title: newTitle });
        title.textContent = task.title;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        renameInput.value = task.title;
        setDisabled(false);
        if (!row.isConnected) renderList();
      });
      dueDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (archived || pendingUpdates.has(task.id)) return;
        setDisabled(true);
        await updateTask(task, { dueDate: dueDateInput.value });
        dueDateInput.value = task.dueDate;
        setDisabled(false);
        if (!row.isConnected) renderList();
      });
      row.append(title, checkbox, priorityLabel, priority, renameForm, dueDateForm);
      return row;
    }));
  }

  filter.addEventListener('change', renderList);
  priorityFilter.addEventListener('change', renderList);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) {
      showError(alert, 'Task title is required');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      tasks.push(await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      renderList();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = archived;
    }
  });
  try {
    tasks = await api(path);
    renderList();
    button.disabled = archived;
  } catch (error) {
    showError(alert, error.message);
  }
}

const projectPath = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
try {
  if (projectPath) await renderProject(projectPath[1]);
  else await renderProjects();
} finally {
  app.setAttribute('aria-busy', 'false');
}
