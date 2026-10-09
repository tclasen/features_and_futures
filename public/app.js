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
  return alert;
}

function showError(alert, error) {
  alert.textContent = error.message;
  alert.hidden = false;
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  const alert = alertBox();
  if (match) {
    const back = element('button', 'Projects');
    back.type = 'button';
    back.addEventListener('click', () => location.assign('/'));
    app.append(back, alert);
    try {
      const project = await request(`/api/projects/${match[1]}`);
      app.prepend(element('h1', project.name));
      document.title = `${project.name} — Workboard`;
    } catch (error) { showError(alert, error); }
  } else {
    app.append(element('h1', 'Workboard'));
    const form = element('form');
    const label = element('label', 'Project name');
    label.htmlFor = 'project-name';
    const input = element('input');
    input.id = 'project-name';
    input.name = 'name';
    input.type = 'text';
    const submit = element('button', 'Create project');
    submit.type = 'submit';
    form.append(label, input, submit);
    const list = element('section');
    list.setAttribute('aria-label', 'Projects');
    app.append(form, alert, list);
    function appendProject(project) {
      const row = element('div');
      row.dataset.testid = 'project-row';
      row.className = 'project-row';
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => location.assign(`/projects/${project.id}`));
      row.append(element('span', project.name), open);
      list.append(row);
    }
    submit.disabled = true;
    try {
      (await request('/api/projects')).forEach(appendProject);
      submit.disabled = false;
    } catch (error) { showError(alert, error); }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;
      const name = input.value.trim();
      if (!name) {
        showError(alert, new Error('Project name is required'));
        return;
      }
      submit.disabled = true;
      try {
        appendProject(await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }));
        input.value = '';
        input.focus();
      } catch (error) { showError(alert, error); }
      finally { submit.disabled = false; }
    });
  }
  app.setAttribute('aria-busy', 'false');
}

render();
