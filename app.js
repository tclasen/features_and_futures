const content = document.querySelector('#content');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function projectIdFromPath() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  return match ? match[1] : null;
}

async function renderList() {
  content.replaceChildren();
  content.append(element('h1', '', 'Workboard'));

  const form = element('form', 'create-form');
  const field = element('div', 'field');
  const label = element('label', '', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  field.append(label, input);
  const submit = element('button', '', 'Create project');
  submit.type = 'submit';
  form.append(field, submit);
  const alert = element('p', 'alert');
  alert.hidden = true;
  alert.setAttribute('role', 'alert');
  content.append(form, alert);

  const projects = await request('/api/projects');
  const title = element('h2', 'section-title', 'Projects');
  const list = element('div', 'project-list');
  if (projects.length === 0) {
    list.append(element('p', 'empty', 'No projects yet. Create one to get started.'));
  } else {
    for (const project of projects) {
      const row = element('div', 'project-row');
      row.dataset.testid = 'project-row';
      row.append(element('span', 'project-name', project.name));
      const open = element('button', '', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      list.append(row);
    }
  }
  content.append(title, list);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await renderList();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
}

async function renderProject(id) {
  const project = await request(`/api/projects/${id}`);
  content.replaceChildren();
  const back = element('button', 'back-button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => navigate('/'));
  content.append(back, element('h1', '', project.name));
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  try {
    const id = projectIdFromPath();
    if (id) await renderProject(id);
    else await renderList();
  } catch {
    content.replaceChildren(element('p', 'alert', 'Unable to load this page.'));
  }
}

window.addEventListener('popstate', render);
render();
