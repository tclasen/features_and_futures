const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) {
    let project;
    try { project = await request(`/api/projects/${encodeURIComponent(match[1])}`); }
    catch { project = null; }
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { history.pushState({}, '', '/'); render(); });
    app.append(back);
    if (project) app.append(element('h1', {}, project.name));
    else app.append(element('p', { role: 'alert' }, 'Project not found'));
    return;
  }

  app.append(element('h1', {}, 'Workboard'));
  const form = element('form');
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text', required: 'true' });
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', hidden: '' });
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
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      input.value = '';
      alert.hidden = true;
      await showProjects(list);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  app.append(form);
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(list);
  await showProjects(list);
}

async function showProjects(list) {
  const projects = await request('/api/projects');
  list.replaceChildren();
  for (const project of projects) {
    const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
    row.append(element('span', {}, project.name));
    const open = element('button', { type: 'button' }, 'Open project');
    open.addEventListener('click', () => {
      history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
      render();
    });
    row.append(open);
    list.append(row);
  }
}

window.addEventListener('popstate', render);
render().catch(error => {
  app.replaceChildren(element('p', { role: 'alert' }, error.message));
});
