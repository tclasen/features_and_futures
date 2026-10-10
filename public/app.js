const app = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function showError(message) {
  const alert = element('p', message, { role: 'alert' });
  app.prepend(alert);
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, submit);
  app.append(form);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(list);
  try {
    const projects = await getProjects();
    for (const project of projects) {
      const row = element('article', undefined, { 'data-testid': 'project-row', class: 'project-row' });
      row.append(element('span', project.name));
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      list.append(row);
    }
  } catch {
    showError('Could not load projects');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }
    try {
      const response = await fetch('/api/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Could not create project');
      renderList();
    } catch {
      showError('Could not create project');
    }
  });
}

async function renderProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error('Project not found');
    const project = await response.json();
    app.append(element('h1', project.name));
    const form = element('form');
    const label = element('label', 'Task title', { for: 'task-title' });
    const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
    form.append(label, input, element('button', 'Create task', { type: 'submit' }));
    app.append(form);

    const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
    const filter = element('select', undefined, { id: 'task-filter', name: 'filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value: value.toLowerCase() }));
    filterLabel.append(filter);
    app.append(filterLabel);
    const list = element('section', undefined, { 'aria-label': 'Tasks' });
    app.append(list);

    let tasks = [];
    const renderTasks = () => {
      list.replaceChildren();
      const visible = tasks.filter(task => filter.value === 'all' || (filter.value === 'completed' ? task.completed : !task.completed));
      for (const task of visible) {
        const row = element('article', undefined, { 'data-testid': 'task-row', class: 'task-row' });
        row.append(element('span', task.title));
        const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          try {
            const update = await fetch(`/api/tasks/${task.id}`, {
              method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
            });
            if (!update.ok) throw new Error('Could not update task');
            const saved = await update.json();
            tasks = tasks.map(item => item.id === saved.id ? saved : item);
            renderTasks();
          } catch {
            checkbox.checked = task.completed;
            checkbox.disabled = false;
            showError('Could not update task');
          }
        });
        row.append(checkbox);
        list.append(row);
      }
    };
    filter.addEventListener('change', renderTasks);
    const tasksResponse = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`);
    if (!tasksResponse.ok) throw new Error('Could not load tasks');
    tasks = await tasksResponse.json();
    renderTasks();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        showError('Task title is required');
        return;
      }
      try {
        const created = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
        });
        if (!created.ok) throw new Error('Could not create task');
        tasks.push(await created.json());
        input.value = '';
        renderTasks();
      } catch {
        showError('Could not create task');
      }
    });
  } catch {
    app.append(element('h1', 'Project not found'));
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)$/);
if (match) renderProject(match[1]);
else renderList();
