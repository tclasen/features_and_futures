const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function alertBox() {
  const alert = element('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);
  return alert;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const create = element('button', 'Create project');
  create.type = 'submit';
  form.append(label, input, create);
  app.append(form);
  const alert = alertBox();
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const name of ['Active', 'Archived']) {
    const option = element('option', name);
    option.value = name;
    filter.append(option);
  }
  app.append(filterLabel, filter);
  let projects = [];
  const list = element('section');
  list.setAttribute('aria-label', 'Projects');
  app.append(list);

  function render() {
    list.replaceChildren();
    for (const project of projects) {
      if (Boolean(project.archived) !== (filter.value === 'Archived')) continue;
      const row = element('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      const summary = element('span', `${project.completed}/${project.total} completed`);
      summary.dataset.testid = 'project-summary';
      const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        archive.disabled = true;
        alert.hidden = true;
        try {
          await request(`/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !project.archived }),
          });
          await refresh();
        } catch (error) { showError(error); }
        finally { archive.disabled = false; }
      });
      row.append(element('span', project.name), summary, open, archive);
      list.append(row);
    }
  }
  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
  async function refresh() {
    projects = await request('/api/projects');
    render();
  }
  filter.addEventListener('change', render);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError(new Error('Project name is required'));
    create.disabled = true;
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      await refresh();
      input.focus();
    } catch (error) { showError(error); }
    finally { create.disabled = false; }
  });
  try { await refresh(); }
  catch (error) { showError(error); }
}

async function showProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);
  const alert = alertBox();
  try {
    const project = await request(`/api/projects/${id}`);
    app.prepend(element('h1', project.name));
    document.title = `${project.name} — Workboard`;
    if (project.archived) app.append(element('p', 'Archived project'));
    const form = element('form');
    const label = element('label', 'Task title');
    label.htmlFor = 'task-title';
    const input = element('input');
    input.id = 'task-title';
    input.type = 'text';
    const create = element('button', 'Create task');
    create.type = 'submit';
    create.disabled = Boolean(project.archived);
    form.append(label, input, create);
    const filterLabel = element('label', 'Task filter');
    filterLabel.htmlFor = 'task-filter';
    const filter = element('select');
    filter.id = 'task-filter';
    for (const name of ['All', 'Open', 'Completed']) {
      const option = element('option', name);
      option.value = name;
      filter.append(option);
    }
    const list = element('section');
    list.setAttribute('aria-label', 'Tasks');
    app.append(form, filterLabel, filter, list);
    let tasks = [];
    function showError(error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
    function render() {
      list.replaceChildren();
      for (const task of tasks) {
        if (filter.value === 'Open' && task.completed) continue;
        if (filter.value === 'Completed' && !task.completed) continue;
        const row = element('div');
        row.className = 'task-row';
        row.dataset.testid = 'task-row';
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = Boolean(project.archived);
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          alert.hidden = true;
          try {
            const saved = await request(`/api/projects/${id}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            task.completed = saved.completed;
            render();
          } catch (error) {
            checkbox.checked = task.completed;
            showError(error);
          } finally { checkbox.disabled = false; }
        });
        row.append(element('span', task.title), checkbox);
        list.append(row);
      }
    }
    filter.addEventListener('change', render);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (project.archived) return;
      const title = input.value.trim();
      if (!title) return showError(new Error('Task title is required'));
      create.disabled = true;
      alert.hidden = true;
      try {
        const task = await request(`/api/projects/${id}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        tasks.push(task);
        input.value = '';
        render();
        input.focus();
      } catch (error) { showError(error); }
      finally { create.disabled = false; }
    });
    tasks = await request(`/api/projects/${id}/tasks`);
    render();
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
