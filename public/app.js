const listView = document.querySelector('#projects-view');
const detailView = document.querySelector('#project-view');
const list = document.querySelector('#project-list');
const error = document.querySelector('#error');
const form = document.querySelector('#project-form');
const input = document.querySelector('#project-name');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

async function render() {
  const currentPath = location.pathname;
  const match = currentPath.match(/^\/projects\/(\d+)$/);
  listView.hidden = Boolean(match);
  detailView.hidden = !match;
  document.title = 'Workboard';
  if (match) {
    const title = document.querySelector('#project-title');
    const detailError = document.querySelector('#detail-error');
    title.textContent = '';
    showError(detailError, '');
    try {
      const project = await request(`/api/projects/${match[1]}`);
      if (location.pathname !== currentPath) return;
      title.textContent = project.name;
      document.title = `${project.name} · Workboard`;
    } catch (err) { showError(detailError, err.message); }
    return;
  }
  showError(error, '');
  try {
    const projects = await request('/api/projects');
    if (location.pathname !== currentPath) return;
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'secondary';
      open.textContent = 'Open project';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(name, open);
      list.append(row);
    }
    document.querySelector('#empty').hidden = projects.length > 0;
  } catch (err) { showError(error, err.message); }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    showError(error, 'Project name is required');
    input.focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  showError(error, '');
  try {
    await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    input.value = '';
    await render();
    input.focus();
  } catch (err) { showError(error, err.message); }
  finally { button.disabled = false; }
});
document.querySelector('#back').addEventListener('click', () => navigate('/'));
window.addEventListener('popstate', render);
render();
