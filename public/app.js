const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const alertBox = document.querySelector('#alert');

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  const filter = document.querySelector('#project-filter').value;
  const container = document.querySelector('#projects');
  container.replaceChildren();
  for (const project of projects) {
    if (Boolean(project.archived) !== (filter === 'Archived')) continue;
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.testid = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open project';
    button.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
    const summary = document.createElement('span');
    summary.dataset.testid = 'project-summary';
    summary.textContent = `${project.completed_count}/${project.total_count} completed`;
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = project.archived ? 'Restore project' : 'Archive project';
    archive.addEventListener('click', async () => {
      await fetch(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
      await loadProjects();
    });
    row.append(name, summary, button, archive);
    container.append(row);
  }
}

let appliedDueRange = { from: '', through: '' };

function validCalendarDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function loadTasks(projectId) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) return;
  const tasks = await response.json();
  const filter = document.querySelector('#task-filter').value;
  const priorityFilter = document.querySelector('#priority-filter').value;
  const container = document.querySelector('#tasks');
  container.replaceChildren();
  for (const task of tasks) {
    if ((filter === 'Open' && task.completed) || (filter === 'Completed' && !task.completed)) continue;
    if (priorityFilter !== 'All' && task.priority !== priorityFilter) continue;
    if (appliedDueRange.from || appliedDueRange.through) {
      if (!task.due_date) continue;
      if (appliedDueRange.from && task.due_date < appliedDueRange.from) continue;
      if (appliedDueRange.through && task.due_date > appliedDueRange.through) continue;
    }
    const row = document.createElement('div');
    row.className = 'task-row';
    row.dataset.testid = 'task-row';
    const title = document.createElement('span');
    title.textContent = task.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = Boolean(document.querySelector('#archived-label').hidden === false);
    checkbox.setAttribute('aria-label', `Complete ${task.title}`);
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
      await loadTasks(projectId);
    });
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.setAttribute('aria-label', 'New task title');
    renameInput.value = task.title;
    renameInput.disabled = checkbox.disabled;
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename task';
    renameButton.disabled = checkbox.disabled;
    renameButton.addEventListener('click', async () => {
      const alert = document.querySelector('#task-alert');
      const newTitle = renameInput.value.trim();
      if (!newTitle) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
      alert.hidden = true;
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
      if (response.ok) await loadTasks(projectId);
    });
    const priority = document.createElement('select');
    priority.setAttribute('aria-label', 'Task priority');
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    }
    priority.value = task.priority || 'Normal';
    priority.disabled = checkbox.disabled;
    priority.addEventListener('change', async () => {
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
      await loadTasks(projectId);
    });
    const dueDate = document.createElement('input');
    dueDate.type = 'text';
    dueDate.setAttribute('aria-label', 'Task due date');
    dueDate.value = task.due_date || '';
    dueDate.disabled = checkbox.disabled;
    const saveDate = document.createElement('button');
    saveDate.type = 'button';
    saveDate.textContent = 'Save due date';
    saveDate.disabled = checkbox.disabled;
    saveDate.addEventListener('click', async () => {
      const alert = document.querySelector('#task-alert');
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: dueDate.value }) });
      if (!response.ok) { alert.textContent = 'Due date must be a valid YYYY-MM-DD date'; alert.hidden = false; return; }
      alert.hidden = true;
      await loadTasks(projectId);
    });
    row.append(title, checkbox, renameInput, renameButton, priority, dueDate, saveDate);
    container.append(row);
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    appliedDueRange = { from: '', through: '' };
    document.querySelector('#due-from').value = '';
    document.querySelector('#due-through').value = '';
    document.querySelector('#range-alert').hidden = true;
    const response = await fetch(`/api/projects/${match[1]}`);
    if (response.ok) {
      const project = await response.json();
      document.querySelector('#project-title').textContent = project.name;
      document.querySelector('#archived-label').hidden = !project.archived;
      const defaultPriority = document.querySelector('#default-task-priority');
      defaultPriority.value = project.default_priority || 'Normal';
      defaultPriority.disabled = Boolean(project.archived);
      document.querySelector('#rename-form').querySelectorAll('input, button').forEach(control => { control.disabled = Boolean(project.archived); });
      document.querySelector('#task-form').querySelectorAll('input, button').forEach(control => { control.disabled = Boolean(project.archived); });
      list.hidden = true;
      detail.hidden = false;
      await loadTasks(project.id);
      return;
    }
  }
  detail.hidden = true;
  list.hidden = false;
  await loadProjects();
}

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#project-name');
  const name = input.value.trim();
  if (!name) {
    alertBox.textContent = 'Project name is required';
    alertBox.hidden = false;
    return;
  }
  alertBox.hidden = true;
  const response = await fetch('/api/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  if (response.ok) {
    input.value = '';
    await loadProjects();
  }
});
document.querySelector('#rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#new-project-name');
  const alert = document.querySelector('#rename-alert');
  const name = input.value.trim();
  if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; return; }
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return;
  const response = await fetch(`/api/projects/${match[1]}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (response.ok) {
    input.value = '';
    document.querySelector('#project-title').textContent = name;
  }
});
document.querySelector('#default-task-priority').addEventListener('change', async event => {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return;
  const response = await fetch(`/api/projects/${match[1]}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default_priority: event.target.value }) });
  if (!response.ok) render();
});
document.querySelector('#due-range-form').addEventListener('submit', async event => {
  event.preventDefault();
  const alert = document.querySelector('#range-alert');
  const from = document.querySelector('#due-from').value.trim();
  const through = document.querySelector('#due-through').value.trim();
  if ((from && !validCalendarDate(from)) || (through && !validCalendarDate(through))) {
    alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
    alert.hidden = false;
    return;
  }
  if (from && through && from > through) {
    alert.textContent = 'Due from must not be after Due through';
    alert.hidden = false;
    return;
  }
  alert.hidden = true;
  appliedDueRange = { from, through };
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) await loadTasks(match[1]);
});
document.querySelector('#back').addEventListener('click', () => { location.href = '/'; });
document.querySelector('#project-filter').addEventListener('change', loadProjects);
for (const filterId of ['#task-filter', '#priority-filter']) {
  document.querySelector(filterId).addEventListener('change', () => {
    const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
    if (match) loadTasks(match[1]);
  });
}
document.querySelector('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#task-title');
  const title = input.value.trim();
  const alert = document.querySelector('#task-alert');
  if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
  alert.hidden = true;
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (!match) return;
  const response = await fetch(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  if (response.ok) { input.value = ''; await loadTasks(match[1]); }
});
render();
