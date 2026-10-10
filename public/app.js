const content = document.querySelector('#content');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showProjects() {
  content.replaceChildren();
  const heading = element('h1', 'Workboard');
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  const alert = element('p', undefined, 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  form.append(label, input, submit);
  const projectList = element('div', undefined, 'project-list');
  projectList.setAttribute('aria-label', 'Projects');
  content.append(heading, form, alert, filterLabel, projectList);

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
      await renderRows(projectList, filter);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  filter.addEventListener('change', () => renderRows(projectList, filter));
  await renderRows(projectList, filter);
}

async function renderRows(list, filter) {
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects.filter((item) => item.archived === (filter.value === 'Archived'))) {
    const row = element('article', undefined, 'project-row');
    row.dataset.testid = 'project-row';
    const name = element('span', project.name, 'project-name');
    const summary = element('span', `${project.completedCount}/${project.totalCount} completed`, 'project-summary');
    summary.dataset.testid = 'project-summary';
    const open = element('button', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
    archive.type = 'button';
    archive.addEventListener('click', async () => {
      await request(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
      await renderRows(list, filter);
    });
    row.append(name, summary, open, archive);
    list.append(row);
  }
}

async function showProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  content.replaceChildren();
  const back = element('button', 'Projects', 'back-button');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  const heading = element('h1', project.name);
  const archivedNotice = project.archived ? element('p', 'Archived project', 'archived-notice') : null;
  const renameForm = element('form', undefined, 'create-form rename-form');
  const renameLabel = element('label', 'New project name');
  renameLabel.htmlFor = 'new-project-name';
  const renameInput = element('input');
  renameInput.id = 'new-project-name';
  renameInput.name = 'name';
  renameInput.type = 'text';
  renameInput.autocomplete = 'off';
  renameInput.disabled = project.archived;
  const renameButton = element('button', 'Rename project');
  renameButton.type = 'submit';
  renameButton.disabled = project.archived;
  renameForm.append(renameLabel, renameInput, renameButton);
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.name = 'title';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  submit.disabled = project.archived;
  input.disabled = project.archived;
  const alert = element('p', undefined, 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit);

  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  const priorityFilterLabel = element('label', 'Priority filter');
  priorityFilterLabel.htmlFor = 'priority-filter';
  const priorityFilter = element('select');
  priorityFilter.id = 'priority-filter';
  for (const value of ['All', 'Low', 'Normal', 'High']) {
    const option = element('option', value);
    option.value = value;
    priorityFilter.append(option);
  }
  priorityFilterLabel.append(priorityFilter);
  const taskList = element('div', undefined, 'task-list');
  taskList.setAttribute('aria-label', 'Tasks');
  if (archivedNotice) content.append(back, heading, archivedNotice, renameForm, form, alert, filterLabel, priorityFilterLabel, taskList);
  else content.append(back, heading, renameForm, form, alert, filterLabel, priorityFilterLabel, taskList);

  renameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      const renamed = await request(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: renameInput.value }),
      });
      heading.textContent = renamed.name;
      renameInput.value = '';
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  const renderTasks = async () => {
    const tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    taskList.replaceChildren();
    const matchingTasks = tasks.filter((task) => (filter.value === 'All'
      || (filter.value === 'Completed' ? task.completed : !task.completed))
      && (priorityFilter.value === 'All' || task.priority === priorityFilter.value));
    for (const task of matchingTasks) {
      const row = element('article', undefined, 'task-row');
      row.dataset.testid = 'task-row';
      const checkboxLabel = element('label', undefined, 'task-check');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = project.archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          await request(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          await renderTasks();
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          alert.textContent = error.message;
          alert.hidden = false;
        } finally {
          checkbox.disabled = false;
        }
      });
      checkboxLabel.append(checkbox, element('span', task.title, 'task-title'));
      const renameForm = element('form', undefined, 'create-form task-rename-form');
      const renameLabel = element('label', 'New task title');
      renameLabel.htmlFor = `new-task-title-${task.id}`;
      const renameInput = element('input');
      renameInput.id = `new-task-title-${task.id}`;
      renameInput.type = 'text';
      renameInput.value = task.title;
      renameInput.disabled = project.archived;
      const renameButton = element('button', 'Rename task');
      renameButton.type = 'submit';
      renameButton.disabled = project.archived;
      renameForm.append(renameLabel, renameInput, renameButton);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        alert.hidden = true;
        try {
          await request(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: renameInput.value }),
          });
          await renderTasks();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        }
      });
      const priorityLabel = element('label', 'Task priority');
      const priority = element('select');
      priority.setAttribute('aria-label', 'Task priority');
      priority.disabled = project.archived;
      for (const value of ['Low', 'Normal', 'High']) {
        const option = element('option', value);
        option.value = value;
        priority.append(option);
      }
      priority.value = task.priority;
      priority.addEventListener('change', async () => {
        const previousPriority = task.priority;
        priority.disabled = true;
        try {
          await request(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          task.priority = priority.value;
          await renderTasks();
        } catch (error) {
          priority.value = previousPriority;
          alert.textContent = error.message;
          alert.hidden = false;
        } finally {
          priority.disabled = project.archived;
        }
      });
      priorityLabel.append(priority);
      row.append(checkboxLabel, renameForm, priorityLabel);
      taskList.append(row);
    }
  };

  filter.addEventListener('change', () => { renderTasks().catch(() => {}); });
  priorityFilter.addEventListener('change', () => { renderTasks().catch(() => {}); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: input.value }),
      });
      input.value = '';
      filter.value = 'All';
      await renderTasks();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  await renderTasks();
}

const route = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (route) {
  showProject(route[1]).catch(() => { location.href = '/'; });
} else {
  showProjects().catch(() => {
    content.textContent = 'Unable to load Workboard.';
  });
}
