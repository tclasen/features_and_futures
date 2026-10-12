const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(error) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = error.message;
}

function appendProject(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, button);
  app.querySelector('#projects').append(row);
  app.querySelector('#empty').hidden = true;
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
    <h2>Tasks</h2>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
    </select>
    <p id="empty-tasks">No tasks to show.</p>
    <ul id="tasks" aria-label="Tasks"></ul>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const submit = form.querySelector('button');
  const filter = section.querySelector('select');
  const list = section.querySelector('ul');
  const endpoint = `/api/projects/${projectId}/tasks`;
  let tasks = [];

  function drawTasks() {
    list.replaceChildren();
    const visible = tasks.filter((task) => filter.value === 'all' ||
      (filter.value === 'completed' ? task.completed : !task.completed));
    section.querySelector('#empty-tasks').hidden = visible.length > 0;
    for (const task of visible) {
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        app.querySelector('[role="alert"]')?.remove();
        checkbox.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          checkbox.disabled = false;
          showError(error);
        }
      });
      row.append(title, checkbox);
      list.append(row);
    }
  }

  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) return showError(new Error('Task title is required'));
    submit.disabled = true;
    try {
      const task = await request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) { showError(error); }
    finally { submit.disabled = false; }
  });
  try {
    tasks = await request(endpoint);
    drawTasks();
    submit.disabled = false;
  } catch (error) { showError(error); }
}

async function render() {
  const projectPath = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectPath) {
    app.innerHTML = '<button type="button" id="back">Projects</button><h1>Loading project…</h1>';
    app.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await request(`/api/projects/${projectPath[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      await renderTasks(project.id);
    } catch (error) {
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(error);
    }
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <h2>Projects</h2>
      <p id="empty">No projects yet.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    // Register after loading so creations always follow the persisted rows.
    try {
      submit.disabled = true;
      const projects = await request('/api/projects');
      projects.forEach(appendProject);
    } catch (error) { showError(error); }
    finally { submit.disabled = false; }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      app.querySelector('[role="alert"]')?.remove();
      if (!input.value.trim()) return showError(new Error('Project name is required'));
      submit.disabled = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value }),
        });
        appendProject(project);
        input.value = '';
        input.focus();
      } catch (error) { showError(error); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
