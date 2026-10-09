const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}
function alert(message) {
  const node = element('p', message);
  node.setAttribute('role', 'alert');
  return node;
}
async function renderTasks(projectId, archived) {
  const path = `/api/projects/${projectId}/tasks`;
  const form = element('form');
  const label = element('label', 'Task title');
  label.htmlFor = 'task-title';
  const input = element('input');
  input.id = 'task-title';
  input.type = 'text';
  const create = element('button', 'Create task');
  create.type = 'submit';
  create.disabled = true;
  form.append(label, input, create);
  const errorBox = element('div');
  const filterLabel = element('label', 'Task filter');
  filterLabel.htmlFor = 'task-filter';
  const filter = element('select');
  filter.id = 'task-filter';
  for (const value of ['All', 'Open', 'Completed']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  const list = element('section');
  list.setAttribute('aria-label', 'Tasks');
  app.append(form, errorBox, filterLabel, filter, list);
  let tasks = [];
  function displayTasks() {
    list.replaceChildren();
    for (const task of tasks) {
      if (filter.value === 'Open' && task.completed || filter.value === 'Completed' && !task.completed) continue;
      const row = element('div');
      row.className = 'task-row';
      row.dataset.testid = 'task-row';
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = Boolean(archived);
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        errorBox.replaceChildren();
        try {
          const saved = await request(`${path}/${task.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          task.completed = saved.completed;
          displayTasks();
        } catch (error) {
          checkbox.checked = task.completed;
          errorBox.append(alert(error.message));
        } finally { checkbox.disabled = false; }
      });
      row.append(checkbox, element('span', task.title));
      list.append(row);
    }
  }
  filter.addEventListener('change', displayTasks);
  try {
    tasks = await request(path);
    displayTasks();
    create.disabled = Boolean(archived);
  } catch (error) { errorBox.append(alert(error.message)); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (archived) return;
    errorBox.replaceChildren();
    const title = input.value.trim();
    if (!title) {
      errorBox.append(alert('Task title is required'));
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      tasks.push(await request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }));
      displayTasks();
      input.value = '';
      input.focus();
    } catch (error) { errorBox.append(alert(error.message)); }
    finally { create.disabled = Boolean(archived); }
  });
}
async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.append(button('Projects', () => { location.href = '/'; }));
    try {
      const project = await request(`/api/projects/${match[1]}`);
      const heading = element('h1', project.name);
      app.append(heading);
      document.title = `${project.name} · Workboard`;
      if (project.archived) app.append(element('p', 'Archived project'));
      const renameForm = element('form');
      const renameLabel = element('label', 'New project name');
      renameLabel.htmlFor = 'new-project-name';
      const renameInput = element('input');
      renameInput.id = 'new-project-name';
      renameInput.type = 'text';
      renameInput.value = project.name;
      renameInput.disabled = Boolean(project.archived);
      const rename = element('button', 'Rename project');
      rename.type = 'submit';
      rename.disabled = Boolean(project.archived);
      const renameErrors = element('div');
      renameForm.append(renameLabel, renameInput, rename);
      app.append(renameForm, renameErrors);
      renameForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (project.archived) return;
        renameErrors.replaceChildren();
        const name = renameInput.value.trim();
        if (!name) {
          renameErrors.append(alert('Project name is required'));
          renameInput.focus();
          return;
        }
        rename.disabled = true;
        try {
          const saved = await request(`/api/projects/${project.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          project.name = saved.name;
          heading.textContent = saved.name;
          document.title = `${saved.name} · Workboard`;
          renameInput.value = saved.name;
        } catch (error) { renameErrors.append(alert(error.message)); }
        finally { rename.disabled = Boolean(project.archived); }
      });
      await renderTasks(project.id, project.archived);
    } catch (error) { app.append(alert(error.message)); }
    return;
  }
  document.title = 'Workboard';
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const create = element('button', 'Create project');
  create.type = 'submit';
  const errorBox = element('div');
  const list = element('section');
  list.setAttribute('aria-label', 'Projects');
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = element('option', value);
    option.value = value;
    filter.append(option);
  }
  let projects = [];
  function displayProjects() {
    list.replaceChildren();
    const matching = projects.filter(project => Boolean(project.archived) === (filter.value === 'Archived'));
    if (!matching.length) list.append(element('p', 'No projects in this list.'));
    matching.forEach(addProject);
  }
  filter.addEventListener('change', displayProjects);
  function addProject(project) {
    const row = element('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const summary = element('span', `${project.completed}/${project.total} completed`);
    summary.dataset.testid = 'project-summary';
    const archive = button(project.archived ? 'Restore project' : 'Archive project', async () => {
      archive.disabled = true;
      errorBox.replaceChildren();
      try {
        const saved = await request(`/api/projects/${project.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !project.archived }),
        });
        Object.assign(project, saved);
        displayProjects();
      } catch (error) { errorBox.append(alert(error.message)); }
      finally { archive.disabled = false; }
    });
    row.append(element('span', project.name), summary, button('Open project', () => {
      location.href = `/projects/${project.id}`;
    }), archive);
    list.append(row);
  }
  form.append(label, input, create);
  app.append(form, errorBox, filterLabel, filter, list);
  create.disabled = true;
  try {
    projects = await request('/api/projects');
    displayProjects();
    create.disabled = false;
  } catch (error) { errorBox.replaceChildren(alert(error.message)); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.replaceChildren();
    const name = input.value.trim();
    if (!name) {
      errorBox.append(alert('Project name is required'));
      input.focus();
      return;
    }
    create.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      projects.push(project);
      displayProjects();
      input.value = '';
      input.focus();
    } catch (error) { errorBox.append(alert(error.message)); }
    finally { create.disabled = false; }
  });
}
render();
