const app = document.querySelector('#app');

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.testId) node.dataset.testid = options.testId;
  if (options.className) node.className = options.className;
  return node;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function renderList() {
  app.replaceChildren();
  app.append(element('h1', { text: 'Workboard' }));
  const form = element('form', { className: 'create-form' });
  const label = element('label', { text: 'Project name' });
  const input = element('input');
  input.type = 'text';
  input.id = 'project-name';
  input.autocomplete = 'off';
  label.htmlFor = input.id;
  const create = element('button', { text: 'Create project' });
  create.type = 'submit';
  const alert = element('p', { className: 'alert' });
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, create, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value })
      });
      await renderList();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  app.append(form);
  const list = element('section', { className: 'project-list' });
  for (const project of await request('/api/projects')) {
    const row = element('article', { testId: 'project-row', className: 'project-row' });
    row.append(element('span', { text: project.name }));
    const open = element('button', { text: 'Open project' });
    open.type = 'button';
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(open);
    list.append(row);
  }
  app.append(list);
}

async function renderProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  app.replaceChildren();
  const back = element('button', { text: 'Projects' });
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back, element('h1', { text: project.name }));
}

const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
if (match) {
  renderProject(match[1]).catch(() => { location.href = '/'; });
} else {
  renderList().catch(error => {
    app.replaceChildren(element('p', { text: error.message, className: 'alert' }));
  });
}
