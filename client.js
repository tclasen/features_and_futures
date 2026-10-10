const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  if (options.type) node.type = options.type;
  if (options.label) node.setAttribute('aria-label', options.label);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showError(message) {
  const alert = element('p', { className: 'alert', text: message });
  alert.setAttribute('role', 'alert');
  const previous = app.querySelector('[role="alert"]');
  previous?.remove();
  app.prepend(alert);
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function showProjects() {
  const heading = element('h1', { text: 'Workboard' });
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Project name' });
  label.htmlFor = 'project-name';
  const input = element('input', { type: 'text' });
  input.id = 'project-name';
  input.name = 'name';
  const submit = element('button', { type: 'submit', text: 'Create project' });
  form.append(label, input, submit);
  const filterLabel = element('label', { text: 'Project filter' });
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', { text: value });
    option.value = value;
    filter.append(option);
  }
  const list = element('div', { className: 'project-list' });
  const drawProjects = async () => {
    const archived = filter.value === 'Archived';
    const projects = await request(`/api/projects?archived=${archived}`);
    list.replaceChildren();
    for (const project of projects) {
      const row = element('article', { className: 'project-row' });
      row.dataset.testid = 'project-row';
      const details = element('div', { className: 'project-details' });
      details.append(element('span', { text: project.name }));
      const summary = element('span', { className: 'project-summary', text: `${project.completedCount}/${project.totalCount} completed` });
      summary.dataset.testid = 'project-summary';
      details.append(summary);
      const actions = element('div', { className: 'project-actions' });
      const open = element('button', { type: 'button', text: 'Open project' });
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      actions.append(open);
      const archive = element('button', { type: 'button', text: archived ? 'Restore project' : 'Archive project' });
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${project.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !archived })
          });
          await drawProjects();
        } catch (error) { showError(error.message); }
      });
      actions.append(archive);
      row.append(details, actions);
      list.append(row);
    }
  };
  filter.addEventListener('change', drawProjects);
  await drawProjects();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      showError('Project name is required');
      input.focus();
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      render();
    } catch (error) {
      showError(error.message);
    }
  });
  app.replaceChildren(heading, form, filterLabel, filter, list);
}

async function showProject(id) {
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const heading = element('h1', { text: project.name });
    const back = element('button', { type: 'button', text: 'Projects' });
    back.addEventListener('click', () => navigate('/'));
    const archived = Boolean(project.archived);
    const renameForm = element('form', { className: 'create-form' });
    const renameLabel = element('label', { text: 'New project name' });
    renameLabel.htmlFor = 'new-project-name';
    const renameInput = element('input', { type: 'text' });
    renameInput.id = 'new-project-name';
    renameInput.name = 'name';
    renameInput.disabled = archived;
    const renameButton = element('button', { type: 'submit', text: 'Rename project' });
    renameButton.disabled = archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        showError('Project name is required');
        renameInput.focus();
        return;
      }
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        heading.textContent = updated.name;
        renameInput.value = '';
      } catch (error) { showError(error.message); }
    });
    const form = element('form', { className: 'create-form' });
    const label = element('label', { text: 'Task title' });
    label.htmlFor = 'task-title';
    const input = element('input', { type: 'text' });
    input.id = 'task-title';
    input.name = 'title';
    const submit = element('button', { type: 'submit', text: 'Create task' });
    if (archived) {
      const status = element('p', { text: 'Archived project' });
      status.className = 'archived-status';
      app.append(status);
      submit.disabled = true;
      input.disabled = true;
    }
    form.append(label, input, submit);

    const filterLabel = element('label', { text: 'Task filter' });
    filterLabel.htmlFor = 'task-filter';
    const filter = element('select');
    filter.id = 'task-filter';
    for (const value of ['All', 'Open', 'Completed']) {
      const option = element('option', { text: value });
      option.value = value;
      filter.append(option);
    }
    const list = element('div', { className: 'task-list' });
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    const drawTasks = () => {
      list.replaceChildren();
      for (const task of tasks) {
        const completed = Boolean(task.completed);
        if (filter.value === 'Open' && completed) continue;
        if (filter.value === 'Completed' && !completed) continue;
        const row = element('article', { className: 'task-row' });
        row.dataset.testid = 'task-row';
        row.append(element('span', { text: task.title }));
        const checkbox = element('input', { type: 'checkbox', label: `Complete ${task.title}` });
        checkbox.checked = completed;
        checkbox.disabled = archived;
        checkbox.addEventListener('change', async () => {
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked })
            });
            task.completed = updated.completed;
            drawTasks();
          } catch (error) {
            showError(error.message);
            checkbox.checked = !checkbox.checked;
          }
        });
        row.append(checkbox);
        list.append(row);
      }
    };
    filter.addEventListener('change', drawTasks);
    drawTasks();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        showError('Task title is required');
        input.focus();
        return;
      }
      try {
        const task = await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        tasks.push(task);
        input.value = '';
        drawTasks();
      } catch (error) {
        showError(error.message);
      }
    });
    app.replaceChildren(heading, back, renameForm);
    if (archived) {
      const status = element('p', { text: 'Archived project' });
      status.className = 'archived-status';
      app.append(status);
    }
    app.append(form, filterLabel, filter, list);
  } catch {
    app.replaceChildren(element('h1', { text: 'Project not found' }));
    const back = element('button', { type: 'button', text: 'Projects' });
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
  }
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  try {
    if (match) await showProject(match[1]);
    else await showProjects();
  } catch {
    showError('Unable to load projects');
  }
}

window.addEventListener('popstate', render);
render();
