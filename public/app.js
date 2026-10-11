const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
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
  const row = document.createElement('div');
  row.dataset.testid = 'project-row';
  row.className = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
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
      archive.disabled = false;
    }
  });
  row.append(name, summary, open, archive);
  return row;
}

function renderRename(project, heading) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label for="new-project-name">New project name</label>
    <div class="create-controls">
      <input id="new-project-name" type="text" autocomplete="off">
      <button type="submit">Rename project</button>
    </div>
  `;
  app.append(form);
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  input.disabled = submit.disabled = Boolean(project.archived);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    app.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = saved.name;
      heading.textContent = saved.name;
      document.title = `${saved.name} — Workboard`;
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = Boolean(project.archived);
    }
  });
}

async function renderTasks(project) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Tasks');
  section.innerHTML = `
    <form>
      <label for="task-title">Task title</label>
      <div class="create-controls">
        <input id="task-title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option>All</option>
      <option>Open</option>
      <option>Completed</option>
    </select>
    <div id="task-list"></div>
  `;
  app.append(section);
  const endpoint = `/api/projects/${project.id}/tasks`;
  let tasks = await api(endpoint);
  const list = section.querySelector('#task-list');
  const filter = section.querySelector('select');
  function drawTasks() {
    const visible = tasks.filter(task => filter.value === 'All' ||
      (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map(task => {
      const row = document.createElement('div');
      row.dataset.testid = 'task-row';
      row.className = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = Boolean(project.archived);
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
          tasks = tasks.map(item => item.id === saved.id ? saved : item);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = Boolean(project.archived);
        }
      });
      const renameForm = document.createElement('form');
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      renameLabel.textContent = 'New task title';
      const renameInput = document.createElement('input');
      renameInput.id = renameLabel.htmlFor;
      renameInput.type = 'text';
      renameInput.autocomplete = 'off';
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameInput.disabled = renameButton.disabled = Boolean(project.archived);
      renameForm.append(renameLabel, renameInput, renameButton);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (project.archived) return;
        app.querySelector('[role="alert"]')?.remove();
        const newTitle = renameInput.value.trim();
        if (!newTitle) return showError('Task title is required');
        renameButton.disabled = true;
        try {
          const saved = await api(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          tasks = tasks.map(item => item.id === saved.id ? saved : item);
          drawTasks();
        } catch (error) {
          showError(error.message);
        } finally {
          renameButton.disabled = Boolean(project.archived);
        }
      });
      row.append(title, checkbox, renameForm);
      return row;
    }));
  }
  filter.addEventListener('change', drawTasks);
  drawTasks();
  const form = section.querySelector('form');
  const input = section.querySelector('#task-title');
  const submit = form.querySelector('button');
  submit.disabled = Boolean(project.archived);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    app.querySelector('[role="alert"]')?.remove();
    const title = input.value.trim();
    if (!title) return showError('Task title is required');
    submit.disabled = true;
    try {
      const task = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = Boolean(project.archived);
    }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.replaceChildren();
    const back = document.createElement('button');
    back.textContent = 'Projects';
    back.addEventListener('click', () => location.assign('/'));
    app.append(back);
    const project = await api(`/api/projects/${match[1]}`);
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    app.prepend(heading);
    document.title = `${project.name} — Workboard`;
    if (project.archived) {
      const notice = document.createElement('p');
      notice.textContent = 'Archived project';
      app.append(notice);
    }
    renderRename(project, heading);
    await renderTasks(project);
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
    <label for="project-filter">Project filter</label>
    <select id="project-filter">
      <option>Active</option>
      <option>Archived</option>
    </select>
    <section aria-label="Projects" id="project-list"></section>
  `;
  const list = app.querySelector('#project-list');
  let projects = await api('/api/projects');
  const filter = app.querySelector('#project-filter');
  function drawProjects() {
    const archived = filter.value === 'Archived';
    list.replaceChildren(...projects.filter(project => Boolean(project.archived) === archived)
      .map(project => projectRow(project, saved => {
        projects = projects.map(item => item.id === saved.id ? saved : item);
        drawProjects();
      })));
  }
  filter.addEventListener('change', drawProjects);
  drawProjects();
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const submit = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
