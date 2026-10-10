const app = document.querySelector('#app');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function projects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    let items;
    try { items = await projects(); } catch { app.append(element('p', 'Unable to load projects')); return; }
    const project = items.find(item => String(item.id) === match[1]);
    if (!project) {
      app.append(element('h1', 'Project not found'));
    } else {
      app.append(element('h1', project.name));
      const form = element('form', undefined, 'create-form');
      const label = element('label', 'Task title'); label.htmlFor = 'task-title';
      const input = element('input'); input.id = 'task-title'; input.type = 'text'; input.setAttribute('aria-label', 'Task title');
      const submit = element('button', 'Create task'); submit.type = 'submit';
      const alert = element('p', '', 'alert'); alert.setAttribute('role', 'alert'); alert.hidden = true;
      form.append(label, input, submit, alert);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
        const response = await fetch(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
        if (response.ok) render();
      });
      app.append(form);
      const filterLabel = element('label', 'Task filter'); filterLabel.htmlFor = 'task-filter';
      const filter = element('select'); filter.id = 'task-filter'; filter.setAttribute('aria-label', 'Task filter');
      for (const value of ['All', 'Open', 'Completed']) { const option = element('option', value); option.value = value; filter.append(option); }
      app.append(filter);
      const taskList = element('section', undefined, 'task-list');
      const taskResponse = await fetch(`/api/projects/${match[1]}/tasks`);
      const tasks = taskResponse.ok ? await taskResponse.json() : [];
      const showTasks = () => {
        taskList.replaceChildren();
        for (const task of tasks) {
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          const row = element('div', undefined, 'task-row'); row.dataset.testid = 'task-row';
          row.append(element('span', task.title));
          const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(task.completed); checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          checkbox.addEventListener('change', async () => { await fetch(`/api/projects/${match[1]}/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) }); render(); });
          row.append(checkbox); taskList.append(row);
        }
      };
      filter.addEventListener('change', showTasks); showTasks(); app.append(taskList);
    }
    const back = element('button', 'Projects');
    back.type = 'button';
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      alert.hidden = true;
      await render();
    }
  });
  app.append(form);

  let items;
  try { items = await projects(); } catch { app.append(element('p', 'Unable to load projects')); return; }
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  for (const project of items) {
    const row = element('div', undefined, 'project-row');
    row.dataset.testid = 'project-row';
    row.append(element('span', project.name));
    const open = element('button', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(open);
    list.append(row);
  }
  app.append(list);
}

addEventListener('popstate', render);
render();
