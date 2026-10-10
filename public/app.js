const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load Workboard');
  return result;
}

function projectRow(project, onArchive, showError) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  const details = element('div', undefined, { class: 'project-details' });
  details.append(element('span', project.name), element('span',
    `${project.completed_count}/${project.total_count} completed`, { 'data-testid': 'project-summary', class: 'summary' }));
  const actions = element('div', undefined, { class: 'project-actions' });
  const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      Object.assign(project, saved);
      onArchive();
    } catch (error) {
      showError(error);
      archive.disabled = false;
    }
  });
  actions.append(open, archive);
  row.append(details, actions);
  return row;
}

function renderRename(project, heading) {
  const form = element('form', undefined, { class: 'rename-form' });
  const input = element('input', undefined, {
    id: 'new-project-name', name: 'name', type: 'text', autocomplete: 'off',
  });
  input.value = project.name;
  input.disabled = project.archived;
  const rename = element('button', 'Rename project', { type: 'submit' });
  rename.disabled = project.archived;
  const controls = element('div', undefined, { class: 'controls' });
  controls.append(input, rename);
  const alert = element('p', '', { role: 'alert', class: 'alert' });
  alert.hidden = true;
  form.append(element('label', 'New project name', { for: 'new-project-name' }), controls, alert);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (project.archived) return;
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    rename.disabled = true;
    try {
      const saved = await api(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      Object.assign(project, saved);
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      input.value = project.name;
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      rename.disabled = project.archived;
    }
  });
  app.append(form);
}

async function renderTasks(projectId, archived) {
  const form = element('form');
  const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create task', { type: 'submit', class: 'primary' });
  create.disabled = true;
  const controls = element('div', undefined, { class: 'controls' });
  controls.append(input, create);
  const alert = element('p', '', { role: 'alert', class: 'alert' });
  alert.hidden = true;
  form.append(element('label', 'Task title', { for: 'task-title' }), controls, alert);
  const filterControls = element('div', undefined, { class: 'task-filter' });
  const filter = element('select', undefined, { id: 'task-filter' });
  for (const value of ['All', 'Open', 'Completed']) {
    filter.append(element('option', value, { value }));
  }
  filter.value = 'All';
  filterControls.append(element('label', 'Task filter', { for: 'task-filter' }), filter);
  const list = element('section', undefined, { 'aria-label': 'Tasks', class: 'task-list' });
  app.append(form, filterControls, list);
  const path = `/api/projects/${projectId}/tasks`;
  const tasks = await api(path);

  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }

  function refresh() {
    const visible = tasks.filter((task) => filter.value === 'All' ||
      (filter.value === 'Completed' ? task.completed : !task.completed));
    list.replaceChildren(...visible.map((task) => {
      const row = element('div', undefined, { 'data-testid': 'task-row', class: 'task-row' });
      const checkbox = element('input', undefined, {
        type: 'checkbox', 'aria-label': `Complete ${task.title}`,
      });
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
        } catch (error) {
          showError(error);
        } finally {
          refresh();
        }
      });
      row.append(checkbox, element('span', task.title));
      const renameForm = element('form', undefined, { class: 'task-rename-form' });
      const renameInput = element('input', undefined, {
        id: `new-task-title-${task.id}`, type: 'text', name: 'title', autocomplete: 'off',
      });
      renameInput.value = task.title;
      renameInput.disabled = archived;
      const rename = element('button', 'Rename task', { type: 'submit' });
      rename.disabled = archived;
      const renameControls = element('div', undefined, { class: 'controls' });
      renameControls.append(renameInput, rename);
      renameForm.append(element('label', 'New task title', { for: renameInput.id }), renameControls);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (archived) return;
        alert.hidden = true;
        const title = renameInput.value.trim();
        if (!title) {
          showError(new Error('Task title is required'));
          renameInput.focus();
          return;
        }
        rename.disabled = true;
        try {
          const saved = await api(`${path}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
          });
          Object.assign(task, saved);
          refresh();
        } catch (error) {
          showError(error);
        } finally {
          rename.disabled = archived;
        }
      });
      row.append(renameForm);
      return row;
    }));
    if (!visible.length) list.append(element('p', 'No tasks to show.', { class: 'empty' }));
  }

  filter.addEventListener('change', refresh);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (archived) return;
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) {
      showError(new Error('Task title is required'));
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      tasks.push(await api(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      refresh();
      input.value = '';
      input.focus();
    } catch (error) {
      showError(error);
    } finally {
      create.disabled = archived;
    }
  });
  refresh();
  create.disabled = archived;
}

async function render() {
  app.replaceChildren();
  const projectId = window.location.pathname.match(/^\/projects\/(\d+)$/)?.[1];
  if (projectId) {
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
    const project = await api(`/api/projects/${projectId}`);
    document.title = `${project.name} · Workboard`;
    const heading = element('h1', project.name);
    app.append(heading);
    if (project.archived) app.append(element('p', 'Archived project'));
    renderRename(project, heading);
    await renderTasks(projectId, project.archived);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', autocomplete: 'off' });
  const create = element('button', 'Create project', { type: 'submit', class: 'primary' });
  create.disabled = true;
  const controls = element('div', undefined, { class: 'controls' });
  controls.append(input, create);
  const alert = element('p', '', { role: 'alert', class: 'alert' });
  alert.hidden = true;
  form.append(label, controls, alert);
  const filterControls = element('div', undefined, { class: 'project-filter' });
  const filter = element('select', undefined, { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) {
    filter.append(element('option', value, { value }));
  }
  filter.value = 'Active';
  filterControls.append(element('label', 'Project filter', { for: 'project-filter' }), filter);
  const list = element('section', undefined, { 'aria-label': 'Projects', class: 'project-list' });
  app.append(form, filterControls, list);
  const projects = await api('/api/projects');
  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
  function refresh() {
    const visible = projects.filter((project) => project.archived === (filter.value === 'Archived'));
    list.replaceChildren(...visible.map((project) => projectRow(project, refresh, showError)));
    if (!visible.length) list.append(element('p', filter.value === 'Archived'
      ? 'No archived projects.' : 'No projects yet. Create a project to get started.', { class: 'empty' }));
  }
  filter.addEventListener('change', refresh);
  refresh();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      projects.push(project);
      refresh();
      input.value = '';
      input.focus();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally {
      create.disabled = false;
    }
  });
  create.disabled = false;
}

render().catch((error) => {
  app.append(element('p', error.message, { role: 'alert', class: 'alert' }));
}).finally(() => app.setAttribute('aria-busy', 'false'));
