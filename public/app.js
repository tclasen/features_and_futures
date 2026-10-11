const app = document.getElementById('app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  let alert = document.getElementById('error');
  if (!alert) {
    alert = document.createElement('p');
    alert.id = 'error';
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project, onArchive) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onArchive(saved);
    } catch (error) { showError(error.message); }
    finally { archive.disabled = false; }
  });
  row.append(name, summary, open, archive);
  return row;
}

async function renderProject(projectId) {
  const project = await request(`/api/projects/${projectId}`);
  let tasks = await request(`/api/projects/${projectId}/tasks`);
  app.innerHTML = `
    <button type="button" id="back">Projects</button><h1></h1>
    <form id="rename-form">
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Rename project</button>
      </div>
    </form>
    <form id="task-form">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <h2>Tasks</h2>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
    </select>
    <p id="empty">No tasks to show.</p>
    <ul id="tasks"></ul>`;
  app.querySelector('h1').textContent = project.name;
  const renameForm = document.getElementById('rename-form');
  const renameInput = document.getElementById('new-project-name');
  renameInput.value = project.name;
  if (project.archived) {
    const notice = document.createElement('p');
    notice.textContent = 'Archived project';
    app.querySelector('h1').after(notice);
    document.querySelector('#task-form button').disabled = true;
    renameInput.disabled = true;
    renameForm.querySelector('button').disabled = true;
  }
  document.title = `${project.name} · Workboard`;
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const name = renameInput.value.trim();
    if (!name) { showError('Project name is required'); renameInput.focus(); return; }
    const button = renameForm.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const saved = await request(`/api/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = saved.name;
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      renameInput.value = project.name;
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
  document.getElementById('back').addEventListener('click', () => location.assign('/'));
  const filter = document.getElementById('task-filter');
  const list = document.getElementById('tasks');
  function drawTasks() {
    const visible = tasks.filter(task => filter.value === 'all' ||
      (filter.value === 'completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map(task => {
      const row = document.createElement('li');
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
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally { checkbox.disabled = false; }
      });
      row.append(title, checkbox);
      return row;
    }));
    document.getElementById('empty').hidden = visible.length > 0;
  }
  filter.addEventListener('change', drawTasks);
  drawTasks();
  document.getElementById('task-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const input = document.getElementById('task-title');
    const title = input.value.trim();
    if (!title) { showError('Task title is required'); input.focus(); return; }
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      tasks.push(await request(`/api/projects/${projectId}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    await renderProject(match[1]);
    return;
  }
  let projects = await request('/api/projects');
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <h2>Projects</h2>
    <label for="project-filter">Project filter</label>
    <select id="project-filter">
      <option value="active">Active</option>
      <option value="archived">Archived</option>
    </select>
    <p id="empty">No projects to show.</p>
    <ul id="projects"></ul>`;
  const list = document.getElementById('projects');
  const empty = document.getElementById('empty');
  const filter = document.getElementById('project-filter');
  function drawProjects() {
    const visible = projects.filter(project => Boolean(project.archived) === (filter.value === 'archived'));
    list.replaceChildren(...visible.map(project => projectRow(project, saved => {
      projects = projects.map(current => current.id === saved.id ? saved : current);
      drawProjects();
    })));
    empty.hidden = visible.length > 0;
  }
  filter.addEventListener('change', drawProjects);
  drawProjects();
  app.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('project-name');
    const name = input.value.trim();
    if (!name) { showError('Project name is required'); input.focus(); return; }
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      input.focus();
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
}

try { await render(); }
catch (error) {
  app.innerHTML = '<h1>Workboard</h1><button type="button" id="back">Projects</button>';
  document.getElementById('back').addEventListener('click', () => location.assign('/'));
  showError(error.message);
}
finally { app.setAttribute('aria-busy', 'false'); }
