import { filterProjects, filterTasks, normalizeDueRange } from './task-filters.js';

const app = document.getElementById('app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function showError(message) {
  let alert = document.getElementById('error');
  if (!alert) {
    alert = document.createElement('p');
    alert.id = 'error';
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
  alert.hidden = false;
}

function projectRow(project, onArchive) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed}/${project.total} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onArchive(saved);
    } catch (error) { showError(error.message); }
    finally { archive.disabled = false; }
  });
  row.append(name, summary, open, archive);
  return row;
}

async function renderProject(projectId) {
  const project = await request(`/api/projects/${projectId}`);
  let tasks = await request(`/api/projects/${projectId}/tasks`);
  const destinations = (await request('/api/projects')).filter(candidate =>
    !candidate.archived && candidate.id !== project.id);
  app.innerHTML = `
    <button type="button" id="back">Projects</button><h1></h1>
    <button type="button" id="download-project">Download project</button>
    <form id="rename-form">
      <label for="new-project-name">New project name</label>
      <div class="form-controls">
        <input id="new-project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Rename project</button>
      </div>
    </form>
    <div class="project-default">
      <label for="default-task-priority">Default task priority</label>
      <select id="default-task-priority">
        <option value="Low">Low</option>
        <option value="Normal">Normal</option>
        <option value="High">High</option>
      </select>
    </div>
    <form id="task-form">
      <label for="task-title">Task title</label>
      <div class="form-controls">
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <h2>Tasks</h2>
    <form id="task-search-form">
      <label for="task-search">Task search</label>
      <div class="form-controls">
        <input id="task-search" type="text" autocomplete="off">
        <button type="submit">Search tasks</button>
      </div>
    </form>
    <label for="task-filter">Task filter</label>
    <select id="task-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="completed">Completed</option>
      <option value="deleted">Deleted</option>
    </select>
    <label for="priority-filter">Priority filter</label>
    <select id="priority-filter">
      <option value="all">All</option>
      <option value="Low">Low</option>
      <option value="Normal">Normal</option>
      <option value="High">High</option>
    </select>
    <form id="due-range-form">
      <label for="due-from">Due from</label>
      <input id="due-from" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
      <label for="due-through">Due through</label>
      <input id="due-through" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
      <button type="submit">Apply due range</button>
    </form>
    <p id="empty">No tasks to show.</p>
    <ul id="tasks"></ul>`;
  app.querySelector('h1').textContent = project.name;
  document.getElementById('download-project').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = `/api/projects/${projectId}/export`;
    link.download = 'workboard-project.json';
    document.body.append(link);
    link.click();
    link.remove();
  });
  const renameForm = document.getElementById('rename-form');
  const renameInput = document.getElementById('new-project-name');
  renameInput.value = project.name;
  const defaultPriority = document.getElementById('default-task-priority');
  defaultPriority.value = project.default_priority;
  defaultPriority.disabled = Boolean(project.archived);
  defaultPriority.addEventListener('change', async () => {
    defaultPriority.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const saved = await request(`/api/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_priority: defaultPriority.value }),
      });
      project.default_priority = saved.default_priority;
    } catch (error) {
      defaultPriority.value = project.default_priority;
      showError(error.message);
    } finally { defaultPriority.disabled = Boolean(project.archived); }
  });
  if (project.archived) {
    const notice = document.createElement('p');
    notice.textContent = 'Archived project';
    app.querySelector('h1').after(notice);
    document.querySelector('#task-form button').disabled = true;
    renameInput.disabled = true;
    renameForm.querySelector('button').disabled = true;
  }
  document.title = `${project.name} · Workboard`;
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const name = renameInput.value.trim();
    if (!name) { showError('Project name is required'); renameInput.focus(); return; }
    const button = renameForm.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const saved = await request(`/api/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      project.name = saved.name;
      app.querySelector('h1').textContent = project.name;
      document.title = `${project.name} · Workboard`;
      renameInput.value = project.name;
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
  document.getElementById('back').addEventListener('click', () => location.assign('/'));
  const filter = document.getElementById('task-filter');
  const priorityFilter = document.getElementById('priority-filter');
  const dueFrom = document.getElementById('due-from');
  const dueThrough = document.getElementById('due-through');
  let dueRange = { from: '', through: '' };
  let taskQuery = '';
  const list = document.getElementById('tasks');
  function drawTasks() {
    const visible = filterTasks(tasks, filter.value, priorityFilter.value, dueRange, taskQuery);
    list.replaceChildren(...visible.map(task => {
      const readOnly = Boolean(project.archived || task.deleted);
      const row = document.createElement('li');
      row.dataset.testid = 'task-row';
      const title = document.createElement('span');
      title.textContent = task.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = readOnly;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally { checkbox.disabled = readOnly; }
      });
      const rename = document.createElement('form');
      rename.className = 'task-rename';
      const label = document.createElement('label');
      label.htmlFor = `new-task-title-${task.id}`;
      label.textContent = 'New task title';
      const input = document.createElement('input');
      input.id = label.htmlFor;
      input.type = 'text';
      input.value = task.title;
      input.disabled = readOnly;
      const button = document.createElement('button');
      button.type = 'submit';
      button.textContent = 'Rename task';
      button.disabled = readOnly;
      const controls = document.createElement('div');
      controls.className = 'form-controls';
      controls.append(input, button);
      rename.append(label, controls);
      rename.addEventListener('submit', async event => {
        event.preventDefault();
        if (readOnly) return;
        const newTitle = input.value.trim();
        if (!newTitle) { showError('Task title is required'); input.focus(); return; }
        button.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) { showError(error.message); }
        finally { button.disabled = readOnly; }
      });
      const priorityControl = document.createElement('div');
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
      priority.disabled = readOnly;
      priority.addEventListener('change', async () => {
        priority.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) {
          priority.value = task.priority;
          showError(error.message);
        } finally { priority.disabled = readOnly; }
      });
      priorityControl.append(priorityLabel, priority);
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
      dueDateInput.disabled = readOnly;
      const saveDate = document.createElement('button');
      saveDate.type = 'submit';
      saveDate.textContent = 'Save due date';
      saveDate.disabled = readOnly;
      const dateControls = document.createElement('div');
      dateControls.className = 'form-controls';
      dateControls.append(dueDateInput, saveDate);
      dueDateForm.append(dueDateLabel, dateControls);
      dueDateForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (readOnly) return;
        saveDate.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: dueDateInput.value }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) { showError(error.message); }
        finally { saveDate.disabled = readOnly; }
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
      notesInput.disabled = readOnly;
      const saveNotes = document.createElement('button');
      saveNotes.type = 'submit';
      saveNotes.textContent = 'Save notes';
      saveNotes.disabled = readOnly;
      const notesControls = document.createElement('div');
      notesControls.className = 'form-controls';
      notesControls.append(notesInput, saveNotes);
      notesForm.append(notesLabel, notesControls);
      notesForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (readOnly) return;
        saveNotes.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notesInput.value }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) { showError(error.message); }
        finally { saveNotes.disabled = readOnly; }
      });
      const moveForm = document.createElement('form');
      moveForm.className = 'task-move';
      const destinationLabel = document.createElement('label');
      destinationLabel.htmlFor = `destination-project-${task.id}`;
      destinationLabel.textContent = 'Destination project';
      const destination = document.createElement('select');
      destination.id = destinationLabel.htmlFor;
      for (const project of destinations) {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        destination.append(option);
      }
      const move = document.createElement('button');
      move.type = 'submit';
      move.textContent = 'Move task';
      const moveDisabled = readOnly || destinations.length === 0;
      destination.disabled = moveDisabled;
      move.disabled = moveDisabled;
      const moveControls = document.createElement('div');
      moveControls.className = 'form-controls';
      moveControls.append(destination, move);
      moveForm.append(destinationLabel, moveControls);
      moveForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (moveDisabled) return;
        move.disabled = true;
        destination.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_project_id: Number(destination.value) }),
          });
          tasks = tasks.filter(current => current.id !== task.id);
          drawTasks();
        } catch (error) { showError(error.message); }
        finally {
          move.disabled = moveDisabled;
          destination.disabled = moveDisabled;
        }
      });
      const deletion = document.createElement('button');
      deletion.type = 'button';
      deletion.textContent = task.deleted ? 'Restore task' : 'Delete task';
      deletion.disabled = Boolean(project.archived);
      deletion.addEventListener('click', async () => {
        if (project.archived) return;
        deletion.disabled = true;
        document.getElementById('error').hidden = true;
        try {
          const saved = await request(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted: !task.deleted }),
          });
          tasks = tasks.map(current => current.id === saved.id ? saved : current);
          drawTasks();
        } catch (error) { showError(error.message); }
        finally { deletion.disabled = Boolean(project.archived); }
      });
      row.append(title, checkbox, priorityControl, rename, dueDateForm, notesForm, moveForm, deletion);
      return row;
    }));
    document.getElementById('empty').hidden = visible.length > 0;
  }
  filter.addEventListener('change', drawTasks);
  priorityFilter.addEventListener('change', drawTasks);
  document.getElementById('task-search-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('task-search');
    taskQuery = input.value.trim();
    input.value = taskQuery;
    drawTasks();
  });
  document.getElementById('due-range-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      dueRange = normalizeDueRange(dueFrom.value, dueThrough.value);
      dueFrom.value = dueRange.from;
      dueThrough.value = dueRange.through;
      document.getElementById('error').hidden = true;
      drawTasks();
    } catch (error) { showError(error.message); }
  });
  drawTasks();
  document.getElementById('task-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const input = document.getElementById('task-title');
    const title = input.value.trim();
    if (!title) { showError('Task title is required'); input.focus(); return; }
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      tasks.push(await request(`/api/projects/${projectId}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    await renderProject(match[1]);
    return;
  }
  let projects = await request('/api/projects');
  app.innerHTML = `
    <h1>Workboard</h1>
    <form id="project-form">
      <label for="project-name">Project name</label>
      <div class="form-controls">
        <input id="project-name" name="name" type="text" autocomplete="off">
        <button type="submit">Create project</button>
      </div>
    </form>
    <form id="import-form">
      <label for="project-json">Project JSON</label>
      <textarea id="project-json" rows="8"></textarea>
      <label for="imported-project-name">Imported project name</label>
      <div class="form-controls">
        <input id="imported-project-name" type="text" autocomplete="off">
        <button type="submit">Import project</button>
      </div>
    </form>
    <p id="error" role="alert" hidden></p>
    <h2>Projects</h2>
    <form id="project-search-form">
      <label for="project-search">Project search</label>
      <div class="form-controls">
        <input id="project-search" type="text" autocomplete="off">
        <button type="submit">Search projects</button>
      </div>
    </form>
    <label for="project-filter">Project filter</label>
    <select id="project-filter">
      <option value="active">Active</option>
      <option value="archived">Archived</option>
    </select>
    <p id="empty">No projects to show.</p>
    <ul id="projects"></ul>`;
  const list = document.getElementById('projects');
  const empty = document.getElementById('empty');
  const filter = document.getElementById('project-filter');
  let projectQuery = '';
  function drawProjects() {
    const visible = filterProjects(projects, filter.value, projectQuery);
    list.replaceChildren(...visible.map(project => projectRow(project, saved => {
      projects = projects.map(current => current.id === saved.id ? saved : current);
      drawProjects();
    })));
    empty.hidden = visible.length > 0;
  }
  filter.addEventListener('change', drawProjects);
  document.getElementById('project-search-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('project-search');
    projectQuery = input.value.trim();
    input.value = projectQuery;
    drawProjects();
  });
  drawProjects();
  document.getElementById('import-form').addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('imported-project-name').value.trim();
    if (!name) { showError('Project name is required'); return; }
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const project = await request('/api/projects/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, document: document.getElementById('project-json').value }),
      });
      location.assign(`/projects/${project.id}`);
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
  document.getElementById('project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('project-name');
    const name = input.value.trim();
    if (!name) { showError('Project name is required'); input.focus(); return; }
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    document.getElementById('error').hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      input.focus();
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
}

try { await render(); }
catch (error) {
  app.innerHTML = '<h1>Workboard</h1><button type="button" id="back">Projects</button>';
  document.getElementById('back').addEventListener('click', () => location.assign('/'));
  showError(error.message);
}
finally { app.setAttribute('aria-busy', 'false'); }
