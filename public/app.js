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

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  row.append(name, open);
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
      <ul aria-label="Projects"></ul>
    </section>`;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const button = form.querySelector('button');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('ul');
  // Load before accepting writes so a late list response cannot duplicate a new row.
  button.disabled = true;
  try {
    const projects = await api('/api/projects');
    list.append(...projects.map(projectRow));
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
      list.append(projectRow(project));
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
    await renderTasks(id);
  } catch (error) {
    app.querySelector('h1').textContent = 'Project unavailable';
    showError(app.querySelector('[role="alert"]'), error.message);
  }
}

async function renderTasks(projectId) {
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
    <ul aria-label="Tasks"></ul>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const button = form.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  const filter = section.querySelector('select');
  const list = section.querySelector('ul');
  const path = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  const pendingUpdates = new Set();

  function renderList() {
    const matching = tasks.filter((task) => filter.value === 'all'
      || (filter.value === 'completed' ? task.completed : !task.completed));
    list.replaceChildren(...matching.map((task) => {
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = pendingUpdates.has(task.id);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        pendingUpdates.add(task.id);
        alert.hidden = true;
        try {
          const updated = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = updated.completed;
        } catch (error) {
          checkbox.checked = task.completed;
          showError(alert, error.message);
        } finally {
          pendingUpdates.delete(task.id);
          checkbox.disabled = false;
          // Refresh filtered or replaced rows; otherwise preserve the focused checkbox.
          if (filter.value !== 'all' || !checkbox.isConnected) renderList();
        }
      });
      row.append(title, checkbox);
      return row;
    }));
  }

  filter.addEventListener('change', renderList);
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
      button.disabled = false;
    }
  });
  try {
    tasks = await api(path);
    renderList();
    button.disabled = false;
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
