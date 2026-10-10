const app = document.querySelector('#app');

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    const response = await fetch(`/api/projects/${match[1]}`);
    if (!response.ok) {
      app.append(element('h1', {}, 'Project not found'), element('button', { type: 'button' }, 'Projects'));
      app.querySelector('button').addEventListener('click', () => { location.href = '/'; });
      return;
    }
    const project = await response.json();
    app.append(element('h1', {}, project.name));
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back);
    return;
  }

  app.append(element('h1', {}, 'Workboard'));
  const form = element('form');
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  const create = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', 'aria-live': 'assertive', hidden: '' });
  form.append(label, input, create);
  app.append(form, alert);
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(list);

  async function loadProjects() {
    const projects = await (await fetch('/api/projects')).json();
    list.replaceChildren();
    for (const project of projects) {
      const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
      row.append(element('span', {}, project.name));
      const open = element('button', { type: 'button' }, 'Open project');
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(open);
      list.append(row);
    }
  }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      alert.textContent = '';
      alert.hidden = true;
      await loadProjects();
    }
  });
  await loadProjects();
}

render();
