const app = document.querySelector('#app');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    let project;
    try {
      const response = await fetch(`/api/projects/${match[1]}`);
      if (!response.ok) throw new Error('Project not found');
      project = await response.json();
    } catch {
      app.append(element('h1', 'Project not found'));
      const back = element('button', 'Projects');
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
      return;
    }
    app.append(element('h1', project.name));
    if (project.archived) app.append(element('p', 'Archived project')); 
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    app.append(back);

    const renameForm = element('form', undefined, 'create-form');
    const renameLabel = element('label', 'New project name');
    renameLabel.htmlFor = 'new-project-name';
    const renameInput = element('input');
    renameInput.id = 'new-project-name';
    renameInput.type = 'text';
    renameInput.autocomplete = 'off';
    renameInput.value = project.name;
    renameInput.disabled = project.archived;
    const renameButton = element('button', 'Rename project');
    renameButton.type = 'submit';
    renameButton.disabled = project.archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    const renameAlert = element('p', '', 'alert');
    renameAlert.setAttribute('role', 'alert');
    renameAlert.hidden = true;
    app.append(renameForm, renameAlert);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        renameAlert.textContent = 'Project name is required';
        renameAlert.hidden = false;
        renameInput.focus();
        return;
      }
      const response = await fetch(`/api/projects/${match[1]}/rename`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      if (!response.ok) {
        renameAlert.textContent = 'Project name is required';
        renameAlert.hidden = false;
        return;
      }
      renameAlert.hidden = true;
      renameInput.value = name;
      app.querySelector('h1').textContent = name;
    });

    const form = element('form', undefined, 'create-form');
    const label = element('label', 'Task title');
    label.htmlFor = 'task-title';
    const input = element('input');
    input.id = 'task-title';
    input.type = 'text';
    input.autocomplete = 'off';
    const submit = element('button', 'Create task');
    submit.type = 'submit';
    if (project.archived) submit.disabled = true;
    form.append(label, input, submit);
    const alert = element('p', '', 'alert');
    alert.setAttribute('role', 'alert');
    alert.hidden = true;
    const filterLabel = element('label', 'Task filter');
    filterLabel.htmlFor = 'task-filter';
    const filter = element('select');
    filter.id = 'task-filter';
    for (const value of ['All', 'Open', 'Completed']) filter.append(new Option(value, value));
    const list = element('section', undefined, 'task-list');
    app.append(form, alert, filterLabel, filter, list);

    async function loadTasks() {
      const response = await fetch(`/api/projects/${match[1]}/tasks`);
      const tasks = await response.json();
      list.replaceChildren();
      for (const task of tasks.filter(t => filter.value === 'All' || (filter.value === 'Completed') === t.completed)) {
        const row = element('div', undefined, 'task-row');
        row.dataset.testid = 'task-row';
        row.append(element('span', task.title));
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = project.archived;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await loadTasks();
        });
        row.append(checkbox);
        const priority = element('select');
        priority.setAttribute('aria-label', 'Task priority');
        for (const value of ['Low', 'Normal', 'High']) priority.append(new Option(value, value));
        priority.value = task.priority;
        priority.disabled = project.archived;
        priority.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
        });
        row.append(priority);
        const renameForm = element('form', undefined, 'create-form');
        const renameInput = element('input');
        renameInput.type = 'text';
        renameInput.value = task.title;
        renameInput.setAttribute('aria-label', 'New task title');
        renameInput.disabled = project.archived;
        const renameButton = element('button', 'Rename task');
        renameButton.type = 'submit';
        renameButton.disabled = project.archived;
        renameForm.append(renameInput, renameButton);
        const renameAlert = element('p', '', 'alert');
        renameAlert.setAttribute('role', 'alert');
        renameAlert.hidden = true;
        renameForm.addEventListener('submit', async event => {
          event.preventDefault();
          const title = renameInput.value.trim();
          if (!title) {
            renameAlert.textContent = 'Task title is required';
            renameAlert.hidden = false;
            renameInput.focus();
            return;
          }
          const response = await fetch(`/api/tasks/${task.id}/rename`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
          });
          if (!response.ok) {
            renameAlert.textContent = 'Task title is required';
            renameAlert.hidden = false;
            return;
          }
          await loadTasks();
        });
        row.append(renameForm, renameAlert);
        list.append(row);
      }
    }
    filter.addEventListener('change', loadTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
      const response = await fetch(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      if (!response.ok) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
      alert.hidden = true;
      input.value = '';
      await loadTasks();
    });
    await loadTasks();
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
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);
  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) filter.append(new Option(value, value));
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, alert, filterLabel, filter, list);

  async function loadProjects() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    list.replaceChildren();
    for (const project of projects.filter(p => p.archived === (filter.value === 'Archived'))) {
      const row = element('div', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      const details = element('div');
      details.append(element('span', project.name));
      const summary = element('span', project.summary, 'project-summary');
      summary.dataset.testid = 'project-summary';
      details.append(summary);
      row.append(details);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      const action = element('button', project.archived ? 'Restore project' : 'Archive project');
      action.type = 'button';
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
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    input.value = '';
    await loadProjects();
  });
  await loadProjects();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
render();
