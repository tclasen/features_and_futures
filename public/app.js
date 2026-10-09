const heading = document.querySelector('#heading');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const tasks = document.querySelector('#tasks');
const alert = document.querySelector('#alert');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');
const taskForm = document.querySelector('#task-form');
const taskTitleInput = document.querySelector('#task-title');
const taskFilter = document.querySelector('#task-filter');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function projectPath() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  return match?.[1] ?? null;
}

async function render() {
  const id = projectPath();
  list.hidden = Boolean(id);
  detail.hidden = !id;
  alert.textContent = '';
  if (id) {
    try {
      const project = await request(`/api/projects/${id}`);
      heading.textContent = project.name;
      await renderTasks(id);
      return;
    } catch {
      history.replaceState({}, '', '/');
      return render();
    }
  }

  heading.textContent = 'Workboard';
  const items = await request('/api/projects');
  projects.replaceChildren(...items.map((project) => {
    const row = document.createElement('div');
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${project.id}`);
      render();
    });
    row.append(name, open);
    return row;
  }));
}

async function renderTasks(projectId) {
  const items = await request(`/api/projects/${projectId}/tasks`);
  const filter = taskFilter.value;
  const shown = items.filter((task) => filter === 'All' || (filter === 'Completed') === Boolean(task.completed));
  tasks.replaceChildren(...shown.map((task) => {
    const row = document.createElement('div');
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${projectId}/tasks/${task.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await renderTasks(projectId);
      } catch (error) {
        alert.textContent = error.message;
        checkbox.checked = Boolean(task.completed);
      }
    });
    label.append(checkbox);
    row.append(title, label);
    return row;
  }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    alert.textContent = 'Project name is required';
    return;
  }
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    nameInput.value = '';
    await render();
  } catch (error) {
    alert.textContent = error.message;
  }
});

document.querySelector('#back-button').addEventListener('click', () => {
  history.pushState({}, '', '/');
  render();
});
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskTitleInput.value.trim();
  if (!title) {
    alert.textContent = 'Task title is required';
    return;
  }
  const id = projectPath();
  try {
    await request(`/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    taskTitleInput.value = '';
    await renderTasks(id);
  } catch (error) {
    alert.textContent = error.message;
  }
});
taskFilter.addEventListener('change', () => {
  const id = projectPath();
  if (id) renderTasks(id).catch((error) => { alert.textContent = error.message; });
});
window.addEventListener('popstate', render);
render().catch((error) => { alert.textContent = error.message; });
