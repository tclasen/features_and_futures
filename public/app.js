const app = document.querySelector('#app');
function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
async function request(url, options) {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}
function alertMessage(message) {
  let alert = app.querySelector('[role="alert"]');
  if (!alert) { alert = element('p', '', { role: 'alert' }); app.append(alert); }
  alert.textContent = message;
}
function projectRow(project) {
  const row = element('li', undefined, { 'data-testid': 'project-row', class: 'project-row' });
  const button = element('button', 'Open project', { type: 'button' });
  button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
  row.append(element('span', project.name), button);
  return row;
}
async function showProjects() {
  const heading = element('h1', 'Workboard');
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const list = element('ul', undefined, { class: 'projects', 'aria-label': 'Projects' });
  form.append(label, input, submit);
  app.replaceChildren(heading, form, list);
  const projects = await request('/api/projects');
  projects.forEach(project => list.append(projectRow(project)));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alertMessage('Project name is required'); return; }
    submit.disabled = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      list.append(projectRow(project));
      app.querySelector('[role="alert"]')?.remove();
      input.value = '';
      input.focus();
    } catch (error) { alertMessage(error.message); }
    finally { submit.disabled = false; }
  });
}
async function showProject(id) {
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => { location.href = '/'; });
  app.replaceChildren(back);
  const project = await request(`/api/projects/${id}`);
  app.append(element('h1', project.name));
  document.title = `${project.name} · Workboard`;
}
try {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) await showProject(match[1]);
  else await showProjects();
} catch (error) { alertMessage(error.message); }
finally { app.setAttribute('aria-busy', 'false'); }
