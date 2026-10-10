const app = document.querySelector('#app');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    let project;
    try {
      const response = await fetch(`/api/projects/${match[1]}`);
      if (!response.ok) throw new Error('Project not found');
      project = await response.json();
    } catch {
      app.append(element('h1', 'Project not found'));
      const back = element('button', 'Projects');
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
      return;
    }
    app.append(element('h1', project.name));
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    app.append(back);
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);
  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, alert, list);

  async function loadProjects() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    list.replaceChildren();
    for (const project of projects) {
      const row = element('div', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', project.name));
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      list.append(row);
    }
  }
  form.addEventListener('submit', async (event) => {
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
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    input.value = '';
    await loadProjects();
  });
  await loadProjects();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
render();
