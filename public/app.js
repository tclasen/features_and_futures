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
    <ul class="projects"></ul>
  `;
  const list = app.querySelector('ul');
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const submit = form.querySelector('button');
  const filter = app.querySelector('select');
  let projects = [];
  function renderProjects() {
    const archived = filter.value === 'Archived';
    list.replaceChildren(...projects.filter((project) => Boolean(project.archived) === archived)
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
  const filter = section.querySelector('select');
  const list = section.querySelector('ul');
  const endpoint = `/api/projects/${id}/tasks`;
  let tasks = [];
  const pendingUpdates = new Set();

  function renderTasks() {
    const visible = tasks.filter((task) => filter.value === 'All'
      || (filter.value === 'Completed' ? task.completed : !task.completed));
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

      async function saveTask(update) {
        if (project.archived || pendingUpdates.has(task.id)) return;
        pendingUpdates.add(task.id);
        checkbox.disabled = renameInput.disabled = renameButton.disabled = priority.disabled = true;
        try {
          const saved = await api(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
          });
          Object.assign(task, saved);
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
      row.append(title, checkbox, renameForm, priorityLabel, priority);
      return row;
    }));
  }

  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    submit.disabled = true;
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
    }
  });
  tasks = await api(endpoint);
  renderTasks();
  submit.disabled = Boolean(project.archived);
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
