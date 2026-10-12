import { isValidDueDate } from './dates.js';

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

function normalizeSearch(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
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
    <div class="task-filter">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority" disabled>
        <option>Low</option><option selected>Normal</option><option>High</option>
      </select>
    </div>
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
    <form id="due-range" class="task-filter">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <form id="task-search-form" class="task-filter">
      <label for="task-search">Task search</label>
      <div class="create-fields">
        <input id="task-search" type="text" autocomplete="off">
        <button type="submit">Search tasks</button>
      </div>
    </form>
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
  const defaultPriority = app.querySelector('#default-task-priority');
  const dueRangeForm = app.querySelector('#due-range');
  const dueFrom = app.querySelector('#due-from');
  const dueThrough = app.querySelector('#due-through');
  let appliedFrom = '';
  let appliedThrough = '';
  const searchForm = app.querySelector('#task-search-form');
  const searchInput = app.querySelector('#task-search');
  let appliedSearch = '';
  const list = app.querySelector('#task-list');
  const tasksPath = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  let destinations = [];
  let archived = false;
  let savedDefaultPriority;

  function displayTasks() {
    const matching = tasks.filter(task =>
      normalizeSearch(task.title).includes(appliedSearch) &&
      (filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed)) &&
      (priorityFilter.value === 'All' || task.priority === priorityFilter.value) &&
      ((!appliedFrom && !appliedThrough) || (task.dueDate &&
        (!appliedFrom || task.dueDate >= appliedFrom) &&
        (!appliedThrough || task.dueDate <= appliedThrough))));
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
          if (appliedSearch) displayTasks();
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
      const dueDateForm = document.createElement('form');
      dueDateForm.className = 'task-due-date';
      const dueDateLabel = document.createElement('label');
      dueDateLabel.textContent = 'Task due date';
      const dueDateInput = document.createElement('input');
      dueDateInput.id = `task-due-date-${task.id}`;
      dueDateInput.type = 'text';
      dueDateInput.autocomplete = 'off';
      dueDateInput.value = task.dueDate;
      dueDateInput.disabled = archived;
      dueDateLabel.htmlFor = dueDateInput.id;
      const dueDateButton = document.createElement('button');
      dueDateButton.type = 'submit';
      dueDateButton.textContent = 'Save due date';
      dueDateButton.disabled = archived;
      const dueDateFields = document.createElement('div');
      dueDateFields.className = 'create-fields';
      dueDateFields.append(dueDateInput, dueDateButton);
      dueDateForm.append(dueDateLabel, dueDateFields);
      dueDateForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (archived) return;
        dueDateButton.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dueDate: dueDateInput.value.trim() }),
          });
          Object.assign(task, saved);
          dueDateInput.value = task.dueDate;
          if (appliedFrom || appliedThrough) displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          dueDateButton.disabled = archived;
        }
      });
      const moveForm = document.createElement('form');
      moveForm.className = 'move-task';
      const destinationLabel = document.createElement('label');
      destinationLabel.textContent = 'Destination project';
      const destination = document.createElement('select');
      destination.id = `destination-project-${task.id}`;
      destinationLabel.htmlFor = destination.id;
      for (const project of destinations) {
        const option = document.createElement('option');
        option.value = String(project.id);
        option.textContent = project.name;
        destination.append(option);
      }
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      destination.disabled = moveButton.disabled = archived || destinations.length === 0;
      const moveFields = document.createElement('div');
      moveFields.className = 'create-fields';
      moveFields.append(destination, moveButton);
      moveForm.append(destinationLabel, moveFields);
      moveForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (archived || destinations.length === 0) return;
        destination.disabled = moveButton.disabled = true;
        alert.hidden = true;
        try {
          await request(`${tasksPath}/${task.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
          });
          tasks = tasks.filter(candidate => candidate.id !== task.id);
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          destination.disabled = moveButton.disabled = archived || destinations.length === 0;
        }
      });
      const notesForm = document.createElement('form');
      notesForm.className = 'task-notes';
      const notesLabel = document.createElement('label');
      notesLabel.textContent = 'Task notes';
      const notesInput = document.createElement('textarea');
      notesInput.id = `task-notes-${task.id}`;
      notesInput.rows = 4;
      notesInput.value = task.notes;
      notesInput.disabled = archived;
      notesLabel.htmlFor = notesInput.id;
      const notesButton = document.createElement('button');
      notesButton.type = 'submit';
      notesButton.textContent = 'Save notes';
      notesButton.disabled = archived;
      const notesFields = document.createElement('div');
      notesFields.className = 'create-fields';
      notesFields.append(notesInput, notesButton);
      notesForm.append(notesLabel, notesFields);
      notesForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (archived) return;
        notesButton.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`${tasksPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesInput.value }),
          });
          Object.assign(task, saved);
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          notesButton.disabled = archived;
        }
      });
      row.append(title, checkbox, priorityField, renameForm, dueDateForm, moveForm, notesForm);
      return row;
    }));
  }

  try {
    const project = await request(`/api/projects/${projectId}`);
    archived = project.archived;
    savedDefaultPriority = project.defaultPriority;
    defaultPriority.value = savedDefaultPriority;
    app.querySelector('#archived-notice').hidden = !archived;
    app.querySelector('h1').textContent = project.name;
    document.title = `${project.name} · Workboard`;
    tasks = await request(tasksPath);
    destinations = (await request('/api/projects')).filter(project =>
      !project.archived && project.id !== Number(projectId));
    displayTasks();
  } catch (error) {
    showError(alert, error.message);
    return;
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
  dueRangeForm.addEventListener('submit', event => {
    event.preventDefault();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if (!isValidDueDate(from) || !isValidDueDate(through)) {
      showError(alert, 'Due range must use valid YYYY-MM-DD dates');
      return;
    }
    if (from && through && from > through) {
      showError(alert, 'Due from must not be after Due through');
      return;
    }
    appliedFrom = from;
    appliedThrough = through;
    dueFrom.value = from;
    dueThrough.value = through;
    alert.hidden = true;
    displayTasks();
  });
  filter.addEventListener('change', displayTasks);
  priorityFilter.addEventListener('change', displayTasks);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedSearch = normalizeSearch(searchInput.value.trim());
    alert.hidden = true;
    displayTasks();
  });
  defaultPriority.disabled = archived;
  defaultPriority.addEventListener('change', async () => {
    if (archived) return;
    defaultPriority.disabled = true;
    alert.hidden = true;
    try {
      const saved = await request(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPriority: defaultPriority.value }),
      });
      savedDefaultPriority = saved.defaultPriority;
    } catch (error) {
      showError(alert, error.message);
    } finally {
      defaultPriority.value = savedDefaultPriority;
      defaultPriority.disabled = archived;
    }
  });
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
      <form id="project-search-form" class="project-filter">
        <label for="project-search">Project search</label>
        <div class="create-fields">
          <input id="project-search" type="text" autocomplete="off">
          <button type="submit">Search projects</button>
        </div>
      </form>
      <section aria-label="Projects" id="project-list"></section>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const alert = app.querySelector('[role="alert"]');
    const list = app.querySelector('#project-list');
    const filter = app.querySelector('#project-filter');
    const searchForm = app.querySelector('#project-search-form');
    const searchInput = app.querySelector('#project-search');
    let appliedSearch = '';
    let projects = [];
    function displayProjects() {
      list.replaceChildren(...projects
        .filter(project => project.archived === (filter.value === 'Archived') &&
          normalizeSearch(project.name).includes(appliedSearch))
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
    searchForm.addEventListener('submit', event => {
      event.preventDefault();
      appliedSearch = normalizeSearch(searchInput.value.trim());
      alert.hidden = true;
      displayProjects();
    });
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
