const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
}

function alertMessage(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = !message;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.textContent = 'Open project';
  button.addEventListener('click', () => navigate(`/projects/${project.id}`));
  row.append(name, button);
  return row;
}

async function render() {
  const path = location.pathname;
  app.setAttribute('aria-busy', 'true');
  const match = path.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = `<button id="projects">Projects</button><h1></h1>
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
          <option>All</option><option>Open</option><option>Completed</option>
        </select>
      </div>
      <ul id="task-list" aria-label="Tasks"></ul>`;
    app.querySelector('#projects').addEventListener('click', () => navigate('/'));
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    const filter = app.querySelector('select');
    const list = app.querySelector('ul');
    const endpoint = `/api/projects/${match[1]}/tasks`;
    let tasks = [];
    function displayTasks() {
      const visible = tasks.filter(task => filter.value === 'All' ||
        (filter.value === 'Completed' ? task.completed : !task.completed));
      list.replaceChildren(...visible.map(task => {
        const row = document.createElement('li');
        row.dataset.testid = 'task-row';
        const title = document.createElement('span');
        title.textContent = task.title;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          alertMessage('');
          try {
            const saved = await request(`${endpoint}/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            tasks = tasks.map(item => item.id === saved.id ? saved : item);
            if (list.isConnected) displayTasks();
          } catch (error) {
            checkbox.checked = task.completed;
            if (list.isConnected) alertMessage(error.message);
          } finally {
            checkbox.disabled = false;
          }
        });
        row.append(title, checkbox);
        return row;
      }));
    }
    filter.addEventListener('change', displayTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const title = input.value.trim();
      if (!title) {
        alertMessage('Task title is required');
        input.focus();
        return;
      }
      submit.disabled = true;
      alertMessage('');
      try {
        const task = await request(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        tasks.push(task);
        if (!form.isConnected) return;
        displayTasks();
        input.value = '';
        input.focus();
      } catch (error) {
        if (form.isConnected) alertMessage(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    try {
      const project = await request(`/api/projects/${match[1]}`);
      if (location.pathname !== path) return;
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      tasks = await request(endpoint);
      if (!list.isConnected) return;
      displayTasks();
      submit.disabled = false;
    } catch (error) {
      if (location.pathname === path) alertMessage(error.message);
    }
  } else {
    document.title = 'Workboard';
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
      <ul id="project-list" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const list = app.querySelector('ul');
    const submit = form.querySelector('button');
    // Wait for the initial list before allowing creation, keeping creation order stable.
    submit.disabled = true;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        alertMessage('Project name is required');
        input.focus();
        return;
      }
      submit.disabled = true;
      alertMessage('');
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
        if (form.isConnected) alertMessage(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    try {
      const projects = await request('/api/projects');
      if (!list.isConnected) return;
      list.replaceChildren(...projects.map(projectRow));
    } catch (error) {
      if (list.isConnected) alertMessage(error.message);
    } finally {
      submit.disabled = false;
    }
  }
  if (location.pathname === path) app.setAttribute('aria-busy', 'false');
}

window.addEventListener('popstate', render);
render();
