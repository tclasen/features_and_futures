const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function projectRow(project, refresh) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  row.append(element('span', project.name, { class: 'project-name' }));
  row.append(element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' }));
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => {
    history.pushState({}, '', `/projects/${project.id}`);
    renderProject(project.id);
  });
  row.append(open);
  if (project.archived) {
    const restore = element('button', 'Restore project', { type: 'button' });
    restore.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: false }) });
      refresh();
    });
    row.append(restore);
  } else {
    const archive = element('button', 'Archive project', { type: 'button' });
    archive.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: true }) });
      refresh();
    });
    row.append(archive);
  }
  return row;
}

async function renderList() {
  app.replaceChildren();
  app.append(element('h1', 'Workboard'));

  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Project name', autocomplete: 'off' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(input, submit);
  const alert = element('p', '', { id: 'alert', role: 'alert', hidden: '' });
  const projects = element('section', undefined, { id: 'projects', 'aria-label': 'Projects' });
  const filter = element('select', undefined, { 'aria-label': 'Project filter' });
  filter.append(element('option', 'Active', { value: 'active' }), element('option', 'Archived', { value: 'archived' }));
  app.append(form, alert, filter, projects);

  const drawProjects = async () => {
    const allProjects = await loadProjects();
    const rows = document.createDocumentFragment();
    for (const project of allProjects) {
      if (project.archived !== (filter.value === 'archived')) continue;
      rows.append(projectRow(project, drawProjects));
    }
    projects.replaceChildren(rows);
  };
  filter.addEventListener('change', drawProjects);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.textContent = '';
    alert.hidden = true;
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const project = await response.json();
    input.value = '';
    await drawProjects();
  });

  await drawProjects();
}

async function renderProject(id) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    history.replaceState({}, '', '/');
    return renderList();
  }
  const project = await response.json();
  const view = element('section', undefined, { id: 'project-view' });
  view.append(element('h1', project.name));
  if (project.archived) view.append(element('p', 'Archived project'));
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => {
    history.pushState({}, '', '/');
    renderList();
  });
  const renameForm = element('form');
  const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New project name', autocomplete: 'off' });
  const renameButton = element('button', 'Rename project', { type: 'submit' });
  renameInput.disabled = project.archived;
  renameButton.disabled = project.archived;
  renameForm.append(renameInput, renameButton);
  const renameAlert = element('p', '', { role: 'alert', hidden: '' });
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = renameInput.value.trim();
    if (!name) {
      renameAlert.textContent = 'Project name is required';
      renameAlert.hidden = false;
      return;
    }
    const result = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!result.ok) {
      renameAlert.textContent = 'Project name is required';
      renameAlert.hidden = false;
      return;
    }
    renderProject(id);
  });
  const form = element('form');
  const input = element('input', undefined, { type: 'text', 'aria-label': 'Task title', autocomplete: 'off' });
  const submit = element('button', 'Create task', { type: 'submit' });
  if (project.archived) {
    input.disabled = true;
    submit.disabled = true;
  }
  form.append(input, submit);
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const filter = element('select', undefined, { 'aria-label': 'Task filter' });
  for (const [value, label] of [['all', 'All'], ['open', 'Open'], ['completed', 'Completed']]) {
    filter.append(element('option', label, { value }));
  }
  const tasks = element('section', undefined, { 'aria-label': 'Tasks' });
  tasks.className = 'task-list';
  let taskData = [];
  const drawTasks = () => {
    tasks.replaceChildren();
    const mode = filter.value;
    for (const task of taskData) {
      if (mode === 'open' && task.completed || mode === 'completed' && !task.completed) continue;
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'task-row' });
      row.append(element('span', task.title));
      const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.addEventListener('change', async () => {
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (result.ok) {
          task.completed = checkbox.checked;
          drawTasks();
        } else {
          checkbox.checked = task.completed;
        }
      });
      row.append(checkbox);
      const renameForm = element('form');
      const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New task title', autocomplete: 'off' });
      const renameButton = element('button', 'Rename task', { type: 'submit' });
      renameInput.disabled = project.archived;
      renameButton.disabled = project.archived;
      const renameAlert = element('span', '', { role: 'alert', hidden: '' });
      renameForm.append(renameInput, renameButton);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        const title = renameInput.value.trim();
        if (!title) {
          renameAlert.textContent = 'Task title is required';
          renameAlert.hidden = false;
          return;
        }
        const result = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
        });
        if (!result.ok) {
          renameAlert.textContent = 'Task title is required';
          renameAlert.hidden = false;
          return;
        }
        task.title = title;
        drawTasks();
      });
      row.append(renameForm, renameAlert);
      tasks.append(row);
    }
  };
  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      return;
    }
    const result = await fetch(`/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (!result.ok) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    input.value = '';
    taskData.push(await result.json());
    drawTasks();
  });
  const taskResponse = await fetch(`/api/projects/${id}/tasks`);
  if (taskResponse.ok) taskData = await taskResponse.json();
  drawTasks();
  view.append(back, renameForm, renameAlert, form, alert, filter, tasks);
  app.replaceChildren(view);
}

function renderRoute() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  return match ? renderProject(match[1]) : renderList();
}

window.addEventListener('popstate', renderRoute);
renderRoute();
