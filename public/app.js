const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const rows = element('section', undefined, { 'aria-label': 'Projects' });
  const filterLabel = element('label', 'Project filter', { for: 'project-filter' });
  const filter = element('select', undefined, { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value: value.toLowerCase() }));
  form.append(label, input, submit);
  app.append(form, alert, filterLabel, filter, rows);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      alert.hidden = true;
      input.value = '';
      await loadProjects();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  async function loadProjects() {
    try {
    const projects = await request('/api/projects');
    rows.replaceChildren();
    for (const project of projects) {
      if (project.archived !== (filter.value === 'archived')) continue;
      const row = element('article', undefined, { 'data-testid': 'project-row' });
      const summary = element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' });
      row.append(element('span', project.name), summary);
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => go(`/projects/${project.id}`));
      row.append(open);
      const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
          await loadProjects();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      row.append(archive);
      rows.append(row);
    }
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  }
  filter.addEventListener('change', loadProjects);
  await loadProjects();
}

async function renderProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => go('/'));
  app.append(back);
  try {
    const project = await request(`/api/projects/${id}`);
    app.append(element('h1', project.name));
    if (project.archived) app.append(element('p', 'Archived project'));
    const form = element('form');
    const label = element('label', 'Task title', { for: 'task-title' });
    const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
    const submit = element('button', 'Create task', { type: 'submit' });
    if (project.archived) { input.disabled = true; submit.disabled = true; }
    const alert = element('p', '', { role: 'alert', hidden: '' });
    form.append(label, input, submit);

    const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
    const filter = element('select', undefined, { id: 'task-filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value: value.toLowerCase() }));
    const rows = element('section', undefined, { 'aria-label': 'Tasks' });
    app.append(form, alert, filterLabel, filter, rows);

    let tasks = [];
    function showTasks() {
      rows.replaceChildren();
      const selected = filter.value;
      for (const task of tasks) {
        if (selected === 'open' && task.completed || selected === 'completed' && !task.completed) continue;
        const row = element('article', undefined, { 'data-testid': 'task-row' });
        row.append(element('span', task.title));
        const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
        checkbox.checked = task.completed;
        checkbox.disabled = project.archived;
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          try {
            await request(`/api/projects/${id}/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
            task.completed = checkbox.checked;
            showTasks();
          } catch (error) {
            checkbox.checked = task.completed;
            alert.textContent = error.message;
            alert.hidden = false;
            checkbox.disabled = false;
          }
        });
        row.append(checkbox);
        rows.append(row);
      }
    }
    async function loadTasks() {
      tasks = await request(`/api/projects/${id}/tasks`);
      showTasks();
    }
    filter.addEventListener('change', showTasks);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        alert.textContent = 'Task title is required';
        alert.hidden = false;
        input.focus();
        return;
      }
      try {
        await request(`/api/projects/${id}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
        input.value = '';
        alert.hidden = true;
        await loadTasks();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    await loadTasks();
  } catch (error) {
    app.append(element('p', error.message, { role: 'alert' }));
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) await renderProject(match[1]);
  else await renderList();
}

window.addEventListener('popstate', render);
render();
