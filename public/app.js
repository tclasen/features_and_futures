const app = document.querySelector('#app');
const projectId = location.pathname.match(/^\/projects\/(\d+)$/)?.[1];

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

if (projectId) {
  document.querySelector('#project-form').remove();
  document.querySelector('section').remove();
  const project = await (await fetch(`/api/projects/${projectId}`)).json();
  const heading = document.querySelector('h1');
  heading.textContent = project.name || 'Project not found';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);
} else {
  const list = document.querySelector('#projects');
  const alert = document.querySelector('#alert');
  async function render() {
    const projects = await loadProjects();
    list.replaceChildren();
    for (const project of projects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const name = document.createElement('span');
      name.textContent = project.name;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open project';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      row.append(name, open);
      list.append(row);
    }
  }
  document.querySelector('#project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const input = document.querySelector('#project-name');
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (response.ok) {
      input.value = '';
      await render();
    }
  });
  await render();
}
