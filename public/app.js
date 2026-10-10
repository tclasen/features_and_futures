const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function alertBox() {
  const alert = element('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);
  return alert;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const create = element('button', 'Create project');
  create.type = 'submit';
  form.append(label, input, create);
  app.append(form);
  const alert = alertBox();
  const list = element('section');
  list.setAttribute('aria-label', 'Projects');
  app.append(list);

  function render(projects) {
    list.replaceChildren();
    for (const project of projects) {
      const row = element('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(element('span', project.name), open);
      list.append(row);
    }
  }
  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError(new Error('Project name is required'));
    create.disabled = true;
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      render(await request('/api/projects'));
      input.focus();
    } catch (error) { showError(error); }
    finally { create.disabled = false; }
  });
  try { render(await request('/api/projects')); }
  catch (error) { showError(error); }
}

async function showProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);
  const alert = alertBox();
  try {
    const project = await request(`/api/projects/${id}`);
    app.prepend(element('h1', project.name));
    document.title = `${project.name} — Workboard`;
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
