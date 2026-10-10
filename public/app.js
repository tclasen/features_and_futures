const root = document.querySelector('#app');

function heading(text) {
  const h = document.createElement('h1');
  h.textContent = text;
  return h;
}

async function render() {
  root.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = document.createElement('button');
    back.className = 'back-button';
    back.textContent = 'Projects';
    back.addEventListener('click', () => { location.href = '/'; });
    root.append(back);
    const response = await fetch(`/api/projects/${match[1]}`);
    if (!response.ok) {
      const title = heading('Project not found');
      root.append(title);
      return;
    }
    const project = await response.json();
    root.append(heading(project.name));
    if (project.archived) {
      const notice = document.createElement('p');
      notice.textContent = 'Archived project';
      notice.dataset.testid = 'archived-notice';
      root.append(notice);
    }
    const renameForm = document.createElement('form');
    renameForm.className = 'create-form';
    const renameLabel = document.createElement('label');
    renameLabel.className = 'field';
    renameLabel.textContent = 'New project name';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.name = 'name';
    renameInput.autocomplete = 'off';
    renameInput.setAttribute('aria-label', 'New project name');
    renameInput.disabled = project.archived;
    renameLabel.append(renameInput);
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename project';
    renameButton.disabled = project.archived;
    renameForm.append(renameLabel, renameButton);
    root.append(renameForm);
    const form = document.createElement('form');
    form.className = 'create-form';
    const label = document.createElement('label');
    label.className = 'field';
    label.textContent = 'Task title';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'title';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Task title');
    label.append(input);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Create task';
    submit.disabled = project.archived;
    form.append(label, submit);
    root.append(form);
    const alertBox = document.createElement('div');
    alertBox.className = 'alert';
    alertBox.setAttribute('role', 'alert');
    alertBox.hidden = true;
    root.append(alertBox);

    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      alertBox.hidden = true;
      const name = renameInput.value.trim();
      if (!name) {
        alertBox.textContent = 'Project name is required';
        alertBox.hidden = false;
        return;
      }
      const renamed = await fetch(`/api/projects/${match[1]}/rename`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      if (renamed.ok) await render();
    });

    const filterLabel = document.createElement('label');
    filterLabel.className = 'filter-field';
    filterLabel.textContent = 'Task filter';
    const filter = document.createElement('select');
    filter.setAttribute('aria-label', 'Task filter');
    for (const value of ['All', 'Open', 'Completed']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      filter.append(option);
    }
    filterLabel.append(filter);
    root.append(filterLabel);
    const list = document.createElement('div');
    list.className = 'task-list';
    root.append(list);

    async function loadTasks() {
      const tasksResponse = await fetch(`/api/projects/${match[1]}/tasks`);
      const tasks = await tasksResponse.json();
      list.replaceChildren();
      const matching = tasks.filter(task => filter.value === 'All' || (filter.value === 'Open' ? !task.completed : task.completed));
      if (!matching.length) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = tasks.length ? 'No tasks match this filter.' : 'No tasks yet.';
        list.append(empty);
        return;
      }
      for (const task of matching) {
        const row = document.createElement('div');
        row.className = 'task-row';
        row.dataset.testid = 'task-row';
        const title = document.createElement('span');
        title.className = 'task-title';
        title.textContent = task.title;
        const checkboxLabel = document.createElement('label');
        checkboxLabel.className = 'task-check';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = project.archived;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          const saved = await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked })
          });
          if (saved.ok) await loadTasks();
        });
        checkboxLabel.append(checkbox);
        row.append(title, checkboxLabel);
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.setAttribute('aria-label', 'New task title');
        renameInput.autocomplete = 'off';
        renameInput.disabled = project.archived;
        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.textContent = 'Rename task';
        renameButton.disabled = project.archived;
        renameButton.addEventListener('click', async () => {
          alertBox.hidden = true;
          const newTitle = renameInput.value.trim();
          if (!newTitle) {
            alertBox.textContent = 'Task title is required';
            alertBox.hidden = false;
            return;
          }
          const renamed = await fetch(`/api/tasks/${task.id}/rename`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle })
          });
          if (renamed.ok) await loadTasks();
        });
        row.append(renameInput, renameButton);
        list.append(row);
      }
    }
    filter.addEventListener('change', loadTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      alertBox.hidden = true;
      const title = input.value.trim();
      if (!title) {
        alertBox.textContent = 'Task title is required';
        alertBox.hidden = false;
        return;
      }
      const created = await fetch(`/api/projects/${match[1]}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
      });
      if (created.ok) {
        input.value = '';
        filter.value = 'All';
        await loadTasks();
      }
    });
    await loadTasks();
    return;
  }

  root.append(heading('Workboard'));
  const form = document.createElement('form');
  form.className = 'create-form';
  const label = document.createElement('label');
  label.className = 'field';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'name';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Project name');
  label.append(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  form.append(label, submit);
  root.append(form);
  const alertBox = document.createElement('div');
  alertBox.className = 'alert';
  alertBox.setAttribute('role', 'alert');
  alertBox.hidden = true;
  root.append(alertBox);
  const filterLabel = document.createElement('label');
  filterLabel.className = 'filter-field';
  filterLabel.textContent = 'Project filter';
  const filter = document.createElement('select');
  filter.setAttribute('aria-label', 'Project filter');
  for (const value of ['Active', 'Archived']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  root.append(filterLabel);
  const list = document.createElement('div');
  list.className = 'project-list';
  root.append(list);

  let projectLoad = 0;
  async function loadProjects() {
    const loadId = ++projectLoad;
    list.replaceChildren();
    const response = await fetch('/api/projects');
    const projects = await response.json();
    // Ignore stale responses when multiple renders are requested in quick succession.
    if (loadId !== projectLoad) return;
    const matching = projects.filter(project => project.archived === (filter.value === 'Archived'));
    if (!matching.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No projects yet.';
      list.append(empty);
      return;
    }
    for (const project of matching) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.className = 'project-name';
      name.textContent = project.name;
      const summary = document.createElement('span');
      summary.dataset.testid = 'project-summary';
      summary.textContent = `${project.completed}/${project.total} completed`;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(name, summary, open);
      const stateButton = document.createElement('button');
      stateButton.type = 'button';
      stateButton.textContent = project.archived ? 'Restore project' : 'Archive project';
      stateButton.addEventListener('click', async () => {
        const changed = await fetch(`/api/projects/${project.id}/archive`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived })
        });
        if (changed.ok) await loadProjects();
      });
      row.append(stateButton);
      list.append(row);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    alertBox.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alertBox.textContent = 'Project name is required';
      alertBox.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      await loadProjects();
    }
  });
  filter.addEventListener('change', loadProjects);
  await loadProjects();
}

render();
