const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Unable to complete request');
  return value;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
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

async function showProjects() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p role="alert"></p>
    <ul aria-label="Projects"></ul>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const button = form.querySelector('button');
  const list = app.querySelector('ul');
  // Load first so submissions cannot race the initial list render.
  button.disabled = true;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const name = input.value.trim();
    if (!name) return showAlert('Project name is required');
    button.disabled = true;
    showAlert('');
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
  } finally {
    button.disabled = false;
  }
}

async function showProject(id) {
  const back = document.createElement('button');
  back.textContent = 'Projects';
  back.type = 'button';
  back.addEventListener('click', () => location.assign('/'));
  app.append(back);
  const project = await api(`/api/projects/${id}`);
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  app.prepend(heading);
  document.title = `${project.name} — Workboard`;
  const controls = document.createElement('section');
  controls.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <p role="alert"></p>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option>
      <option>Open</option>
      <option>Completed</option>
    </select>
    <ul aria-label="Tasks"></ul>
  `;
  app.append(controls);
  const form = controls.querySelector('form');
  const input = controls.querySelector('input');
  const button = form.querySelector('button');
  const filter = controls.querySelector('select');
  const list = controls.querySelector('ul');
  const tasksPath = `/api/projects/${id}/tasks`;
  let tasks = [];

  function renderTasks() {
    const visible = tasks.filter((task) => filter.value === 'All'
      || task.completed === (filter.value === 'Completed'));
    list.replaceChildren(...visible.map((task) => {
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
        showAlert('');
        try {
          const saved = await api(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showAlert(error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(title, checkbox);
      return row;
    }));
  }

  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const title = input.value.trim();
    if (!title) return showAlert('Task title is required');
    button.disabled = true;
    showAlert('');
    try {
      const task = await api(tasksPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });
  tasks = await api(tasksPath);
  renderTasks();
  button.disabled = false;
}

try {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
