const app = document.querySelector('#app');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function renderList() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', '', { role: 'alert', hidden: '' });
  const rows = element('section', undefined, { 'aria-label': 'Projects' });
  const filterLabel = element('label', 'Project filter', { for: 'project-filter' });
  const filter = element('select', undefined, { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value: value.toLowerCase() }));
  form.append(label, input, submit);
  app.append(form, alert, filterLabel, filter, rows);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      alert.hidden = true;
      input.value = '';
      await loadProjects();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  async function loadProjects() {
    try {
    const projects = await request('/api/projects');
    rows.replaceChildren();
    for (const project of projects) {
      if (project.archived !== (filter.value === 'archived')) continue;
      const row = element('article', undefined, { 'data-testid': 'project-row' });
      const summary = element('span', `${project.completedCount}/${project.totalCount} completed`, { 'data-testid': 'project-summary' });
      row.append(element('span', project.name), summary);
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => go(`/projects/${project.id}`));
      row.append(open);
      const archive = element('button', project.archived ? 'Restore project' : 'Archive project', { type: 'button' });
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${project.id}/archive`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
          await loadProjects();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      row.append(archive);
      rows.append(row);
    }
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  }
  filter.addEventListener('change', loadProjects);
  await loadProjects();
}

async function renderProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects', { type: 'button' });
  back.addEventListener('click', () => go('/'));
  app.append(back);
  try {
    const project = await request(`/api/projects/${id}`);
    app.append(element('h1', project.name));
    if (project.archived) app.append(element('p', 'Archived project'));
    const renameForm = element('form');
    const renameLabel = element('label', 'New project name', { for: 'new-project-name' });
    const renameInput = element('input', undefined, { id: 'new-project-name', name: 'name', type: 'text' });
    const renameButton = element('button', 'Rename project', { type: 'submit' });
    if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
    renameForm.append(renameLabel, renameInput, renameButton);
    const form = element('form');
    const label = element('label', 'Task title', { for: 'task-title' });
    const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text' });
    const submit = element('button', 'Create task', { type: 'submit' });
    if (project.archived) { input.disabled = true; submit.disabled = true; }
    const alert = element('p', '', { role: 'alert', hidden: '' });
    form.append(label, input, submit);

    const defaultPriorityLabel = element('label', 'Default task priority', { for: 'default-task-priority' });
    const defaultPriority = element('select', undefined, { id: 'default-task-priority' });
    for (const value of ['Low', 'Normal', 'High']) defaultPriority.append(element('option', value, { value }));
    defaultPriority.value = project.defaultPriority;
    defaultPriority.disabled = project.archived;

    const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
    const filter = element('select', undefined, { id: 'task-filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value: value.toLowerCase() }));
    const priorityFilterLabel = element('label', 'Priority filter', { for: 'priority-filter' });
    const priorityFilter = element('select', undefined, { id: 'priority-filter' });
    for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', value, { value: value.toLowerCase() }));
    const dueFromLabel = element('label', 'Due from', { for: 'due-from' });
    const dueFrom = element('input', undefined, { id: 'due-from', type: 'text' });
    const dueThroughLabel = element('label', 'Due through', { for: 'due-through' });
    const dueThrough = element('input', undefined, { id: 'due-through', type: 'text' });
    const applyDueRange = element('button', 'Apply due range', { type: 'button' });
    const rows = element('section', undefined, { 'aria-label': 'Tasks' });
    app.append(renameForm, defaultPriorityLabel, defaultPriority, form, alert, filterLabel, filter, priorityFilterLabel, priorityFilter, dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, rows);

    defaultPriority.addEventListener('change', async () => {
      const previous = project.defaultPriority;
      defaultPriority.disabled = true;
      try {
        const updated = await request(`/api/projects/${id}/default-priority`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: defaultPriority.value }) });
        project.defaultPriority = updated.defaultPriority;
        alert.hidden = true;
      } catch (error) {
        defaultPriority.value = previous;
        alert.textContent = error.message;
        alert.hidden = false;
      } finally {
        defaultPriority.disabled = project.archived;
      }
    });

    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        alert.textContent = 'Project name is required';
        alert.hidden = false;
        renameInput.focus();
        return;
      }
      try {
        const renamed = await request(`/api/projects/${id}/name`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
        app.querySelector('h1').textContent = renamed.name;
        renameInput.value = '';
        alert.hidden = true;
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });

    let tasks = [];
    let activeProjects = [];
    let appliedDueRange = { from: '', through: '' };
    function isValidCalendarDate(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return false;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (year < 1 || month < 1 || month > 12 || day < 1) return false;
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return day <= days[month - 1];
    }
    function showTasks() {
      rows.replaceChildren();
      const selected = filter.value;
      const selectedPriority = priorityFilter.value;
      for (const task of tasks) {
        if (selected === 'open' && task.completed || selected === 'completed' && !task.completed) continue;
        if (selectedPriority !== 'all' && task.priority.toLowerCase() !== selectedPriority) continue;
        if ((appliedDueRange.from || appliedDueRange.through) && !task.dueDate) continue;
        if (task.dueDate && appliedDueRange.from && task.dueDate < appliedDueRange.from) continue;
        if (task.dueDate && appliedDueRange.through && task.dueDate > appliedDueRange.through) continue;
        const row = element('article', undefined, { 'data-testid': 'task-row' });
        row.append(element('span', task.title));
        const renameForm = element('form');
        const renameInput = element('input', undefined, { type: 'text', 'aria-label': 'New task title', value: task.title });
        const renameButton = element('button', 'Rename task', { type: 'submit' });
        renameInput.disabled = project.archived;
        renameButton.disabled = project.archived;
        renameForm.append(renameInput, renameButton);
        renameForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const title = renameInput.value.trim();
          if (!title) {
            alert.textContent = 'Task title is required';
            alert.hidden = false;
            renameInput.focus();
            return;
          }
          try {
            await request(`/api/projects/${id}/tasks/${task.id}/title`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
            task.title = title;
            alert.hidden = true;
            showTasks();
          } catch (error) {
            alert.textContent = error.message;
            alert.hidden = false;
          }
        });
        row.append(renameForm);
        const dueDateForm = element('form');
        const dueDateInput = element('input', undefined, { type: 'text', 'aria-label': 'Task due date', value: task.dueDate || '' });
        const dueDateButton = element('button', 'Save due date', { type: 'submit' });
        dueDateInput.disabled = project.archived;
        dueDateButton.disabled = project.archived;
        dueDateForm.append(dueDateInput, dueDateButton);
        dueDateForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const dueDate = dueDateInput.value.trim();
          try {
            const updated = await request(`/api/projects/${id}/tasks/${task.id}/due-date`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ dueDate })
            });
            task.dueDate = updated.dueDate;
            dueDateInput.value = updated.dueDate || '';
            alert.hidden = true;
            showTasks();
          } catch (error) {
            alert.textContent = error.message;
            alert.hidden = false;
          }
        });
        row.append(dueDateForm);
        const priority = element('select', undefined, { 'aria-label': 'Task priority' });
        for (const value of ['Low', 'Normal', 'High']) priority.append(element('option', value, { value }));
        priority.value = task.priority;
        priority.disabled = project.archived;
        priority.addEventListener('change', async () => {
          const previous = task.priority;
          priority.disabled = true;
          try {
            await request(`/api/projects/${id}/tasks/${task.id}/priority`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
            task.priority = priority.value;
            alert.hidden = true;
            showTasks();
          } catch (error) {
            priority.value = previous;
            alert.textContent = error.message;
            alert.hidden = false;
          } finally {
            priority.disabled = project.archived;
          }
        });
        row.append(priority);
        const destinations = activeProjects.filter((candidate) => candidate.id !== Number(id));
        const destination = element('select', undefined, { 'aria-label': 'Destination project' });
        for (const candidate of destinations) {
          destination.append(element('option', candidate.name, { value: candidate.id }));
        }
        const moveButton = element('button', 'Move task', { type: 'button' });
        destination.disabled = project.archived || destinations.length === 0;
        moveButton.disabled = project.archived || destinations.length === 0;
        moveButton.addEventListener('click', async () => {
          if (!destination.value) return;
          moveButton.disabled = true;
          try {
            await request(`/api/projects/${id}/tasks/${task.id}/move`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ destinationProjectId: Number(destination.value) })
            });
            tasks = tasks.filter((candidate) => candidate.id !== task.id);
            alert.hidden = true;
            showTasks();
          } catch (error) {
            alert.textContent = error.message;
            alert.hidden = false;
            moveButton.disabled = project.archived || destinations.length === 0;
          }
        });
        row.append(destination, moveButton);
        const checkbox = element('input', undefined, { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
        checkbox.checked = task.completed;
        checkbox.disabled = project.archived;
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          try {
            await request(`/api/projects/${id}/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
            task.completed = checkbox.checked;
            showTasks();
          } catch (error) {
            checkbox.checked = task.completed;
            alert.textContent = error.message;
            alert.hidden = false;
            checkbox.disabled = false;
          }
        });
        row.append(checkbox);
        rows.append(row);
      }
    }
    async function loadTasks() {
      [tasks, activeProjects] = await Promise.all([
        request(`/api/projects/${id}/tasks`),
        request('/api/projects').then((projects) => projects.filter((candidate) => !candidate.archived))
      ]);
      showTasks();
    }
    filter.addEventListener('change', showTasks);
    priorityFilter.addEventListener('change', showTasks);
    applyDueRange.addEventListener('click', () => {
      const from = dueFrom.value.trim();
      const through = dueThrough.value.trim();
      if ((from && !isValidCalendarDate(from)) || (through && !isValidCalendarDate(through))) {
        alert.textContent = 'Due range must use valid YYYY-MM-DD dates';
        alert.hidden = false;
        return;
      }
      if (from && through && from > through) {
        alert.textContent = 'Due from must not be after Due through';
        alert.hidden = false;
        return;
      }
      appliedDueRange = { from, through };
      dueFrom.value = from;
      dueThrough.value = through;
      alert.hidden = true;
      showTasks();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        alert.textContent = 'Task title is required';
        alert.hidden = false;
        input.focus();
        return;
      }
      try {
        const created = await request(`/api/projects/${id}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
        input.value = '';
        alert.hidden = true;
        tasks.push(created);
        showTasks();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    await loadTasks();
  } catch (error) {
    app.append(element('p', error.message, { role: 'alert' }));
  }
}

async function render() {
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) await renderProject(match[1]);
  else await renderList();
}

window.addEventListener('popstate', render);
render();
