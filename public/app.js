import { createTaskPanel } from './tasks.js';

const app = document.querySelector('#app');

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete request');
  return data;
}

function button(label, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function showError(container, error) {
  container.textContent = error.message;
  container.hidden = false;
}

let renderVersion = 0;
async function render() {
  const version = ++renderVersion;
  app.setAttribute('aria-busy', 'true');
  app.replaceChildren();
  const heading = document.createElement('h1');
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.append(button('Projects', () => navigate('/')), heading, alert);
    try {
      const project = await api(`/api/projects/${match[1]}`);
      if (version !== renderVersion) return;
      heading.textContent = project.name;
      document.title = `${project.name} · Workboard`;
      const tasks = await createTaskPanel(project.id, api);
      if (version !== renderVersion) return;
      app.append(tasks);
    } catch (error) {
      if (version !== renderVersion) return;
      heading.textContent = 'Project unavailable';
      showError(alert, error);
    }
  } else {
    heading.textContent = 'Workboard';
    document.title = 'Workboard';
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.htmlFor = 'project-name';
    label.textContent = 'Project name';
    const input = document.createElement('input');
    input.id = 'project-name';
    input.name = 'name';
    input.type = 'text';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Create project';
    form.append(label, input, submit);
    const list = document.createElement('div');
    list.setAttribute('aria-label', 'Projects');
    function addProject(project) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      row.append(name, button('Open project', () => navigate(`/projects/${project.id}`)));
      list.append(row);
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;
      if (!input.value.trim()) {
        showError(alert, new Error('Project name is required'));
        return;
      }
      submit.disabled = true;
      try {
        const project = await api('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.value }),
        });
        if (version !== renderVersion) return;
        addProject(project);
        input.value = '';
        input.focus();
      } catch (error) {
        if (version === renderVersion) showError(alert, error);
      } finally {
        submit.disabled = false;
      }
    });
    app.append(heading, form, alert, list);
    // Do not allow a creation to race the initial list load.
    submit.disabled = true;
    try {
      const projects = await api('/api/projects');
      if (version !== renderVersion) return;
      projects.forEach(addProject);
    } catch (error) {
      if (version !== renderVersion) return;
      showError(alert, error);
    }
    submit.disabled = false;
  }
  app.setAttribute('aria-busy', 'false');
}

window.addEventListener('popstate', render);
render();
