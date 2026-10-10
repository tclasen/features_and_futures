const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function renderList() {
  app.replaceChildren();
  const title = element('h1', '', 'Workboard');
  app.append(title);

  const form = element('form', 'create-form');
  const label = element('label', '', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  input.required = true;
  const submit = element('button', 'primary', 'Create project');
  submit.type = 'submit';
  const alert = element('p', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  app.append(form);

  const list = element('div', 'project-list');
  list.setAttribute('aria-label', 'Projects');
  const projects = await request('/api/projects');
  for (const project of projects) {
    const row = element('article', 'project-row');
    row.dataset.testid = 'project-row';
    row.append(element('span', 'project-name', project.name));
    const open = element('button', 'secondary', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${encodeURIComponent(project.id)}`; });
    row.append(open);
    list.append(row);
  }
  app.append(list);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await renderList();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

async function renderProject(id) {
  app.replaceChildren();
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  const back = element('button', 'back', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', '', project.name));
}

async function render() {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  try {
    if (match) await renderProject(decodeURIComponent(match[1]));
    else await renderList();
  } catch (error) {
    app.replaceChildren();
    app.append(element('h1', '', 'Workboard'));
    const alert = element('p', 'alert', error.message);
    alert.setAttribute('role', 'alert');
    app.append(alert);
    const back = element('button', 'secondary', 'Projects');
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back);
  }
}

render();
