const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.testId) node.dataset.testid = options.testId;
  if (options.className) node.className = options.className;
  return node;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function renderList(archived = false, appliedQuery = '') {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text'; input.id = 'project-name'; input.autocomplete = 'off'; label.htmlFor = input.id;
  const create = element('button', { text: 'Create project' }); create.type = 'submit';
  const alert = element('p', { className: 'alert' }); alert.setAttribute('role', 'alert'); alert.hidden = true;
  form.append(label, input, create, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      await renderList();
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
  app.append(form);
  const filterLabel = element('label', { text: 'Project filter' }); filterLabel.htmlFor = 'project-filter';
  const filter = element('select'); filter.id = 'project-filter';
  for (const [value, text] of [['false', 'Active'], ['true', 'Archived']]) { const option = element('option', { text }); option.value = value; filter.append(option); }
  filter.value = String(archived);
  filter.addEventListener('change', () => renderList(filter.value === 'true', appliedQuery));
  app.append(filterLabel, filter);
  const searchForm = element('form', { className: 'create-form' });
  const searchLabel = element('label', { text: 'Project search' }); searchLabel.htmlFor = 'project-search';
  const searchInput = element('input'); searchInput.id = searchLabel.htmlFor; searchInput.type = 'text'; searchInput.value = appliedQuery;
  const searchButton = element('button', { text: 'Search projects' }); searchButton.type = 'submit';
  searchForm.append(searchLabel, searchInput, searchButton);
  searchForm.addEventListener('submit', event => { event.preventDefault(); renderList(archived, searchInput.value.trim()); });
  app.append(searchForm);
  const normalizeSearch = value => value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
  const query = normalizeSearch(appliedQuery.trim());
  const list = element('section', { className: 'project-list' });
  for (const project of await request(`/api/projects?archived=${archived}`)) {
    if (!normalizeSearch(project.name).includes(query)) continue;
    const row = element('article', { testId: 'project-row', className: 'project-row' });
    row.append(element('span', { text: project.name }));
    const summary = element('span', { text: `${project.completedCount}/${project.totalCount} completed`, testId: 'project-summary' });
    row.append(summary);
    const open = element('button', { text: 'Open project' }); open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(open);
    const archive = element('button', { text: archived ? 'Restore project' : 'Archive project' }); archive.type = 'button';
    archive.addEventListener('click', async () => {
      await request(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !archived }) });
      await renderList(archived);
    });
    row.append(archive); list.append(row);
  }
  app.append(list);
}

async function renderProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  const destinations = (await request('/api/projects?archived=false')).filter(candidate => candidate.id !== project.id);
  app.replaceChildren();
  const back = element('button', { text: 'Projects' }); back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', { text: project.name }));
  if (project.archived) app.append(element('p', { text: 'Archived project' }));
  const renameForm = element('form', { className: 'create-form' });
  const renameLabel = element('label', { text: 'New project name' }); renameLabel.htmlFor = 'new-project-name';
  const renameInput = element('input'); renameInput.type = 'text'; renameInput.id = 'new-project-name'; renameInput.value = project.name; renameInput.disabled = Boolean(project.archived);
  const renameButton = element('button', { text: 'Rename project' }); renameButton.type = 'submit'; renameButton.disabled = Boolean(project.archived);
  const renameAlert = element('p', { className: 'alert' }); renameAlert.setAttribute('role', 'alert'); renameAlert.hidden = true;
  renameForm.append(renameLabel, renameInput, renameButton, renameAlert);
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/rename`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: renameInput.value }) });
      project.name = renameInput.value.trim();
      app.querySelector('h1').textContent = project.name;
      renameInput.value = project.name;
    } catch (error) { renameAlert.textContent = error.message; renameAlert.hidden = false; }
  });

  const defaultLabel = element('label', { text: 'Default task priority' }); defaultLabel.htmlFor = 'default-task-priority';
  const defaultPriority = element('select'); defaultPriority.id = defaultLabel.htmlFor;
  for (const value of ['Low', 'Normal', 'High']) { const option = element('option', { text: value }); option.value = value; defaultPriority.append(option); }
  defaultPriority.value = project.defaultPriority;
  defaultPriority.disabled = Boolean(project.archived);
  let defaultPrioritySave = Promise.resolve();
  defaultPriority.addEventListener('change', () => {
    const selectedPriority = defaultPriority.value;
    defaultPrioritySave = defaultPrioritySave
      .then(() => request(`/api/projects/${encodeURIComponent(id)}/default-priority`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: selectedPriority }) }))
      .catch(error => { alert.textContent = error.message; alert.hidden = false; });
  });
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Task title' });
  const input = element('input'); input.type = 'text'; input.id = 'task-title'; input.autocomplete = 'off'; label.htmlFor = input.id;
  const create = element('button', { text: 'Create task' }); create.type = 'submit'; create.disabled = Boolean(project.archived);
  const alert = element('p', { className: 'alert' }); alert.setAttribute('role', 'alert'); alert.hidden = true;
  form.append(label, input, create, alert);
  const filterLabel = element('label', { text: 'Task filter' }); filterLabel.htmlFor = 'task-filter';
  const filter = element('select'); filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) { const option = element('option', { text: value }); option.value = value; filter.append(option); }
  const priorityFilterLabel = element('label', { text: 'Priority filter' }); priorityFilterLabel.htmlFor = 'priority-filter';
  const priorityFilter = element('select'); priorityFilter.id = 'priority-filter';
  for (const value of ['All', 'Low', 'Normal', 'High']) { const option = element('option', { text: value }); option.value = value; priorityFilter.append(option); }
  const taskSearchForm = element('form', { className: 'create-form' });
  const taskSearchLabel = element('label', { text: 'Task search' }); taskSearchLabel.htmlFor = 'task-search';
  const taskSearchInput = element('input'); taskSearchInput.type = 'text'; taskSearchInput.id = taskSearchLabel.htmlFor;
  const taskSearchButton = element('button', { text: 'Search tasks' }); taskSearchButton.type = 'submit';
  let appliedTaskQuery = '';
  taskSearchForm.append(taskSearchLabel, taskSearchInput, taskSearchButton);
  taskSearchForm.addEventListener('submit', event => { event.preventDefault(); appliedTaskQuery = taskSearchInput.value.trim(); refreshTasks(); });
  const dueFromLabel = element('label', { text: 'Due from' }); dueFromLabel.htmlFor = 'due-from';
  const dueFrom = element('input'); dueFrom.type = 'text'; dueFrom.id = 'due-from';
  const dueThroughLabel = element('label', { text: 'Due through' }); dueThroughLabel.htmlFor = 'due-through';
  const dueThrough = element('input'); dueThrough.type = 'text'; dueThrough.id = 'due-through';
  const applyDueRange = element('button', { text: 'Apply due range' }); applyDueRange.type = 'button';
  let appliedDueFrom = '', appliedDueThrough = '';
  const list = element('section', { className: 'task-list' });
  let taskRenderVersion = 0;
  async function refreshTasks() {
    const renderVersion = ++taskRenderVersion;
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    if (renderVersion !== taskRenderVersion) return;
    list.replaceChildren();
    const normalizeTaskSearch = value => value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
    const normalizedTaskQuery = normalizeTaskSearch(appliedTaskQuery.trim());
    for (const task of tasks) {
      if (!normalizeTaskSearch(task.title).includes(normalizedTaskQuery)) continue;
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed || priorityFilter.value !== 'All' && priorityFilter.value !== task.priority) continue;
      if ((appliedDueFrom || appliedDueThrough) && (!task.dueDate || (appliedDueFrom && task.dueDate < appliedDueFrom) || (appliedDueThrough && task.dueDate > appliedDueThrough))) continue;
      const row = element('article', { testId: 'task-row', className: 'task-row' });
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(task.completed);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`); checkbox.disabled = Boolean(project.archived);
      checkbox.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await refreshTasks();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      const priorityLabel = element('label', { text: 'Task priority' });
      const priority = element('select'); priorityLabel.htmlFor = `task-priority-${task.id}`; priority.id = priorityLabel.htmlFor;
      for (const value of ['Low', 'Normal', 'High']) { const option = element('option', { text: value }); option.value = value; priority.append(option); }
      priority.value = task.priority;
      priority.disabled = Boolean(project.archived);
      priority.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}/priority`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
          await refreshTasks();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      const renameForm = element('form', { className: 'create-form' });
      const renameLabel = element('label', { text: 'New task title' });
      const renameInput = element('input'); renameInput.type = 'text'; renameInput.value = task.title;
      renameLabel.htmlFor = `new-task-title-${task.id}`; renameInput.id = renameLabel.htmlFor; renameInput.disabled = Boolean(project.archived);
      const renameButton = element('button', { text: 'Rename task' }); renameButton.type = 'submit'; renameButton.disabled = Boolean(project.archived);
      const renameAlert = element('p', { className: 'alert' }); renameAlert.setAttribute('role', 'alert'); renameAlert.hidden = true;
      renameForm.append(renameLabel, renameInput, renameButton, renameAlert);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}/rename`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: renameInput.value }) });
          await refreshTasks();
        } catch (error) { renameAlert.textContent = error.message; renameAlert.hidden = false; }
      });
      const dueForm = element('form', { className: 'create-form' });
      const dueLabel = element('label', { text: 'Task due date' });
      const dueInput = element('input'); dueInput.type = 'text'; dueInput.value = task.dueDate || ''; dueInput.disabled = Boolean(project.archived);
      dueLabel.htmlFor = `task-due-date-${task.id}`; dueInput.id = dueLabel.htmlFor;
      const dueButton = element('button', { text: 'Save due date' }); dueButton.type = 'submit'; dueButton.disabled = Boolean(project.archived);
      dueForm.append(dueLabel, dueInput, dueButton);
      dueForm.addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}/due-date`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dueDate: dueInput.value }) });
          await refreshTasks();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      const destinationLabel = element('label', { text: 'Destination project' });
      const destination = element('select');
      destinationLabel.htmlFor = `destination-project-${task.id}`; destination.id = destinationLabel.htmlFor;
      for (const candidate of destinations) {
        const option = element('option', { text: candidate.name }); option.value = candidate.id; destination.append(option);
      }
      destination.disabled = Boolean(project.archived) || destinations.length === 0;
      const moveButton = element('button', { text: 'Move task' }); moveButton.type = 'button'; moveButton.disabled = destination.disabled;
      moveButton.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}/move`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destinationId: Number(destination.value) }) });
          await refreshTasks();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      const title = element('span', { text: task.title });
      title.dataset.taskTitle = task.title;
      row.append(checkbox, title, priorityLabel, priority, renameForm, dueForm, destinationLabel, destination, moveButton); list.append(row);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await defaultPrioritySave;
      await request(`/api/projects/${encodeURIComponent(id)}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
      await refreshTasks(); input.value = ''; alert.hidden = true;
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
  applyDueRange.addEventListener('click', () => {
    const from = dueFrom.value.trim(), through = dueThrough.value.trim();
    const validDate = value => {
      if (!value) return true;
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return false;
      const [, y, m, d] = match.map(Number);
      if (y < 1 || m < 1 || m > 12 || d < 1) return false;
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    };
    if (!validDate(from) || !validDate(through)) { alert.textContent = 'Due range must use valid YYYY-MM-DD dates'; alert.hidden = false; return; }
    if (from && through && from > through) { alert.textContent = 'Due from must not be after Due through'; alert.hidden = false; return; }
    appliedDueFrom = from; appliedDueThrough = through;
    dueFrom.value = from; dueThrough.value = through;
    alert.hidden = true;
    refreshTasks();
  });
  filter.addEventListener('change', refreshTasks);
  priorityFilter.addEventListener('change', refreshTasks);
  app.append(renameForm, defaultLabel, defaultPriority, form, taskSearchForm, filterLabel, filter, priorityFilterLabel, priorityFilter, dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, list);
  await refreshTasks();
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) renderProject(match[1]).catch(() => { location.href = '/'; });
else renderList().catch(error => { app.replaceChildren(element('p', { text: error.message, className: 'alert' })); });
