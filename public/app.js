const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function el(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    const project = await request(`/api/projects/${match[1]}`).catch(() => null);
    const back = el('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => go('/'));
    app.append(back);
    if (project) app.append(el('h1', {}, project.name));
    else app.append(el('p', { role: 'alert' }, 'Project not found'));
    return;
  }

  app.append(el('h1', {}, 'Workboard'));
  const form = el('form', { class: 'create-form' });
  const label = el('label', { for: 'project-name' }, 'Project name');
  const input = el('input', { id: 'project-name', name: 'name', type: 'text' });
  const submit = el('button', { type: 'submit' }, 'Create project');
  const alert = el('p', { role: 'alert', class: 'error', hidden: '' });
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      render();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  app.append(form);
  const projects = await request('/api/projects');
  const list = el('section', { 'aria-label': 'Projects' });
  for (const project of projects) {
    const row = el('article', { 'data-testid': 'project-row', class: 'project-row' });
    row.append(el('span', {}, project.name));
    const open = el('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => go(`/projects/${project.id}`));
    row.append(open);
    list.append(row);
  }
  app.append(list);
}

window.addEventListener('popstate', render);
render();
