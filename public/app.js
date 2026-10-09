const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

function showAlert(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) {
    alert = element('p', '', { role: 'alert' });
    app.append(alert);
  }
  alert.textContent = message;
}

function projectRow(project) {
  const row = element('div', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const open = element('button', 'Open project', { type: 'button' });
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), open);
  return row;
}

async function showProjects() {
  app.append(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, submit);
  const list = element('section', undefined, { 'aria-label': 'Projects' });
  app.append(form, list);
  for (const project of await request('/api/projects')) list.append(projectRow(project));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) return showAlert('Project name is required');
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      list.append(projectRow(project));
      input.value = '';
      app.querySelector('[role="alert"]')?.remove();
      input.focus();
    } catch (error) {
      showAlert(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

async function showProject(id) {
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { window.location.href = '/'; });
  app.append(back);
  const project = await request(`/api/projects/${id}`);
  app.append(element('h1', project.name));
  document.title = `${project.name} · Workboard`;
}

try {
  const match = window.location.pathname.match(/^\/projects\/([1-9]\d*)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) {
  showAlert(error.message);
} finally {
  app.setAttribute('aria-busy', 'false');
}
