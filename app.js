const root = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function getTasks(projectId) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) throw new Error('Could not load tasks');
  return response.json();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showList() {
  root.replaceChildren();
  root.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);
  const error = element('p', undefined, 'alert');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Project name is required';
      error.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (response.ok) {
      input.value = '';
      await showList();
    }
  });
  root.append(form, error);
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  root.append(filterLabel, filter);
  const list = element('section', undefined, 'projects');
  list.setAttribute('aria-label', 'Projects');
  root.append(list);
  async function renderProjects() {
   try {
    const projects = await getProjects();
    list.replaceChildren();
    for (const project of projects) {
      if ((filter.value === 'Archived') !== project.archived) continue;
      const row = element('div', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name));
      const summary = element('span', `${project.completedCount}/${project.totalCount} completed`);
      summary.dataset.testid = 'project-summary';
      row.append(summary);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        const response = await fetch(`/api/projects/${project.id}/archive`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        if (response.ok) await renderProjects();
      });
      row.append(archive);
      list.append(row);
    }
   } catch {
    const message = element('p', 'Could not load projects');
    message.setAttribute('role', 'alert');
    list.replaceChildren(message);
   }
  }
  filter.addEventListener('change', renderProjects);
  await renderProjects();
}

async function showProject(id) {
  root.replaceChildren();
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  root.append(back);
  try {
    const projects = await getProjects();
    const project = projects.find((item) => String(item.id) === id);
    if (project) {
      const heading = element('h1', project.name);
      root.append(heading);
      if (project.archived) root.append(element('p', 'Archived project'));
      const renameForm = element('form', undefined, 'create-form');
      const renameLabel = element('label', 'New project name');
      renameLabel.htmlFor = 'new-project-name';
      const renameInput = element('input');
      renameInput.id = 'new-project-name';
      renameInput.name = 'name';
      renameInput.type = 'text';
      renameInput.autocomplete = 'off';
      renameInput.disabled = project.archived;
      const renameButton = element('button', 'Rename project');
      renameButton.type = 'submit';
      renameButton.disabled = project.archived;
      renameForm.append(renameLabel, renameInput, renameButton);
      const renameError = element('p', undefined, 'alert');
      renameError.setAttribute('role', 'alert');
      renameError.hidden = true;
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = renameInput.value.trim();
        if (!name) {
          renameError.textContent = 'Project name is required';
          renameError.hidden = false;
          renameInput.focus();
          return;
        }
        const response = await fetch(`/api/projects/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
        });
        if (response.ok) {
          heading.textContent = name;
          renameInput.value = '';
          renameError.hidden = true;
        }
      });
      root.append(renameForm, renameError);
      const defaultLabel = element('label', 'Default task priority');
      defaultLabel.htmlFor = 'default-task-priority';
      const defaultPriority = element('select');
      defaultPriority.id = 'default-task-priority';
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', value);
        option.value = value;
        defaultPriority.append(option);
      }
      defaultPriority.value = project.defaultPriority || 'Normal';
      defaultPriority.disabled = project.archived;
      defaultPriority.addEventListener('change', async () => {
        const response = await fetch(`/api/projects/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultPriority: defaultPriority.value }),
        });
        if (!response.ok) defaultPriority.value = project.defaultPriority || 'Normal';
      });
      root.append(defaultLabel, defaultPriority);
      await renderTasks(id, project.archived);
    } else root.append(element('h1', 'Project not found'));
  } catch {
    root.append(element('h1', 'Could not load project'));
  }
}

async function renderTasks(projectId, archived) {
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  submit.disabled = archived;
  form.append(label, input, submit);
  const error = element('p', undefined, 'alert');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  const priorityFilterLabel = element('label', 'Priority filter');
  priorityFilterLabel.htmlFor = 'priority-filter';
  const priorityFilter = element('select');
  priorityFilter.id = 'priority-filter';
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = element('option', value);
    option.value = value;
    priorityFilter.append(option);
  }
  const dueFromLabel = element('label', 'Due from');
  dueFromLabel.htmlFor = 'due-from';
  const dueFrom = element('input');
  dueFrom.type = 'text';
  dueFrom.id = 'due-from';
  dueFrom.setAttribute('aria-label', 'Due from');
  const dueThroughLabel = element('label', 'Due through');
  dueThroughLabel.htmlFor = 'due-through';
  const dueThrough = element('input');
  dueThrough.type = 'text';
  dueThrough.id = 'due-through';
  dueThrough.setAttribute('aria-label', 'Due through');
  const applyDueRange = element('button', 'Apply due range');
  applyDueRange.type = 'button';
  const rangeError = element('p', undefined, 'alert');
  rangeError.setAttribute('role', 'alert');
  rangeError.hidden = true;
  let appliedRange = { from: '', through: '' };
  const rows = element('section', undefined, 'tasks');
  rows.setAttribute('aria-label', 'Tasks');
  async function refresh() {
    const tasks = await getTasks(projectId);
    const projects = await getProjects();
    const destinations = projects.filter(project => !project.archived && String(project.id) !== String(projectId));
    rows.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
      if (appliedRange.from || appliedRange.through) {
        if (!task.dueDate) continue;
        if (appliedRange.from && task.dueDate < appliedRange.from) continue;
        if (appliedRange.through && task.dueDate > appliedRange.through) continue;
      }
      const row = element('div', undefined, 'task-row');
      row.dataset.testid = 'task-row';
      row.append(element('span', task.title));
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (response.ok) await refresh();
      });
      row.append(checkbox);
      const priority = element('select');
      priority.setAttribute('aria-label', 'Task priority');
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', value);
        option.value = value;
        priority.append(option);
      }
      priority.value = task.priority || 'Normal';
      priority.disabled = archived;
      priority.addEventListener('change', async () => {
        const selectedPriority = priority.value;
        priority.disabled = true;
        const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: selectedPriority }),
        });
        if (response.ok) await refresh();
        else {
          priority.value = task.priority || 'Normal';
          priority.disabled = false;
        }
      });
      row.append(priority);
      const dueDate = element('input');
      dueDate.type = 'text';
      dueDate.setAttribute('aria-label', 'Task due date');
      dueDate.value = task.dueDate || '';
      dueDate.disabled = archived;
      const saveDueDate = element('button', 'Save due date');
      saveDueDate.type = 'button';
      saveDueDate.disabled = archived;
      const dueDateError = element('span');
      dueDateError.setAttribute('role', 'alert');
      saveDueDate.addEventListener('click', async () => {
        const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: dueDate.value }),
        });
        if (response.ok) {
          dueDateError.textContent = '';
          await refresh();
        } else {
          const result = await response.json().catch(() => ({}));
          dueDateError.textContent = result.error || 'Could not save due date';
        }
      });
      row.append(dueDate, saveDueDate, dueDateError);
      const renameInput = element('input');
      renameInput.type = 'text';
      renameInput.setAttribute('aria-label', 'New task title');
      renameInput.disabled = archived;
      const renameButton = element('button', 'Rename task');
      renameButton.type = 'button';
      renameButton.disabled = archived;
      const renameError = element('span');
      renameError.setAttribute('role', 'alert');
      renameButton.addEventListener('click', async () => {
        const title = renameInput.value.trim();
        if (!title) {
          renameError.textContent = 'Task title is required';
          renameInput.focus();
          return;
        }
        const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
        });
        if (response.ok) await refresh();
      });
      row.append(renameInput, renameButton, renameError);
      const destination = element('select');
      destination.setAttribute('aria-label', 'Destination project');
      for (const candidate of destinations) {
        const option = element('option', candidate.name);
        option.value = candidate.id;
        destination.append(option);
      }
      const moveButton = element('button', 'Move task');
      moveButton.type = 'button';
      destination.disabled = archived || destinations.length === 0;
      moveButton.disabled = archived || destinations.length === 0;
      moveButton.addEventListener('click', async () => {
        const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}/move`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
        });
        if (response.ok) await refresh();
      });
      row.append(destination, moveButton);
      rows.append(row);
    }
  }
  filter.addEventListener('change', refresh);
  priorityFilter.addEventListener('change', refresh);
  applyDueRange.addEventListener('click', async () => {
    const from = dueFrom.value.trim();
    const through = dueThrough.value.trim();
    const validDate = value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const [year, month, day] = value.split('-').map(Number);
      if (year < 1 || month < 1 || month > 12) return false;
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    };
    if ((from && !validDate(from)) || (through && !validDate(through))) {
      rangeError.textContent = 'Due range must use valid YYYY-MM-DD dates';
      rangeError.hidden = false;
      return;
    }
    if (from && through && from > through) {
      rangeError.textContent = 'Due from must not be after Due through';
      rangeError.hidden = false;
      return;
    }
    appliedRange = { from, through };
    rangeError.hidden = true;
    await refresh();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      error.textContent = 'Task title is required';
      error.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (response.ok) {
      input.value = '';
      error.hidden = true;
      await refresh();
    }
  });
  root.append(form, error, filterLabel, filter, priorityFilterLabel, priorityFilter,
    dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, rangeError, rows);
  try { await refresh(); }
  catch { const message = element('p', 'Could not load tasks'); message.setAttribute('role', 'alert'); root.append(message); }
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) showProject(match[1]);
else showList();
