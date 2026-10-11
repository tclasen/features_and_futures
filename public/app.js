const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
  alert.hidden = !message;
}

function validDueDate(value) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function projectRow(project, onUpdate) {
  const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const updated = await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, updated);
      showAlert('');
      onUpdate();
    } catch (error) { showAlert(error.message); archive.disabled = false; }
  });
  row.append(element('span', project.name),
    element('span', `${project.completed}/${project.total} completed`, { 'data-testid': 'project-summary' }),
    open, archive);
  return row;
}

async function renderTasks(project) {
  const endpoint = `/api/projects/${project.id}/tasks`;
  const form = element('form');
  const input = element('input', '', { id: 'task-title', type: 'text', autocomplete: 'off' });
  const submit = element('button', 'Create task', { type: 'submit' });
  submit.disabled = true;
  const controls = element('div', '', { class: 'controls' });
  controls.append(input, submit);
  form.append(element('label', 'Task title', { for: 'task-title' }), controls);
  const filter = element('select', '', { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  const priorityFilter = element('select', '', { id: 'priority-filter' });
  for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'filters' });
  filters.append(element('label', 'Task filter', { for: 'task-filter' }), filter,
    element('label', 'Priority filter', { for: 'priority-filter' }), priorityFilter);
  const rangeForm = element('form', '', { class: 'due-range-form' });
  const dueFrom = element('input', '', { id: 'due-from', type: 'text', autocomplete: 'off' });
  const dueThrough = element('input', '', { id: 'due-through', type: 'text', autocomplete: 'off' });
  rangeForm.append(element('label', 'Due from', { for: dueFrom.id }), dueFrom,
    element('label', 'Due through', { for: dueThrough.id }), dueThrough,
    element('button', 'Apply due range', { type: 'submit' }));
  const list = element('section', '', { 'aria-label': 'Tasks', class: 'tasks' });
  app.append(form, element('p', '', { role: 'alert', hidden: '' }), filters, rangeForm, list);
  let tasks = [];
  let appliedFrom = '';
  let appliedThrough = '';
  function drawTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
      if (appliedFrom || appliedThrough) {
        if (!task.due_date || (appliedFrom && task.due_date < appliedFrom) ||
          (appliedThrough && task.due_date > appliedThrough)) continue;
      }
      const row = element('div', '', { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', '', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = Boolean(project.archived);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const updated = await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, updated);
          showAlert('');
        } catch (error) { showAlert(error.message); }
        finally { drawTasks(); }
      });
      row.append(checkbox, element('span', task.title));
      const priorityControls = element('div');
      const priority = element('select', '', { id: `task-priority-${task.id}` });
      for (const value of ['Low', 'Normal', 'High']) {
        priority.append(element('option', value, { value }));
      }
      priority.value = task.priority;
      priority.disabled = Boolean(project.archived);
      priority.addEventListener('change', async () => {
        priority.disabled = true;
        try {
          Object.assign(task, await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          }));
          showAlert('');
        } catch (error) { showAlert(error.message); }
        finally { drawTasks(); }
      });
      priorityControls.append(element('label', 'Task priority', { for: priority.id }), priority);
      row.append(priorityControls);
      const renameForm = element('form', '', { class: 'task-rename-form' });
      const renameInput = element('input', '', { id: `new-task-title-${task.id}`, type: 'text', autocomplete: 'off' });
      const renameButton = element('button', 'Rename task', { type: 'submit' });
      renameInput.disabled = Boolean(project.archived);
      renameButton.disabled = Boolean(project.archived);
      const renameControls = element('div', '', { class: 'controls' });
      renameControls.append(renameInput, renameButton);
      renameForm.append(element('label', 'New task title', { for: renameInput.id }), renameControls);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (project.archived) return;
        const title = renameInput.value.trim();
        if (!title) return showAlert('Task title is required');
        renameButton.disabled = true;
        try {
          Object.assign(task, await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
          }));
          showAlert('');
          drawTasks();
          document.getElementById(`new-task-title-${task.id}`).focus();
        } catch (error) { showAlert(error.message); }
        finally { renameButton.disabled = Boolean(project.archived); }
      });
      row.append(renameForm);
      const dueForm = element('form', '', { class: 'task-due-form' });
      const dueInput = element('input', '', { id: `task-due-date-${task.id}`, type: 'text', autocomplete: 'off' });
      dueInput.value = task.due_date;
      const dueButton = element('button', 'Save due date', { type: 'submit' });
      dueInput.disabled = Boolean(project.archived);
      dueButton.disabled = Boolean(project.archived);
      const dueControls = element('div', '', { class: 'controls' });
      dueControls.append(dueInput, dueButton);
      dueForm.append(element('label', 'Task due date', { for: dueInput.id }), dueControls);
      dueForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (project.archived) return;
        dueButton.disabled = true;
        try {
          Object.assign(task, await request(`${endpoint}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ due_date: dueInput.value.trim() }),
          }));
          dueInput.value = task.due_date;
          showAlert('');
          drawTasks();
        } catch (error) { showAlert(error.message); }
        finally { dueButton.disabled = Boolean(project.archived); }
      });
      row.append(dueForm);
      list.append(row);
    }
  }
  filter.addEventListener('change', drawTasks);
  priorityFilter.addEventListener('change', drawTasks);
  rangeForm.addEventListener('submit', event => {
    event.preventDefault();
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    if ((from && !validDueDate(from)) || (through && !validDueDate(through))) {
      return showAlert('Due range must use valid YYYY-MM-DD dates');
    }
    if (from && through && from > through) {
      return showAlert('Due from must not be after Due through');
    }
    appliedFrom = from;
    appliedThrough = through;
    dueFrom.value = from;
    dueThrough.value = through;
    showAlert('');
    drawTasks();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const title = input.value.trim();
    if (!title) return showAlert('Task title is required');
    submit.disabled = true;
    try {
      tasks.push(await request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }));
      drawTasks();
      input.value = '';
      showAlert('');
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = Boolean(project.archived); }
  });
  tasks = await request(endpoint);
  drawTasks();
  submit.disabled = Boolean(project.archived);
}

function renderDefaultPriority(project) {
  const controls = element('div', '', { class: 'rename-form' });
  const select = element('select', '', { id: 'default-task-priority' });
  for (const value of ['Low', 'Normal', 'High']) select.append(element('option', value, { value }));
  select.value = project.default_priority;
  select.disabled = Boolean(project.archived);
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      Object.assign(project, await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_priority: select.value }),
      }));
      showAlert('');
    } catch (error) { showAlert(error.message); }
    finally {
      select.value = project.default_priority;
      select.disabled = Boolean(project.archived);
    }
  });
  controls.append(element('label', 'Default task priority', { for: select.id }), select);
  app.append(controls);
}

function renderRename(project, heading) {
  const form = element('form', '', { class: 'rename-form' });
  const input = element('input', '', { id: 'new-project-name', type: 'text', autocomplete: 'off' });
  const submit = element('button', 'Rename project', { type: 'submit' });
  input.disabled = Boolean(project.archived);
  submit.disabled = Boolean(project.archived);
  const controls = element('div', '', { class: 'controls' });
  controls.append(input, submit);
  form.append(element('label', 'New project name', { for: 'new-project-name' }), controls);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (project.archived) return;
    const name = input.value.trim();
    if (!name) return showAlert('Project name is required');
    submit.disabled = true;
    try {
      Object.assign(project, await request(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      }));
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = '';
      showAlert('');
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = Boolean(project.archived); }
  });
  app.append(form);
}

async function render() {
  app.replaceChildren();
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await request(`/api/projects/${match[1]}`);
    document.title = `${project.name} · Workboard`;
    const heading = element('h1', project.name);
    app.append(heading);
    if (project.archived) app.append(element('p', 'Archived project'));
    renderRename(project, heading);
    renderDefaultPriority(project);
    await renderTasks(project);
    return;
  }
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const submit = element('button', 'Create project', { type: 'submit' });
  submit.disabled = true;
  const controls = element('div', '', { class: 'controls' });
  controls.append(input, submit);
  form.append(label, controls);
  const list = element('section', '', { 'aria-label': 'Projects', class: 'projects' });
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const filter = element('select', '', { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const filters = element('div', '', { class: 'filters' });
  filters.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  app.append(form, alert, filters, list);
  let projects = [];
  function drawProjects() {
    list.replaceChildren();
    for (const project of projects) {
      if (Boolean(project.archived) === (filter.value === 'Archived')) {
        list.append(projectRow(project, drawProjects));
      }
    }
  }
  filter.addEventListener('change', drawProjects);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showAlert('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      projects.push(project);
      drawProjects();
      input.value = '';
      showAlert('');
      input.focus();
    } catch (error) { showAlert(error.message); }
    finally { submit.disabled = false; }
  });
  projects = await request('/api/projects');
  drawProjects();
  submit.disabled = false;
}

render().catch(error => showAlert(error.message)).finally(() => app.setAttribute('aria-busy', 'false'));
