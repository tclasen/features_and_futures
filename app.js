const app = document.querySelector('#app');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function projectIdFromPath() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

async function render() {
  const projects = await getProjects();
  const projectId = projectIdFromPath();
  if (projectId !== null) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      app.innerHTML = '<h1>Project not found</h1><button type="button" id="back">Projects</button>';
      document.querySelector('#back').addEventListener('click', () => navigate('/'));
      return;
    }
    const taskResponse = await fetch(`/api/projects/${projectId}/tasks`);
    if (!taskResponse.ok) throw new Error('Could not load tasks');
    const tasks = await taskResponse.json();
    app.innerHTML = `<button type="button" id="back">Projects</button><h1>${escapeHtml(project.name)}</h1>
      <form id="task-form">
        <label for="task-title">Task title</label>
        <input id="task-title" name="title" type="text" autocomplete="off">
        <button type="submit">Create task</button>
        <p id="task-error" role="alert" hidden></p>
      </form>
      <label for="task-filter">Task filter</label>
      <select id="task-filter"><option>All</option><option>Open</option><option>Completed</option></select>
      <section id="tasks" aria-label="Tasks"></section>`;
    document.querySelector('#back').addEventListener('click', () => navigate('/'));
    const list = document.querySelector('#tasks');
    const filter = document.querySelector('#task-filter');
    const drawTasks = () => {
      const shown = tasks.filter((task) => filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed));
      list.innerHTML = shown.map((task) => `<div data-testid="task-row" class="task-row">
        <span>${escapeHtml(task.title)}</span>
        <input type="checkbox" data-task-id="${task.id}" aria-label="Complete ${escapeHtml(task.title)}" ${task.completed ? 'checked' : ''}>
      </div>`).join('');
      list.querySelectorAll('[data-task-id]').forEach((checkbox) => checkbox.addEventListener('change', async () => {
        const task = tasks.find((item) => item.id === Number(checkbox.dataset.taskId));
        checkbox.disabled = true;
        try {
          const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          if (!response.ok) throw new Error('Could not save task');
          task.completed = checkbox.checked;
          drawTasks();
        } catch (error) { checkbox.checked = task.completed; checkbox.disabled = false; showError(error); }
      }));
    };
    filter.addEventListener('change', drawTasks);
    drawTasks();
    document.querySelector('#task-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#task-title');
      const error = document.querySelector('#task-error');
      const title = input.value.trim();
      if (!title) { error.textContent = 'Task title is required'; error.hidden = false; return; }
      const response = await fetch(`/api/projects/${projectId}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      if (!response.ok) { const result = await response.json(); error.textContent = result.error ?? 'Could not create task'; error.hidden = false; return; }
      navigate(`/projects/${projectId}`);
    });
    return;
  }

  app.innerHTML = `<h1>Workboard</h1>
    <form id="create-form">
      <label for="project-name">Project name</label>
      <input id="project-name" name="name" type="text" autocomplete="off">
      <button type="submit">Create project</button>
      <p id="error" role="alert" hidden></p>
    </form>
    <section id="projects" aria-label="Projects">${projects.map((project) => `
      <div data-testid="project-row" class="project-row">
        <span>${escapeHtml(project.name)}</span>
        <button type="button" data-project-id="${project.id}">Open project</button>
      </div>`).join('')}
    </section>`;

  document.querySelector('#create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#project-name');
    const error = document.querySelector('#error');
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Project name is required';
      error.hidden = false;
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const result = await response.json();
      error.textContent = result.error ?? 'Could not create project';
      error.hidden = false;
      return;
    }
    navigate('/');
  });
  document.querySelectorAll('[data-project-id]').forEach((button) => {
    button.addEventListener('click', () => navigate(`/projects/${button.dataset.projectId}`));
  });
}

function navigate(path) {
  history.pushState({}, '', path);
  render().catch(showError);
}

function showError(error) {
  app.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p>`;
}

window.addEventListener('popstate', () => render().catch(showError));
render().catch(showError);
