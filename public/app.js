const app = document.querySelector('#app');

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function heading(text) {
  const h = document.createElement('h1');
  h.textContent = text;
  return h;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.append(heading(project.name));
    } catch {
      app.append(heading('Project not found'));
    }
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Projects';
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
    return;
  }

  app.append(heading('Workboard'));
  const form = document.createElement('form');
  form.className = 'create-form';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'projectName';
  input.type = 'text';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Create project';
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  app.append(form);

  const list = document.createElement('section');
  list.className = 'project-list';
  list.setAttribute('aria-label', 'Projects');
  app.append(list);
  const projects = await request('/api/projects');
  for (const project of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open project';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(name, open);
    list.append(row);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      render();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
render();
