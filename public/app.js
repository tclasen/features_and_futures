const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete the request');
  return body;
}

function showError(container, error) {
  let alert = container.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    container.append(alert);
  }
  alert.textContent = error.message;
}

function projectRow(project, onArchiveChange) {
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const open = document.createElement('button');
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.assign(`/projects/${project.id}`);
  });
  const archive = document.createElement('button');
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    row.querySelector('[role="alert"]')?.remove();
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onArchiveChange(saved);
    } catch (error) {
      showError(row, error);
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
    <form>
      <label for="project-name">Project name</label>
      <div class="create-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <div class="project-filter">
      <label for="project-filter">Project filter</label>
      <select id="project-filter">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <section aria-label="Projects" id="projects"></section>`;
  const form = app.querySelector('form');
  const input = form.elements.name;
  const button = form.querySelector('button');
  const projects = app.querySelector('#projects');
  const filter = app.querySelector('select');
  let projectList = [];
  function renderRows() {
    const archived = filter.value === 'archived';
    projects.replaceChildren(...projectList
      .filter((project) => project.archived === archived)
      .map((project) => projectRow(project, (saved) => {
        projectList = projectList.map((entry) => entry.id === saved.id ? saved : entry);
        renderRows();
      })));
  }
  filter.addEventListener('change', renderRows);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) {
      showError(form, new Error('Project name is required'));
      return;
    }
    button.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projectList.push(project);
      renderRows();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  });
  // Load existing rows before accepting new ones to preserve creation order.
  button.disabled = true;
  try {
    projectList = await api('/api/projects');
    renderRows();
  } catch (error) {
    showError(app, error);
  } finally {
    button.disabled = false;
  }
}

async function renderProject(id) {
  const back = document.createElement('button');
  back.textContent = 'Projects';
  back.addEventListener('click', () => window.location.assign('/'));
  app.replaceChildren(back);
  try {
    const project = await api(`/api/projects/${id}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    app.prepend(heading);
    document.title = `${project.name} · Workboard`;
    if (project.archived) {
      const notice = document.createElement('p');
      notice.textContent = 'Archived project';
      app.append(notice);
    }
    await renderTasks(id, project.archived);
  } catch (error) {
    showError(app, error);
  }
}

async function renderTasks(projectId, archived) {
  const controls = document.createElement('div');
  controls.className = 'task-controls';
  controls.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <div class="task-filter">
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <section aria-label="Tasks" id="tasks"></section>`;
  app.append(controls);
  const form = controls.querySelector('form');
  const input = form.elements.title;
  input.disabled = archived;
  const button = form.querySelector('button');
  const filter = controls.querySelector('select');
  const rows = controls.querySelector('#tasks');
  const endpoint = `/api/projects/${projectId}/tasks`;
  let tasks = [];

  function renderRows() {
    const visible = tasks.filter((task) => filter.value === 'all'
      || (filter.value === 'completed' ? task.completed : !task.completed));
    rows.replaceChildren(...visible.map((task) => {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      const title = document.createElement('span');
      title.textContent = task.title;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        rows.querySelector('[role="alert"]')?.remove();
        try {
          const saved = await api(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          renderRows();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(rows, error);
        } finally {
          checkbox.disabled = archived;
        }
      });
      label.append(checkbox, title);
      row.append(label);
      return row;
    }));
  }

  filter.addEventListener('change', renderRows);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (archived) return;
    form.querySelector('[role="alert"]')?.remove();
    const title = input.value.trim();
    if (!title) {
      showError(form, new Error('Task title is required'));
      return;
    }
    button.disabled = true;
    try {
      const task = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderRows();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = archived;
    }
  });
  try {
    tasks = await api(endpoint);
    renderRows();
    button.disabled = archived;
  } catch (error) {
    showError(controls, error);
  }
}

const projectMatch = /^\/projects\/([1-9]\d*)$/.exec(window.location.pathname);
if (projectMatch) {
  await renderProject(projectMatch[1]);
} else {
  await renderProjects();
}
