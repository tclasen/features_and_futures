const view = document.querySelector('#view');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function projects() {
  const response = await fetch('/api/projects');
  return response.json();
}

async function showList() {
  view.replaceChildren();
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const button = element('button', 'Create project');
  button.type = 'submit';
  const alert = element('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, button, alert);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    history.pushState({}, '', '/');
    await showList();
  });
  view.append(form);
  const list = element('div', undefined, 'project-list');
  for (const project of await projects()) {
    const row = element('article', undefined, 'project-row');
    row.dataset.testid = 'project-row';
    row.append(element('span', project.name));
    const open = element('button', 'Open project');
    open.type = 'button';
    open.addEventListener('click', () => navigate(`/projects/${project.id}`));
    row.append(open);
    list.append(row);
  }
  view.append(list);
}

async function showProject(id) {
  view.replaceChildren();
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) {
    view.append(element('p', 'Project not found'));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    view.append(back);
    return;
  }
  const project = await response.json();
  view.append(element('h2', project.name));
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => navigate('/'));
  view.append(back);
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) showProject(match[1]);
  else showList();
}

window.addEventListener('popstate', render);
render();
