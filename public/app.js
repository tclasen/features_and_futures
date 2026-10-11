const app = document.querySelector('#app');

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

async function projectsPage() {
  document.title = 'Workboard';
  app.replaceChildren(element('h1', {}, 'Workboard'));

  const form = element('form', { class: 'create-form' });
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', class: 'alert' });
  form.append(label, input, submit);
  const filterLabel = element('label', { for: 'project-filter' }, 'Project filter');
  const filter = element('select', { id: 'project-filter' });
  for (const option of ['Active', 'Archived']) filter.append(element('option', { value: option.toLowerCase() }, option));
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(form, alert, filterLabel, filter, list);

  async function loadProjects() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    list.replaceChildren();
    for (const project of projects.filter((item) => item.archived === (filter.value === 'archived'))) {
      const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
      row.append(element('span', {}, project.name));
      row.append(element('span', { 'data-testid': 'project-summary' }, `${project.completedCount}/${project.totalCount} completed`));
      const open = element('button', { type: 'button' }, 'Open project');
      open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
      row.append(open);
      const action = element('button', { type: 'button' }, project.archived ? 'Restore project' : 'Archive project');
      action.addEventListener('click', async () => {
        await fetch(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
        await loadProjects();
      });
      row.append(action);
      list.append(row);
    }
  }

  filter.addEventListener('change', loadProjects);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.textContent = '';
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert.textContent = result.error || 'Unable to create project';
      return;
    }
    input.value = '';
    await loadProjects();
  });

  await loadProjects();
}

async function projectPage(projectId) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) {
    app.replaceChildren(element('h1', {}, 'Project not found'));
    return;
  }
  const project = await response.json();
  document.title = `${project.name} · Workboard`;
  const back = element('button', { type: 'button' }, 'Projects');
  back.addEventListener('click', () => { window.location.href = '/'; });
  const heading = element('h1', {}, project.name);
  const archivedNotice = project.archived ? element('p', {}, 'Archived project') : null;
  const form = element('form', { class: 'create-form' });
  const label = element('label', { for: 'task-title' }, 'Task title');
  const input = element('input', { id: 'task-title', name: 'title', type: 'text' });
  const submit = element('button', { type: 'submit' }, 'Create task');
  if (project.archived) submit.disabled = true;
  form.append(label, input, submit);
  const alert = element('p', { role: 'alert', class: 'alert' });
  const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
  const filter = element('select', { id: 'task-filter' });
  for (const option of ['All', 'Open', 'Completed']) {
    filter.append(element('option', { value: option.toLowerCase() }, option));
  }
  const list = element('section', { 'aria-label': 'Tasks' });
  app.replaceChildren(back, heading, ...(archivedNotice ? [archivedNotice] : []), form, alert, filterLabel, filter, list);

  async function loadTasks() {
    const tasksResponse = await fetch(`/api/projects/${projectId}/tasks`);
    const tasks = await tasksResponse.json();
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'open' && task.completed) continue;
      if (filter.value === 'completed' && !task.completed) continue;
      const row = element('div', { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', {
        type: 'checkbox',
        'aria-label': `Complete ${task.title}`,
      });
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.addEventListener('change', async () => {
        await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await loadTasks();
      });
      row.append(checkbox, element('span', {}, task.title));
      list.append(row);
    }
  }

  filter.addEventListener('change', loadTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.textContent = '';
    const createResponse = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input.value }),
    });
    const result = await createResponse.json();
    if (!createResponse.ok) {
      alert.textContent = result.error || 'Unable to create task';
      return;
    }
    input.value = '';
    await loadTasks();
  });

  await loadTasks();
}

const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) projectPage(match[1]);
else projectsPage();
