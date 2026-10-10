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
      root.append(element('h1', project.name));
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
        if (response.ok) await showProject(id);
      });
      root.append(renameForm, renameError);
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
  const rows = element('section', undefined, 'tasks');
  rows.setAttribute('aria-label', 'Tasks');
  async function refresh() {
    const tasks = await getTasks(projectId);
    rows.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
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
      rows.append(row);
    }
  }
  filter.addEventListener('change', refresh);
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
  root.append(form, error, filterLabel, filter, rows);
  try { await refresh(); }
  catch { const message = element('p', 'Could not load tasks'); message.setAttribute('role', 'alert'); root.append(message); }
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) showProject(match[1]);
else showList();
