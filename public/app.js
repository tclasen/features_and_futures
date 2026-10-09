const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
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

function projectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  row.append(name, open);
  return row;
}

async function renderTasks(projectId) {
  const path = `/api/projects/${projectId}/tasks`;
  const tasks = await request(path);
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Project tasks');
  section.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
    </select>
    <div id="tasks"></div>
  `;
  app.append(section);
  const list = section.querySelector('#tasks');
  const filter = section.querySelector('select');

  function renderList() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'open' && task.completed) continue;
      if (filter.value === 'completed' && !task.completed) continue;
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
        app.querySelector('[role="alert"]')?.remove();
        try {
          const updated = await request(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = updated.completed;
          renderList();
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

  filter.addEventListener('change', renderList);
  renderList();
  const form = section.querySelector('form');
  const input = section.querySelector('#task-title');
  const submit = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    submit.disabled = true;
    try {
      const task = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      renderList();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const project = await request(`/api/projects/${match[1]}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Projects';
    back.addEventListener('click', () => { location.href = '/'; });
    app.replaceChildren(heading, back);
    await renderTasks(project.id);
  } else {
    const projects = await request('/api/projects');
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <section aria-label="Projects" id="projects"></section>
    `;
    const list = app.querySelector('#projects');
    list.append(...projects.map(projectRow));
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      app.querySelector('[role="alert"]')?.remove();
      const name = input.value.trim();
      if (!name) return showError('Project name is required');
      submit.disabled = true;
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
        showError(error.message);
      } finally {
        submit.disabled = false;
      }
    });
  }
}

render().catch((error) => {
  app.replaceChildren();
  showError(error.message);
}).finally(() => app.setAttribute('aria-busy', 'false'));
