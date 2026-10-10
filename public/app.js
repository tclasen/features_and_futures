const view = document.querySelector('#project-view');

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

function heading(text) {
  const element = document.createElement('h1');
  element.textContent = text;
  return element;
}

async function showProjects() {
  view.replaceChildren(heading('Workboard'));
  const form = document.createElement('form');
  form.className = 'project-form';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  form.append(label, input, submit, alert);
  const list = document.createElement('section');
  list.className = 'project-list';
  list.setAttribute('aria-label', 'Projects');
  view.append(form, list);

  async function refresh() {
    const projects = await request('/api/projects');
    list.replaceChildren(...projects.map((project) => {
      const row = document.createElement('article');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { window.location.href = `/projects/${encodeURIComponent(project.id)}`; });
      row.append(name, open);
      return row;
    }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      input.value = '';
      await refresh();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });
  await refresh();
}

async function showProject(id) {
  const project = await request(`/api/projects/${encodeURIComponent(id)}`);
  view.replaceChildren(heading(project.name));
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { window.location.href = '/'; });
  view.append(back);
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) {
  showProject(decodeURIComponent(match[1])).catch(() => { window.location.href = '/'; });
} else {
  showProjects().catch((error) => {
    view.replaceChildren(heading('Workboard'));
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = error.message;
    view.append(message);
  });
}
