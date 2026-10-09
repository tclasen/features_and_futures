const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete request');
  return body;
}

async function render() {
  app.replaceChildren();
  const error = element('p', '', { role: 'alert' });
  error.hidden = true;
  const showError = message => { error.textContent = message; error.hidden = false; };
  const projectPath = location.pathname.match(/^\/projects\/(\d+)$/);
  if (projectPath) {
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { location.href = '/'; });
    app.append(back, error);
    try {
      const project = await request(`/api/projects/${projectPath[1]}`);
      app.prepend(element('h1', project.name));
      document.title = `${project.name} · Workboard`;
    } catch (cause) { showError(cause.message); }
    return;
  }

  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', '', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  form.append(label, input, submit);
  const list = element('div', '', { 'aria-label': 'Projects' });
  const empty = element('p', 'No projects yet. Create your first project above.');
  function addProject(project) {
    empty.remove();
    const row = element('div', '', { 'data-testid': 'project-row', class: 'project-row' });
    const open = element('button', 'Open project', { type: 'button' });
    open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    row.append(element('span', project.name), open);
    list.append(row);
  }
  app.append(element('h1', 'Workboard'), form, error, list);
  submit.disabled = true;
  try {
    const projects = await request('/api/projects');
    if (!projects.length) list.append(empty);
    projects.forEach(addProject);
    submit.disabled = false;
  } catch (cause) { showError(cause.message); }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    const name = input.value.trim();
    if (!name) { showError('Project name is required'); return; }
    submit.disabled = true;
    try {
      addProject(await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }));
      input.value = '';
      input.focus();
    } catch (cause) { showError(cause.message); }
    finally { submit.disabled = false; }
  });
}

render();
