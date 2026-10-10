const view = document.querySelector('#view');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function projects() {
  const response = await fetch('/api/projects');
  return response.json();
}

async function showList() {
  view.replaceChildren();
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  view.append(filterLabel, filter);
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const button = element('button', 'Create project');
  button.type = 'submit';
  const alert = element('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    history.pushState({}, '', '/');
    await showList();
  });
  view.append(form);
  const list = element('div', undefined, 'project-list');
  const allProjects = await projects();
  const renderProjects = () => {
    list.replaceChildren();
    for (const project of allProjects.filter(item => Boolean(item.archived) === (filter.value === 'Archived'))) {
      const row = element('article', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name));
      const summary = element('span', `${project.completedCount}/${project.totalCount} completed`);
      summary.dataset.testid = 'project-summary';
      row.append(summary);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      const action = element('button', project.archived ? 'Restore project' : 'Archive project');
      action.type = 'button';
      action.addEventListener('click', async () => {
        const result = await fetch(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
        if (result.ok) {
          project.archived = project.archived ? 0 : 1;
          renderProjects();
        }
      });
      row.append(action);
      list.append(row);
    }
  };
  filter.addEventListener('change', renderProjects);
  renderProjects();
  view.append(list);
}

async function showProject(id) {
  view.replaceChildren();
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    view.append(element('p', 'Project not found'));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    view.append(back);
    return;
  }
  const project = await response.json();
  const heading = element('h2', project.name);
  view.append(heading);
  if (project.archived) view.append(element('p', 'Archived project'));
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => navigate('/'));
  view.append(back);

  const form = element('form', undefined, 'create-form task-form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.type = 'text';
  const create = element('button', 'Create task');
  create.type = 'submit';
  create.disabled = Boolean(project.archived);
  const alert = element('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, create, alert);
  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  const taskList = element('div', undefined, 'task-list');
  let taskData = [];
  const renderTasks = () => {
    taskList.replaceChildren();
    const visible = taskData.filter(task => filter.value === 'All' || (filter.value === 'Completed') === Boolean(task.completed));
    for (const task of visible) {
      const row = element('article', undefined, 'task-row');
      row.dataset.testid = 'task-row';
      row.append(element('span', task.title));
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.disabled = Boolean(project.archived);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        const result = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        if (result.ok) {
          task.completed = checkbox.checked ? 1 : 0;
          renderTasks();
        }
      });
      row.append(checkbox);
      taskList.append(row);
    }
  };
  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const result = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input.value }),
    });
    if (!result.ok) {
      alert.textContent = 'Task title is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    input.value = '';
    taskData.push(await result.json());
    renderTasks();
  });
  view.append(form, filterLabel, filter, taskList);
  const taskResponse = await fetch(`/api/projects/${encodeURIComponent(id)}/tasks`);
  if (taskResponse.ok) {
    taskData = await taskResponse.json();
    renderTasks();
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) showProject(match[1]);
  else showList();
}

window.addEventListener('popstate', render);
render();
