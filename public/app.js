const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

async function renderProjects() {
  document.title = 'Workboard';
  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit" disabled>Create project</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <div id="projects"></div>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('#projects');
  function appendProject(project) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(name, button);
    list.append(row);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      appendProject(project);
      input.value = '';
      input.focus();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  try {
    const projects = await request('/api/projects');
    projects.forEach(appendProject);
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  } finally {
    form.querySelector('button').disabled = false;
  }
}

async function renderProject(id) {
  app.innerHTML = '<button type="button">Projects</button><h1>Loading project…</h1>';
  app.querySelector('button').addEventListener('click', () => { window.location.href = '/'; });
  try {
    const project = await request(`/api/projects/${id}`);
    app.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    renderTasks(id);
  } catch (error) {
    app.querySelector('h1').textContent = 'Project unavailable';
    showError(error.message);
  }
}

async function renderTasks(projectId) {
  const section = document.createElement('section');
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
        <option value="all" selected>All</option>
        <option value="open">Open</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <div id="tasks"></div>
  `;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const button = form.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  const filter = section.querySelector('select');
  const list = section.querySelector('#tasks');
  const endpoint = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  const pending = new Set();

  function displayError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }

  function renderRows() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'open' && task.completed) continue;
      if (filter.value === 'completed' && !task.completed) continue;
      const row = document.createElement('div');
      row.dataset.testid = 'task-row';
      row.className = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.checked = task.completed;
      checkbox.disabled = pending.has(task.id);
      checkbox.addEventListener('change', async () => {
        alert.hidden = true;
        pending.add(task.id);
        checkbox.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
        } catch (error) {
          displayError(error);
        } finally {
          pending.delete(task.id);
          renderRows();
        }
      });
      row.append(title, checkbox);
      list.append(row);
    }
  }

  filter.addEventListener('change', renderRows);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) return displayError(new Error('Task title is required'));
    button.disabled = true;
    try {
      const task = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderRows();
      input.value = '';
      input.focus();
    } catch (error) {
      displayError(error);
    } finally {
      button.disabled = false;
    }
  });
  try {
    tasks = await request(endpoint);
    renderRows();
    button.disabled = false;
  } catch (error) {
    displayError(error);
  }
}

const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (match) renderProject(match[1]);
else renderProjects();
