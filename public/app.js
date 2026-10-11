import { filterTasks, normalizeDueRange } from './task-filters.js';
import { filterProjects, normalizeSearchQuery } from './search.js';

const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(container, message) {
  container.textContent = message;
  container.hidden = false;
}

function renderRename(project) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Rename project');
  section.innerHTML = `
    <form>
      <label for="new-project-name">New project name</label>
      <div class="create-controls">
        <input id="new-project-name" type="text" autocomplete="off">
        <button type="submit">Rename project</button>
      </div>
    </form>
    <p role="alert" hidden></p>
  `;
  const form = section.querySelector('form');
  const input = form.querySelector('input');
  const button = form.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  input.value = project.name;
  input.disabled = project.archived;
  button.disabled = project.archived;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(alert, 'Project name is required');
      return;
    }
    button.disabled = true;
    try {
      Object.assign(project, await request(`/api/projects/${project.id}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      }));
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      input.value = project.name;
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = project.archived;
    }
  });
  app.append(section);
}

async function renderTasks(project) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Tasks');
  section.innerHTML = `
    <div class="task-filter">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority">
        <option value="Low">Low</option>
        <option value="Normal">Normal</option>
        <option value="High">High</option>
      </select>
    </div>
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
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="completed">Completed</option>
        <option value="deleted">Deleted</option>
      </select>
    </div>
    <div class="task-filter">
      <label for="priority-filter">Priority filter</label>
      <select id="priority-filter">
        <option value="all">All</option>
        <option value="Low">Low</option>
        <option value="Normal">Normal</option>
        <option value="High">High</option>
      </select>
    </div>
    <form id="due-range">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
      <label for="due-through">Due through</label>
      <div class="create-controls">
        <input id="due-through" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
        <button type="submit">Apply due range</button>
      </div>
    </form>
    <form id="task-search-form" class="search-form">
      <label for="task-search">Task search</label>
      <div class="create-controls">
        <input id="task-search" type="text" autocomplete="off">
        <button type="submit">Search tasks</button>
      </div>
    </form>
    <div id="tasks"></div>
  `;
  app.append(section);
  const form = section.querySelector('form');
  const input = section.querySelector('input');
  const button = form.querySelector('button');
  const alert = section.querySelector('[role="alert"]');
  const filter = section.querySelector('#task-filter');
  const priorityFilter = section.querySelector('#priority-filter');
  const dueRangeForm = section.querySelector('#due-range');
  const dueFrom = section.querySelector('#due-from');
  const dueThrough = section.querySelector('#due-through');
  // Draft inputs only replace the applied range after successful validation.
  let dueRange = { from: '', through: '' };
  const searchForm = section.querySelector('#task-search-form');
  const searchInput = section.querySelector('#task-search');
  let searchQuery = '';
  const defaultPriority = section.querySelector('#default-task-priority');
  defaultPriority.value = project.default_task_priority;
  defaultPriority.disabled = project.archived;
  defaultPriority.addEventListener('change', async () => {
    defaultPriority.disabled = true;
    button.disabled = true;
    alert.hidden = true;
    try {
      Object.assign(project, await request(`/api/projects/${project.id}/default-task-priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: defaultPriority.value }),
      }));
    } catch (error) {
      showError(alert, error.message);
    } finally {
      defaultPriority.value = project.default_task_priority;
      defaultPriority.disabled = project.archived;
      button.disabled = project.archived;
    }
  });
  const list = section.querySelector('#tasks');
  const endpoint = `/api/projects/${project.id}/tasks`;
  let tasks = [];
  let destinations = [];

  function displayTasks() {
    list.replaceChildren();
    for (const task of filterTasks(tasks, filter.value, priorityFilter.value, dueRange, searchQuery)) {
      const cannotEdit = project.archived || task.deleted;
      const row = document.createElement('div');
      row.dataset.testid = 'task-row';
      row.className = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = cannotEdit;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const updated = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, updated);
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(alert, error.message);
        } finally {
          checkbox.disabled = cannotEdit;
        }
      });
      const renameForm = document.createElement('form');
      renameForm.className = 'task-rename';
      const renameLabel = document.createElement('label');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      renameLabel.textContent = 'New task title';
      const renameInput = document.createElement('input');
      renameInput.id = renameLabel.htmlFor;
      renameInput.type = 'text';
      renameInput.autocomplete = 'off';
      renameInput.value = task.title;
      renameInput.disabled = cannotEdit;
      const renameButton = document.createElement('button');
      renameButton.type = 'submit';
      renameButton.textContent = 'Rename task';
      renameButton.disabled = cannotEdit;
      const renameControls = document.createElement('div');
      renameControls.className = 'create-controls';
      renameControls.append(renameInput, renameButton);
      renameForm.append(renameLabel, renameControls);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (cannotEdit) return;
        alert.hidden = true;
        if (!renameInput.value.trim()) {
          showError(alert, 'Task title is required');
          return;
        }
        renameButton.disabled = true;
        try {
          const updated = await request(`${endpoint}/${task.id}/title`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: renameInput.value }),
          });
          task.title = updated.title;
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          renameButton.disabled = cannotEdit;
        }
      });
      const priorityControls = document.createElement('div');
      const priorityLabel = document.createElement('label');
      priorityLabel.htmlFor = `task-priority-${task.id}`;
      priorityLabel.textContent = 'Task priority';
      const prioritySelect = document.createElement('select');
      prioritySelect.id = priorityLabel.htmlFor;
      for (const priority of ['Low', 'Normal', 'High']) {
        const option = document.createElement('option');
        option.value = priority;
        option.textContent = priority;
        prioritySelect.append(option);
      }
      prioritySelect.value = task.priority;
      prioritySelect.disabled = cannotEdit;
      prioritySelect.addEventListener('change', async () => {
        prioritySelect.disabled = true;
        alert.hidden = true;
        try {
          const updated = await request(`${endpoint}/${task.id}/priority`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: prioritySelect.value }),
          });
          task.priority = updated.priority;
          displayTasks();
        } catch (error) {
          prioritySelect.value = task.priority;
          showError(alert, error.message);
        } finally {
          prioritySelect.disabled = cannotEdit;
        }
      });
      priorityControls.append(priorityLabel, prioritySelect);
      const dueDateForm = document.createElement('form');
      dueDateForm.className = 'task-due-date';
      const dueDateLabel = document.createElement('label');
      dueDateLabel.htmlFor = `task-due-date-${task.id}`;
      dueDateLabel.textContent = 'Task due date';
      const dueDateInput = document.createElement('input');
      dueDateInput.id = dueDateLabel.htmlFor;
      dueDateInput.type = 'text';
      dueDateInput.placeholder = 'YYYY-MM-DD';
      dueDateInput.value = task.due_date;
      dueDateInput.disabled = cannotEdit;
      const dueDateButton = document.createElement('button');
      dueDateButton.type = 'submit';
      dueDateButton.textContent = 'Save due date';
      dueDateButton.disabled = cannotEdit;
      const dueDateControls = document.createElement('div');
      dueDateControls.className = 'create-controls';
      dueDateControls.append(dueDateInput, dueDateButton);
      dueDateForm.append(dueDateLabel, dueDateControls);
      dueDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (cannotEdit) return;
        alert.hidden = true;
        dueDateButton.disabled = true;
        try {
          const updated = await request(`${endpoint}/${task.id}/due-date`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: dueDateInput.value }),
          });
          task.due_date = updated.due_date;
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          dueDateButton.disabled = cannotEdit;
        }
      });
      const notesForm = document.createElement('form');
      notesForm.className = 'task-notes';
      const notesLabel = document.createElement('label');
      notesLabel.htmlFor = `task-notes-${task.id}`;
      notesLabel.textContent = 'Task notes';
      const notesInput = document.createElement('textarea');
      notesInput.id = notesLabel.htmlFor;
      notesInput.rows = 4;
      notesInput.value = task.notes;
      notesInput.disabled = cannotEdit;
      const notesButton = document.createElement('button');
      notesButton.type = 'submit';
      notesButton.textContent = 'Save notes';
      notesButton.disabled = cannotEdit;
      notesForm.append(notesLabel, notesInput, notesButton);
      notesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (cannotEdit) return;
        alert.hidden = true;
        notesButton.disabled = true;
        try {
          const updated = await request(`${endpoint}/${task.id}/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesInput.value }),
          });
          task.notes = updated.notes;
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          notesButton.disabled = cannotEdit;
        }
      });
      const moveForm = document.createElement('form');
      moveForm.className = 'task-move';
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
      const cannotMove = cannotEdit || destinations.length === 0;
      destinationSelect.disabled = cannotMove;
      const moveButton = document.createElement('button');
      moveButton.type = 'submit';
      moveButton.textContent = 'Move task';
      moveButton.disabled = cannotMove;
      const moveControls = document.createElement('div');
      moveControls.className = 'create-controls';
      moveControls.append(destinationSelect, moveButton);
      moveForm.append(destinationLabel, moveControls);
      moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (cannotMove) return;
        alert.hidden = true;
        moveButton.disabled = true;
        destinationSelect.disabled = true;
        try {
          await request(`${endpoint}/${task.id}/move`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_project_id: Number(destinationSelect.value) }),
          });
          tasks = tasks.filter((existing) => existing.id !== task.id);
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          moveButton.disabled = cannotMove;
          destinationSelect.disabled = cannotMove;
        }
      });
      const deletionButton = document.createElement('button');
      deletionButton.type = 'button';
      deletionButton.textContent = task.deleted ? 'Restore task' : 'Delete task';
      deletionButton.disabled = project.archived;
      deletionButton.addEventListener('click', async () => {
        if (project.archived) return;
        alert.hidden = true;
        deletionButton.disabled = true;
        try {
          Object.assign(task, await request(`${endpoint}/${task.id}/deleted`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted: !task.deleted }),
          }));
          displayTasks();
        } catch (error) {
          showError(alert, error.message);
        } finally {
          deletionButton.disabled = project.archived;
        }
      });
      row.append(title, checkbox, priorityControls, renameForm, dueDateForm, notesForm, moveForm, deletionButton);
      list.append(row);
    }
  }

  filter.addEventListener('change', displayTasks);
  priorityFilter.addEventListener('change', displayTasks);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchQuery = normalizeSearchQuery(searchInput.value);
    displayTasks();
  });
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      dueRange = normalizeDueRange(dueFrom.value, dueThrough.value);
      dueFrom.value = dueRange.from;
      dueThrough.value = dueRange.through;
      displayTasks();
    } catch (error) {
      showError(alert, error.message);
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(alert, 'Task title is required');
      return;
    }
    button.disabled = true;
    try {
      tasks.push(await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      }));
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(alert, error.message);
    } finally {
      button.disabled = project.archived;
    }
  });

  try {
    const [savedTasks, projects] = await Promise.all([request(endpoint), request('/api/projects')]);
    tasks = savedTasks;
    destinations = projects.filter((candidate) => !candidate.archived && candidate.id !== project.id);
    displayTasks();
    button.disabled = project.archived;
  } catch (error) {
    showError(alert, error.message);
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) {
    app.innerHTML = '<button id="back" type="button">Projects</button><h1>Loading project…</h1><p role="alert" hidden></p>';
    document.querySelector('#back').addEventListener('click', () => location.assign('/'));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} — Workboard`;
      if (project.archived) {
        const notice = document.createElement('p');
        notice.textContent = 'Archived project';
        app.append(notice);
      }
      renderRename(project);
      await renderTasks(project);
    } catch (error) {
      app.querySelector('h1').textContent = 'Project unavailable';
      showError(app.querySelector('[role="alert"]'), error.message);
    }
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
    <p role="alert" hidden></p>
    <div class="project-filter">
      <label for="project-filter">Project filter</label>
      <select id="project-filter">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <form id="project-search-form" class="search-form">
      <label for="project-search">Project search</label>
      <div class="create-controls">
        <input id="project-search" type="text" autocomplete="off">
        <button type="submit">Search projects</button>
      </div>
    </form>
    <section aria-label="Projects" id="projects"></section>
  `;
  const form = app.querySelector('form');
  const input = app.querySelector('input');
  const alert = app.querySelector('[role="alert"]');
  const list = app.querySelector('#projects');
  const filter = app.querySelector('select');
  const searchForm = app.querySelector('#project-search-form');
  const searchInput = app.querySelector('#project-search');
  let searchQuery = '';
  let projects = [];

  function displayProjects() {
    list.replaceChildren();
    filterProjects(projects, filter.value, searchQuery).forEach(appendProject);
  }

  filter.addEventListener('change', displayProjects);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchQuery = normalizeSearchQuery(searchInput.value);
    displayProjects();
  });

  function appendProject(project) {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => location.assign(`/projects/${project.id}`));
    const archiveButton = document.createElement('button');
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? 'Restore project' : 'Archive project';
    archiveButton.addEventListener('click', async () => {
      archiveButton.disabled = true;
      alert.hidden = true;
      try {
        Object.assign(project, await request(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        }));
        displayProjects();
      } catch (error) {
        showError(alert, error.message);
      } finally {
        archiveButton.disabled = false;
      }
    });
    row.append(name, summary, button, archiveButton);
    list.append(row);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!input.value.trim()) {
      showError(alert, 'Project name is required');
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
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

  form.querySelector('button').disabled = true;
  try {
    projects = await request('/api/projects');
    displayProjects();
  } catch (error) {
    showError(alert, error.message);
  } finally {
    form.querySelector('button').disabled = false;
  }
}

render();
