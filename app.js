const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Something went wrong');
  return value;
}

function isValidCalendarDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

async function showProjects() {
  app.replaceChildren();
  app.append(element('h1', {}, 'Workboard'));

  const form = element('form', { class: 'project-form' });
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { class: 'alert', role: 'alert', hidden: '' });
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      alert.hidden = true;
      await renderProjects(filter.value, list, renderState);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  const filterLabel = element('label', { for: 'project-filter' }, 'Project filter');
  const filter = element('select', { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', { value }, value));
  const list = element('div', { id: 'project-list', class: 'project-list' });
  const renderState = { version: 0 };
  filter.addEventListener('change', () => renderProjects(filter.value, list, renderState));
  app.append(form, alert, filterLabel, filter, list);
  await renderProjects(filter.value, list, renderState);
}

async function renderProjects(filter, list, renderState) {
  const version = ++renderState.version;
  const projects = await request('/api/projects');
  if (version !== renderState.version) return;
  list.replaceChildren();
  for (const project of projects.filter((item) => item.archived === (filter === 'Archived'))) {
    const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
    row.append(element('span', {}, project.name));
    row.append(element('span', { 'data-testid': 'project-summary' }, `${project.completedCount}/${project.totalCount} completed`));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(open);
    const archive = element('button', { type: 'button' }, project.archived ? 'Restore project' : 'Archive project');
    archive.addEventListener('click', async () => {
      await request(`/api/projects/${project.id}/archive`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      row.remove();
    });
    row.append(archive);
    list.append(row);
  }
}

async function showProject(id) {
  app.replaceChildren();
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const heading = element('h1', {}, project.name);
    app.append(heading);
    if (project.archived) app.append(element('p', { class: 'archived-notice' }, 'Archived project'));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const renameForm = element('form', { class: 'rename-form' });
    const renameLabel = element('label', { for: 'new-project-name' }, 'New project name');
    const renameInput = element('input', { id: 'new-project-name', name: 'name', type: 'text' });
    const renameButton = element('button', { type: 'submit' }, 'Rename project');
    const renameAlert = element('p', { class: 'alert', role: 'alert', hidden: '' });
    if (project.archived) {
      renameInput.disabled = true;
      renameButton.disabled = true;
    }
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        renameAlert.textContent = 'Project name is required';
        renameAlert.hidden = false;
        return;
      }
      try {
        const renamed = await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
        });
        heading.textContent = renamed.name;
        renameInput.value = '';
        renameAlert.hidden = true;
      } catch (error) {
        renameAlert.textContent = error.message;
        renameAlert.hidden = false;
      }
    });
    app.append(renameForm, renameAlert);
    let savedDefaultPriority = project.defaultPriority;
    const defaultPriorityLabel = element('label', { for: 'default-task-priority' }, 'Default task priority');
    const defaultPriority = element('select', { id: 'default-task-priority' });
    for (const value of ['Low', 'Normal', 'High']) {
      const option = element('option', { value }, value);
      option.selected = project.defaultPriority === value;
      defaultPriority.append(option);
    }
    defaultPriority.disabled = project.archived;
    defaultPriority.addEventListener('change', async () => {
      const selectedPriority = defaultPriority.value;
      try {
        await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ defaultPriority: selectedPriority }),
        });
        savedDefaultPriority = selectedPriority;
      } catch (error) {
        console.error(error);
        defaultPriority.value = savedDefaultPriority;
      }
    });
    app.append(defaultPriorityLabel, defaultPriority);
    const form = element('form', { class: 'task-form' });
    const label = element('label', { for: 'task-title' }, 'Task title');
    const input = element('input', { id: 'task-title', name: 'title', type: 'text' });
    const submit = element('button', { type: 'submit' }, 'Create task');
    if (project.archived) {
      input.disabled = true;
      submit.disabled = true;
    }
    const alert = element('p', { class: 'alert', role: 'alert', hidden: '' });
    form.append(label, input, submit);
    const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
    const filter = element('select', { id: 'task-filter' });
    filter.setAttribute('aria-label', 'Task filter');
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', { value }, value));
    const priorityFilterLabel = element('label', { for: 'priority-filter' }, 'Priority filter');
    const priorityFilter = element('select', { id: 'priority-filter' });
    priorityFilter.setAttribute('aria-label', 'Priority filter');
    for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', { value }, value));
    const dueRangeForm = element('form', { class: 'due-range-form' });
    const dueFromLabel = element('label', { for: 'due-from' }, 'Due from');
    const dueFrom = element('input', { id: 'due-from', type: 'text', placeholder: 'YYYY-MM-DD' });
    const dueThroughLabel = element('label', { for: 'due-through' }, 'Due through');
    const dueThrough = element('input', { id: 'due-through', type: 'text', placeholder: 'YYYY-MM-DD' });
    const applyDueRange = element('button', { type: 'submit' }, 'Apply due range');
    const dueRangeAlert = element('p', { class: 'alert', role: 'alert', hidden: '' });
    dueRangeForm.append(dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange);
    const appliedDueRange = { from: '', through: '' };
    const list = element('div', { class: 'task-list' });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        alert.textContent = 'Task title is required';
        alert.hidden = false;
        return;
      }
      try {
        await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
        });
        input.value = '';
        alert.hidden = true;
        await renderTasks(id, filter.value, priorityFilter.value, appliedDueRange, list);
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    filter.addEventListener('change', () => renderTasks(id, filter.value, priorityFilter.value, appliedDueRange, list));
    priorityFilter.addEventListener('change', () => renderTasks(id, filter.value, priorityFilter.value, appliedDueRange, list));
    dueRangeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const from = dueFrom.value.trim();
      const through = dueThrough.value.trim();
      if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
        dueRangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
        dueRangeAlert.hidden = false;
        return;
      }
      if (from && through && from > through) {
        dueRangeAlert.textContent = 'Due from must not be after Due through';
        dueRangeAlert.hidden = false;
        return;
      }
      appliedDueRange.from = from;
      appliedDueRange.through = through;
      dueRangeAlert.hidden = true;
      await renderTasks(id, filter.value, priorityFilter.value, appliedDueRange, list);
    });
    app.append(form, alert, filterLabel, filter, priorityFilterLabel, priorityFilter,
      dueRangeForm, dueRangeAlert, list);
    await renderTasks(id, filter.value, priorityFilter.value, appliedDueRange, list);
  } catch {
    app.append(element('h1', {}, 'Project not found'));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

async function renderTasks(projectId, taskFilter, priorityFilter, dueRange, list) {
  const project = await request(`/api/projects/${encodeURIComponent(projectId)}`);
  const tasks = await request(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
  list.replaceChildren();
  for (const task of tasks) {
    if (taskFilter === 'Open' && task.completed || taskFilter === 'Completed' && !task.completed) continue;
    if (priorityFilter !== 'All' && task.priority !== priorityFilter) continue;
    if ((dueRange.from || dueRange.through) && !task.dueDate) continue;
    if (dueRange.from && task.dueDate < dueRange.from) continue;
    if (dueRange.through && task.dueDate > dueRange.through) continue;
    const row = element('div', { 'data-testid': 'task-row', class: 'task-row' });
    row.append(element('span', {}, task.title));
    const checkboxId = `task-${task.id}`;
    const checkbox = element('input', { id: checkboxId, type: 'checkbox' });
    checkbox.checked = task.completed;
    checkbox.disabled = project.archived;
    const label = element('label', { for: checkboxId }, `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }),
        });
        await renderTasks(projectId, taskFilter, priorityFilter, dueRange, list);
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        console.error(error);
      }
    });
    row.append(checkbox, label);
    const priorityId = `task-priority-${task.id}`;
    const priorityLabel = element('label', { for: priorityId }, 'Task priority');
    const priority = element('select', { id: priorityId });
    for (const value of ['Low', 'Normal', 'High']) {
      const option = element('option', { value }, value);
      option.selected = task.priority === value;
      priority.append(option);
    }
    priority.disabled = project.archived;
    priority.addEventListener('change', async () => {
      const selectedPriority = priority.value;
      try {
        await request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: selectedPriority }),
        });
        await renderTasks(projectId, taskFilter, priorityFilter, dueRange, list);
      } catch (error) {
        console.error(error);
        priority.value = task.priority;
      }
    });
    row.append(priorityLabel, priority);
    const renameForm = element('form', { class: 'task-rename-form' });
    const renameInputId = `new-task-title-${task.id}`;
    const renameLabel = element('label', { for: renameInputId }, 'New task title');
    const renameInput = element('input', { id: renameInputId, type: 'text', value: task.title });
    const renameButton = element('button', { type: 'submit' }, 'Rename task');
    const renameAlert = element('p', { class: 'alert', role: 'alert', hidden: '' });
    renameInput.disabled = project.archived;
    renameButton.disabled = project.archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = renameInput.value.trim();
      if (!title) {
        renameAlert.textContent = 'Task title is required';
        renameAlert.hidden = false;
        return;
      }
      try {
        await request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
        });
        await renderTasks(projectId, taskFilter, priorityFilter, dueRange, list);
      } catch (error) {
        renameAlert.textContent = error.message;
        renameAlert.hidden = false;
      }
    });
    row.append(renameForm, renameAlert);

    const dueDateForm = element('form', { class: 'task-due-date-form' });
    const dueDateInputId = `task-due-date-${task.id}`;
    const dueDateLabel = element('label', { for: dueDateInputId }, 'Task due date');
    const dueDateInput = element('input', {
      id: dueDateInputId, type: 'text', value: task.dueDate ?? '',
      placeholder: 'YYYY-MM-DD',
    });
    const dueDateButton = element('button', { type: 'submit' }, 'Save due date');
    const dueDateAlert = element('p', { class: 'alert', role: 'alert', hidden: '' });
    dueDateInput.disabled = project.archived;
    dueDateButton.disabled = project.archived;
    dueDateForm.append(dueDateLabel, dueDateInput, dueDateButton);
    dueDateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const enteredDate = dueDateInput.value.trim();
      try {
        await request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dueDate: enteredDate || null }),
        });
        await renderTasks(projectId, taskFilter, priorityFilter, dueRange, list);
      } catch (error) {
        dueDateAlert.textContent = error.message;
        dueDateAlert.hidden = false;
      }
    });
    row.append(dueDateForm, dueDateAlert);
    list.append(row);
  }
}

const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
