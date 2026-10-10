const app = document.querySelector('#app');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = location.pathname.match(/^\/projects\/(\d+)\/?$/);
  if (match) {
    let project;
    try {
      const response = await fetch(`/api/projects/${match[1]}`);
      if (!response.ok) throw new Error('Project not found');
      project = await response.json();
    } catch {
      app.append(element('h1', 'Project not found'));
      const back = element('button', 'Projects');
      back.addEventListener('click', () => navigate('/'));
      app.append(back);
      return;
    }
    app.append(element('h1', project.name));
    if (project.archived) app.append(element('p', 'Archived project')); 
    const back = element('button', 'Projects');
    back.addEventListener('click', () => navigate('/'));
    app.append(back);

    const renameForm = element('form', undefined, 'create-form');
    const renameLabel = element('label', 'New project name');
    renameLabel.htmlFor = 'new-project-name';
    const renameInput = element('input');
    renameInput.id = 'new-project-name';
    renameInput.type = 'text';
    renameInput.autocomplete = 'off';
    renameInput.value = project.name;
    renameInput.disabled = project.archived;
    const renameButton = element('button', 'Rename project');
    renameButton.type = 'submit';
    renameButton.disabled = project.archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    const renameAlert = element('p', '', 'alert');
    renameAlert.setAttribute('role', 'alert');
    renameAlert.hidden = true;
    app.append(renameForm, renameAlert);
    const defaultLabel = element('label', 'Default task priority');
    defaultLabel.htmlFor = 'default-task-priority';
    const defaultPriority = element('select');
    defaultPriority.id = 'default-task-priority';
    defaultPriority.setAttribute('aria-label', 'Default task priority');
    for (const value of ['Low', 'Normal', 'High']) defaultPriority.append(new Option(value, value));
    defaultPriority.value = project.default_priority;
    defaultPriority.disabled = project.archived;
    defaultPriority.addEventListener('change', async () => {
      const response = await fetch(`/api/projects/${match[1]}/default-priority`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: defaultPriority.value })
      });
      if (!response.ok) defaultPriority.value = project.default_priority;
      else project.default_priority = defaultPriority.value;
    });
    app.append(defaultLabel, defaultPriority);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        renameAlert.textContent = 'Project name is required';
        renameAlert.hidden = false;
        renameInput.focus();
        return;
      }
      const response = await fetch(`/api/projects/${match[1]}/rename`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      if (!response.ok) {
        renameAlert.textContent = 'Project name is required';
        renameAlert.hidden = false;
        return;
      }
      renameAlert.hidden = true;
      renameInput.value = name;
      app.querySelector('h1').textContent = name;
    });

    const form = element('form', undefined, 'create-form');
    const label = element('label', 'Task title');
    label.htmlFor = 'task-title';
    const input = element('input');
    input.id = 'task-title';
    input.type = 'text';
    input.autocomplete = 'off';
    const submit = element('button', 'Create task');
    submit.type = 'submit';
    if (project.archived) submit.disabled = true;
    form.append(label, input, submit);
    const alert = element('p', '', 'alert');
    alert.setAttribute('role', 'alert');
    alert.hidden = true;
    const filterLabel = element('label', 'Task filter');
    filterLabel.htmlFor = 'task-filter';
    const filter = element('select');
    filter.id = 'task-filter';
    for (const value of ['All', 'Open', 'Completed']) filter.append(new Option(value, value));
    const priorityFilterLabel = element('label', 'Priority filter');
    priorityFilterLabel.htmlFor = 'priority-filter';
    const priorityFilter = element('select');
    priorityFilter.id = 'priority-filter';
    for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(new Option(value, value));
    const dueFromLabel = element('label', 'Due from');
    const dueFrom = element('input');
    dueFrom.type = 'text';
    dueFrom.setAttribute('aria-label', 'Due from');
    dueFromLabel.append(dueFrom);
    const dueThroughLabel = element('label', 'Due through');
    const dueThrough = element('input');
    dueThrough.type = 'text';
    dueThrough.setAttribute('aria-label', 'Due through');
    dueThroughLabel.append(dueThrough);
    const applyDueRange = element('button', 'Apply due range');
    applyDueRange.type = 'button';
    const dueRangeAlert = element('p', '', 'alert');
    dueRangeAlert.setAttribute('role', 'alert');
    dueRangeAlert.hidden = true;
    let appliedFrom = '', appliedThrough = '';
    const taskSearchLabel = element('label', 'Task search');
    const taskSearch = element('input');
    taskSearch.type = 'text';
    taskSearch.setAttribute('aria-label', 'Task search');
    taskSearchLabel.append(taskSearch);
    const searchTasks = element('button', 'Search tasks');
    searchTasks.type = 'button';
    let appliedTaskQuery = '';
    const list = element('section', undefined, 'task-list');
    app.append(form, alert, filterLabel, filter, priorityFilterLabel, priorityFilter,
      dueFromLabel, dueThroughLabel, applyDueRange, dueRangeAlert, taskSearchLabel, searchTasks, list);

    function validDate(value) {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return false;
      const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
      const date = new Date(0);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCFullYear(year, month - 1, day);
      return year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }
    applyDueRange.addEventListener('click', () => {
      const from = dueFrom.value.trim(), through = dueThrough.value.trim();
      if ((from && !validDate(from)) || (through && !validDate(through))) {
        dueRangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates';
        dueRangeAlert.hidden = false;
        return;
      }
      if (from && through && from > through) {
        dueRangeAlert.textContent = 'Due from must not be after Due through';
        dueRangeAlert.hidden = false;
        return;
      }
      appliedFrom = from;
      appliedThrough = through;
      dueRangeAlert.hidden = true;
      loadTasks();
    });

    async function loadTasks() {
      const response = await fetch(`/api/projects/${match[1]}/tasks`);
      const tasks = await response.json();
      const destinationsResponse = await fetch('/api/active-projects');
      const destinations = (await destinationsResponse.json()).filter(p => String(p.id) !== String(match[1]));
      list.replaceChildren();
      for (const task of tasks.filter(t =>
        (filter.value === 'All' || (filter.value === 'Completed') === t.completed) &&
        (priorityFilter.value === 'All' || priorityFilter.value === t.priority) &&
        t.title.replace(/[A-Z]/g, c => c.toLowerCase()).includes(appliedTaskQuery.replace(/[A-Z]/g, c => c.toLowerCase())) &&
        ((!appliedFrom && !appliedThrough) || (!!t.due_date && (!appliedFrom || t.due_date >= appliedFrom) && (!appliedThrough || t.due_date <= appliedThrough)))
      )) {
        const row = element('div', undefined, 'task-row');
        row.dataset.testid = 'task-row';
        row.append(element('span', task.title));
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = project.archived;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await loadTasks();
        });
        row.append(checkbox);
        const priority = element('select');
        priority.setAttribute('aria-label', 'Task priority');
        for (const value of ['Low', 'Normal', 'High']) priority.append(new Option(value, value));
        priority.value = task.priority;
        priority.disabled = project.archived;
        priority.addEventListener('change', async () => {
          const response = await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
          if (response.ok) await loadTasks();
        });
        row.append(priority);
        const dueForm = element('form', undefined, 'create-form');
        const dueInput = element('input');
        dueInput.type = 'text';
        dueInput.value = task.due_date || '';
        dueInput.setAttribute('aria-label', 'Task due date');
        dueInput.disabled = project.archived;
        const dueButton = element('button', 'Save due date');
        dueButton.type = 'submit';
        dueButton.disabled = project.archived;
        dueForm.append(dueInput, dueButton);
        const dueAlert = element('p', '', 'alert');
        dueAlert.setAttribute('role', 'alert');
        dueAlert.hidden = true;
        dueForm.addEventListener('submit', async event => {
          event.preventDefault();
          const response = await fetch(`/api/tasks/${task.id}/due-date`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: dueInput.value }) });
          if (!response.ok) {
            dueAlert.textContent = 'Due date must be a valid YYYY-MM-DD date';
            dueAlert.hidden = false;
            return;
          }
          dueAlert.hidden = true;
          const saved = await response.json();
          dueInput.value = saved.due_date || '';
          await loadTasks();
        });
        row.append(dueForm, dueAlert);
        const destination = element('select');
        destination.setAttribute('aria-label', 'Destination project');
        for (const candidate of destinations) destination.append(new Option(candidate.name, candidate.id));
        const moveButton = element('button', 'Move task');
        moveButton.type = 'button';
        destination.disabled = project.archived || destinations.length === 0;
        moveButton.disabled = project.archived || destinations.length === 0;
        moveButton.addEventListener('click', async () => {
          const moved = await fetch(`/api/tasks/${task.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination_id: destination.value }) });
          if (moved.ok) await loadTasks();
        });
        row.append(destination, moveButton);
        const renameForm = element('form', undefined, 'create-form');
        const renameInput = element('input');
        renameInput.type = 'text';
        renameInput.value = task.title;
        renameInput.setAttribute('aria-label', 'New task title');
        renameInput.disabled = project.archived;
        const renameButton = element('button', 'Rename task');
        renameButton.type = 'submit';
        renameButton.disabled = project.archived;
        renameForm.append(renameInput, renameButton);
        const renameAlert = element('p', '', 'alert');
        renameAlert.setAttribute('role', 'alert');
        renameAlert.hidden = true;
        renameForm.addEventListener('submit', async event => {
          event.preventDefault();
          const title = renameInput.value.trim();
          if (!title) {
            renameAlert.textContent = 'Task title is required';
            renameAlert.hidden = false;
            renameInput.focus();
            return;
          }
          const response = await fetch(`/api/tasks/${task.id}/rename`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
          });
          if (!response.ok) {
            renameAlert.textContent = 'Task title is required';
            renameAlert.hidden = false;
            return;
          }
          await loadTasks();
        });
        row.append(renameForm, renameAlert);
        list.append(row);
      }
    }
    searchTasks.addEventListener('click', () => { appliedTaskQuery = taskSearch.value.trim(); loadTasks(); });
    filter.addEventListener('change', loadTasks);
    priorityFilter.addEventListener('change', loadTasks);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
      const response = await fetch(`/api/projects/${match[1]}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, priority: project.default_priority }) });
      if (!response.ok) { alert.textContent = 'Task title is required'; alert.hidden = false; return; }
      alert.hidden = true;
      input.value = '';
      await loadTasks();
    });
    await loadTasks();
    return;
  }

  app.append(element('h1', 'Workboard'));
  const form = element('form', undefined, 'create-form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  input.autocomplete = 'off';
  const submit = element('button', 'Create project');
  submit.type = 'submit';
  form.append(label, input, submit);
  const alert = element('p', '', 'alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) filter.append(new Option(value, value));
  const projectSearchLabel = element('label', 'Project search');
  const projectSearch = element('input');
  projectSearch.type = 'text';
  projectSearch.setAttribute('aria-label', 'Project search');
  projectSearchLabel.append(projectSearch);
  const searchProjects = element('button', 'Search projects');
  searchProjects.type = 'button';
  const list = element('section', undefined, 'project-list');
  list.setAttribute('aria-label', 'Projects');
  app.append(form, alert, filterLabel, filter, projectSearchLabel, searchProjects, list);
  let appliedProjectQuery = '';

  async function loadProjects() {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    list.replaceChildren();
    const query = appliedProjectQuery.replace(/[A-Z]/g, c => c.toLowerCase());
    for (const project of projects.filter(p => p.archived === (filter.value === 'Archived') &&
      p.name.replace(/[A-Z]/g, c => c.toLowerCase()).includes(query))) {
      const row = element('div', undefined, 'project-row');
      row.dataset.testid = 'project-row';
      const details = element('div');
      details.append(element('span', project.name));
      const summary = element('span', project.summary, 'project-summary');
      summary.dataset.testid = 'project-summary';
      details.append(summary);
      row.append(details);
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => navigate(`/projects/${project.id}`));
      row.append(open);
      const action = element('button', project.archived ? 'Restore project' : 'Archive project');
      action.type = 'button';
      action.addEventListener('click', async () => {
        await fetch(`/api/projects/${project.id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
        await loadProjects();
      });
      row.append(action);
      list.append(row);
    }
  }
  searchProjects.addEventListener('click', () => { appliedProjectQuery = projectSearch.value.trim(); loadProjects(); });
  filter.addEventListener('change', loadProjects);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (!response.ok) {
      alert.textContent = 'Project name is required';
      alert.hidden = false;
      return;
    }
    alert.hidden = true;
    input.value = '';
    await loadProjects();
  });
  await loadProjects();
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);
render();
