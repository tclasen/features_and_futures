const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function projectsButton() {
  const button = element('button', 'Projects', { type: 'button' });
  button.addEventListener('click', () => { window.location.href = '/'; });
  return button;
}

function projectRow(project) {
  const row = element('li', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const name = element('span', project.name, { class: 'project-name' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, open);
  return row;
}

async function renderTasks(projectId) {
  const path = `/api/projects/${projectId}/tasks`;
  let tasks = [];
  const form = element('form');
  const label = element('label', 'Task title', { for: 'task-title' });
  const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
  const submit = element('button', 'Create task', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', class: 'alert', hidden: '' });
  const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
  const filter = element('select', undefined, { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
  const filters = element('div', undefined, { class: 'task-filters' });
  filters.append(filterLabel, filter);
  const list = element('ul', undefined, { class: 'tasks', 'aria-label': 'Tasks' });
  const empty = element('p', 'No matching tasks.', { class: 'empty' });
  form.append(label, input, submit);
  app.append(form, alert, filters, list, empty);

  const showError = message => {
    alert.textContent = message;
    alert.hidden = false;
  };
  function drawTasks() {
    const visible = tasks.filter(task => filter.value === 'All' ||
      (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map(task => {
      const row = element('li', undefined, { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      const title = element('span', task.title, { class: 'task-title' });
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          Object.assign(task, saved);
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(checkbox, title);
      return row;
    }));
    empty.hidden = visible.length > 0;
  }
  filter.addEventListener('change', drawTasks);
  submit.disabled = true;
  try {
    tasks = await request(path);
    drawTasks();
  } catch (error) {
    showError(error.message);
  }
  submit.disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      showError('Task title is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    alert.hidden = true;
    try {
      const task = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      tasks.push(task);
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.replaceChildren(projectsButton());
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.append(element('h1', project.name));
      document.title = `${project.name} · Workboard`;
      await renderTasks(project.id);
    } catch (error) {
      app.append(element('p', error.message, { role: 'alert' }));
    }
    app.setAttribute('aria-busy', 'false');
    return;
  }

  const heading = element('h1', 'Workboard');
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', class: 'alert', hidden: '' });
  const list = element('ul', undefined, { class: 'projects', 'aria-label': 'Projects' });
  const empty = element('p', 'No projects yet. Create your first project above.', { class: 'empty' });
  form.append(label, input, submit);
  app.replaceChildren(heading, form, alert, list, empty);

  const showError = message => {
    alert.textContent = message;
    alert.hidden = false;
  };

  // Wait for the initial list so new rows always follow existing projects.
  submit.disabled = true;
  try {
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map(projectRow));
    empty.hidden = projects.length > 0;
  } catch (error) {
    showError(error.message);
  }
  submit.disabled = false;
  app.setAttribute('aria-busy', 'false');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    alert.hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      empty.hidden = true;
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

render();
