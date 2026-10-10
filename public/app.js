const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function renderProjects(projects) {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', 'aria-label': 'Project name' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', undefined, { role: 'alert', hidden: '' });
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      projects.push(project);
      renderProjects(projects);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  const list = element('ul');
  for (const project of projects) {
    const row = element('li', undefined, { 'data-testid': 'project-row' });
    row.append(
      element('span', project.name, { class: 'project-name' }),
      element('button', 'Open project', { type: 'button' }),
    );
    row.querySelector('button').addEventListener('click', () => {
      window.location.href = `/projects/${encodeURIComponent(project.id)}`;
    });
    list.append(row);
  }
  app.append(form, alert, list);
}

async function renderProject(id) {
  app.replaceChildren();
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back, element('h1', project.name));

    const form = element('form');
    const label = element('label', 'Task title', { for: 'task-title' });
    const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text', 'aria-label': 'Task title' });
    const submit = element('button', 'Create task', { type: 'submit' });
    const alert = element('p', undefined, { role: 'alert', hidden: '' });
    form.append(label, input, submit);

    const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
    const filter = element('select', undefined, { id: 'task-filter', 'aria-label': 'Task filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
    const list = element('ul');
    let tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    const renderTasks = () => {
      const matching = tasks.filter((task) => filter.value === 'All'
        || (filter.value === 'Completed' ? Boolean(task.completed) : !task.completed));
      list.replaceChildren();
      for (const task of matching) {
        const row = element('li', undefined, { 'data-testid': 'task-row' });
        const checkbox = element('input', undefined, {
          type: 'checkbox',
          'aria-label': `Complete ${task.title}`,
        });
        checkbox.checked = Boolean(task.completed);
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            task.completed = updated.completed;
            renderTasks();
          } catch (error) {
            checkbox.checked = Boolean(task.completed);
            alert.textContent = error.message;
            alert.hidden = false;
          } finally {
            checkbox.disabled = false;
          }
        });
        row.append(element('span', task.title), checkbox);
        list.append(row);
      }
    };
    filter.addEventListener('change', renderTasks);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;
      try {
        const task = await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: input.value }),
        });
        tasks.push(task);
        input.value = '';
        renderTasks();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    renderTasks();
    app.append(form, alert, filterLabel, filter, list);
  } catch {
    app.append(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1]));
else request('/api/projects').then(renderProjects).catch(() => {
  app.replaceChildren(element('h1', 'Workboard'), element('p', 'Unable to load projects.'));
});
