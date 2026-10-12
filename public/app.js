const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
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
  app.innerHTML = `
    <button type="button" id="projects">Projects</button>
    <h1></h1>
    <form>
      <label for="task-title">Task title</label>
      <div class="create-fields">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit" disabled>Create task</button>
      </div>
    </form>
    <p role="alert" hidden></p>
    <div class="task-filter">
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option>All</option><option>Open</option><option>Completed</option>
      </select>
    </div>
    <section aria-label="Tasks" id="task-list"></section>`;
  app.querySelector('#projects').addEventListener('click', () => location.assign('/'));
  const form = app.querySelector('form');
  const input = app.querySelector('#task-title');
  const button = form.querySelector('button');
  const alert = app.querySelector('[role="alert"]');
  const filter = app.querySelector('#task-filter');
  const list = app.querySelector('#task-list');
  const tasksPath = `/api/projects/${projectId}/tasks`;
  let tasks = [];

  function displayTasks() {
    const matching = tasks.filter(task => filter.value === 'All' ||
      (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...matching.map(task => {
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
        alert.hidden = true;
        try {
          const saved = await request(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(alert, error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(title, checkbox);
      return row;
    }));
  }

  try {
    const project = await request(`/api/projects/${projectId}`);
    app.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    tasks = await request(tasksPath);
    displayTasks();
  } catch (error) {
    showError(alert, error.message);
    return;
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
  filter.addEventListener('change', displayTasks);
  button.disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      showError(alert, 'Task title is required');
      input.focus();
      return;
    }
    button.disabled = true;
    alert.hidden = true;
    try {
      tasks.push(await request(tasksPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = false;
    }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    await renderProject(match[1]);
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-fields">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p role="alert" hidden></p>
      <section aria-label="Projects" id="project-list"></section>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const alert = app.querySelector('[role="alert"]');
    const list = app.querySelector('#project-list');
    // Load the existing rows before accepting creations to preserve their order.
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const projects = await request('/api/projects');
      list.append(...projects.map(projectRow));
    } catch (error) {
      showError(alert, error.message);
      return;
    } finally {
      app.setAttribute('aria-busy', 'false');
    }
    button.disabled = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        showError(alert, 'Project name is required');
        input.focus();
        return;
      }
      button.disabled = true;
      alert.hidden = true;
      try {
        const project = await request('/api/projects', {
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
  app.setAttribute('aria-busy', 'false');
}

render();
