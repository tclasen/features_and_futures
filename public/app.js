const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  const alert = document.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = false;
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

function setupTasks(projectId) {
  const list = document.querySelector('#task-list');
  const filter = document.querySelector('#task-filter');
  const form = document.querySelector('#task-form');
  const input = document.querySelector('#task-title');
  const submit = form.querySelector('button');
  let tasks = [];

  function displayTasks() {
    const visible = tasks.filter((task) => filter.value === 'All' ||
      (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map((task) => {
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
        document.querySelector('[role="alert"]').hidden = true;
        try {
          const saved = await api(`/api/projects/${projectId}/tasks/${task.id}`, {
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
      return row;
    }));
  }

  filter.addEventListener('change', displayTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      showError('Task title is required');
      return;
    }
    submit.disabled = true;
    document.querySelector('[role="alert"]').hidden = true;
    try {
      const task = await api(`/api/projects/${projectId}/tasks`, {
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
      submit.disabled = false;
    }
  });

  return api(`/api/projects/${projectId}/tasks`).then((saved) => {
    tasks = saved;
    displayTasks();
    submit.disabled = false;
  });
}

async function render() {
  const projectRoute = location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectRoute) {
    app.innerHTML = '<button id="projects" type="button">Projects</button><h1></h1><p role="alert" hidden></p>';
    document.querySelector('#projects').addEventListener('click', () => location.assign('/'));
    try {
      const project = await api(`/api/projects/${projectRoute[1]}`);
      document.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      app.insertAdjacentHTML('beforeend', `
        <form id="task-form">
          <label for="task-title">Task title</label>
          <div class="create-controls">
            <input id="task-title" name="title" type="text" autocomplete="off">
            <button type="submit" disabled>Create task</button>
          </div>
        </form>
        <div class="task-filter-controls">
          <label for="task-filter">Task filter</label>
          <select id="task-filter">
            <option>All</option>
            <option>Open</option>
            <option>Completed</option>
          </select>
        </div>
        <section aria-label="Tasks" id="task-list"></section>
      `);
      await setupTasks(project.id);
    } catch (error) {
      if (!document.querySelector('h1').textContent) {
        document.querySelector('h1').textContent = 'Project unavailable';
      }
      showError(error.message);
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
      <p role="alert" hidden></p>
      <section aria-label="Projects" id="project-list"></section>
    `;
    const list = document.querySelector('#project-list');
    const form = document.querySelector('form');
    const input = document.querySelector('#project-name');
    const submit = form.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value.trim()) {
        showError('Project name is required');
        return;
      }
      submit.disabled = true;
      document.querySelector('[role="alert"]').hidden = true;
      try {
        const project = await api('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value }),
        });
        list.append(projectRow(project));
        input.value = '';
        input.focus();
      } catch (error) {
        showError(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    submit.disabled = true;
    try {
      const projects = await api('/api/projects');
      list.replaceChildren(...projects.map(projectRow));
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  }
  app.setAttribute('aria-busy', 'false');
}

render();
