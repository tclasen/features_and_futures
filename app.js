const app = document.querySelector('#app');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function projects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Unable to load projects');
  return response.json();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    let items;
    try { items = await projects(); } catch { app.append(element('p', 'Unable to load projects')); return; }
    const project = items.find(item => String(item.id) === match[1]);
    if (!project) {
      app.append(element('h1', 'Project not found'));
    } else {
      app.append(element('h1', project.name));
    }
    const back = element('button', 'Projects');
    back.type = 'button';
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.setAttribute('aria-label', 'Project name');
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      alert.hidden = true;
      await render();
    }
  });
  app.append(form);

  let items;
  try { items = await projects(); } catch { app.append(element('p', 'Unable to load projects')); return; }
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  for (const project of items) {
    const row = element('div', undefined, 'project-row');
    row.dataset.testid = 'project-row';
    row.append(element('span', project.name));
    const open = element('button', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(open);
    list.append(row);
  }
  app.append(list);
}

addEventListener('popstate', render);
render();
