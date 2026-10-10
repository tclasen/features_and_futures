const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete the request');
  return data;
}

function showAlert(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = !message;
}

function addProjectRow(project, onArchiveChange) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    showAlert('');
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      onArchiveChange();
    } catch (error) {
      showAlert(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, open, archive);
  app.querySelector('#projects').append(row);
}

async function renderProject(projectId) {
  app.innerHTML = `
    <button id="back" type="button">Projects</button><h1></h1>
    <p id="archive-notice" hidden>Archived project</p>
    <form id="rename-project">
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off" disabled>
        <button type="submit" disabled>Rename project</button>
      </div>
    </form>
    <form id="create-task">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option><option>Open</option><option>Completed</option>
    </select>
    <section id="tasks" aria-label="Tasks"></section>`;
  app.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
  const project = await request(`/api/projects/${projectId}`);
  app.querySelector('h1').textContent = project.name;
  document.title = `${project.name} · Workboard`;
  app.querySelector('#archive-notice').hidden = !project.archived;
  const renameForm = app.querySelector('#rename-project');
  const renameInput = app.querySelector('#new-project-name');
  const renameButton = renameForm.querySelector('button');
  renameInput.disabled = project.archived;
  renameButton.disabled = project.archived;
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    showAlert('');
    if (!renameInput.value.trim()) {
      showAlert('Project name is required');
      renameInput.focus();
      return;
    }
    renameButton.disabled = true;
    try {
      const saved = await request(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameInput.value }),
      });
      Object.assign(project, saved);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      renameInput.value = '';
      renameInput.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      renameButton.disabled = project.archived;
    }
  });
  const tasksPath = `/api/projects/${projectId}/tasks`;
  const tasks = await request(tasksPath);
  const filter = app.querySelector('#task-filter');
  const rows = app.querySelector('#tasks');

  function renderTasks() {
    rows.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        showAlert('');
        try {
          const saved = await request(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showAlert(error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(checkbox, title);
      rows.append(row);
    }
  }

  filter.addEventListener('change', renderTasks);
  renderTasks();
  const form = app.querySelector('#create-task');
  const input = app.querySelector('#task-title');
  const button = form.querySelector('button');
  button.disabled = project.archived;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    showAlert('');
    if (!input.value.trim()) {
      showAlert('Task title is required');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const task = await request(tasksPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = project.archived;
    }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    return renderProject(match[1]);
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
    <p role="alert" hidden></p>
    <label for="project-filter">Project filter</label>
    <select id="project-filter"><option>Active</option><option>Archived</option></select>
    <section id="projects" aria-label="Projects"></section>`;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const button = form.querySelector('button');
  // Attach creation only after the initial list loads to preserve visible order.
  button.disabled = true;
  const projects = await request('/api/projects');
  const filter = app.querySelector('#project-filter');
  function renderProjects() {
    app.querySelector('#projects').replaceChildren();
    for (const project of projects) {
      if (project.archived === (filter.value === 'Archived')) addProjectRow(project, renderProjects);
    }
  }
  filter.addEventListener('change', renderProjects);
  renderProjects();
  button.disabled = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAlert('');
    if (!input.value.trim()) {
      showAlert('Project name is required');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      projects.push(project);
      renderProjects();
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

render().catch((error) => showAlert(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
