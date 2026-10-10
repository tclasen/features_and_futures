const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
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

function projectRow(project, onUpdate) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    app.querySelector('[role="alert"]')?.remove();
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onUpdate(saved);
    } catch (error) {
      showError(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, button, archive);
  return row;
}

async function renderTasks(project) {
  const section = document.createElement('section');
  section.innerHTML = `
    <h2>Tasks</h2>
    <form>
      <label for="task-title">Task title</label>
      <div class="create-project">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <div class="task-filter">
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option>All</option>
        <option>Open</option>
        <option>Completed</option>
      </select>
    </div>
    <ul aria-label="Tasks"></ul>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const submit = form.querySelector('button');
  const filter = section.querySelector('select');
  const list = section.querySelector('ul');
  const endpoint = `/api/projects/${project.id}/tasks`;
  const tasks = await api(endpoint);

  function displayTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = document.createElement('li');
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
        app.querySelector('[role="alert"]')?.remove();
        try {
          const saved = await api(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = false;
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
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) {
      showError('Task title is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    try {
      const task = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = project.archived;
    }
  });
  displayTasks();
  submit.disabled = project.archived;
}

async function render() {
  const projectMatch = location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) {
    app.innerHTML = '<button type="button" id="projects">Projects</button>';
    document.querySelector('#projects').addEventListener('click', () => location.assign('/'));
    const project = await api(`/api/projects/${projectMatch[1]}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    app.prepend(heading);
    document.title = `${project.name} · Workboard`;
    if (project.archived) {
      const status = document.createElement('p');
      status.textContent = 'Archived project';
      app.append(status);
    }
    await renderTasks(project);
    return;
  }

  app.innerHTML = `
    <h1>Workboard</h1>
    <form>
      <label for="project-name">Project name</label>
      <div class="create-project">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <div class="project-filter">
      <label for="project-filter">Project filter</label>
      <select id="project-filter">
        <option>Active</option>
        <option>Archived</option>
      </select>
    </div>
    <ul aria-label="Projects"></ul>`;
  const list = app.querySelector('ul');
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const submit = form.querySelector('button');
  const filter = app.querySelector('select');
  submit.disabled = true;
  const projects = await api('/api/projects');
  function displayProjects() {
    list.replaceChildren(...projects
      .filter((project) => project.archived === (filter.value === 'Archived'))
      .map((project) => projectRow(project, (saved) => {
        Object.assign(project, saved);
        displayProjects();
      })));
  }
  filter.addEventListener('change', displayProjects);
  displayProjects();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) {
      showError('Project name is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      projects.push(project);
      displayProjects();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  submit.disabled = false;
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
