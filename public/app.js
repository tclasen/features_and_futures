const app = document.querySelector('#app');

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    const response = await fetch(`/api/projects/${match[1]}`);
    if (!response.ok) {
      app.append(element('h1', {}, 'Project not found'));
      const back = element('button', { type: 'button' }, 'Projects');
      back.addEventListener('click', () => { location.href = '/'; });
      app.append(back);
      return;
    }
    const project = await response.json();
    app.append(element('h1', {}, project.name));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back);
    if (project.archived) app.append(element('p', {}, 'Archived project'));

    const renameForm = element('form');
    const renameLabel = element('label', { for: 'new-project-name' }, 'New project name');
    const renameInput = element('input', { id: 'new-project-name', type: 'text' });
    const renameButton = element('button', { type: 'submit' }, 'Rename project');
    const renameAlert = element('p', { role: 'alert', 'aria-live': 'assertive', hidden: '' });
    if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
    renameForm.append(renameLabel, renameInput, renameButton);
    app.append(renameForm, renameAlert);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) { renameAlert.textContent = 'Project name is required'; renameAlert.hidden = false; renameInput.focus(); return; }
      const response = await fetch(`/api/projects/${match[1]}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (response.ok) render();
    });

    const form = element('form');
    const label = element('label', { for: 'task-title' }, 'Task title');
    const input = element('input', { id: 'task-title', name: 'title', type: 'text' });
    const create = element('button', { type: 'submit' }, 'Create task');
    const alert = element('p', { role: 'alert', 'aria-live': 'assertive', hidden: '' });
    if (project.archived) { input.disabled = true; create.disabled = true; }
    form.append(label, input, create);
    app.append(form, alert);
    const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
    const filter = element('select', { id: 'task-filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', { value: value.toLowerCase() }, value));
    app.append(filterLabel, filter);
    const priorityFilterLabel = element('label', { for: 'priority-filter' }, 'Priority filter');
    const priorityFilter = element('select', { id: 'priority-filter' });
    for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', { value: value.toLowerCase() }, value));
    app.append(priorityFilterLabel, priorityFilter);
    const list = element('section', { 'aria-label': 'Tasks' });
    app.append(list);
    async function loadTasks() {
      const tasks = await (await fetch(`/api/projects/${match[1]}/tasks`)).json();
      list.replaceChildren();
      for (const task of tasks) {
        if (filter.value === 'open' && task.completed || filter.value === 'completed' && !task.completed) continue;
        if (priorityFilter.value !== 'all' && task.priority.toLowerCase() !== priorityFilter.value) continue;
        const row = element('div', { 'data-testid': 'task-row', class: 'task-row' });
        row.append(element('span', {}, task.title));
        const checkbox = element('input', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
        checkbox.checked = Boolean(task.completed);
        checkbox.disabled = Boolean(project.archived);
        checkbox.addEventListener('change', async () => {
          await fetch(`/api/projects/${match[1]}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await loadTasks();
        });
        row.append(checkbox);
        const priorityLabel = element('label', {}, 'Task priority');
        const priority = element('select', { 'aria-label': 'Task priority' });
        for (const value of ['Low', 'Normal', 'High']) priority.append(element('option', { value }, value));
        priority.value = task.priority || 'Normal';
        priority.disabled = Boolean(project.archived);
        priority.addEventListener('change', async () => {
          const response = await fetch(`/api/projects/${match[1]}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
          if (response.ok) await loadTasks();
        });
        row.append(priorityLabel, priority);
        const renameForm = element('form');
        const renameInput = element('input', { type: 'text', 'aria-label': 'New task title', value: task.title });
        const renameButton = element('button', { type: 'submit' }, 'Rename task');
        if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
        renameForm.append(renameInput, renameButton);
        renameForm.addEventListener('submit', async event => {
          event.preventDefault();
          const title = renameInput.value.trim();
          if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; renameInput.focus(); return; }
          const response = await fetch(`/api/projects/${match[1]}/tasks/${task.id}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
          if (response.ok) { alert.hidden = true; await loadTasks(); }
        });
        row.append(renameForm);
        list.append(row);
      }
    }
    filter.addEventListener('change', loadTasks);
    priorityFilter.addEventListener('change', loadTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
      const result = await fetch(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      if (result.ok) { input.value = ''; alert.textContent = ''; alert.hidden = true; await loadTasks(); }
    });
    await loadTasks();
    return;
  }

  app.append(element('h1', {}, 'Workboard'));
  const filterLabel = element('label', { for: 'project-filter' }, 'Project filter');
  const filter = element('select', { id: 'project-filter' });
  filter.append(element('option', { value: 'active' }, 'Active'), element('option', { value: 'archived' }, 'Archived'));
  app.append(filterLabel, filter);
  const form = element('form');
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  const create = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', 'aria-live': 'assertive', hidden: '' });
  form.append(label, input, create);
  app.append(form, alert);
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(list);

  async function loadProjects() {
    const projects = await (await fetch(`/api/projects?filter=${filter.value}`)).json();
    list.replaceChildren();
    for (const project of projects) {
      const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
      row.append(element('span', {}, project.name));
      row.append(element('span', { 'data-testid': 'project-summary' }, `${project.completedCount}/${project.totalCount} completed`));
      const open = element('button', { type: 'button' }, 'Open project');
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      const action = element('button', { type: 'button' }, filter.value === 'active' ? 'Archive project' : 'Restore project');
      action.addEventListener('click', async () => {
        await fetch(`/api/projects/${project.id}/${filter.value === 'active' ? 'archive' : 'restore'}`, { method: 'POST' });
        await loadProjects();
      });
      row.append(action);
      list.append(row);
    }
  }
  filter.addEventListener('change', loadProjects);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; input.focus(); return; }
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (response.ok) { input.value = ''; alert.textContent = ''; alert.hidden = true; await loadProjects(); }
  });
  await loadProjects();
}

render();
