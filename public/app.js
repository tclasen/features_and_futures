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

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  row.append(name, open);
  return row;
}

async function renderProject(projectId) {
  const project = await request(`/api/projects/${projectId}`);
  let tasks = await request(`/api/projects/${projectId}/tasks`);
  app.innerHTML = `
    <button type="button" id="back">Projects</button><h1></h1>
    <form>
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
  document.title = `${project.name} · Workboard`;
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
  app.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
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
  const projects = await request('/api/projects');
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
    <p id="empty">No projects yet. Create your first project above.</p>
    <ul id="projects"></ul>`;
  const list = document.getElementById('projects');
  const empty = document.getElementById('empty');
  empty.hidden = projects.length > 0;
  list.append(...projects.map(projectRow));
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
      list.append(projectRow(project));
      empty.hidden = true;
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
