const app = document.querySelector('#app');
// Keep the list view during navigation, but start each page load on Active.
let projectFilter = 'Active';

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

// Normalize only search keys; keep saved names and titles untouched.
function searchKey(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
}

function validRangeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
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
      <div class="task-filter">
        <label for="priority-filter">Priority filter</label>
        <select id="priority-filter">
          <option>All</option><option>Low</option><option>Normal</option><option>High</option>
        </select>
      </div>
      <div class="task-filter">
        <label for="default-task-priority">Default task priority</label>
        <select id="default-task-priority" disabled>
          <option>Low</option><option>Normal</option><option>High</option>
        </select>
      </div>
      <form id="due-range-form" class="task-filter">
        <label for="due-from">Due from</label>
        <input id="due-from" type="text" autocomplete="off">
        <label for="due-through">Due through</label>
        <input id="due-through" type="text" autocomplete="off">
        <button type="submit">Apply due range</button>
      </form>
      <form id="task-search-form" class="task-filter">
        <label for="task-search">Task search</label>
        <input id="task-search" type="text" autocomplete="off">
        <button type="submit">Search tasks</button>
      </form>
      <ul id="task-list" aria-label="Tasks"></ul>`;
    app.querySelector('#projects').addEventListener('click', () => navigate('/'));
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const submit = form.querySelector('button');
    const filter = app.querySelector('#task-filter');
    const priorityFilter = app.querySelector('#priority-filter');
    const defaultPriority = app.querySelector('#default-task-priority');
    const dueRangeForm = app.querySelector('#due-range-form');
    const dueFrom = app.querySelector('#due-from');
    const dueThrough = app.querySelector('#due-through');
    // Draft fields are separate from the applied range so invalid submissions
    // and unsaved input cannot change the visible membership.
    let appliedFrom = '';
    let appliedThrough = '';
    const searchForm = app.querySelector('#task-search-form');
    const searchInput = app.querySelector('#task-search');
    let appliedQuery = '';
    const list = app.querySelector('ul');
    const renameForm = app.querySelector('#rename-form');
    const renameInput = app.querySelector('#new-project-name');
    const renameSubmit = renameForm.querySelector('button');
    const endpoint = `/api/projects/${match[1]}/tasks`;
    let tasks = [];
    let destinations = [];
    let archived = false;
    let savedDefaultPriority = 'Normal';
    defaultPriority.addEventListener('change', async () => {
      if (defaultPriority.disabled) return;
      defaultPriority.disabled = true;
      submit.disabled = true;
      alertMessage('');
      try {
        const project = await request(`/api/projects/${match[1]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default_priority: defaultPriority.value }),
        });
        savedDefaultPriority = project.default_priority;
        defaultPriority.value = savedDefaultPriority;
      } catch (error) {
        defaultPriority.value = savedDefaultPriority;
        if (defaultPriority.isConnected) alertMessage(error.message);
      } finally {
        defaultPriority.disabled = archived;
        submit.disabled = archived;
      }
    });
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
      const visible = tasks.filter(task =>
        (filter.value === 'All' ||
          (filter.value === 'Completed' ? task.completed : !task.completed)) &&
        (priorityFilter.value === 'All' || task.priority === priorityFilter.value) &&
        searchKey(task.title).includes(appliedQuery) &&
        ((!appliedFrom && !appliedThrough) ||
          (task.due_date && (!appliedFrom || task.due_date >= appliedFrom) &&
            (!appliedThrough || task.due_date <= appliedThrough))));
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
        const dueDateForm = document.createElement('form');
        dueDateForm.className = 'create-controls';
        const dueDateLabel = document.createElement('label');
        dueDateLabel.textContent = 'Task due date';
        const dueDateInput = document.createElement('input');
        dueDateInput.type = 'text';
        dueDateInput.autocomplete = 'off';
        dueDateInput.setAttribute('aria-label', 'Task due date');
        dueDateInput.value = task.due_date || '';
        dueDateInput.disabled = archived;
        dueDateLabel.append(dueDateInput);
        const dueDateSubmit = document.createElement('button');
        dueDateSubmit.type = 'submit';
        dueDateSubmit.textContent = 'Save due date';
        dueDateSubmit.disabled = archived;
        dueDateForm.addEventListener('submit', async event => {
          event.preventDefault();
          if (dueDateSubmit.disabled) return;
          dueDateSubmit.disabled = true;
          alertMessage('');
          try {
            const saved = await request(`${endpoint}/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ due_date: dueDateInput.value }),
            });
            tasks = tasks.map(item => item.id === saved.id ? saved : item);
            if (list.isConnected) displayTasks();
          } catch (error) {
            if (list.isConnected) alertMessage(error.message);
          } finally {
            dueDateSubmit.disabled = archived;
          }
        });
        dueDateForm.append(dueDateLabel, dueDateSubmit);
        const moveForm = document.createElement('form');
        moveForm.className = 'create-controls';
        const destinationLabel = document.createElement('label');
        destinationLabel.textContent = 'Destination project';
        const destination = document.createElement('select');
        destination.setAttribute('aria-label', 'Destination project');
        for (const project of destinations) {
          const option = document.createElement('option');
          option.value = String(project.id);
          option.textContent = project.name;
          destination.append(option);
        }
        if (destinations.length) destination.value = String(destinations[0].id);
        const moveSubmit = document.createElement('button');
        moveSubmit.type = 'submit';
        moveSubmit.textContent = 'Move task';
        destination.disabled = moveSubmit.disabled = archived || !destinations.length;
        destinationLabel.append(destination);
        moveForm.append(destinationLabel, moveSubmit);
        moveForm.addEventListener('submit', async event => {
          event.preventDefault();
          if (moveSubmit.disabled) return;
          destination.disabled = moveSubmit.disabled = true;
          alertMessage('');
          try {
            await request(`${endpoint}/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ destination_project_id: Number(destination.value) }),
            });
            tasks = tasks.filter(item => item.id !== task.id);
            if (list.isConnected) displayTasks();
          } catch (error) {
            if (list.isConnected) alertMessage(error.message);
          } finally {
            destination.disabled = moveSubmit.disabled = archived || !destinations.length;
          }
        });
        row.append(title, checkbox, priorityLabel, taskRenameForm, dueDateForm, moveForm);
        return row;
      }));
    }
    filter.addEventListener('change', displayTasks);
    priorityFilter.addEventListener('change', displayTasks);
    searchForm.addEventListener('submit', event => {
      event.preventDefault();
      searchInput.value = searchInput.value.trim();
      appliedQuery = searchKey(searchInput.value);
      alertMessage('');
      displayTasks();
    });
    dueRangeForm.addEventListener('submit', event => {
      event.preventDefault();
      const from = dueFrom.value.trim();
      const through = dueThrough.value.trim();
      if ((from && !validRangeDate(from)) || (through && !validRangeDate(through))) {
        alertMessage('Due range must use valid YYYY-MM-DD dates');
        return;
      }
      if (from && through && from > through) {
        alertMessage('Due from must not be after Due through');
        return;
      }
      appliedFrom = from;
      appliedThrough = through;
      dueFrom.value = from;
      dueThrough.value = through;
      alertMessage('');
      displayTasks();
    });
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
      savedDefaultPriority = project.default_priority;
      defaultPriority.value = savedDefaultPriority;
      defaultPriority.disabled = archived;
      renameInput.disabled = archived;
      renameSubmit.disabled = archived;
      app.querySelector('#archive-status').hidden = !archived;
      document.title = `${project.name} · Workboard`;
      const [savedTasks, projects] = await Promise.all([
        request(endpoint), request('/api/projects'),
      ]);
      tasks = savedTasks;
      destinations = projects.filter(item => !item.archived && item.id !== Number(match[1]));
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
      <form id="project-search-form" class="project-filter">
        <label for="project-search">Project search</label>
        <input id="project-search" type="text" autocomplete="off">
        <button type="submit">Search projects</button>
      </form>
      <ul id="project-list" aria-label="Projects"></ul>`;
    const form = app.querySelector('form');
    const input = app.querySelector('input');
    const list = app.querySelector('ul');
    const submit = form.querySelector('button');
    const filter = app.querySelector('select');
    let projects = [];
    const searchForm = app.querySelector('#project-search-form');
    const searchInput = app.querySelector('#project-search');
    let appliedQuery = '';
    filter.value = projectFilter;
    function saveProjectFilter() {
      projectFilter = filter.value;
    }
    function displayProjects() {
      list.replaceChildren(...projects
        .filter(project => project.archived === (filter.value === 'Archived') &&
          searchKey(project.name).includes(appliedQuery))
        .map(project => projectRow(project, saved => {
          projects = projects.map(item => item.id === saved.id ? saved : item);
          if (list.isConnected) displayProjects();
        })));
    }
    filter.addEventListener('change', () => {
      saveProjectFilter();
      displayProjects();
    });
    searchForm.addEventListener('submit', event => {
      event.preventDefault();
      searchInput.value = searchInput.value.trim();
      appliedQuery = searchKey(searchInput.value);
      alertMessage('');
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
        // New projects are active: reveal the saved row even when creation
        // started from the archived view retained during navigation.
        filter.value = 'Active';
        saveProjectFilter();
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
