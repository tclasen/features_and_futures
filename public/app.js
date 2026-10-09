const heading = document.querySelector('#heading');
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const projects = document.querySelector('#projects');
const alert = document.querySelector('#alert');
const form = document.querySelector('#create-form');
const nameInput = document.querySelector('#project-name');

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
window.addEventListener('popstate', render);
render().catch((error) => { alert.textContent = error.message; });
