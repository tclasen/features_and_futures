const app = document.querySelector('#app');

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const projects = await getProjects();
    const project = projects.find(item => String(item.id) === match[1]);
    if (!project) {
      app.append(element('h1', 'Project not found'));
    } else {
      app.append(element('h1', project.name));
      if (project.archived) app.append(element('p', 'Archived project'));
      const form = element('form');
      const label = element('label', 'Task title');
      label.htmlFor = 'task-title';
      const input = element('input');
      input.id = 'task-title';
      input.type = 'text';
      input.setAttribute('aria-label', 'Task title');
      const submit = element('button', 'Create task');
      submit.type = 'submit';
      const alert = element('p');
      alert.className = 'alert';
      alert.setAttribute('role', 'alert');
      alert.hidden = true;
      if (project.archived) { input.disabled = true; submit.disabled = true; }
      form.append(label, input, submit, alert);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) {
          alert.textContent = 'Task title is required';
          alert.hidden = false;
          input.focus();
          return;
        }
        submit.disabled = true;
        try {
          const response = await fetch(`/api/projects/${project.id}/tasks`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
          });
          if (!response.ok) throw new Error((await response.json()).error || 'Unable to create task');
          await render();
        } catch (error) {
          alert.textContent = error.message;
          alert.hidden = false;
        } finally { submit.disabled = false; }
      });
      app.append(form);
      const filterLabel = element('label', 'Task filter');
      filterLabel.htmlFor = 'task-filter';
      const filter = element('select');
      filter.id = 'task-filter';
      filter.setAttribute('aria-label', 'Task filter');
      for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value));
      app.append(filterLabel, filter);
      const taskList = element('section');
      taskList.setAttribute('aria-label', 'Tasks');
      const response = await fetch(`/api/projects/${project.id}/tasks`);
      if (!response.ok) throw new Error('Unable to load tasks');
      const tasks = await response.json();
      const displayTasks = () => {
        taskList.replaceChildren();
        for (const task of tasks) {
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          const row = element('article', undefined, 'task-row');
          row.dataset.testid = 'task-row';
          row.append(element('span', task.title));
          const checkbox = element('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(task.completed);
          checkbox.disabled = Boolean(project.archived);
          checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          checkbox.addEventListener('change', async () => {
            checkbox.disabled = true;
            try {
              const update = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
                method: 'PATCH', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ completed: checkbox.checked })
              });
              if (!update.ok) throw new Error('Unable to update task');
              task.completed = Number(checkbox.checked);
              displayTasks();
            } catch (error) {
              checkbox.checked = !checkbox.checked;
              alert.textContent = error.message;
              alert.hidden = false;
              checkbox.disabled = false;
            }
          });
          row.append(checkbox);
          taskList.append(row);
        }
      };
      filter.addEventListener('change', displayTasks);
      displayTasks();
      app.append(taskList);
    }
    const back = element('button', 'Projects');
    back.type = 'button';
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  const alert = element('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    submit.disabled = true;
    try {
      const response = await fetch('/api/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Unable to create project');
      input.value = '';
      alert.hidden = true;
      await render();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    } finally { submit.disabled = false; }
  });
  app.append(form);
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  filter.setAttribute('aria-label', 'Project filter');
  for (const value of ['Active', 'Archived']) filter.append(element('option', value));
  app.append(filterLabel, filter);
  const list = element('section');
  list.setAttribute('aria-label', 'Projects');
  const projects = await getProjects();
  const displayProjects = () => {
  list.replaceChildren();
  for (const project of projects) {
    if (Boolean(project.archived) !== (filter.value === 'Archived')) continue;
    const row = element('article', undefined, 'project-row');
    row.dataset.testid = 'project-row';
    row.append(element('span', project.name));
    const summary = element('span', `${project.completedCount}/${project.totalCount} completed`);
    summary.dataset.testid = 'project-summary';
    row.append(summary);
    const open = element('button', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(open);
    const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
    archive.type = 'button';
    archive.addEventListener('click', async () => {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived })
      });
      if (response.ok) { project.archived = Number(!project.archived); displayProjects(); }
    });
    row.append(archive);
    list.append(row);
  }
  };
  filter.addEventListener('change', displayProjects);
  displayProjects();
  app.append(list);
}

render().catch(error => { app.replaceChildren(element('p', error.message, 'alert')); });
