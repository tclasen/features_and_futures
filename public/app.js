const app = document.querySelector('#app');

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function searchText(value) {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

async function renderProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  const filterLabel = element('label', 'Project filter', { for: 'project-filter' });
  const filter = element('select', undefined, { id: 'project-filter', 'aria-label': 'Project filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', value, { value }));
  const searchLabel = element('label', 'Project search', { for: 'project-search' });
  const searchInput = element('input', undefined, { id: 'project-search', type: 'text', 'aria-label': 'Project search' });
  const searchButton = element('button', 'Search projects', { type: 'button' });
  let appliedProjectQuery = '';
  app.append(filterLabel, filter);
  const form = element('form');
  const label = element('label', 'Project name', { for: 'project-name' });
  const input = element('input', undefined, { id: 'project-name', name: 'name', type: 'text', 'aria-label': 'Project name' });
  const submit = element('button', 'Create project', { type: 'submit' });
  const alert = element('p', undefined, { role: 'alert', hidden: '' });
  form.append(label, input, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    try {
      const project = await request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.value }),
      });
      input.value = '';
      await loadProjects();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
  });

  const list = element('ul');
  async function loadProjects() {
    const projects = await request(`/api/projects?filter=${filter.value}`);
    list.replaceChildren();
    const query = searchText(appliedProjectQuery);
    for (const project of projects.filter((item) => searchText(item.name).includes(query))) {
      const row = element('li', undefined, { 'data-testid': 'project-row' });
      const name = element('span', project.name, { class: 'project-name' });
      const summary = element('span', `${project.completedCount || 0}/${project.totalCount} completed`, { 'data-testid': 'project-summary' });
      const open = element('button', 'Open project', { type: 'button' });
      open.addEventListener('click', () => {
        window.location.href = `/projects/${encodeURIComponent(project.id)}`;
      });
      const archive = element('button', filter.value === 'Active' ? 'Archive project' : 'Restore project', { type: 'button' });
      archive.addEventListener('click', async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(project.id)}/archive`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ archived: filter.value === 'Active' }),
          });
          await loadProjects();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
      });
      row.append(name, summary, open, archive);
      list.append(row);
    }
  }
  filter.addEventListener('change', loadProjects);
  searchButton.addEventListener('click', () => {
    appliedProjectQuery = searchInput.value.trim();
    loadProjects();
  });
  app.append(searchLabel, searchInput, searchButton, form, alert, list);
  await loadProjects();
}

async function renderProject(id) {
  app.replaceChildren();
  try {
    const project = await request(`/api/projects/${encodeURIComponent(id)}`);
    const back = element('button', 'Projects', { type: 'button', class: 'back' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back, element('h1', project.name));
    const archived = Boolean(project.archived);
    if (archived) app.append(element('p', 'Archived project'));

    const defaultPriorityLabel = element('label', 'Default task priority', { for: 'default-task-priority' });
    const defaultPriority = element('select', undefined, {
      id: 'default-task-priority', 'aria-label': 'Default task priority',
    });
    for (const value of ['Low', 'Normal', 'High']) {
      defaultPriority.append(element('option', value, { value }));
    }
    defaultPriority.value = project.defaultTaskPriority || 'Normal';
    defaultPriority.disabled = archived;

    const alert = element('p', undefined, { role: 'alert', hidden: '' });
    defaultPriority.addEventListener('change', async () => {
      const previous = project.defaultTaskPriority || 'Normal';
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ defaultTaskPriority: defaultPriority.value }),
        });
        project.defaultTaskPriority = updated.defaultTaskPriority;
      } catch (error) {
        defaultPriority.value = previous;
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    const renameForm = element('form');
    const renameLabel = element('label', 'New project name', { for: 'new-project-name' });
    const renameInput = element('input', undefined, {
      id: 'new-project-name', name: 'name', type: 'text', 'aria-label': 'New project name',
    });
    const renameButton = element('button', 'Rename project', { type: 'submit' });
    renameInput.disabled = archived;
    renameButton.disabled = archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;
      try {
        const updated = await request(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: renameInput.value }),
        });
        app.querySelector('h1').textContent = updated.name;
        renameInput.value = '';
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });

    const form = element('form');
    const label = element('label', 'Task title', { for: 'task-title' });
    const input = element('input', undefined, { id: 'task-title', name: 'title', type: 'text', 'aria-label': 'Task title' });
    const submit = element('button', 'Create task', { type: 'submit' });
    submit.disabled = archived;
    form.append(label, input, submit);

    const filterLabel = element('label', 'Task filter', { for: 'task-filter' });
    const filter = element('select', undefined, { id: 'task-filter', 'aria-label': 'Task filter' });
    for (const value of ['All', 'Open', 'Completed']) filter.append(element('option', value, { value }));
    const priorityFilterLabel = element('label', 'Priority filter', { for: 'priority-filter' });
    const priorityFilter = element('select', undefined, {
      id: 'priority-filter', 'aria-label': 'Priority filter',
    });
    for (const value of ['All', 'Low', 'Normal', 'High']) {
      priorityFilter.append(element('option', value, { value }));
    }
    const dueFromLabel = element('label', 'Due from', { for: 'due-from' });
    const dueFrom = element('input', undefined, { id: 'due-from', type: 'text', 'aria-label': 'Due from' });
    const dueThroughLabel = element('label', 'Due through', { for: 'due-through' });
    const dueThrough = element('input', undefined, { id: 'due-through', type: 'text', 'aria-label': 'Due through' });
    const applyDueRange = element('button', 'Apply due range', { type: 'button' });
    const taskSearchLabel = element('label', 'Task search', { for: 'task-search' });
    const taskSearchInput = element('input', undefined, { id: 'task-search', type: 'text', 'aria-label': 'Task search' });
    const taskSearchButton = element('button', 'Search tasks', { type: 'button' });
    let appliedTaskQuery = '';
    let appliedDueRange = { from: '', through: '' };
    const list = element('ul');
    let tasks = await request(`/api/projects/${encodeURIComponent(id)}/tasks`);
    const destinations = await request(`/api/projects/${encodeURIComponent(id)}/destinations`);
    const normalizeDateBoundary = (value) => {
      const trimmed = value.trim();
      if (!trimmed) return '';
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (year < 1 || month < 1 || month > 12) return null;
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return day >= 1 && day <= daysInMonth[month - 1] ? trimmed : null;
    };
    const renderTasks = () => {
      const matching = tasks.filter((task) => {
        const matchesCompletion = filter.value === 'All'
          || (filter.value === 'Completed' ? Boolean(task.completed) : !task.completed);
        const matchesPriority = priorityFilter.value === 'All'
          || (task.priority || 'Normal') === priorityFilter.value;
        const matchesDueRange = !appliedDueRange.from && !appliedDueRange.through
          || Boolean(task.dueDate)
            && (!appliedDueRange.from || task.dueDate >= appliedDueRange.from)
            && (!appliedDueRange.through || task.dueDate <= appliedDueRange.through);
        const matchesSearch = searchText(task.title).includes(searchText(appliedTaskQuery));
        return matchesCompletion && matchesPriority && matchesDueRange && matchesSearch;
      });
      list.replaceChildren();
      for (const task of matching) {
        const row = element('li', undefined, { 'data-testid': 'task-row' });
        const checkbox = element('input', undefined, {
          type: 'checkbox',
          'aria-label': `Complete ${task.title}`,
        });
        checkbox.checked = Boolean(task.completed);
        checkbox.disabled = archived;
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            task.completed = updated.completed;
            renderTasks();
          } catch (error) {
            checkbox.checked = Boolean(task.completed);
            alert.textContent = error.message;
            alert.hidden = false;
          } finally {
            checkbox.disabled = false;
          }
        });
        const title = element('span', task.title);
        const priority = element('select', undefined, { 'aria-label': 'Task priority' });
        for (const value of ['Low', 'Normal', 'High']) {
          priority.append(element('option', value, { value }));
        }
        priority.value = task.priority || 'Normal';
        priority.disabled = archived;
        priority.addEventListener('change', async () => {
          const previous = task.priority || 'Normal';
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ priority: priority.value }),
            });
            task.priority = updated.priority;
            renderTasks();
          } catch (error) {
            priority.value = previous;
            alert.textContent = error.message;
            alert.hidden = false;
          }
        });
        const renameForm = element('form');
        const renameInput = element('input', undefined, {
          type: 'text',
          'aria-label': 'New task title',
        });
        const renameButton = element('button', 'Rename task', { type: 'submit' });
        renameInput.disabled = archived;
        renameButton.disabled = archived;
        renameForm.append(renameInput, renameButton);
        renameForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          alert.hidden = true;
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ title: renameInput.value }),
            });
            task.title = updated.title;
            renderTasks();
          } catch (error) {
            alert.textContent = error.message;
            alert.hidden = false;
          }
        });
        const dueDateForm = element('form');
        const dueDateInput = element('input', undefined, {
          type: 'text',
          value: task.dueDate || '',
          'aria-label': 'Task due date',
        });
        const saveDueDate = element('button', 'Save due date', { type: 'submit' });
        dueDateInput.disabled = archived;
        saveDueDate.disabled = archived;
        dueDateForm.append(dueDateInput, saveDueDate);
        dueDateForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          alert.hidden = true;
          try {
            const updated = await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ dueDate: dueDateInput.value }),
            });
            task.dueDate = updated.dueDate;
            dueDateInput.value = updated.dueDate || '';
            renderTasks();
          } catch (error) {
            alert.textContent = error.message;
            alert.hidden = false;
          }
        });
        const destinationSelect = element('select', undefined, { 'aria-label': 'Destination project' });
        for (const destination of destinations) {
          destinationSelect.append(element('option', destination.name, { value: destination.id }));
        }
        const moveButton = element('button', 'Move task', { type: 'button' });
        destinationSelect.disabled = archived || destinations.length === 0;
        moveButton.disabled = archived || destinations.length === 0;
        moveButton.addEventListener('click', async () => {
          try {
            await request(`/api/projects/${encodeURIComponent(id)}/tasks/${encodeURIComponent(task.id)}`, {
              method: 'PATCH', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ destinationProjectId: destinationSelect.value }),
            });
            tasks = tasks.filter((item) => item.id !== task.id);
            renderTasks();
          } catch (error) {
            alert.textContent = error.message;
            alert.hidden = false;
          }
        });
        row.append(title, checkbox, priority, renameForm, dueDateForm, destinationSelect, moveButton);
        list.append(row);
      }
    };
    filter.addEventListener('change', renderTasks);
    priorityFilter.addEventListener('change', renderTasks);
    applyDueRange.addEventListener('click', () => {
      const from = normalizeDateBoundary(dueFrom.value);
      const through = normalizeDateBoundary(dueThrough.value);
      if (from === null || through === null) {
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
      dueFrom.value = from;
      dueThrough.value = through;
      renderTasks();
    });
    taskSearchButton.addEventListener('click', () => {
      appliedTaskQuery = taskSearchInput.value.trim();
      renderTasks();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;
      try {
        const task = await request(`/api/projects/${encodeURIComponent(id)}/tasks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: input.value }),
        });
        tasks.push(task);
        input.value = '';
        renderTasks();
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
    renderTasks();
    app.append(renameForm, alert, defaultPriorityLabel, defaultPriority, form, filterLabel, filter, priorityFilterLabel, priorityFilter,
      taskSearchLabel, taskSearchInput, taskSearchButton,
      dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, list);
  } catch {
    app.append(element('h1', 'Project not found'));
    const back = element('button', 'Projects', { type: 'button' });
    back.addEventListener('click', () => { window.location.href = '/'; });
    app.append(back);
  }
}

const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
if (match) renderProject(decodeURIComponent(match[1]));
else renderProjects().catch(() => {
  app.replaceChildren(element('h1', 'Workboard'), element('p', 'Unable to load projects.'));
});
