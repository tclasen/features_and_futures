const app = document.querySelector('#app');

async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function heading(text) {
  const element = document.createElement('h1');
  element.textContent = text;
  return element;
}

async function render() {
  const match = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
  app.replaceChildren();
  if (match) {
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.append(heading(project.name));
      if (project.archived) {
        const status = document.createElement('p');
        status.textContent = 'Archived project';
        app.append(status);
      }
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => navigate('/'));
      app.append(back);

      const form = document.createElement('form');
      const label = document.createElement('label');
      label.htmlFor = 'task-title';
      label.textContent = 'Task title';
      const input = document.createElement('input');
      input.id = 'task-title';
      input.type = 'text';
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Create task';
      submit.disabled = Boolean(project.archived);
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.hidden = true;
      form.append(label, input, submit, alert);
      app.append(form);

      const filterLabel = document.createElement('label');
      filterLabel.htmlFor = 'task-filter';
      filterLabel.textContent = 'Task filter';
      const filter = document.createElement('select');
      filter.id = 'task-filter';
      for (const value of ['All', 'Open', 'Completed']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        filter.append(option);
      }
      app.append(filterLabel, filter);
      const list = document.createElement('section');
      list.setAttribute('aria-label', 'Tasks');
      app.append(list);

      async function loadTasks() {
        const tasks = await request(`/api/projects/${match[1]}/tasks`);
        list.replaceChildren();
        for (const task of tasks) {
          if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
          const row = document.createElement('div');
          row.dataset.testid = 'task-row';
          row.className = 'task-row';
          const title = document.createElement('span');
          title.textContent = task.title;
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(task.completed);
          checkbox.disabled = Boolean(project.archived);
          checkbox.setAttribute('aria-label', `Complete ${task.title}`);
          checkbox.addEventListener('change', async () => {
            try {
              await request(`/api/projects/${match[1]}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
              await loadTasks();
            } catch (error) { alert.textContent = error.message; alert.hidden = false; }
          });
          row.append(title, checkbox);
          list.append(row);
        }
      }
      filter.addEventListener('change', loadTasks);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        alert.hidden = true;
        try {
          await request(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
          input.value = '';
          filter.value = 'All';
          await loadTasks();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      await loadTasks();
    } catch {
      app.append(heading('Project not found'));
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
    }
    return;
  }

  app.append(heading('Workboard'));
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  app.append(form);
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'project-filter';
  filterLabel.textContent = 'Project filter';
  const filter = document.createElement('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    filter.append(option);
  }
  app.append(filterLabel, filter);
  const list = document.createElement('section');
  list.setAttribute('aria-label', 'Projects');
  app.append(list);

  async function loadProjects() {
    const archived = filter.value === 'Archived';
    const projects = await request(`/api/projects?archived=${archived}`);
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      const summary = document.createElement('span');
      summary.dataset.testid = 'project-summary';
      summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.textContent = archived ? 'Restore project' : 'Archive project';
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !archived }) });
          await loadProjects();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      row.append(name, summary, open, archive);
      list.append(row);
    }
  }
  filter.addEventListener('change', loadProjects);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      input.value = '';
      await loadProjects();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  try { await loadProjects(); } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
render();
