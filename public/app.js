const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const rows = element('section', undefined, { 'aria-label': 'Projects' });
  form.append(label, input, submit);
  app.append(form, alert, rows);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      go('/');
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  try {
    const projects = await request('/api/projects');
    for (const project of projects) {
      const row = element('article', undefined, { 'data-testid': 'project-row' });
      row.append(element('span', project.name));
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => go(`/projects/${project.id}`));
      row.append(open);
      rows.append(row);
    }
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
}

async function renderProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => go('/'));
  app.append(back);
  try {
    const project = await request(`/api/projects/${id}`);
    app.append(element('h1', project.name));
  } catch (error) {
    app.append(element('p', error.message, { role: 'alert' }));
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) await renderProject(match[1]);
  else await renderList();
}

window.addEventListener('popstate', render);
render();
