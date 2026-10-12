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

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    try {
      const project = await request(`/api/projects/${match[1]}`);
      const back = element('button', 'Projects', 'back');
      back.type = 'button';
      back.addEventListener('click', () => navigate('/'));
      app.append(back, element('h1', project.name));
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'Task title');
      const submit = element('button', 'Create task');
      submit.type = 'submit';
      form.append(input, submit);
      const alert = element('p', '');
      alert.setAttribute('role', 'alert');
      const filter = document.createElement('select');
      filter.setAttribute('aria-label', 'Task filter');
      for (const value of ['All', 'Open', 'Completed']) {
        const option = element('option', value);
        option.value = value;
        filter.append(option);
      }
      const list = element('section');
      list.setAttribute('aria-label', 'Tasks');
      app.append(form, alert, filter, list);
      async function refreshTasks() {
        const tasks = await request(`/api/projects/${project.id}/tasks`);
        list.replaceChildren(...tasks.filter(task => filter.value === 'All' || (filter.value === 'Completed') === Boolean(task.completed)).map(task => {
          const row = element('div');
          row.dataset.testid = 'task-row';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(task.completed);
          checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          checkbox.addEventListener('change', async () => {
            await request(`/api/projects/${project.id}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
            await refreshTasks();
          });
          row.append(checkbox, element('span', task.title));
          return row;
        }));
      }
      filter.addEventListener('change', refreshTasks);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { alert.textContent = 'Task title is required'; input.focus(); return; }
        try {
          await request(`/api/projects/${project.id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
          alert.textContent = '';
          input.value = '';
          await refreshTasks();
        } catch (error) { alert.textContent = error.message; }
      });
      await refreshTasks();
    } catch {
      app.append(element('h1', 'Project not found'));
      const back = element('button', 'Projects', 'back');
      back.type = 'button';
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
    }
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'name';
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(input, submit);
  const alert = element('p', '', '');
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-live', 'polite');
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, alert, list);

  async function refresh() {
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map(project => {
      const row = element('div', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name, 'project-name'));
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      return row;
    }));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      input.focus();
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      alert.textContent = '';
      input.value = '';
      await refresh();
    } catch (error) {
      alert.textContent = error.message;
    }
  });
  await refresh();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

window.addEventListener('popstate', render);
render();
