const root = document.querySelector('#app');

function heading(text) {
  const h = document.createElement('h1');
  h.textContent = text;
  return h;
}

async function render() {
  root.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const back = document.createElement('button');
    back.className = 'back-button';
    back.textContent = 'Projects';
    back.addEventListener('click', () => { location.href = '/'; });
    root.append(back);
    const response = await fetch(`/api/projects/${match[1]}`);
    if (!response.ok) {
      const title = heading('Project not found');
      root.append(title);
      return;
    }
    const project = await response.json();
    root.append(heading(project.name));
    return;
  }

  root.append(heading('Workboard'));
  const form = document.createElement('form');
  form.className = 'create-form';
  const label = document.createElement('label');
  label.className = 'field';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'name';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Project name');
  label.append(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  form.append(label, submit);
  root.append(form);
  const alertBox = document.createElement('div');
  alertBox.className = 'alert';
  alertBox.setAttribute('role', 'alert');
  alertBox.hidden = true;
  root.append(alertBox);
  const list = document.createElement('div');
  list.className = 'project-list';
  root.append(list);

  async function loadProjects() {
    list.replaceChildren();
    const response = await fetch('/api/projects');
    const projects = await response.json();
    if (!projects.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No projects yet.';
      list.append(empty);
      return;
    }
    for (const project of projects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.className = 'project-name';
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(name, open);
      list.append(row);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    alertBox.hidden = true;
    const name = input.value.trim();
    if (!name) {
      alertBox.textContent = 'Project name is required';
      alertBox.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      await loadProjects();
    }
  });
  await loadProjects();
}

render();
