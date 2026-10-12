const app = document.querySelector('#app');

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function matchesSearch(value, query) {
  return asciiLower(value.replace(/[ \t]+/g, ' '))
    .includes(asciiLower(query.replace(/[ \t]+/g, ' ')));
}

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

function validRangeDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function appendProject(project, onArchive) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open project';
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    app.querySelector('[role="alert"]')?.remove();
    archive.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      onArchive();
    } catch (error) { archive.disabled = false; showError(error); }
  });
  row.append(name, summary, button, archive);
  app.querySelector('#projects').append(row);
  app.querySelector('#empty').hidden = true;
}

function renderRename(project) {
  const form = document.createElement('form');
  form.innerHTML = `
    <label for="new-project-name">New project name</label>
    <div class="create-controls">
      <input id="new-project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Rename project</button>
    </div>`;
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  input.disabled = project.archived;
  submit.disabled = project.archived;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    if (!input.value.trim()) return showError(new Error('Project name is required'));
    submit.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      Object.assign(project, saved);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = '';
      input.focus();
    } catch (error) { showError(error); }
    finally { submit.disabled = project.archived; }
  });
  app.append(form);
}

function renderDefaultPriority(project) {
  const controls = document.createElement('div');
  controls.innerHTML = `
    <label for="default-task-priority">Default task priority</label>
    <select id="default-task-priority">
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>`;
  const select = controls.querySelector('select');
  select.value = project.default_priority;
  select.disabled = project.archived;
  select.addEventListener('change', async () => {
    if (select.disabled) return;
    app.querySelector('[role="alert"]')?.remove();
    select.disabled = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_priority: select.value }),
      });
      Object.assign(project, saved);
    } catch (error) { showError(error); }
    finally {
      select.value = project.default_priority;
      select.disabled = project.archived;
    }
  });
  app.append(controls);
}

async function renderTasks(project) {
  const projectId = project.id;
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
    <form id="task-search-form">
      <label for="task-search">Task search</label>
      <input id="task-search" type="text" autocomplete="off">
      <button type="submit">Search tasks</button>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option value="all">All</option>
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>
    <form id="due-range">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <p id="empty-tasks">No tasks to show.</p>
    <ul id="tasks" aria-label="Tasks"></ul>`;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const submit = form.querySelector('button');
  const filter = section.querySelector('#task-filter');
  const priorityFilter = section.querySelector('#priority-filter');
  const rangeForm = section.querySelector('#due-range');
  const dueFrom = section.querySelector('#due-from');
  const dueThrough = section.querySelector('#due-through');
  const searchForm = section.querySelector('#task-search-form');
  const searchInput = section.querySelector('#task-search');
  let appliedQuery = '';
  let appliedFrom = '';
  let appliedThrough = '';
  const list = section.querySelector('ul');
  const endpoint = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  let destinations = [];

  function drawTasks() {
    list.replaceChildren();
    const visible = tasks.filter((task) =>
      matchesSearch(task.title, appliedQuery) &&
      (filter.value === 'all' ||
        (filter.value === 'completed' ? task.completed : !task.completed)) &&
      (priorityFilter.value === 'all' || task.priority === priorityFilter.value) &&
      ((!appliedFrom && !appliedThrough) || (task.due_date !== '' &&
        (!appliedFrom || task.due_date >= appliedFrom) &&
        (!appliedThrough || task.due_date <= appliedThrough))));
    section.querySelector('#empty-tasks').hidden = visible.length > 0;
    for (const task of visible) {
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
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
          checkbox.disabled = project.archived;
          showError(error);
        }
      });
      const renameForm = document.createElement('form');
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      renameLabel.textContent = 'New task title';
      const renameControls = document.createElement('div');
      renameControls.className = 'create-controls';
      const renameInput = document.createElement('input');
      renameInput.id = renameLabel.htmlFor;
      renameInput.type = 'text';
      renameInput.name = 'title';
      renameInput.autocomplete = 'off';
      renameInput.disabled = project.archived;
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = project.archived;
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (renameButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        if (!renameInput.value.trim()) return showError(new Error('Task title is required'));
        renameButton.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: renameInput.value }),
          });
          Object.assign(task, saved);
          title.textContent = task.title;
          checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          renameInput.value = '';
          renameInput.focus();
          drawTasks();
        } catch (error) { showError(error); }
        finally { renameButton.disabled = project.archived; }
      });
      renameControls.append(renameInput, renameButton);
      renameForm.append(renameLabel, renameControls);
      const priorityControls = document.createElement('div');
      const priorityLabel = document.createElement('label');
      priorityLabel.htmlFor = `task-priority-${task.id}`;
      priorityLabel.textContent = 'Task priority';
      const priority = document.createElement('select');
      priority.id = priorityLabel.htmlFor;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.disabled = project.archived;
      priority.addEventListener('change', async () => {
        app.querySelector('[role="alert"]')?.remove();
        priority.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) { showError(error); }
        finally {
          priority.value = task.priority;
          priority.disabled = project.archived;
        }
      });
      priorityControls.append(priorityLabel, priority);
      const dueForm = document.createElement('form');
      const dueLabel = document.createElement('label');
      dueLabel.htmlFor = `task-due-date-${task.id}`;
      dueLabel.textContent = 'Task due date';
      const dueControls = document.createElement('div');
      dueControls.className = 'create-controls';
      const dueInput = document.createElement('input');
      dueInput.id = dueLabel.htmlFor;
      dueInput.type = 'text';
      dueInput.name = 'due_date';
      dueInput.autocomplete = 'off';
      dueInput.value = task.due_date;
      dueInput.disabled = project.archived;
      const dueButton = document.createElement('button');
      dueButton.type = 'submit';
      dueButton.textContent = 'Save due date';
      dueButton.disabled = project.archived;
      dueForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (dueButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        dueButton.disabled = true;
        try {
          const saved = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: dueInput.value }),
          });
          Object.assign(task, saved);
          dueInput.value = task.due_date;
          drawTasks();
        } catch (error) { showError(error); }
        finally { dueButton.disabled = project.archived; }
      });
      dueControls.append(dueInput, dueButton);
      dueForm.append(dueLabel, dueControls);
      const moveForm = document.createElement('form');
      const destinationLabel = document.createElement('label');
      destinationLabel.htmlFor = `destination-project-${task.id}`;
      destinationLabel.textContent = 'Destination project';
      const destinationSelect = document.createElement('select');
      destinationSelect.id = destinationLabel.htmlFor;
      for (const destination of destinations) {
        const option = document.createElement('option');
        option.value = String(destination.id);
        option.textContent = destination.name;
        destinationSelect.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      destinationSelect.disabled = project.archived || destinations.length === 0;
      moveButton.disabled = destinationSelect.disabled;
      moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (moveButton.disabled) return;
        app.querySelector('[role="alert"]')?.remove();
        moveButton.disabled = true;
        destinationSelect.disabled = true;
        try {
          await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_project_id: Number(destinationSelect.value) }),
          });
          tasks = tasks.filter((item) => item.id !== task.id);
          drawTasks();
        } catch (error) { showError(error); }
        finally {
          destinationSelect.disabled = project.archived || destinations.length === 0;
          moveButton.disabled = destinationSelect.disabled;
        }
      });
      moveForm.append(destinationLabel, destinationSelect, moveButton);
      row.append(title, checkbox, priorityControls, renameForm, dueForm, moveForm);
      list.append(row);
    }
  }

  filter.addEventListener('change', drawTasks);
  priorityFilter.addEventListener('change', drawTasks);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedQuery = searchInput.value.trim();
    searchInput.value = appliedQuery;
    drawTasks();
  });
  rangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    app.querySelector('[role="alert"]')?.remove();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if (!validRangeDate(from) || !validRangeDate(through)) {
      return showError(new Error('Due range must use valid YYYY-MM-DD dates'));
    }
    if (from && through && from > through) {
      return showError(new Error('Due from must not be after Due through'));
    }
    appliedFrom = from;
    appliedThrough = through;
    dueFrom.value = from;
    dueThrough.value = through;
    drawTasks();
  });
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
    finally { submit.disabled = project.archived; }
  });
  try {
    const [savedTasks, projects] = await Promise.all([request(endpoint), request('/api/projects')]);
    tasks = savedTasks;
    destinations = projects.filter((item) => !item.archived && item.id !== projectId);
    drawTasks();
    submit.disabled = project.archived;
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
      if (project.archived) {
        const notice = document.createElement('p');
        notice.textContent = 'Archived project';
        app.append(notice);
      }
      renderRename(project);
      renderDefaultPriority(project);
      await renderTasks(project);
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
      <form id="project-search-form">
        <label for="project-search">Project search</label>
        <input id="project-search" type="text" autocomplete="off">
        <button type="submit">Search projects</button>
      </form>
      <label for="project-filter">Project filter</label>
      <select id="project-filter">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <p id="empty">No projects yet.</p>
      <ul id="projects" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    const filter = app.querySelector('#project-filter');
    const searchForm = app.querySelector('#project-search-form');
    const searchInput = app.querySelector('#project-search');
    let appliedQuery = '';
    let projects = [];
    function drawProjects() {
      app.querySelector('#projects').replaceChildren();
      const visible = projects.filter((project) =>
        project.archived === (filter.value === 'archived') && matchesSearch(project.name, appliedQuery));
      app.querySelector('#empty').hidden = visible.length > 0;
      app.querySelector('#empty').textContent = 'No projects to show.';
      visible.forEach((project) => appendProject(project, drawProjects));
    }
    filter.addEventListener('change', drawProjects);
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      appliedQuery = searchInput.value.trim();
      searchInput.value = appliedQuery;
      drawProjects();
    });
    // Register after loading so creations always follow the persisted rows.
    try {
      submit.disabled = true;
      projects = await request('/api/projects');
      drawProjects();
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
        projects.push(project);
        drawProjects();
        input.value = '';
        input.focus();
      } catch (error) { showError(error); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
