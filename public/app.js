const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project, onArchiveChange) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const updated = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onArchiveChange(updated);
      app.querySelector('[role="alert"]')?.remove();
    } catch (error) {
      showAlert(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(element('span', project.name), element('span', `${project.completed_count}/${project.total_count} completed`, {
    'data-testid': 'project-summary',
  }), open, archive);
  return row;
}

async function showProjects() {
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, submit);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  const filter = element('select', undefined, { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  app.append(form, element('label', 'Project filter', { for: 'project-filter' }), filter, list);
  let projects = await request('/api/projects');
  function renderProjects() {
    list.replaceChildren();
    for (const project of projects) {
      if (project.archived !== (filter.value === 'Archived')) continue;
      list.append(projectRow(project, (updated) => {
        projects = projects.map((existing) => existing.id === updated.id ? updated : existing);
        renderProjects();
      }));
    }
  }
  filter.addEventListener('change', renderProjects);
  renderProjects();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) return showAlert('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      projects.push(project);
      renderProjects();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

async function showProject(id) {
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const project = await request(`/api/projects/${id}`);
  app.append(element('h1', project.name));
  if (project.archived) app.append(element('p', 'Archived project'));
  document.title = `${project.name} · Workboard`;
  const form = element('form');
  const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
  const submit = element('button', 'Create task', { type: 'submit' });
  submit.disabled = project.archived;
  form.append(element('label', 'Task title', { for: 'task-title' }), input, submit);
  const filter = element('select', undefined, { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) {
    filter.append(element('option', value, { value }));
  }
  const list = element('section', undefined, { 'aria-label': 'Tasks' });
  app.append(form, element('label', 'Task filter', { for: 'task-filter' }), filter, list);
  let tasks = await request(`/api/projects/${id}/tasks`);

  function renderTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', undefined, {
        type: 'checkbox', 'aria-label': `Complete ${task.title}`,
      });
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          const updated = await request(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          tasks = tasks.map((existing) => existing.id === updated.id ? updated : existing);
          app.querySelector('[role="alert"]')?.remove();
          renderTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showAlert(error.message);
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(checkbox, element('span', task.title));
      list.append(row);
    }
  }

  filter.addEventListener('change', renderTasks);
  renderTasks();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    if (!input.value.trim()) return showAlert('Task title is required');
    submit.disabled = true;
    try {
      const task = await request(`/api/projects/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      tasks.push(task);
      renderTasks();
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
