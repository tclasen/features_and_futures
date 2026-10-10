const app = document.querySelector('#app');
const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

if (projectId) {
  document.querySelector('#project-form').remove();
  document.querySelector('section').remove();
  const project = await (await fetch(`/api/projects/${projectId}`)).json();
  const heading = document.querySelector('h1');
  heading.textContent = project.name || 'Project not found';
  if (!project.name) {
    heading.textContent = 'Project not found';
    return;
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);

  const form = document.createElement('form');
  form.id = 'task-form';
  form.innerHTML = '<label for="task-title">Task title</label><div class="form-row"><input id="task-title" type="text" autocomplete="off"><button type="submit">Create task</button></div><p id="task-alert" role="alert" hidden></p>';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'task-filter';
  filterLabel.textContent = 'Task filter';
  const filter = document.createElement('select');
  filter.id = 'task-filter';
  for (const [value, label] of [['all', 'All'], ['open', 'Open'], ['completed', 'Completed']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; filter.append(option);
  }
  const tasksList = document.createElement('div');
  tasksList.id = 'tasks';
  app.append(form, filterLabel, filter, tasksList);
  let tasks = [];
  async function renderTasks() {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    tasks = await response.json();
    const mode = filter.value;
    tasksList.replaceChildren();
    for (const task of tasks.filter(task => mode === 'all' || (mode === 'completed') === task.completed)) {
      const row = document.createElement('div'); row.className = 'task-row'; row.dataset.testid = 'task-row';
      const title = document.createElement('span'); title.textContent = task.title;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        await fetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
        await renderTasks();
      });
      row.append(title, checkbox); tasksList.append(row);
    }
  }
  filter.addEventListener('change', renderTasks);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.querySelector('#task-title');
    const alert = document.querySelector('#task-alert');
    const title = input.value.trim(); alert.hidden = true;
    if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
    const response = await fetch(`/api/projects/${projectId}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
    if (response.ok) { input.value = ''; await renderTasks(); }
  });
  await renderTasks();
} else {
  const list = document.querySelector('#projects');
  const alert = document.querySelector('#alert');
  async function render() {
    const projects = await loadProjects();
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(name, open);
      list.append(row);
    }
  }
  document.querySelector('#project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const input = document.querySelector('#project-name');
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      await render();
    }
  });
  await render();
}
