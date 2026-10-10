const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function showAlert(message) {
  const alert = document.querySelector('#error');
  alert.textContent = message;
  alert.hidden = !message;
}

function appendProject(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  document.querySelector('#projects').append(row);
}

async function renderList() {
  app.innerHTML = `
    <h1>Workboard</h1>
    <form id="create-project">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <ul id="projects" aria-label="Projects"></ul>`;
  const projects = await api('/api/projects');
  projects.forEach(appendProject);
  document.querySelector('#create-project').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#project-name');
    const name = input.value.trim();
    showAlert('');
    if (!name) return showAlert('Project name is required');
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      appendProject(project);
      input.value = '';
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

async function renderProject(id) {
  app.innerHTML = `
    <button id="back" type="button">Projects</button>
    <h1></h1>
    <form id="create-task">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option>
      <option>Open</option>
      <option>Completed</option>
    </select>
    <ul id="tasks" aria-label="Tasks"></ul>`;
  document.querySelector('#back').addEventListener('click', () => { window.location.href = '/'; });
  const project = await api(`/api/projects/${id}`);
  document.querySelector('h1').textContent = project.name;
  document.title = `${project.name} — Workboard`;
  const taskPath = `/api/projects/${id}/tasks`;
  const tasks = await api(taskPath);
  const filter = document.querySelector('#task-filter');
  const list = document.querySelector('#tasks');

  function renderTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      const title = document.createElement('span');
      title.textContent = task.title;
      label.append(checkbox, title);
      row.append(label);
      list.append(row);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        showAlert('');
        try {
          const saved = await api(`${taskPath}/${task.id}`, {
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
    }
  }

  filter.addEventListener('change', renderTasks);
  renderTasks();
  document.querySelector('#create-task').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#task-title');
    const title = input.value.trim();
    showAlert('');
    if (!title) return showAlert('Task title is required');
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const task = await api(taskPath, {
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
      if (button) button.disabled = false;
    }
  });
}

try {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await renderProject(match[1]);
  else await renderList();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
