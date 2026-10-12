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

function projectRow(project, changeArchive) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', () => changeArchive(project, archive));
  row.append(name, summary, open, archive);
  return row;
}

async function renderProject(projectId) {
  app.innerHTML = `
    <button type="button" id="projects">Projects</button>
    <h1></h1>
    <p id="archived-notice" hidden>Archived project</p>
    <form id="rename-project">
      <label for="new-project-name">New project name</label>
      <div class="create-fields">
        <input id="new-project-name" name="name" type="text" autocomplete="off" disabled>
        <button type="submit" disabled>Rename project</button>
      </div>
    </form>
    <form id="create-task">
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
    <div class="task-filter">
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter">
        <option>All</option><option>Low</option><option>Normal</option><option>High</option>
      </select>
    </div>
    <section aria-label="Tasks" id="task-list"></section>`;
  app.querySelector('#projects').addEventListener('click', () => location.assign('/'));
  const form = app.querySelector('#create-task');
  const renameForm = app.querySelector('#rename-project');
  const renameInput = app.querySelector('#new-project-name');
  const renameButton = renameForm.querySelector('button');
  const input = app.querySelector('#task-title');
  const button = form.querySelector('button');
  const alert = app.querySelector('[role="alert"]');
  const filter = app.querySelector('#task-filter');
  const priorityFilter = app.querySelector('#priority-filter');
  const list = app.querySelector('#task-list');
  const tasksPath = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  let archived = false;

  function displayTasks() {
    const matching = tasks.filter(task =>
      (filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed)) &&
      (priorityFilter.value === 'All' || task.priority === priorityFilter.value));
    list.replaceChildren(...matching.map(task => {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
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
          checkbox.disabled = archived;
        }
      });
      const renameForm = document.createElement('form');
      renameForm.className = 'rename-task';
      const renameLabel = document.createElement('label');
      renameLabel.textContent = 'New task title';
      const renameInput = document.createElement('input');
      renameInput.id = `new-task-title-${task.id}`;
      renameInput.type = 'text';
      renameInput.name = 'title';
      renameInput.autocomplete = 'off';
      renameInput.disabled = archived;
      renameLabel.htmlFor = renameInput.id;
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = archived;
      const fields = document.createElement('div');
      fields.className = 'create-fields';
      fields.append(renameInput, renameButton);
      renameForm.append(renameLabel, fields);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (archived) return;
        const newTitle = renameInput.value.trim();
        if (!newTitle) {
          showError(alert, 'Task title is required');
          renameInput.focus();
          return;
        }
        renameButton.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          Object.assign(task, saved);
          title.textContent = task.title;
          checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          renameInput.value = '';
          renameInput.focus();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          renameButton.disabled = archived;
        }
      });
      const priorityField = document.createElement('div');
      const priorityLabel = document.createElement('label');
      priorityLabel.textContent = 'Task priority';
      const priority = document.createElement('select');
      priority.id = `task-priority-${task.id}`;
      priorityLabel.htmlFor = priority.id;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.disabled = archived;
      priority.addEventListener('change', async () => {
        priority.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) {
          priority.value = task.priority;
          showError(alert, error.message);
        } finally {
          priority.disabled = archived;
        }
      });
      priorityField.append(priorityLabel, priority);
      row.append(title, checkbox, priorityField, renameForm);
      return row;
    }));
  }

  try {
    const project = await request(`/api/projects/${projectId}`);
    archived = project.archived;
    app.querySelector('#archived-notice').hidden = !archived;
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
  priorityFilter.addEventListener('change', displayTasks);
  renameInput.disabled = archived;
  renameButton.disabled = archived;
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (archived) return;
    const name = renameInput.value.trim();
    if (!name) {
      showError(alert, 'Project name is required');
      renameInput.focus();
      return;
    }
    renameButton.disabled = true;
    alert.hidden = true;
    try {
      const saved = await request(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      app.querySelector('h1').textContent = saved.name;
      document.title = `${saved.name} · Workboard`;
      renameInput.value = '';
      renameInput.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      renameButton.disabled = archived;
    }
  });
  button.disabled = archived;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (archived) return;
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
      button.disabled = archived;
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
      <div class="project-filter">
        <label for="project-filter">Project filter</label>
        <select id="project-filter"><option>Active</option><option>Archived</option></select>
      </div>
      <section aria-label="Projects" id="project-list"></section>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const alert = app.querySelector('[role="alert"]');
    const list = app.querySelector('#project-list');
    const filter = app.querySelector('#project-filter');
    let projects = [];
    function displayProjects() {
      list.replaceChildren(...projects
        .filter(project => project.archived === (filter.value === 'Archived'))
        .map(project => projectRow(project, changeArchive)));
    }
    async function changeArchive(project, archiveButton) {
      archiveButton.disabled = true;
      alert.hidden = true;
      try {
        const saved = await request(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        Object.assign(project, saved);
        displayProjects();
      } catch (error) {
        showError(alert, error.message);
      } finally {
        archiveButton.disabled = false;
      }
    }
    filter.addEventListener('change', displayProjects);
    // Load the existing rows before accepting creations to preserve their order.
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      projects = await request('/api/projects');
      displayProjects();
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
        projects.push(project);
        displayProjects();
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
