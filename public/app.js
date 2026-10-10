const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showError(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p');
    alert.setAttribute('role', 'alert');
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project) {
  const row = element('li');
  row.dataset.testid = 'project-row';
  const open = element('button', 'Open project');
  open.type = 'button';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), open);
  return row;
}

async function renderTasks(projectId) {
  const endpoint = `/api/projects/${projectId}/tasks`;
  const form = element('form');
  const titleLabel = element('label', 'Task title');
  titleLabel.htmlFor = 'task-title';
  const titleInput = element('input');
  titleInput.id = 'task-title';
  titleInput.name = 'title';
  titleInput.type = 'text';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  submit.disabled = true;
  form.append(titleLabel, titleInput, submit);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  filter.value = 'All';
  const filterControls = element('div');
  filterControls.className = 'task-filter';
  filterControls.append(filterLabel, filter);
  const list = element('ul');
  list.setAttribute('aria-label', 'Tasks');
  app.append(form, filterControls, list);
  const tasks = await request(endpoint);

  function matchesFilter(task) {
    return filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed);
  }

  function taskRow(task) {
    const row = element('li');
    row.dataset.testid = 'task-row';
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        const saved = await request(`${endpoint}/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        task.completed = saved.completed;
        drawTasks();
        app.querySelector('[role="alert"]')?.remove();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error.message);
      } finally {
        checkbox.disabled = false;
      }
    });
    row.append(element('span', task.title), checkbox);
    return row;
  }

  function drawTasks() {
    list.replaceChildren(...tasks.filter(matchesFilter).map(taskRow));
  }

  drawTasks();
  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return showError('Task title is required');
    submit.disabled = true;
    try {
      const task = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      drawTasks();
      titleInput.value = '';
      app.querySelector('[role="alert"]')?.remove();
      titleInput.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  submit.disabled = false;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = element('button', 'Projects');
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await request(`/api/projects/${match[1]}`);
    app.append(element('h1', project.name));
    document.title = `${project.name} · Workboard`;
    await renderTasks(project.id);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  submit.disabled = true;
  const list = element('ul');
  list.setAttribute('aria-label', 'Projects');
  form.append(label, input, submit);
  app.append(form, list);
  const projects = await request('/api/projects');
  list.append(...projects.map(projectRow));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  submit.disabled = false;
}

render().catch((error) => showError(error.message)).finally(() => {
  app.setAttribute('aria-busy', 'false');
});
