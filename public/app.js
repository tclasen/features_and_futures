const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showProjects() {
  app.replaceChildren();
  const heading = element('h1', 'Workboard');
  const form = document.createElement('form');
  form.className = 'project-form';
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);

  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  app.append(heading, form, alert, list);

  async function refresh() {
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map((project) => {
      const row = element('article', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      const name = element('span', project.name);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(name, open);
      return row;
    }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      input.value = '';
      await refresh();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  await refresh();
}

async function showProject(id) {
  app.replaceChildren();
  const project = await request(`/api/projects/${id}`);
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => navigate('/'));
  app.append(back, element('h1', project.name));
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  try {
    const match = location.pathname.match(/^\/projects\/(\d+)$/);
    if (match) await showProject(match[1]);
    else await showProjects();
  } catch {
    app.replaceChildren(element('p', 'Project not found.', 'alert'));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
  }
}

window.addEventListener('popstate', render);
render();
