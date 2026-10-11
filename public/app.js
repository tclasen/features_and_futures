const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.testId) node.dataset.testid = options.testId;
  return node;
}

function matchesSearch(value, query) {
  const asciiLower = (text) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const normalizeWhitespace = (text) => text.replace(/[ \t]+/g, ' ');
  return asciiLower(normalizeWhitespace(value)).includes(
    asciiLower(normalizeWhitespace(query.trim())),
  );
}

async function loadProjects(filter = 'Active') {
  const response = await fetch(`/api/projects?filter=${filter}`);
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function showProject(projectId) {
  const [activeProjects, archivedProjects] = await Promise.all([
    loadProjects('Active'), loadProjects('Archived'),
  ]);
  const project = [...activeProjects, ...archivedProjects].find((item) => String(item.id) === projectId);
  if (!project) {
    history.replaceState(null, '', '/');
    await render();
    return;
  }

  app.replaceChildren();
  const back = element('button', { text: 'Projects', className: 'back-button' });
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  const heading = element('h1', { text: project.name });
  app.append(back, heading);
  const download = element('button', { text: 'Download project', className: 'secondary-button' });
  download.type = 'button';
  download.addEventListener('click', async () => {
    download.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/export`);
      if (!response.ok) throw new Error('Could not download project');
      const file = new Blob([await response.text()], { type: 'application/json;charset=utf-8' });
      const objectUrl = URL.createObjectURL(file);
      const link = element('a');
      link.href = objectUrl;
      link.download = 'workboard-project.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      alert.hidden = true;
    } catch {
      alert.textContent = 'Could not download project';
      alert.hidden = false;
    } finally {
      download.disabled = false;
    }
  });
  app.append(download);
  if (project.archived) app.append(element('p', { text: 'Archived project', className: 'archive-notice' }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const renameForm = element('form');
  const renameLabel = element('label', { text: 'New project name' });
  const renameInput = element('input');
  renameInput.type = 'text';
  renameInput.name = 'newProjectName';
  renameInput.disabled = project.archived;
  renameLabel.append(renameInput);
  const renameButton = element('button', { text: 'Rename project' });
  renameButton.type = 'submit';
  renameButton.disabled = project.archived;
  renameForm.append(renameLabel, renameButton);
  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      renameInput.focus();
      return;
    }
    renameButton.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/rename`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('Could not rename project');
      heading.textContent = name;
      renameInput.value = '';
      alert.hidden = true;
    } catch {
      alert.textContent = 'Could not rename project';
      alert.hidden = false;
    } finally {
      renameButton.disabled = project.archived;
    }
  });
  app.append(renameForm);

  const defaultPriorityLabel = element('label', { text: 'Default task priority', className: 'filter-label' });
  const defaultPriority = element('select');
  defaultPriority.setAttribute('aria-label', 'Default task priority');
  defaultPriority.disabled = project.archived;
  for (const value of ['Low', 'Normal', 'High']) {
    const option = element('option', { text: value });
    option.value = value;
    option.selected = value === project.defaultTaskPriority;
    defaultPriority.append(option);
  }
  defaultPriority.addEventListener('change', async () => {
    const previousPriority = project.defaultTaskPriority;
    defaultPriority.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/default-priority`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: defaultPriority.value }),
      });
      if (!response.ok) throw new Error('Could not update default task priority');
      project.defaultTaskPriority = defaultPriority.value;
      alert.hidden = true;
    } catch {
      defaultPriority.value = previousPriority;
      alert.textContent = 'Could not update default task priority';
      alert.hidden = false;
    } finally {
      defaultPriority.disabled = project.archived;
    }
  });
  defaultPriorityLabel.append(defaultPriority);
  app.append(defaultPriorityLabel);

  const form = element('form');
  const label = element('label', { text: 'Task title' });
  const input = element('input');
  input.type = 'text';
  input.name = 'taskTitle';
  label.append(input);
  const create = element('button', { text: 'Create task' });
  create.type = 'submit';
  create.disabled = project.archived;
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error('Could not create task');
      await loadTasks();
      input.value = '';
      alert.hidden = true;
    } catch {
      alert.textContent = 'Could not create task';
      alert.hidden = false;
    }
  });
  app.append(form);

  const filterLabel = element('label', { text: 'Task filter', className: 'filter-label' });
  const filter = element('select');
  filter.setAttribute('aria-label', 'Task filter');
  for (const value of ['All', 'Open', 'Completed', 'Deleted']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);
  const priorityFilterLabel = element('label', { text: 'Priority filter', className: 'filter-label' });
  const priorityFilter = element('select');
  priorityFilter.setAttribute('aria-label', 'Priority filter');
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = element('option', { text: value });
    option.value = value;
    priorityFilter.append(option);
  }
  priorityFilterLabel.append(priorityFilter);
  app.append(priorityFilterLabel);
  let appliedDueRange = { from: '', through: '' };
  const dueRangeForm = element('form', { className: 'due-range-form' });
  const dueFromLabel = element('label', { text: 'Due from' });
  const dueFromInput = element('input');
  dueFromInput.type = 'text';
  dueFromLabel.append(dueFromInput);
  const dueThroughLabel = element('label', { text: 'Due through' });
  const dueThroughInput = element('input');
  dueThroughInput.type = 'text';
  dueThroughLabel.append(dueThroughInput);
  const applyDueRange = element('button', { text: 'Apply due range' });
  applyDueRange.type = 'submit';
  dueRangeForm.append(dueFromLabel, dueThroughLabel, applyDueRange);
  dueRangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const from = dueFromInput.value.trim();
    const through = dueThroughInput.value.trim();
    if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
      alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
      alert.hidden = false;
      return;
    }
    if (from && through && from > through) {
      alert.textContent = 'Due from must not be after Due through';
      alert.hidden = false;
      return;
    }
    appliedDueRange = { from, through };
    alert.hidden = true;
    loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; });
  });
  app.append(dueRangeForm);
  let appliedTaskSearch = '';
  const taskSearchForm = element('form', { className: 'search-form' });
  const taskSearchLabel = element('label', { text: 'Task search' });
  const taskSearchInput = element('input');
  taskSearchInput.type = 'text';
  taskSearchLabel.append(taskSearchInput);
  const taskSearchButton = element('button', { text: 'Search tasks' });
  taskSearchButton.type = 'submit';
  taskSearchForm.append(taskSearchLabel, taskSearchButton);
  taskSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedTaskSearch = taskSearchInput.value.trim();
    alert.hidden = true;
    loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; });
  });
  app.append(taskSearchForm);
  const taskList = element('section', { className: 'task-list', testId: 'task-list' });
  app.append(taskList);

  async function loadTasks() {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    if (!response.ok) throw new Error('Could not load tasks');
    const tasks = await response.json();
    taskList.replaceChildren();
    const visibleTasks = tasks.filter((task) => filter.value === 'Deleted'
      ? task.deleted
      : !task.deleted && (filter.value === 'All'
        || (filter.value === 'Open' && !task.completed)
        || (filter.value === 'Completed' && task.completed))).filter((task) =>
      priorityFilter.value === 'All' || task.priority === priorityFilter.value).filter((task) => {
      if (!appliedDueRange.from && !appliedDueRange.through) return true;
      if (!task.dueDate) return false;
      return (!appliedDueRange.from || task.dueDate >= appliedDueRange.from)
        && (!appliedDueRange.through || task.dueDate <= appliedDueRange.through);
    }).filter((task) => matchesSearch(task.title, appliedTaskSearch));
    for (const task of visibleTasks) {
      const isDeleted = task.deleted;
      const row = element('div', { className: 'task-row', testId: 'task-row' });
      const checkboxLabel = element('label', { className: 'task-checkbox' });
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived || isDeleted;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const update = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          if (!update.ok) throw new Error('Could not update task');
          await loadTasks();
        } catch {
          checkbox.checked = task.completed;
          checkbox.disabled = false;
          alert.textContent = 'Could not update task';
          alert.hidden = false;
        }
      });
      checkboxLabel.append(checkbox, element('span', { text: task.title }));
      row.append(checkboxLabel);
      const renameForm = element('form', { className: 'task-rename-form' });
      const renameLabel = element('label', { text: 'New task title' });
      const renameInput = element('input');
      renameInput.type = 'text';
      renameInput.name = `newTaskTitle-${task.id}`;
      renameInput.disabled = project.archived || isDeleted;
      renameLabel.append(renameInput);
      const renameButton = element('button', { text: 'Rename task', className: 'secondary-button' });
      renameButton.type = 'submit';
      renameButton.disabled = project.archived || isDeleted;
      renameForm.append(renameLabel, renameButton);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = renameInput.value.trim();
        if (!title) {
          alert.textContent = 'Task title is required';
          alert.hidden = false;
          renameInput.focus();
          return;
        }
        renameButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/rename`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title }),
          });
          if (!response.ok) throw new Error('Could not rename task');
          await loadTasks();
          alert.hidden = true;
        } catch {
          alert.textContent = 'Could not rename task';
          alert.hidden = false;
          renameButton.disabled = project.archived || isDeleted;
        }
      });
      row.append(renameForm);
      const priorityLabel = element('label', { text: 'Task priority', className: 'priority-label' });
      const priority = element('select');
      priority.setAttribute('aria-label', 'Task priority');
      priority.disabled = project.archived || isDeleted;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', { text: value });
        option.value = value;
        option.selected = value === task.priority;
        priority.append(option);
      }
      priority.addEventListener('change', async () => {
        const previousPriority = task.priority;
        priority.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          if (!response.ok) throw new Error('Could not update task priority');
          task.priority = priority.value;
          alert.hidden = true;
          await loadTasks();
        } catch {
          priority.value = previousPriority;
          alert.textContent = 'Could not update task priority';
          alert.hidden = false;
        } finally {
          priority.disabled = project.archived || isDeleted;
        }
      });
      priorityLabel.append(priority);
      row.append(priorityLabel);
      const dueDateForm = element('form', { className: 'due-date-form' });
      const dueDateLabel = element('label', { text: 'Task due date', className: 'due-date-label' });
      const dueDateInput = element('input');
      dueDateInput.type = 'text';
      dueDateInput.name = `dueDate-${task.id}`;
      dueDateInput.value = task.dueDate ?? '';
      dueDateInput.disabled = project.archived || isDeleted;
      dueDateLabel.append(dueDateInput);
      const saveDueDate = element('button', { text: 'Save due date', className: 'secondary-button' });
      saveDueDate.type = 'submit';
      saveDueDate.disabled = project.archived || isDeleted;
      dueDateForm.append(dueDateLabel, saveDueDate);
      dueDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const previousDueDate = task.dueDate ?? '';
        const dueDate = dueDateInput.value.trim();
        saveDueDate.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dueDate }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            if (result.error === 'Due date must be a valid YYYY-MM-DD date') {
              dueDateInput.value = previousDueDate;
              alert.textContent = result.error;
              alert.hidden = false;
              return;
            }
            throw new Error('Could not save due date');
          }
          task.dueDate = dueDate || null;
          dueDateInput.value = task.dueDate ?? '';
          alert.hidden = true;
          await loadTasks();
        } catch {
          dueDateInput.value = previousDueDate;
          alert.textContent = 'Could not save due date';
          alert.hidden = false;
        } finally {
          saveDueDate.disabled = project.archived || isDeleted;
        }
      });
      row.append(dueDateForm);
      const notesForm = element('form', { className: 'task-notes-form' });
      const notesLabel = element('label', { text: 'Task notes' });
      const notesInput = element('textarea');
      notesInput.name = `taskNotes-${task.id}`;
      notesInput.value = task.notes;
      notesInput.disabled = project.archived || isDeleted;
      notesLabel.append(notesInput);
      const saveNotes = element('button', { text: 'Save notes', className: 'secondary-button' });
      saveNotes.type = 'submit';
      saveNotes.disabled = project.archived || isDeleted;
      notesForm.append(notesLabel, saveNotes);
      notesForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const notes = notesInput.value;
        saveNotes.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ notes }),
          });
          if (!response.ok) throw new Error('Could not save notes');
          task.notes = notes;
          alert.hidden = true;
          await loadTasks();
        } catch {
          alert.textContent = 'Could not save notes';
          alert.hidden = false;
          saveNotes.disabled = project.archived || isDeleted;
        }
      });
      row.append(notesForm);
      const destinations = activeProjects.filter((candidate) => String(candidate.id) !== projectId);
      const moveForm = element('form', { className: 'task-move-form' });
      const destinationLabel = element('label', { text: 'Destination project' });
      const destinationSelect = element('select');
      destinationSelect.setAttribute('aria-label', 'Destination project');
      for (const destination of destinations) {
        const option = element('option', { text: destination.name });
        option.value = String(destination.id);
        destinationSelect.append(option);
      }
      destinationSelect.disabled = project.archived || isDeleted || destinations.length === 0;
      destinationLabel.append(destinationSelect);
      const moveButton = element('button', { text: 'Move task', className: 'secondary-button' });
      moveButton.type = 'submit';
      moveButton.disabled = project.archived || isDeleted || destinations.length === 0;
      moveForm.append(destinationLabel, moveButton);
      moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!destinationSelect.value) return;
        moveButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/move`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: Number(destinationSelect.value) }),
          });
          if (!response.ok) throw new Error('Could not move task');
          alert.hidden = true;
          await loadTasks();
        } catch {
          alert.textContent = 'Could not move task';
          alert.hidden = false;
          moveButton.disabled = project.archived || isDeleted || destinations.length === 0;
        }
      });
      row.append(moveForm);
      const stateButton = element('button', {
        text: isDeleted ? 'Restore task' : 'Delete task',
        className: 'secondary-button',
      });
      stateButton.type = 'button';
      stateButton.disabled = project.archived;
      stateButton.addEventListener('click', async () => {
        stateButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ deleted: !isDeleted }),
          });
          if (!response.ok) throw new Error('Could not update task');
          alert.hidden = true;
          await loadTasks();
        } catch {
          alert.textContent = 'Could not update task';
          alert.hidden = false;
          stateButton.disabled = project.archived;
        }
      });
      row.append(stateButton);
      taskList.append(row);
    }
  }
  filter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  priorityFilter.addEventListener('change', () => { loadTasks().catch(() => { alert.textContent = 'Could not load tasks'; alert.hidden = false; }); });
  await loadTasks();
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));

  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  const filterLabel = element('label', { text: 'Project filter', className: 'filter-label' });
  const filter = element('select');
  filter.setAttribute('aria-label', 'Project filter');
  for (const value of ['Active', 'Archived']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  app.append(filterLabel);
  let appliedProjectSearch = '';
  const searchForm = element('form', { className: 'search-form' });
  const searchLabel = element('label', { text: 'Project search' });
  const searchInput = element('input');
  searchInput.type = 'text';
  searchLabel.append(searchInput);
  const searchButton = element('button', { text: 'Search projects' });
  searchButton.type = 'submit';
  searchForm.append(searchLabel, searchButton);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedProjectSearch = searchInput.value.trim();
    alert.hidden = true;
    renderProjects().catch(() => { alert.textContent = 'Could not load projects'; alert.hidden = false; });
  });
  app.append(searchForm);
  const projectList = element('section', { className: 'project-list' });
  app.append(projectList);
  let projectRenderVersion = 0;

  const form = element('form');
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text';
  input.name = 'projectName';
  label.append(input);
  const create = element('button', { text: 'Create project' });
  create.type = 'submit';
  form.append(label, create);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Could not create project';
      alert.hidden = false;
      return;
    }
    input.value = '';
    alert.hidden = true;
    await renderProjects();
  });
  app.append(form);

  const importForm = element('form', { className: 'project-import-form' });
  const jsonLabel = element('label', { text: 'Project JSON' });
  const jsonInput = element('textarea');
  jsonInput.name = 'projectJson';
  jsonLabel.append(jsonInput);
  const importedNameLabel = element('label', { text: 'Imported project name' });
  const importedNameInput = element('input');
  importedNameInput.type = 'text';
  importedNameInput.name = 'importedProjectName';
  importedNameLabel.append(importedNameInput);
  const importButton = element('button', { text: 'Import project' });
  importButton.type = 'submit';
  importForm.append(jsonLabel, importedNameLabel, importButton);
  importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = importedNameInput.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      importedNameInput.focus();
      return;
    }
    let document;
    try {
      document = JSON.parse(jsonInput.value);
    } catch {
      alert.textContent = 'Invalid project JSON';
      alert.hidden = false;
      return;
    }
    importButton.disabled = true;
    try {
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, document }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert.textContent = result.error === 'Project name is required'
          ? result.error : 'Invalid project JSON';
        alert.hidden = false;
        return;
      }
      location.href = `/projects/${result.id}`;
    } catch {
      alert.textContent = 'Invalid project JSON';
      alert.hidden = false;
    } finally {
      importButton.disabled = false;
    }
  });
  app.append(importForm);

  const directoryButton = element('button', { text: 'Task directory' });
  directoryButton.type = 'button';
  directoryButton.addEventListener('click', () => { location.href = '/directory'; });
  app.append(directoryButton);

  async function renderProjects() {
    const renderVersion = ++projectRenderVersion;
    const selectedFilter = filter.value;
    const projects = await loadProjects(selectedFilter);
    if (renderVersion !== projectRenderVersion) return;
    projectList.replaceChildren();
    const rows = document.createDocumentFragment();
    for (const project of projects.filter((item) => matchesSearch(item.name, appliedProjectSearch))) {
      const row = element('div', { className: 'project-row', testId: 'project-row' });
      const details = element('div', { className: 'project-details' });
      details.append(element('span', { text: project.name, className: 'project-name' }));
      details.append(element('span', { text: `${project.completedCount}/${project.totalCount} completed`, testId: 'project-summary' }));
      const actions = element('div', { className: 'project-actions' });
      const open = element('button', { text: 'Open project' });
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      // The endpoint is already scoped to the selected state. Use that state
      // for the action label as well, so the Archived view always offers the
      // restoration action even if a client has stale project data.
      const isArchivedView = filter.value === 'Archived';
      const stateButton = element('button', { text: isArchivedView ? 'Restore project' : 'Archive project', className: 'secondary-button' });
      stateButton.type = 'button';
      stateButton.addEventListener('click', async () => {
        stateButton.disabled = true;
        try {
          const response = await fetch(`/api/projects/${project.id}/archive`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: !isArchivedView }),
          });
          if (!response.ok) throw new Error('Could not update project');
          project.archived = !isArchivedView;
          await renderProjects();
        } catch {
          stateButton.disabled = false;
          alert.textContent = 'Could not update project';
          alert.hidden = false;
        }
      });
      actions.append(open, stateButton);
      row.append(details, actions);
      rows.append(row);
    }
    projectList.append(rows);
  }
  filter.addEventListener('change', () => { renderProjects().catch(() => { alert.textContent = 'Could not load projects'; alert.hidden = false; }); });
  await renderProjects();
}

async function render() {
  if (location.pathname === '/directory') {
    await showDirectory();
    return;
  }
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
}

async function showDirectory() {
  app.replaceChildren();
  const back = element('button', { text: 'Projects', className: 'back-button' });
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', { text: 'Task directory' }));
  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);

  function selectControl(labelText, values, className = 'filter-label') {
    const label = element('label', { text: labelText, className });
    const select = element('select');
    select.setAttribute('aria-label', labelText);
    values.forEach((value) => {
      const option = element('option', { text: value });
      option.value = value;
      select.append(option);
    });
    label.append(select);
    app.append(label);
    return select;
  }
  const scope = selectControl('Project scope', ['Active', 'Archived']);
  const completion = selectControl('Task filter', ['All', 'Open', 'Completed', 'Deleted']);
  const priority = selectControl('Priority filter', ['All', 'Low', 'Normal', 'High']);
  const directoryOrder = selectControl('Directory order', ['Original', 'Priority', 'Due date', 'Title']);
  let appliedRange = { from: '', through: '' };
  const rangeForm = element('form', { className: 'due-range-form' });
  const fromLabel = element('label', { text: 'Due from' });
  const fromInput = element('input');
  fromInput.type = 'text';
  fromLabel.append(fromInput);
  const throughLabel = element('label', { text: 'Due through' });
  const throughInput = element('input');
  throughInput.type = 'text';
  throughLabel.append(throughInput);
  const rangeButton = element('button', { text: 'Apply due range' });
  rangeButton.type = 'submit';
  rangeForm.append(fromLabel, throughLabel, rangeButton);
  rangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const from = fromInput.value.trim();
    const through = throughInput.value.trim();
    if ((from && !isValidDate(from)) || (through && !isValidDate(through))) {
      alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
      alert.hidden = false;
      return;
    }
    if (from && through && from > through) {
      alert.textContent = 'Due from must not be after Due through';
      alert.hidden = false;
      return;
    }
    appliedRange = { from, through };
    alert.hidden = true;
    renderRows().catch(showLoadError);
  });
  app.append(rangeForm);
  let appliedSearch = '';
  const searchForm = element('form', { className: 'search-form' });
  const searchLabel = element('label', { text: 'Directory search' });
  const searchInput = element('input');
  searchInput.type = 'text';
  searchLabel.append(searchInput);
  const searchButton = element('button', { text: 'Search directory' });
  searchButton.type = 'submit';
  searchForm.append(searchLabel, searchButton);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    appliedSearch = searchInput.value.trim();
    alert.hidden = true;
    renderRows().catch(showLoadError);
  });
  app.append(searchForm);
  const bulkActions = element('div', { className: 'directory-bulk-actions' });
  const completeVisible = element('button', { text: 'Complete visible tasks' });
  completeVisible.type = 'button';
  const reopenVisible = element('button', { text: 'Reopen visible tasks', className: 'secondary-button' });
  reopenVisible.type = 'button';
  const deleteVisible = element('button', { text: 'Delete visible tasks', className: 'secondary-button' });
  deleteVisible.type = 'button';
  const restoreVisible = element('button', { text: 'Restore visible tasks', className: 'secondary-button' });
  restoreVisible.type = 'button';
  const visiblePriorityLabel = element('label', { text: 'Visible tasks priority', className: 'filter-label' });
  const visiblePriority = element('select');
  visiblePriority.setAttribute('aria-label', 'Visible tasks priority');
  for (const value of ['Low', 'Normal', 'High']) {
    const option = element('option', { text: value });
    option.value = value;
    option.selected = value === 'Normal';
    visiblePriority.append(option);
  }
  visiblePriorityLabel.append(visiblePriority);
  const setVisiblePriority = element('button', { text: 'Set visible priority', className: 'secondary-button' });
  setVisiblePriority.type = 'button';
  bulkActions.append(completeVisible, reopenVisible, deleteVisible, restoreVisible, visiblePriorityLabel, setVisiblePriority);
  app.append(bulkActions);
  const directorySummary = element('p', { testId: 'directory-summary' });
  directorySummary.hidden = true;
  app.append(directorySummary);
  const ownerList = element('section', { className: 'directory-owner-list' });
  app.append(ownerList);
  const results = element('section', { className: 'task-list' });
  app.append(results);
  const emptyResult = element('p', { text: 'No matching tasks', className: 'empty-result' });
  emptyResult.setAttribute('role', 'status');
  emptyResult.hidden = true;
  app.append(emptyResult);
  let visibleRows = [];
  let loading = false;
  let requestVersion = 0;
  function showLoadError() {
    alert.textContent = 'Could not load task directory';
    alert.hidden = false;
  }
  async function renderRows() {
    const currentRequest = ++requestVersion;
    loading = true;
    emptyResult.hidden = true;
    directorySummary.hidden = true;
    completeVisible.disabled = true;
    reopenVisible.disabled = true;
    deleteVisible.disabled = true;
    restoreVisible.disabled = true;
    setVisiblePriority.disabled = true;
    const response = await fetch('/api/directory');
    if (!response.ok) throw new Error('Could not load task directory');
    const tasks = await response.json();
    if (currentRequest !== requestVersion) return;
    loading = false;
    results.replaceChildren();
    let rows = tasks.filter((task) => task.archived === (scope.value === 'Archived'))
      .filter((task) => completion.value === 'Deleted' ? task.deleted : !task.deleted && (
        completion.value === 'All' || (completion.value === 'Open' && !task.completed)
          || (completion.value === 'Completed' && task.completed)))
      .filter((task) => priority.value === 'All' || task.priority === priority.value)
      .filter((task) => {
        if (!appliedRange.from && !appliedRange.through) return true;
        if (!task.dueDate) return false;
        return (!appliedRange.from || task.dueDate >= appliedRange.from)
          && (!appliedRange.through || task.dueDate <= appliedRange.through);
      })
      .filter((task) => matchesSearch(task.title, appliedSearch));
    const priorityRank = { High: 0, Normal: 1, Low: 2 };
    const asciiLower = (value) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    const compareCodePoints = (left, right) => {
      const leftPoints = Array.from(left, (character) => character.codePointAt(0));
      const rightPoints = Array.from(right, (character) => character.codePointAt(0));
      for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
        if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
      }
      return leftPoints.length - rightPoints.length;
    };
    if (directoryOrder.value !== 'Original') {
      const compare = directoryOrder.value === 'Priority'
        ? (left, right) => priorityRank[left.priority] - priorityRank[right.priority]
        : directoryOrder.value === 'Due date'
          ? (left, right) => {
            if (!left.dueDate) return right.dueDate ? 1 : 0;
            if (!right.dueDate) return -1;
            return left.dueDate < right.dueDate ? -1 : left.dueDate > right.dueDate ? 1 : 0;
          }
          : (left, right) => compareCodePoints(asciiLower(left.title), asciiLower(right.title));
      rows = rows.map((task, originalIndex) => ({ task, originalIndex }))
        .sort((left, right) => compare(left.task, right.task)
          || left.originalIndex - right.originalIndex)
        .map(({ task }) => task);
    }
    visibleRows = rows;
    const completedCount = rows.filter((task) => task.completed).length;
    directorySummary.textContent = `${completedCount}/${rows.length} completed`;
    directorySummary.hidden = false;
    ownerList.replaceChildren();
    const owners = new Map();
    for (const task of rows) {
      let owner = owners.get(task.projectId);
      if (!owner) {
        owner = { id: task.projectId, name: task.projectName, tasks: [] };
        owners.set(task.projectId, owner);
      }
      owner.tasks.push(task);
    }
    // Directory rows may be globally sorted, but owner summaries follow the
    // project creation order represented by the source task sequence.
    for (const owner of [...owners.values()].sort((left, right) => left.id - right.id)) {
      const ownerRow = element('div', { className: 'project-row', testId: 'directory-owner-row' });
      const ownerDetails = element('div', { className: 'project-details' });
      const ownerCompleted = owner.tasks.filter((task) => task.completed).length;
      ownerDetails.append(element('span', { text: owner.name, testId: 'directory-owner-name' }));
      ownerDetails.append(element('span', {
        text: `${ownerCompleted}/${owner.tasks.length} completed`,
        testId: 'directory-owner-summary',
      }));
      const openOwner = element('button', { text: 'Open project' });
      openOwner.type = 'button';
      openOwner.addEventListener('click', () => { location.href = `/projects/${owner.id}`; });
      ownerRow.append(ownerDetails, openOwner);
      ownerList.append(ownerRow);
    }
    const eligible = scope.value === 'Active' && completion.value !== 'Deleted'
      ? rows.filter((task) => !task.deleted && !task.archived)
      : [];
    completeVisible.disabled = loading || eligible.every((task) => task.completed);
    reopenVisible.disabled = loading || eligible.every((task) => !task.completed);
    const deletable = scope.value === 'Active' && completion.value !== 'Deleted'
      ? rows.filter((task) => !task.deleted && !task.archived)
      : [];
    const restorable = scope.value === 'Active' && completion.value === 'Deleted'
      ? rows.filter((task) => task.deleted && !task.archived)
      : [];
    deleteVisible.disabled = loading || deletable.length === 0;
    restoreVisible.disabled = loading || restorable.length === 0;
    setVisiblePriority.disabled = loading || deletable.length === 0;
    for (const task of rows) {
      const row = element('div', { className: 'task-row directory-task-row', testId: 'directory-task-row' });
      row.append(element('span', { text: task.title, testId: 'directory-task-title' }));
      row.append(element('span', { text: task.projectName, testId: 'directory-project-name' }));
      row.append(element('span', { text: task.completed ? 'Completed' : 'Open', testId: 'directory-task-completion' }));
      row.append(element('span', { text: task.priority, testId: 'directory-task-priority' }));
      row.append(element('span', { text: task.dueDate, testId: 'directory-task-due-date' }));
      row.append(element('span', { text: task.notes, testId: 'directory-task-notes' }));
      const open = element('button', { text: 'Open project' });
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${task.projectId}`; });
      row.append(open);
      results.append(row);
    }
    emptyResult.hidden = rows.length !== 0;
  }
  async function updateVisibleTasks(completed) {
    const taskIds = visibleRows.filter((task) => task.archived === false && task.deleted === false
      && task.completed !== completed).map((task) => task.taskId);
    if (!taskIds.length) return;
    completeVisible.disabled = true;
    reopenVisible.disabled = true;
    try {
      const response = await fetch('/api/directory/bulk-completion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed, taskIds }),
      });
      if (!response.ok) throw new Error('Could not update visible tasks');
      alert.hidden = true;
      await renderRows();
    } catch {
      showLoadError();
    }
  }
  async function updateVisibleDeletion(deleted) {
    const taskIds = visibleRows.filter((task) => task.archived === false
      && task.deleted === !deleted).map((task) => task.taskId);
    if (!taskIds.length) return;
    deleteVisible.disabled = true;
    restoreVisible.disabled = true;
    try {
      const response = await fetch('/api/directory/bulk-deletion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleted, taskIds }),
      });
      if (!response.ok) throw new Error('Could not update visible tasks');
      alert.hidden = true;
      await renderRows();
    } catch {
      showLoadError();
    }
  }
  async function updateVisiblePriority() {
    const taskIds = visibleRows.filter((task) => !task.archived && !task.deleted)
      .map((task) => task.taskId);
    if (!taskIds.length) return;
    setVisiblePriority.disabled = true;
    try {
      const response = await fetch('/api/directory/bulk-priority', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: visiblePriority.value, taskIds }),
      });
      if (!response.ok) throw new Error('Could not update visible task priorities');
      alert.hidden = true;
      await renderRows();
    } catch {
      showLoadError();
    }
  }
  completeVisible.addEventListener('click', () => updateVisibleTasks(true));
  reopenVisible.addEventListener('click', () => updateVisibleTasks(false));
  deleteVisible.addEventListener('click', () => updateVisibleDeletion(true));
  restoreVisible.addEventListener('click', () => updateVisibleDeletion(false));
  setVisiblePriority.addEventListener('click', updateVisiblePriority);
  for (const control of [scope, completion, priority, directoryOrder]) {
    control.addEventListener('change', () => renderRows().catch(showLoadError));
  }
  await renderRows();
}

render().catch(() => {
  app.replaceChildren(element('p', { text: 'Workboard could not be loaded.' }));
});
