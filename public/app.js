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
  const response = await fetch(`/api/projects/${projectId}`);
  const project = response.ok ? await response.json() : null;
  const heading = document.querySelector('h1');
  heading.textContent = project?.name || 'Project not found';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);

  const form = document.querySelector('#task-form');
  form.hidden = false;
  const alert = document.querySelector('#task-alert');
  const tasks = document.createElement('section');
  tasks.setAttribute('aria-label', 'Tasks');
  const list = document.createElement('div');
  tasks.append(list);
  app.append(tasks);
  async function renderTasks() {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    const all = await response.json();
    const filter = document.querySelector('#task-filter').value;
    list.replaceChildren();
    for (const task of all.filter(t => filter === 'All' || (filter === 'Open' ? !t.completed : !!t.completed))) {
      const row = document.createElement('div');
      row.dataset.testid = 'task-row';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!task.completed;
      checkbox.setAttribute('aria-label', `Complete ${task.title}`);
      checkbox.addEventListener('change', async () => {
        await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked })
        });
        await renderTasks();
      });
      label.append(checkbox, document.createTextNode(task.title));
      row.append(label);
      list.append(row);
    }
  }
  document.querySelector('#task-filter').addEventListener('change', renderTasks);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    alert.hidden = true;
    const input = document.querySelector('#task-title');
    const title = input.value.trim();
    if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
    const response = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title })
    });
    if (response.ok) { input.value = ''; await renderTasks(); }
  });
  if (project) await renderTasks();
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
  document.querySelector('#project-form').addEventListener('submit', async event => {
    event.preventDefault();
    alert.hidden = true;
    const input = document.querySelector('#project-name');
    const name = input.value.trim();
    if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) { input.value = ''; await render(); }
  });
  await render();
}
