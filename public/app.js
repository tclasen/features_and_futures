const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showProjects() {
  app.replaceChildren();
  const heading = element('h1', 'Workboard');
  const form = document.createElement('form');
  form.className = 'project-form';
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = document.createElement('input');
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
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  app.append(heading, form, alert, list);

  async function refresh() {
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map((project) => {
      const row = element('article', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      const name = element('span', project.name);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(name, open);
      return row;
    }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      input.value = '';
      await refresh();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  await refresh();
}

async function showProject(id) {
  app.replaceChildren();
  const project = await request(`/api/projects/${id}`);
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => navigate('/'));
  const heading = element('h1', project.name);
  const form = document.createElement('form');
  form.className = 'task-form';
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = document.createElement('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  form.append(label, input, submit);

  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const name of ['All', 'Open', 'Completed']) {
    const option = element('option', name);
    option.value = name.toLowerCase();
    filter.append(option);
  }
  const list = element('section', undefined, 'task-list');
  list.setAttribute('aria-label', 'Tasks');
  app.append(back, heading, form, alert, filterLabel, filter, list);

  async function refresh() {
    const tasks = await request(`/api/projects/${id}/tasks`);
    const visibleTasks = tasks.filter((task) => filter.value === 'all'
      || (filter.value === 'completed' ? Boolean(task.completed) : !task.completed));
    list.replaceChildren(...visibleTasks.map((task) => {
      const row = element('article', undefined, 'task-row');
      row.dataset.testid = 'task-row';
      const title = element('span', task.title);
      const checkboxLabel = document.createElement('label');
      checkboxLabel.className = 'task-completion';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        try {
          await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          await refresh();
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      checkboxLabel.append(checkbox);
      row.append(title, checkboxLabel);
      return row;
    }));
  }

  filter.addEventListener('change', refresh);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request(`/api/projects/${id}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      input.value = '';
      await refresh();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  await refresh();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  try {
    const match = location.pathname.match(/^\/projects\/(\d+)$/);
    if (match) await showProject(match[1]);
    else await showProjects();
  } catch {
    app.replaceChildren(element('p', 'Project not found.', 'alert'));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
  }
}

window.addEventListener('popstate', render);
render();
