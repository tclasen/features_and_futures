const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Something went wrong');
  return value;
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
        await renderTasks(id, filter.value, list);
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    filter.addEventListener('change', () => renderTasks(id, filter.value, list));
    app.append(form, alert, filterLabel, filter, list);
    await renderTasks(id, filter.value, list);
  } catch {
    app.append(element('h1', {}, 'Project not found'));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

async function renderTasks(projectId, filter, list) {
  const project = await request(`/api/projects/${encodeURIComponent(projectId)}`);
  const tasks = await request(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
  list.replaceChildren();
  for (const task of tasks) {
    if (filter === 'Open' && task.completed || filter === 'Completed' && !task.completed) continue;
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
        await renderTasks(projectId, filter, list);
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
        await renderTasks(projectId, filter, list);
      } catch (error) {
        renameAlert.textContent = error.message;
        renameAlert.hidden = false;
      }
    });
    row.append(renameForm, renameAlert);
    list.append(row);
  }
}

const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
