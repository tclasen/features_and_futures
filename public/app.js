const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

function showError(message) {
  const existing = app.querySelector('[role="alert"]');
  if (existing) existing.remove();
  app.prepend(element('p', { class: 'error', role: 'alert' }, message));
}

async function showProjects(errorMessage = '') {
  app.replaceChildren(element('h1', {}, 'Workboard'));
  const form = element('form');
  const label = element('label', {}, 'Project name');
  const input = element('input', { name: 'name', type: 'text', autocomplete: 'off' });
  input.id = 'project-name';
  label.htmlFor = input.id;
  label.append(input);
  form.append(label, element('button', { type: 'submit' }, 'Create project'));
  app.append(form);

  if (errorMessage) app.append(element('p', { class: 'error', role: 'alert' }, errorMessage));
  const list = element('section', { class: 'project-list', 'aria-label': 'Projects' });
  for (const project of await request('/api/projects')) {
    const row = element('div', { 'data-testid': 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
    row.append(open);
    list.append(row);
  }
  app.append(list);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      await showProjects();
    } catch (error) {
      await showProjects(error.message);
    }
  });
}

async function showProject(id, errorMessage = '') {
  const projects = await request('/api/projects');
  const project = projects.find((item) => String(item.id) === id);
  app.replaceChildren();
  const back = element('button', { class: 'back', type: 'button' }, 'Projects');
  back.addEventListener('click', () => { window.location.href = '/'; });
  if (!project) {
    app.append(element('h1', {}, 'Project not found'), back);
    return;
  }
  app.append(back, element('h1', {}, project.name));
  if (errorMessage) showError(errorMessage);

  const controls = element('div', { class: 'task-controls' });
  const form = element('form');
  const label = element('label', {}, 'Task title');
  const input = element('input', { name: 'title', type: 'text', autocomplete: 'off' });
  input.id = 'task-title';
  label.htmlFor = input.id;
  label.append(input);
  form.append(label, element('button', { type: 'submit' }, 'Create task'));
  const filterLabel = element('label', { class: 'task-filter' }, 'Task filter');
  const filter = element('select', { 'aria-label': 'Task filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', { value }, value));
  filterLabel.append(filter);
  controls.append(form, filterLabel);
  app.append(controls);
  const list = element('section', { class: 'task-list', 'aria-label': 'Tasks' });
  app.append(list);

  let tasks;
  try {
    tasks = await request(`/api/projects/${id}/tasks`);
  } catch (error) {
    showError(error.message);
    return;
  }
  const renderTasks = () => {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', { 'data-testid': 'task-row' });
      const checkbox = element('input', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.addEventListener('change', async () => {
        const completed = checkbox.checked;
        try {
          await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed }),
          });
          task.completed = completed;
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        }
      });
      row.append(checkbox, element('span', {}, task.title));
      list.append(row);
    }
  };
  filter.addEventListener('change', renderTasks);
  renderTasks();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const task = await request(`/api/projects/${id}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      input.value = '';
      renderTasks();
    } catch (error) {
      showError(error.message);
    }
  });
}

const projectRoute = window.location.pathname.match(/^\/projects\/(\d+)$/);
if (projectRoute) {
  showProject(projectRoute[1]).catch(() => showProjects('Unable to load project'));
} else {
  showProjects().catch(() => { app.append(element('h1', {}, 'Workboard'), element('p', { role: 'alert' }, 'Unable to load projects')); });
}
