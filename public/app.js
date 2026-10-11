const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete request');
  return result;
}

function alertMessage(message) {
  const alert = app.querySelector('[role="alert"]');
  alert.textContent = message;
  alert.hidden = !message;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function projectRow(project, onUpdate) {
  const row = document.createElement('li');
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const button = document.createElement('button');
  button.textContent = 'Open project';
  button.addEventListener('click', () => navigate(`/projects/${project.id}`));
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completed_count}/${project.total_count} completed`;
  const archive = document.createElement('button');
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    alertMessage('');
    try {
      const saved = await request(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      onUpdate(saved);
    } catch (error) {
      if (row.isConnected) alertMessage(error.message);
    } finally {
      archive.disabled = false;
    }
  });
  row.append(name, summary, button, archive);
  return row;
}

async function render() {
  const path = location.pathname;
  app.setAttribute('aria-busy', 'true');
  const match = path.match(/^\/projects\/(\d+)$/);
  if (match) {
    app.innerHTML = `<button id="projects">Projects</button><h1></h1>
      <p id="archive-status" hidden>Archived project</p>
      <form>
        <label for="task-title">Task title</label>
        <div class="create-controls">
          <input id="task-title" type="text" autocomplete="off">
          <button type="submit" disabled>Create task</button>
        </div>
      </form>
      <form id="rename-form">
        <label for="new-project-name">New project name</label>
        <div class="create-controls">
          <input id="new-project-name" type="text" autocomplete="off" disabled>
          <button type="submit" disabled>Rename project</button>
        </div>
      </form>
      <p role="alert" hidden></p>
      <div class="task-filter">
        <label for="task-filter">Task filter</label>
        <select id="task-filter">
          <option>All</option><option>Open</option><option>Completed</option>
        </select>
      </div>
      <ul id="task-list" aria-label="Tasks"></ul>`;
    app.querySelector('#projects').addEventListener('click', () => navigate('/'));
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    const filter = app.querySelector('select');
    const list = app.querySelector('ul');
    const renameForm = app.querySelector('#rename-form');
    const renameInput = app.querySelector('#new-project-name');
    const renameSubmit = renameForm.querySelector('button');
    const endpoint = `/api/projects/${match[1]}/tasks`;
    let tasks = [];
    let archived = false;
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (renameSubmit.disabled) return;
      const name = renameInput.value.trim();
      if (!name) {
        alertMessage('Project name is required');
        renameInput.focus();
        return;
      }
      renameSubmit.disabled = true;
      alertMessage('');
      try {
        const project = await request(`/api/projects/${match[1]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!renameForm.isConnected) return;
        app.querySelector('h1').textContent = project.name;
        document.title = `${project.name} · Workboard`;
        renameInput.value = '';
        renameInput.focus();
      } catch (error) {
        if (renameForm.isConnected) alertMessage(error.message);
      } finally {
        renameSubmit.disabled = archived;
      }
    });
    function displayTasks() {
      const visible = tasks.filter(task => filter.value === 'All' ||
        (filter.value === 'Completed' ? task.completed : !task.completed));
      list.replaceChildren(...visible.map(task => {
        const row = document.createElement('li');
        row.dataset.testid = 'task-row';
        const title = document.createElement('span');
        title.textContent = task.title;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = archived;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          alertMessage('');
          try {
            const saved = await request(`${endpoint}/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            tasks = tasks.map(item => item.id === saved.id ? saved : item);
            if (list.isConnected) displayTasks();
          } catch (error) {
            checkbox.checked = task.completed;
            if (list.isConnected) alertMessage(error.message);
          } finally {
            checkbox.disabled = archived;
          }
        });
        const taskRenameForm = document.createElement('form');
        taskRenameForm.className = 'create-controls';
        const taskRenameInput = document.createElement('input');
        taskRenameInput.type = 'text';
        taskRenameInput.autocomplete = 'off';
        taskRenameInput.setAttribute('aria-label', 'New task title');
        taskRenameInput.disabled = archived;
        const taskRenameSubmit = document.createElement('button');
        taskRenameSubmit.type = 'submit';
        taskRenameSubmit.textContent = 'Rename task';
        taskRenameSubmit.disabled = archived;
        taskRenameForm.addEventListener('submit', async event => {
          event.preventDefault();
          if (taskRenameSubmit.disabled) return;
          const newTitle = taskRenameInput.value.trim();
          if (!newTitle) {
            alertMessage('Task title is required');
            taskRenameInput.focus();
            return;
          }
          taskRenameSubmit.disabled = true;
          alertMessage('');
          try {
            const saved = await request(`${endpoint}/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: newTitle }),
            });
            tasks = tasks.map(item => item.id === saved.id ? saved : item);
            if (list.isConnected) displayTasks();
          } catch (error) {
            if (list.isConnected) alertMessage(error.message);
          } finally {
            taskRenameSubmit.disabled = archived;
          }
        });
        taskRenameForm.append(taskRenameInput, taskRenameSubmit);
        const priorityLabel = document.createElement('label');
        priorityLabel.textContent = 'Task priority';
        const priority = document.createElement('select');
        priority.setAttribute('aria-label', 'Task priority');
        for (const value of ['Low', 'Normal', 'High']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          priority.append(option);
        }
        priority.value = task.priority;
        priority.disabled = archived;
        priority.addEventListener('change', async () => {
          priority.disabled = true;
          alertMessage('');
          try {
            const saved = await request(`${endpoint}/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ priority: priority.value }),
            });
            tasks = tasks.map(item => item.id === saved.id ? saved : item);
            if (list.isConnected) displayTasks();
          } catch (error) {
            priority.value = task.priority;
            if (list.isConnected) alertMessage(error.message);
          } finally {
            priority.disabled = archived;
          }
        });
        priorityLabel.append(priority);
        row.append(title, checkbox, priorityLabel, taskRenameForm);
        return row;
      }));
    }
    filter.addEventListener('change', displayTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const title = input.value.trim();
      if (!title) {
        alertMessage('Task title is required');
        input.focus();
        return;
      }
      submit.disabled = true;
      alertMessage('');
      try {
        const task = await request(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        tasks.push(task);
        if (!form.isConnected) return;
        displayTasks();
        input.value = '';
        input.focus();
      } catch (error) {
        if (form.isConnected) alertMessage(error.message);
      } finally {
        submit.disabled = archived;
      }
    });
    try {
      const project = await request(`/api/projects/${match[1]}`);
      if (!form.isConnected) return;
      app.querySelector('h1').textContent = project.name;
      archived = project.archived;
      renameInput.disabled = archived;
      renameSubmit.disabled = archived;
      app.querySelector('#archive-status').hidden = !archived;
      document.title = `${project.name} · Workboard`;
      tasks = await request(endpoint);
      if (!list.isConnected) return;
      displayTasks();
      submit.disabled = archived;
    } catch (error) {
      if (location.pathname === path) alertMessage(error.message);
    }
  } else {
    document.title = 'Workboard';
    app.innerHTML = `
      <h1>Workboard</h1>
      <form>
        <label for="project-name">Project name</label>
        <div class="create-controls">
          <input id="project-name" name="name" type="text" autocomplete="off">
          <button type="submit">Create project</button>
        </div>
      </form>
      <p role="alert" hidden></p>
      <div class="project-filter">
        <label for="project-filter">Project filter</label>
        <select id="project-filter"><option>Active</option><option>Archived</option></select>
      </div>
      <ul id="project-list" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const list = app.querySelector('ul');
    const submit = form.querySelector('button');
    const filter = app.querySelector('select');
    let projects = [];
    // A fresh browser session starts with Active; reloads and Projects navigation
    // keep the user's current view, including while opening archived projects.
    try {
      if (sessionStorage.getItem('project-filter') === 'Archived') filter.value = 'Archived';
    } catch { /* The list still works when browser storage is unavailable. */ }
    function displayProjects() {
      list.replaceChildren(...projects
        .filter(project => project.archived === (filter.value === 'Archived'))
        .map(project => projectRow(project, saved => {
          projects = projects.map(item => item.id === saved.id ? saved : item);
          if (list.isConnected) displayProjects();
        })));
    }
    filter.addEventListener('change', () => {
      try {
        sessionStorage.setItem('project-filter', filter.value);
      } catch { /* Filtering does not depend on storage availability. */ }
      displayProjects();
    });
    // Wait for the initial list before allowing creation, keeping creation order stable.
    submit.disabled = true;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      const name = input.value.trim();
      if (!name) {
        alertMessage('Project name is required');
        input.focus();
        return;
      }
      submit.disabled = true;
      alertMessage('');
      try {
        const project = await request('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        projects.push(project);
        if (!form.isConnected) return;
        displayProjects();
        input.value = '';
        input.focus();
      } catch (error) {
        if (form.isConnected) alertMessage(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    try {
      projects = await request('/api/projects');
      if (!list.isConnected) return;
      displayProjects();
    } catch (error) {
      if (list.isConnected) alertMessage(error.message);
    } finally {
      submit.disabled = false;
    }
  }
  if (location.pathname === path) app.setAttribute('aria-busy', 'false');
}

window.addEventListener('popstate', render);
render();
