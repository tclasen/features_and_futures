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
  return alert;
}

function showError(alert, error) {
  alert.textContent = error.message;
  alert.hidden = false;
}

async function renderTasks(projectId, alert, archived) {
  const path = `/api/projects/${projectId}/tasks`;
  const form = element('form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.type = 'text';
  const submit = element('button', 'Create task');
  submit.type = 'submit';
  submit.disabled = true;
  form.append(label, input, submit);
  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const name of ['All', 'Open', 'Completed']) {
    const option = element('option', name);
    option.value = name;
    filter.append(option);
  }
  const filters = element('div');
  filters.className = 'task-filters';
  filters.append(filterLabel, filter);
  const list = element('section');
  list.setAttribute('aria-label', 'Tasks');
  app.append(form, filters, list);
  let tasks = [];
  function drawTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed) continue;
      if (filter.value === 'Completed' && !task.completed) continue;
      const row = element('div');
      row.dataset.testid = 'task-row';
      row.className = 'task-row';
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = archived;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`${path}/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          drawTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          showError(alert, error);
        } finally { checkbox.disabled = false; }
      });
      row.append(checkbox, element('span', task.title));
      list.append(row);
    }
  }
  filter.addEventListener('change', drawTasks);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (archived) return;
    alert.hidden = true;
    const title = input.value.trim();
    if (!title) return showError(alert, new Error('Task title is required'));
    submit.disabled = true;
    try {
      tasks.push(await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }));
      drawTasks();
      input.value = '';
      input.focus();
    } catch (error) { showError(alert, error); }
    finally { submit.disabled = archived; }
  });
  tasks = await request(path);
  drawTasks();
  submit.disabled = archived;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  const alert = alertBox();
  if (match) {
    const back = element('button', 'Projects');
    back.type = 'button';
    back.addEventListener('click', () => location.assign('/'));
    app.append(back, alert);
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.prepend(element('h1', project.name));
      document.title = `${project.name} — Workboard`;
      if (project.archived) app.append(element('p', 'Archived project'));
      await renderTasks(project.id, alert, project.archived);
    } catch (error) { showError(alert, error); }
  } else {
    app.append(element('h1', 'Workboard'));
    const form = element('form');
    const label = element('label', 'Project name');
    label.htmlFor = 'project-name';
    const input = element('input');
    input.id = 'project-name';
    input.name = 'name';
    input.type = 'text';
    const submit = element('button', 'Create project');
    submit.type = 'submit';
    form.append(label, input, submit);
    const list = element('section');
    list.setAttribute('aria-label', 'Projects');
    const filterLabel = element('label', 'Project filter');
    filterLabel.htmlFor = 'project-filter';
    const filter = element('select');
    filter.id = 'project-filter';
    for (const name of ['Active', 'Archived']) {
      const option = element('option', name);
      option.value = name;
      filter.append(option);
    }
    const filters = element('div');
    filters.className = 'task-filters';
    filters.append(filterLabel, filter);
    app.append(form, alert, filters, list);
    let projects = [];
    function drawProjects() {
      list.replaceChildren();
      projects.filter((project) => project.archived === (filter.value === 'Archived')).forEach(appendProject);
    }
    filter.addEventListener('change', drawProjects);
    function appendProject(project) {
      const row = element('div');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
      const summary = element('span', `${project.completed_count}/${project.total_count} completed`);
      summary.dataset.testid = 'project-summary';
      const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        archive.disabled = true;
        alert.hidden = true;
        try {
          const saved = await request(`/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !project.archived }),
          });
          projects = projects.map((item) => item.id === saved.id ? saved : item);
          drawProjects();
        } catch (error) { showError(alert, error); }
        finally { archive.disabled = false; }
      });
      row.append(element('span', project.name), summary, open, archive);
      list.append(row);
    }
    submit.disabled = true;
    try {
      projects = await request('/api/projects');
      drawProjects();
      submit.disabled = false;
    } catch (error) { showError(alert, error); }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;
      const name = input.value.trim();
      if (!name) {
        showError(alert, new Error('Project name is required'));
        return;
      }
      submit.disabled = true;
      try {
        projects.push(await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }));
        drawProjects();
        input.value = '';
        input.focus();
      } catch (error) { showError(alert, error); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
