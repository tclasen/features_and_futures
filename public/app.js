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
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Projects';
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
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
  const list = document.createElement('section');
  list.setAttribute('aria-label', 'Projects');
  app.append(list);

  async function loadProjects() {
    const projects = await request('/api/projects');
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
      row.append(name, open);
      list.append(row);
    }
  }
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
