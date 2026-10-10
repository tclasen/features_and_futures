const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function renderProjects(projects) {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', 'aria-label': 'Project name' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', undefined, { role: 'alert', hidden: '' });
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      projects.push(project);
      renderProjects(projects);
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  const list = element('ul');
  for (const project of projects) {
    const row = element('li', undefined, { 'data-testid': 'project-row' });
    row.append(
      element('span', project.name, { class: 'project-name' }),
      element('button', 'Open project', { type: 'button' }),
    );
    row.querySelector('button').addEventListener('click', () => {
      window.location.href = `/projects/${encodeURIComponent(project.id)}`;
    });
    list.append(row);
  }
  app.append(form, alert, list);
}

async function renderProject(id) {
  app.replaceChildren();
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back, element('h1', project.name));
  } catch {
    app.append(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1]));
else request('/api/projects').then(renderProjects).catch(() => {
  app.replaceChildren(element('h1', 'Workboard'), element('p', 'Unable to load projects.'));
});
