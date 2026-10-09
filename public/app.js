const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  const alert = document.querySelector('#error');
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  row.append(name, button);
  return row;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = `
      <button type="button" id="back" class="secondary">Projects</button>
      <h1></h1>
      <form id="create-task" novalidate>
        <label for="task-title">Task title</label>
        <div class="form-controls">
          <input id="task-title" name="title" type="text" autocomplete="off">
          <button type="submit">Create task</button>
        </div>
      </form>
      <p id="error" role="alert" hidden></p>
      <h2>Tasks</h2>
      <label for="task-filter">Task filter</label>
      <select id="task-filter">
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="completed">Completed</option>
      </select>
      <p id="empty" hidden>No tasks match this filter.</p>
      <ul id="tasks" aria-label="Tasks"></ul>`;
    document.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
    const project = await request(`/api/projects/${match[1]}`);
    document.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    const endpoint = `/api/projects/${project.id}/tasks`;
    const tasks = await request(endpoint);
    const filter = document.querySelector('#task-filter');
    const list = document.querySelector('#tasks');
    function renderTasks() {
      const visible = tasks.filter(task => filter.value === 'all' ||
        (filter.value === 'completed' ? task.completed : !task.completed));
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
          document.querySelector('#error').hidden = true;
          try {
            const updated = await request(`${endpoint}/${task.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            Object.assign(task, updated);
            renderTasks();
          } catch (error) {
            checkbox.checked = task.completed;
            showError(error.message);
          } finally { checkbox.disabled = false; }
        });
        row.append(title, checkbox);
        return row;
      }));
      document.querySelector('#empty').hidden = visible.length !== 0;
    }
    filter.addEventListener('change', renderTasks);
    renderTasks();
    document.querySelector('#create-task').addEventListener('submit', async event => {
      event.preventDefault();
      const input = document.querySelector('#task-title');
      const title = input.value.trim();
      document.querySelector('#error').hidden = true;
      if (!title) { showError('Task title is required'); input.focus(); return; }
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        tasks.push(await request(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }));
        renderTasks();
        input.value = '';
        input.focus();
      } catch (error) { showError(error.message); }
      finally { button.disabled = false; }
    });
  } else {
    app.innerHTML = `
      <h1>Workboard</h1>
      <p class="intro">A place for your projects.</p>
      <form id="create-project" novalidate>
        <label for="project-name">Project name</label>
        <div class="form-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p id="error" role="alert" hidden></p>
      <h2>Projects</h2>
      <p id="empty" hidden>No projects yet. Create one to get started.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    const projects = await request('/api/projects');
    const list = document.querySelector('#projects');
    list.append(...projects.map(projectRow));
    document.querySelector('#empty').hidden = projects.length !== 0;
    document.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#project-name');
      const name = input.value.trim();
      document.querySelector('#error').hidden = true;
      if (!name) { showError('Project name is required'); input.focus(); return; }
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        const project = await request('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        list.append(projectRow(project));
        document.querySelector('#empty').hidden = true;
        input.value = '';
        input.focus();
      } catch (error) { showError(error.message); }
      finally { button.disabled = false; }
    });
  }
}

render().catch(error => {
  if (!document.querySelector('#error')) app.innerHTML = '<p id="error" role="alert"></p>';
  showError(error.message);
}).finally(() => app.setAttribute('aria-busy', 'false'));
