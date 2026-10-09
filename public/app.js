const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function projectRow(project) {
  const row = element('li', '', { 'data-testid': 'project-row', class: 'project-row' });
  const button = element('button', 'Open project', { type: 'button' });
  button.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), button);
  return row;
}

async function showProjects() {
  const projects = await api('/api/projects');
  const heading = element('h1', 'Workboard');
  const intro = element('p', 'A place for your projects.', { class: 'intro' });
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', class: 'alert' });
  alert.hidden = true;
  const list = element('ul', '', { class: 'projects', 'aria-label': 'Projects' });
  const empty = element('p', 'No projects yet. Create your first project above.', { class: 'empty' });
  empty.hidden = projects.length > 0;
  list.append(...projects.map(projectRow));
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!input.value.trim()) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      list.append(projectRow(project));
      empty.hidden = true;
      input.value = '';
      input.focus();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  app.replaceChildren(heading, intro, form, alert, element('h2', 'Projects'), empty, list);
}

async function showProject(id) {
  const back = element('button', 'Projects', { type: 'button', class: 'back' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.replaceChildren(back);
  const project = await api(`/api/projects/${id}`);
  document.title = `${project.name} · Workboard`;
  app.append(element('h1', project.name));
  const taskPath = `/api/projects/${id}/tasks`;
  const tasks = await api(taskPath);
  const form = element('form');
  const input = element('input', '', { id: 'task-title', name: 'title', type: 'text' });
  const submit = element('button', 'Create task', { type: 'submit' });
  form.append(element('label', 'Task title', { for: 'task-title' }), input, submit);
  const alert = element('p', '', { role: 'alert', class: 'alert' });
  alert.hidden = true;
  const showError = (message) => {
    alert.textContent = message;
    alert.hidden = false;
  };
  const filter = element('select', '', { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) {
    filter.append(element('option', value, { value }));
  }
  const filterControls = element('div', '', { class: 'task-filter' });
  filterControls.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('ul', '', { class: 'tasks', 'aria-label': 'Tasks' });
  const empty = element('p', '', { class: 'empty' });

  function renderTasks() {
    const visible = tasks.filter((task) => filter.value === 'All'
      || (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map((task) => {
      const row = element('li', '', { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', '', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
      checkbox.checked = task.completed;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const saved = await api(`${taskPath}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(checkbox, element('span', task.title));
      return row;
    }));
    empty.textContent = tasks.length ? 'No tasks match this filter.' : 'No tasks yet. Create your first task above.';
    empty.hidden = visible.length > 0;
  }

  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!input.value.trim()) {
      showError('Task title is required');
      input.focus();
      return;
    }
    submit.disabled = true;
    try {
      const task = await api(taskPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  renderTasks();
  app.append(form, alert, element('h2', 'Tasks'), filterControls, empty, list);
}

try {
  const route = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (route) await showProject(route[1]);
  else await showProjects();
} catch (error) {
  app.append(element('p', error.message, { role: 'alert', class: 'alert' }));
} finally {
  app.setAttribute('aria-busy', 'false');
}
