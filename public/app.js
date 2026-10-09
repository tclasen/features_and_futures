// Simple client‑side router based on location.pathname
const API_BASE = '/api';

function $(selector) {
  return document.querySelector(selector);
}

// Create an alert element that is discoverable by assistive technologies.
// Adding `role="alert"` ensures the element is exposed to screen‑readers and
// provides a reliable selector for acceptance tests – they look for an element
// with `role="alert"` containing the error text.
function createAlert(message) {
  const el = document.createElement('div');
  el.className = 'alert';
  el.textContent = message;
  el.setAttribute('role', 'alert');
  return el;
}

async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || resp.statusText);
  }
  return resp.json();
}

function renderProjectList() {
  const container = $('#app');
  container.innerHTML = '';
  const heading = document.createElement('h1');
  heading.textContent = 'Workboard';
  container.appendChild(heading);

  const form = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Project name';
  input.setAttribute('aria-label', 'Project name');
  const btn = document.createElement('button');
  btn.textContent = 'Create project';
  form.appendChild(input);
  form.appendChild(btn);
  container.appendChild(form);

  const alertPlaceholder = document.createElement('div');
  container.appendChild(alertPlaceholder);

  btn.addEventListener('click', async () => {
    const name = input.value.trim();
    alertPlaceholder.innerHTML = '';
    if (!name) {
      alertPlaceholder.appendChild(createAlert('Project name is required'));
      return;
    }
    try {
      await fetchJSON(`${API_BASE}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      input.value = '';
      await loadProjects();
    } catch (e) {
      alertPlaceholder.appendChild(createAlert(e.message));
    }
  });

  const list = document.createElement('div');
  container.appendChild(list);

  async function loadProjects() {
    const projects = await fetchJSON(`${API_BASE}/projects`);
    list.innerHTML = '';
    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.testid = 'project-row';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open project';
      openBtn.addEventListener('click', () => {
        history.pushState(null, '', `/projects/${p.id}`);
        renderProjectPage(p.id);
      });
      row.appendChild(nameSpan);
      row.appendChild(openBtn);
      list.appendChild(row);
    });
  }

  loadProjects();
}

async function renderProjectPage(projectId) {
  const container = $('#app');
  container.innerHTML = '';
  // Fetch project details for heading
  const project = await fetchJSON(`${API_BASE}/projects/${projectId}`);
  const heading = document.createElement('h1');
  heading.textContent = project.name;
  container.appendChild(heading);

  const backBtn = document.createElement('button');
  backBtn.textContent = 'Projects';
  backBtn.addEventListener('click', () => {
    history.pushState(null, '', '/');
    renderProjectList();
  });
  container.appendChild(backBtn);

  // Task creation UI
  const taskForm = document.createElement('div');
  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.placeholder = 'Task title';
  taskInput.setAttribute('aria-label', 'Task title');
  const taskBtn = document.createElement('button');
  taskBtn.textContent = 'Create task';
  taskForm.appendChild(taskInput);
  taskForm.appendChild(taskBtn);
  container.appendChild(taskForm);

  const taskAlert = document.createElement('div');
  container.appendChild(taskAlert);

  // Filter combobox
  const filterDiv = document.createElement('div');
  const filterLabel = document.createElement('label');
  filterLabel.textContent = 'Task filter';
  const filterSelect = document.createElement('select');
  ['All', 'Open', 'Completed'].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.toLowerCase();
    o.textContent = opt;
    filterSelect.appendChild(o);
  });
  filterDiv.appendChild(filterLabel);
  filterDiv.appendChild(filterSelect);
  container.appendChild(filterDiv);

  const taskList = document.createElement('div');
  container.appendChild(taskList);

  let allTasks = [];

  async function loadTasks() {
    const tasks = await fetchJSON(`${API_BASE}/projects/${projectId}/tasks`);
    allTasks = tasks;
    renderTasks();
  }

  function renderTasks() {
    const filter = filterSelect.value; // all/open/completed
    taskList.innerHTML = '';
    allTasks
      .filter(t => {
        if (filter === 'open') return t.completed === 0;
        if (filter === 'completed') return t.completed === 1;
        return true;
      })
      .forEach(t => {
        const row = document.createElement('div');
        row.className = 'row';
        row.dataset.testid = 'task-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = t.completed === 1;
        checkbox.setAttribute('aria-label', `Complete ${t.title}`);
        checkbox.addEventListener('change', async () => {
          await fetch(`${API_BASE}/tasks/${t.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked })
          });
          await loadTasks();
        });
        const span = document.createElement('span');
        span.textContent = t.title;
        row.appendChild(checkbox);
        row.appendChild(span);
        taskList.appendChild(row);
      });
  }

  taskBtn.addEventListener('click', async () => {
    const title = taskInput.value.trim();
    taskAlert.innerHTML = '';
    if (!title) {
      taskAlert.appendChild(createAlert('Task title is required'));
      return;
    }
    try {
      await fetchJSON(`${API_BASE}/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title })
      });
      taskInput.value = '';
      await loadTasks();
    } catch (e) {
      taskAlert.appendChild(createAlert(e.message));
    }
  });

  filterSelect.addEventListener('change', renderTasks);

  await loadTasks();
}

// Initial render based on current URL
function init() {
  if (location.pathname.startsWith('/projects/')) {
    const id = location.pathname.split('/')[2];
    renderProjectPage(id);
  } else {
    renderProjectList();
  }
}

window.addEventListener('popstate', init);
init();

