const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

async function renderTasks(project) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Tasks');
  section.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" type="text" autocomplete="off">
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
    <div id="tasks"></div>
  `;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const button = form.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  const filter = section.querySelector('select');
  const list = section.querySelector('#tasks');
  const endpoint = `/api/projects/${project.id}/tasks`;
  let tasks = [];

  function displayTasks() {
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
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const updated = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, updated);
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(alert, error.message);
        } finally {
          checkbox.disabled = project.archived;
        }
      });
      row.append(title, checkbox);
      list.append(row);
    }
  }

  filter.addEventListener('change', displayTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(alert, 'Task title is required');
      return;
    }
    button.disabled = true;
    try {
      tasks.push(await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      }));
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = project.archived;
    }
  });

  try {
    tasks = await request(endpoint);
    displayTasks();
    button.disabled = project.archived;
  } catch (error) {
    showError(alert, error.message);
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    app.innerHTML = '<button id="back" type="button">Projects</button><h1>Loading project…</h1><p role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => location.assign('/'));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      if (project.archived) {
        const notice = document.createElement('p');
        notice.textContent = 'Archived project';
        app.append(notice);
      }
      await renderTasks(project);
    } catch (error) {
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(app.querySelector('[role="alert"]'), error.message);
    }
    return;
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
    <div class="project-filter">
      <label for="project-filter">Project filter</label>
      <select id="project-filter">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <section aria-label="Projects" id="projects"></section>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('#projects');
  const filter = app.querySelector('select');
  let projects = [];

  function displayProjects() {
    list.replaceChildren();
    projects.filter((project) => project.archived === (filter.value === 'archived')).forEach(appendProject);
  }

  filter.addEventListener('change', displayProjects);

  function appendProject(project) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
    const archiveButton = document.createElement('button');
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    archiveButton.addEventListener('click', async () => {
      archiveButton.disabled = true;
      alert.hidden = true;
      try {
        Object.assign(project, await request(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        }));
        displayProjects();
      } catch (error) {
        showError(alert, error.message);
      } finally {
        archiveButton.disabled = false;
      }
    });
    row.append(name, summary, button, archiveButton);
    list.append(row);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(alert, 'Project name is required');
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      projects.push(project);
      displayProjects();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = false;
    }
  });

  form.querySelector('button').disabled = true;
  try {
    projects = await request('/api/projects');
    displayProjects();
  } catch (error) {
    showError(alert, error.message);
  } finally {
    form.querySelector('button').disabled = false;
  }
}

render();
