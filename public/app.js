const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  const alert = document.querySelector('#alert');
  alert.textContent = message;
  alert.hidden = !message;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.textContent = 'Open project';
  open.addEventListener('click', () => {
    window.location.href = `/projects/${project.id}`;
  });
  row.append(name, open);
  return row;
}

async function renderTasks(projectId) {
  const section = document.createElement('section');
  section.innerHTML = `
    <form id="task-form">
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <label for="task-filter" class="filter-label">Task filter</label>
    <select id="task-filter">
      <option>All</option><option>Open</option><option>Completed</option>
    </select>
    <section id="tasks" aria-label="Tasks"></section>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('#task-title');
  const submit = form.querySelector('button');
  const filter = section.querySelector('#task-filter');
  const list = section.querySelector('#tasks');
  const path = `/api/projects/${projectId}/tasks`;
  let tasks = await api(path);

  function displayTasks() {
    const visible = tasks.filter(task => filter.value === 'All' ||
      (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map(task => {
      const row = document.createElement('div');
      row.className = 'task-row';
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
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showAlert(error.message);
        } finally { checkbox.disabled = false; }
      });
      row.append(checkbox, title);
      return row;
    }));
  }
  displayTasks();
  filter.addEventListener('change', displayTasks);
  submit.disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const title = input.value.trim();
    if (!title) { showAlert('Task title is required'); return; }
    showAlert('');
    submit.disabled = true;
    try {
      const task = await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = '<button id="back">Projects</button><h1></h1><p id="alert" role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
    try {
      const project = await api(`/api/projects/${match[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      await renderTasks(project.id);
    } catch (error) { showAlert(error.message); }
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
    <p id="alert" role="alert" hidden></p>
    <section aria-label="Projects" id="projects"></section>`;
  const list = document.querySelector('#projects');
  const form = document.querySelector('form');
  const input = document.querySelector('#project-name');
  const submit = form.querySelector('button');
  // Register creation only after loading existing projects to preserve row order.
  submit.disabled = true;
  try {
    const projects = await api('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
    submit.disabled = false;
  } catch (error) { showAlert(error.message); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const name = input.value.trim();
    if (!name) { showAlert('Project name is required'); return; }
    showAlert('');
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
}

render();
