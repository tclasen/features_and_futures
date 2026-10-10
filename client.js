const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.type) node.type = options.type;
  if (options.label) node.setAttribute('aria-label', options.label);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showError(message) {
  const alert = element('p', { className: 'alert', text: message });
  alert.setAttribute('role', 'alert');
  const previous = app.querySelector('[role="alert"]');
  previous?.remove();
  app.prepend(alert);
}

function asciiLower(value) {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function showProjects() {
  const heading = element('h1', { text: 'Workboard' });
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Project name' });
  label.htmlFor = 'project-name';
  const input = element('input', { type: 'text' });
  input.id = 'project-name';
  input.name = 'name';
  const submit = element('button', { type: 'submit', text: 'Create project' });
  form.append(label, input, submit);
  const filterLabel = element('label', { text: 'Project filter' });
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  const searchForm = element('form', { className: 'create-form' });
  const searchLabel = element('label', { text: 'Project search' });
  searchLabel.htmlFor = 'project-search';
  const searchInput = element('input', { type: 'text' });
  searchInput.id = 'project-search';
  const searchButton = element('button', { type: 'submit', text: 'Search projects' });
  searchForm.append(searchLabel, searchInput, searchButton);
  let appliedSearch = '';
  const list = element('div', { className: 'project-list' });
  const drawProjects = async () => {
    const archived = filter.value === 'Archived';
    const projects = await request(`/api/projects?archived=${archived}`);
    list.replaceChildren();
    const query = asciiLower(appliedSearch);
    for (const project of projects.filter(item => asciiLower(item.name).includes(query))) {
      const row = element('article', { className: 'project-row' });
      row.dataset.testid = 'project-row';
      const details = element('div', { className: 'project-details' });
      details.append(element('span', { text: project.name }));
      const summary = element('span', { className: 'project-summary', text: `${project.completedCount}/${project.totalCount} completed` });
      summary.dataset.testid = 'project-summary';
      details.append(summary);
      const actions = element('div', { className: 'project-actions' });
      const open = element('button', { type: 'button', text: 'Open project' });
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      actions.append(open);
      const archive = element('button', { type: 'button', text: archived ? 'Restore project' : 'Archive project' });
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${project.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !archived })
          });
          await drawProjects();
        } catch (error) { showError(error.message); }
      });
      actions.append(archive);
      row.append(details, actions);
      list.append(row);
    }
  };
  filter.addEventListener('change', drawProjects);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedSearch = searchInput.value.trim();
    drawProjects();
  });
  await drawProjects();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      render();
    } catch (error) {
      showError(error.message);
    }
  });
  app.replaceChildren(heading, form, filterLabel, filter, searchForm, list);
}

async function showProject(id) {
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const heading = element('h1', { text: project.name });
    const back = element('button', { type: 'button', text: 'Projects' });
    back.addEventListener('click', () => navigate('/'));
    const archived = Boolean(project.archived);
    const renameForm = element('form', { className: 'create-form' });
    const renameLabel = element('label', { text: 'New project name' });
    renameLabel.htmlFor = 'new-project-name';
    const renameInput = element('input', { type: 'text' });
    renameInput.id = 'new-project-name';
    renameInput.name = 'name';
    renameInput.disabled = archived;
    const renameButton = element('button', { type: 'submit', text: 'Rename project' });
    renameButton.disabled = archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        showError('Project name is required');
        renameInput.focus();
        return;
      }
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        heading.textContent = updated.name;
        renameInput.value = '';
      } catch (error) { showError(error.message); }
    });
    const defaultPriorityLabel = element('label', { text: 'Default task priority' });
    defaultPriorityLabel.htmlFor = 'default-task-priority';
    const defaultPriority = element('select');
    defaultPriority.id = 'default-task-priority';
    for (const value of ['Low', 'Normal', 'High']) {
      const option = element('option', { text: value });
      option.value = value;
      defaultPriority.append(option);
    }
    defaultPriority.value = project.defaultTaskPriority || 'Normal';
    defaultPriority.disabled = archived;
    defaultPriority.addEventListener('change', async () => {
      const previous = project.defaultTaskPriority || 'Normal';
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultTaskPriority: defaultPriority.value })
        });
        project.defaultTaskPriority = updated.defaultTaskPriority;
      } catch (error) {
        defaultPriority.value = previous;
        showError(error.message);
      }
    });
    const form = element('form', { className: 'create-form' });
    const label = element('label', { text: 'Task title' });
    label.htmlFor = 'task-title';
    const input = element('input', { type: 'text' });
    input.id = 'task-title';
    input.name = 'title';
    const submit = element('button', { type: 'submit', text: 'Create task' });
    if (archived) {
      const status = element('p', { text: 'Archived project' });
      status.className = 'archived-status';
      app.append(status);
      submit.disabled = true;
      input.disabled = true;
    }
    form.append(label, input, submit);

    const filterLabel = element('label', { text: 'Task filter' });
    filterLabel.htmlFor = 'task-filter';
    const filter = element('select');
    filter.id = 'task-filter';
    for (const value of ['All', 'Open', 'Completed']) {
      const option = element('option', { text: value });
      option.value = value;
      filter.append(option);
    }
    const priorityFilterLabel = element('label', { text: 'Priority filter' });
    priorityFilterLabel.htmlFor = 'priority-filter';
    const priorityFilter = element('select');
    priorityFilter.id = 'priority-filter';
    for (const value of ['All', 'Low', 'Normal', 'High']) {
      const option = element('option', { text: value });
      option.value = value;
      priorityFilter.append(option);
    }
    const dueRangeForm = element('form', { className: 'due-range-form' });
    const dueFromLabel = element('label', { text: 'Due from' });
    dueFromLabel.htmlFor = 'due-from';
    const dueFrom = element('input', { type: 'text' });
    dueFrom.id = 'due-from';
    const dueThroughLabel = element('label', { text: 'Due through' });
    dueThroughLabel.htmlFor = 'due-through';
    const dueThrough = element('input', { type: 'text' });
    dueThrough.id = 'due-through';
    const applyDueRange = element('button', { type: 'submit', text: 'Apply due range' });
    dueRangeForm.append(dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange);
    let appliedDueFrom = '';
    let appliedDueThrough = '';
    const taskSearchForm = element('form', { className: 'create-form' });
    const taskSearchLabel = element('label', { text: 'Task search' });
    taskSearchLabel.htmlFor = 'task-search';
    const taskSearchInput = element('input', { type: 'text' });
    taskSearchInput.id = 'task-search';
    const taskSearchButton = element('button', { type: 'submit', text: 'Search tasks' });
    taskSearchForm.append(taskSearchLabel, taskSearchInput, taskSearchButton);
    let appliedTaskSearch = '';
    taskSearchForm.addEventListener('submit', event => {
      event.preventDefault();
      appliedTaskSearch = taskSearchInput.value.trim();
      drawTasks();
    });
    const isValidCalendarDate = value => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return false;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (year < 1 || month < 1 || month > 12 || day < 1) return false;
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      return day <= [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    };
    dueRangeForm.addEventListener('submit', event => {
      event.preventDefault();
      const from = dueFrom.value.trim();
      const through = dueThrough.value.trim();
      if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
        showError('Due range must use valid YYYY-MM-DD dates');
        return;
      }
      if (from && through && from > through) {
        showError('Due from must not be after Due through');
        return;
      }
      appliedDueFrom = from;
      appliedDueThrough = through;
      dueFrom.value = from;
      dueThrough.value = through;
      drawTasks();
    });
    const list = element('div', { className: 'task-list' });
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    const activeProjects = archived ? [] : await request('/api/projects?archived=false');
    const drawTasks = () => {
      list.replaceChildren();
      for (const task of tasks) {
        const completed = Boolean(task.completed);
        if (filter.value === 'Open' && completed) continue;
        if (filter.value === 'Completed' && !completed) continue;
        if (priorityFilter.value !== 'All' && (task.priority || 'Normal') !== priorityFilter.value) continue;
        if (!asciiLower(task.title).includes(asciiLower(appliedTaskSearch))) continue;
        if ((appliedDueFrom || appliedDueThrough) && !task.dueDate) continue;
        if (appliedDueFrom && task.dueDate < appliedDueFrom) continue;
        if (appliedDueThrough && task.dueDate > appliedDueThrough) continue;
        const row = element('article', { className: 'task-row' });
        row.dataset.testid = 'task-row';
        row.append(element('span', { text: task.title }));
        const renameForm = element('form', { className: 'task-rename-form' });
        const renameInput = element('input', { type: 'text', label: 'New task title' });
        renameInput.disabled = archived;
        const renameButton = element('button', { type: 'submit', text: 'Rename task' });
        renameButton.disabled = archived;
        renameForm.append(renameInput, renameButton);
        renameForm.addEventListener('submit', async event => {
          event.preventDefault();
          const title = renameInput.value.trim();
          if (!title) {
            showError('Task title is required');
            renameInput.focus();
            return;
          }
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title })
            });
            task.title = updated.title;
            drawTasks();
          } catch (error) { showError(error.message); }
        });
        row.append(renameForm);
        const dueDateForm = element('form', { className: 'task-due-date-form' });
        const dueDateInput = element('input', { type: 'text', label: 'Task due date' });
        dueDateInput.value = task.dueDate || '';
        dueDateInput.disabled = archived;
        const saveDueDate = element('button', { type: 'submit', text: 'Save due date' });
        saveDueDate.disabled = archived;
        dueDateForm.append(dueDateInput, saveDueDate);
        dueDateForm.addEventListener('submit', async event => {
          event.preventDefault();
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dueDate: dueDateInput.value })
            });
            task.dueDate = updated.dueDate;
            dueDateInput.value = task.dueDate || '';
            drawTasks();
          } catch (error) {
            dueDateInput.value = task.dueDate || '';
            showError(error.message);
          }
        });
        row.append(dueDateForm);
        const priority = element('select', { label: 'Task priority' });
        for (const value of ['Low', 'Normal', 'High']) {
          const option = element('option', { text: value });
          option.value = value;
          priority.append(option);
        }
        priority.value = task.priority || 'Normal';
        priority.disabled = archived;
        priority.addEventListener('change', async () => {
          const previous = task.priority || 'Normal';
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ priority: priority.value })
            });
            task.priority = updated.priority;
            drawTasks();
          } catch (error) {
            priority.value = previous;
            showError(error.message);
          }
        });
        row.append(priority);
        const checkbox = element('input', { type: 'checkbox', label: `Complete ${task.title}` });
        checkbox.checked = completed;
        checkbox.disabled = archived;
        checkbox.addEventListener('change', async () => {
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked })
            });
            task.completed = updated.completed;
            drawTasks();
          } catch (error) {
            showError(error.message);
            checkbox.checked = !checkbox.checked;
          }
        });
        row.append(checkbox);
        const destinations = activeProjects.filter(candidate => Number(candidate.id) !== Number(id));
        const destination = element('select', { label: 'Destination project' });
        for (const candidate of destinations) {
          const option = element('option', { text: candidate.name });
          option.value = candidate.id;
          destination.append(option);
        }
        const moveButton = element('button', { type: 'button', text: 'Move task' });
        destination.disabled = archived || destinations.length === 0;
        moveButton.disabled = archived || destinations.length === 0;
        moveButton.addEventListener('click', async () => {
          try {
            await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}/move`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ destinationProjectId: Number(destination.value) })
            });
            const index = tasks.findIndex(item => item.id === task.id);
            if (index !== -1) tasks.splice(index, 1);
            drawTasks();
          } catch (error) { showError(error.message); }
        });
        row.append(destination, moveButton);
        list.append(row);
      }
    };
    filter.addEventListener('change', drawTasks);
    priorityFilter.addEventListener('change', drawTasks);
    drawTasks();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        showError('Task title is required');
        input.focus();
        return;
      }
      try {
        const task = await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        tasks.push(task);
        input.value = '';
        drawTasks();
      } catch (error) {
        showError(error.message);
      }
    });
    app.replaceChildren(heading, back, renameForm);
    if (archived) {
      const status = element('p', { text: 'Archived project' });
      status.className = 'archived-status';
      app.append(status);
    }
    app.append(form, defaultPriorityLabel, defaultPriority, filterLabel, filter, priorityFilterLabel, priorityFilter, dueRangeForm, taskSearchForm, list);
  } catch {
    app.replaceChildren(element('h1', { text: 'Project not found' }));
    const back = element('button', { type: 'button', text: 'Projects' });
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
  }
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  try {
    if (match) await showProject(match[1]);
    else await showProjects();
  } catch {
    showError('Unable to load projects');
  }
}

window.addEventListener('popstate', render);
render();
