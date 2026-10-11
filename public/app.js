const app = document.querySelector('#app');
const projectViewState = new Map();
const normalizeSearch = value => value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, character => character.toLowerCase());

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

async function render() {
  app.replaceChildren();
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (match) {
    let project;
    try { project = await request(`/api/projects/${encodeURIComponent(match[1])}`); } catch { project = null; }
    const back = element('button', { type: 'button' }, 'Projects');
    back.addEventListener('click', () => { projectViewState.delete(match[1]); history.pushState({}, '', '/'); render(); });
    app.append(back);
    if (!project) { app.append(element('p', { role: 'alert' }, 'Project not found')); return; }
    app.append(element('h1', {}, project.name));
    const downloadProject = element('button', { type: 'button' }, 'Download project');
    downloadProject.addEventListener('click', () => {
      const link = element('a', { href: `/api/projects/${encodeURIComponent(match[1])}/export`, download: 'workboard-project.json' });
      document.body.append(link);
      link.click();
      link.remove();
    });
    app.append(downloadProject);
    if (project.archived) app.append(element('p', {}, 'Archived project'));
    const renameForm = element('form');
    const renameLabel = element('label', { for: 'new-project-name' }, 'New project name');
    const renameInput = element('input', { id: 'new-project-name', name: 'name', type: 'text' });
    const renameButton = element('button', { type: 'submit' }, 'Rename project');
    const renameAlert = element('p', { role: 'alert', hidden: '' });
    if (project.archived) { renameInput.disabled = true; renameButton.disabled = true; }
    renameForm.append(renameLabel, renameInput, renameButton, renameAlert);
    renameForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) { renameAlert.textContent = 'Project name is required'; renameAlert.hidden = false; renameInput.focus(); return; }
      try {
        await request(`/api/projects/${encodeURIComponent(match[1])}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        render();
      } catch (error) { renameAlert.textContent = error.message; renameAlert.hidden = false; }
    });
    app.append(renameForm);
    const defaultPriorityLabel = element('label', { for: 'default-task-priority' }, 'Default task priority');
    const defaultPriority = element('select', { id: 'default-task-priority' });
    for (const value of ['Low', 'Normal', 'High']) defaultPriority.append(element('option', { value }, value));
    defaultPriority.value = project.defaultPriority || 'Normal';
    defaultPriority.disabled = Boolean(project.archived);
    defaultPriority.addEventListener('change', async () => {
      try {
        await request(`/api/projects/${encodeURIComponent(match[1])}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultPriority: defaultPriority.value }) });
      } catch { defaultPriority.value = project.defaultPriority || 'Normal'; }
    });
    app.append(defaultPriorityLabel, defaultPriority);
    const form = element('form');
    const label = element('label', { for: 'task-title' }, 'Task title');
    const input = element('input', { id: 'task-title', name: 'title', type: 'text' });
    const submit = element('button', { type: 'submit' }, 'Create task');
    const alert = element('p', { role: 'alert', hidden: '' });
    if (project.archived) { input.disabled = true; submit.disabled = true; }
    form.append(label, input, submit, alert);
    const filterLabel = element('label', { for: 'task-filter' }, 'Task filter');
    const filter = element('select', { id: 'task-filter' });
    for (const value of ['All', 'Open', 'Completed', 'Deleted']) filter.append(element('option', { value }, value));
    const priorityFilterLabel = element('label', { for: 'priority-filter' }, 'Priority filter');
    const priorityFilter = element('select', { id: 'priority-filter' });
    for (const value of ['All', 'Low', 'Normal', 'High']) priorityFilter.append(element('option', { value }, value));
    const dueFromLabel = element('label', { for: 'due-from' }, 'Due from');
    const dueFrom = element('input', { id: 'due-from', type: 'text', 'aria-label': 'Due from' });
    const dueThroughLabel = element('label', { for: 'due-through' }, 'Due through');
    const dueThrough = element('input', { id: 'due-through', type: 'text', 'aria-label': 'Due through' });
    const applyDueRange = element('button', { type: 'button' }, 'Apply due range');
    const rangeAlert = element('p', { role: 'alert', hidden: '' });
    const viewState = projectViewState.get(match[1]) || { appliedFrom: '', appliedThrough: '', dueFrom: '', dueThrough: '', taskFilter: 'All', priorityFilter: 'All', taskQuery: '', taskInput: '' };
    let appliedFrom = viewState.appliedFrom, appliedThrough = viewState.appliedThrough;
    dueFrom.value = viewState.dueFrom;
    dueThrough.value = viewState.dueThrough;
    let taskQuery = viewState.taskQuery;
    const taskSearchInput = element('input', { type: 'text', 'aria-label': 'Task search', value: viewState.taskInput });
    const taskSearchButton = element('button', { type: 'button' }, 'Search tasks');
    filter.value = viewState.taskFilter;
    priorityFilter.value = viewState.priorityFilter;
    const saveViewState = () => {
      projectViewState.set(match[1], { appliedFrom, appliedThrough, dueFrom: dueFrom.value, dueThrough: dueThrough.value, taskFilter: filter.value, priorityFilter: priorityFilter.value, taskQuery, taskInput: taskSearchInput.value });
    };
    dueFrom.addEventListener('input', saveViewState);
    dueThrough.addEventListener('input', saveViewState);
    taskSearchInput.addEventListener('input', saveViewState);
    taskSearchButton.addEventListener('click', () => { taskQuery = taskSearchInput.value.trim(); saveViewState(); refresh(); });
    const destinations = await request('/api/projects?archived=false');
    const eligibleDestinations = destinations.filter(item => item.id !== project.id);
    const tasks = element('section', { 'aria-label': 'Tasks' });
    app.append(form, filterLabel, filter, priorityFilterLabel, priorityFilter,
      dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, rangeAlert,
      taskSearchInput, taskSearchButton, tasks);
    const refresh = async () => {
      const items = await request(`/api/projects/${encodeURIComponent(match[1])}/tasks`);
      tasks.replaceChildren();
      for (const task of items) {
        if (!normalizeSearch(task.title).includes(normalizeSearch(taskQuery))) continue;
        if (filter.value === 'Deleted' ? !task.deleted : Boolean(task.deleted)) continue;
        if ((filter.value === 'Open' && task.completed) || (filter.value === 'Completed' && !task.completed)) continue;
        if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
        if ((appliedFrom || appliedThrough) && (!task.dueDate ||
          (appliedFrom && task.dueDate < appliedFrom) ||
          (appliedThrough && task.dueDate > appliedThrough))) continue;
        const row = element('div', { 'data-testid': 'task-row', class: 'project-row' });
        row.append(element('span', {}, task.title));
        const renameInput = element('input', { type: 'text', 'aria-label': 'New task title', value: task.title });
        const renameButton = element('button', { type: 'button' }, 'Rename task');
        const renameAlert = element('span', { role: 'alert', hidden: '' });
        renameInput.disabled = Boolean(project.archived || task.deleted);
        renameButton.disabled = Boolean(project.archived || task.deleted);
        renameButton.addEventListener('click', async () => {
          const title = renameInput.value.trim();
          if (!title) { renameAlert.textContent = 'Task title is required'; renameAlert.hidden = false; renameInput.focus(); return; }
          try {
            await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
            await refresh();
          } catch (error) { renameAlert.textContent = error.message; renameAlert.hidden = false; }
        });
        row.append(renameInput, renameButton, renameAlert);
        const priority = element('select', { 'aria-label': 'Task priority' });
        for (const value of ['Low', 'Normal', 'High']) priority.append(element('option', { value }, value));
        priority.value = task.priority || 'Normal';
        priority.disabled = Boolean(project.archived || task.deleted);
        priority.addEventListener('change', async () => {
          try {
            await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: priority.value }) });
            await refresh();
          } catch (error) { priority.value = task.priority || 'Normal'; }
        });
        row.append(priority);
        const dueDate = element('input', { type: 'text', 'aria-label': 'Task due date', value: task.dueDate || '' });
        const saveDueDate = element('button', { type: 'button', 'aria-label': 'Save due date' }, 'Save due date');
        const dueDateAlert = element('span', { role: 'alert', hidden: '' });
        dueDate.disabled = Boolean(project.archived || task.deleted);
        saveDueDate.disabled = Boolean(project.archived || task.deleted);
        saveDueDate.addEventListener('click', async () => {
          try {
            await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate: dueDate.value }) });
            dueDateAlert.hidden = true;
            await refresh();
          } catch (error) { dueDateAlert.textContent = error.message; dueDateAlert.hidden = false; }
        });
        row.append(dueDate, saveDueDate, dueDateAlert);
        const notes = element('textarea', { 'aria-label': 'Task notes', rows: '3' });
        notes.value = task.notes || '';
        const saveNotes = element('button', { type: 'button', 'aria-label': 'Save notes' }, 'Save notes');
        const notesAlert = element('span', { role: 'alert', hidden: '' });
        notes.disabled = Boolean(project.archived || task.deleted);
        saveNotes.disabled = Boolean(project.archived || task.deleted);
        saveNotes.addEventListener('click', async () => {
          try {
            await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes.value }) });
            notesAlert.hidden = true;
            await refresh();
          } catch (error) { notesAlert.textContent = error.message; notesAlert.hidden = false; }
        });
        row.append(notes, saveNotes, notesAlert);
        const checkbox = element('input', { type: 'checkbox', 'aria-label': `Complete ${task.title}` });
        checkbox.checked = Boolean(task.completed);
        checkbox.disabled = Boolean(project.archived || task.deleted);
        checkbox.addEventListener('change', async () => {
          await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: checkbox.checked }) });
          await refresh();
        });
        row.append(checkbox);
        const destination = element('select', { 'aria-label': 'Destination project' });
        for (const item of eligibleDestinations) destination.append(element('option', { value: item.id }, item.name));
        const moveButton = element('button', { type: 'button' }, 'Move task');
        destination.disabled = Boolean(project.archived || task.deleted) || eligibleDestinations.length === 0;
        moveButton.disabled = Boolean(project.archived || task.deleted) || eligibleDestinations.length === 0;
        moveButton.addEventListener('click', async () => {
          try {
            await request(`/api/tasks/${encodeURIComponent(task.id)}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationProjectId: destination.value }) });
            await refresh();
          } catch (error) { moveAlert.textContent = error.message; moveAlert.hidden = false; }
        });
        const moveAlert = element('span', { role: 'alert', hidden: '' });
        row.append(destination, moveButton, moveAlert);
        const deletionButton = element('button', { type: 'button' }, task.deleted ? 'Restore task' : 'Delete task');
        deletionButton.disabled = Boolean(project.archived);
        deletionButton.addEventListener('click', async () => {
          await request(`/api/tasks/${encodeURIComponent(task.id)}/deletion`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: !task.deleted }) });
          await refresh();
        });
        row.append(deletionButton); tasks.append(row);
      }
    };
    const validCalendarDate = value => {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return false;
      const [, y, m, d] = match.map(Number);
      if (y < 1 || m < 1 || m > 12) return false;
      const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return d >= 1 && d <= days[m - 1];
    };
    applyDueRange.addEventListener('click', async () => {
      const from = dueFrom.value.trim(), through = dueThrough.value.trim();
      if ((from && !validCalendarDate(from)) || (through && !validCalendarDate(through))) {
        rangeAlert.textContent = 'Due range must use valid YYYY-MM-DD dates'; rangeAlert.hidden = false; return;
      }
      if (from && through && from > through) {
        rangeAlert.textContent = 'Due from must not be after Due through'; rangeAlert.hidden = false; return;
      }
      appliedFrom = from; appliedThrough = through; rangeAlert.hidden = true;
      saveViewState();
      await refresh();
    });
    filter.addEventListener('change', () => { saveViewState(); refresh(); });
    priorityFilter.addEventListener('change', () => { saveViewState(); refresh(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) { alert.textContent = 'Task title is required'; alert.hidden = false; input.focus(); return; }
      try {
        await request(`/api/projects/${encodeURIComponent(match[1])}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
        input.value = ''; alert.hidden = true; await refresh();
      } catch (error) { alert.textContent = error.message; alert.hidden = false; }
    });
    await refresh(); return;
  }
  app.append(element('h1', {}, 'Workboard'));
  const form = element('form');
  const label = element('label', { for: 'project-name' }, 'Project name');
  const input = element('input', { id: 'project-name', name: 'name', type: 'text' });
  const submit = element('button', { type: 'submit' }, 'Create project');
  const alert = element('p', { role: 'alert', hidden: '' });
  form.append(label, input, submit, alert);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) { alert.textContent = 'Project name is required'; alert.hidden = false; input.focus(); return; }
    try {
      await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      input.value = ''; alert.hidden = true; await renderProjects();
    } catch (error) { alert.textContent = error.message; alert.hidden = false; }
  });
  app.append(form);
  const importForm = element('form');
  const jsonLabel = element('label', { for: 'project-json' }, 'Project JSON');
  const jsonInput = element('textarea', { id: 'project-json', 'aria-label': 'Project JSON', rows: '6' });
  const importedNameLabel = element('label', { for: 'imported-project-name' }, 'Imported project name');
  const importedNameInput = element('input', { id: 'imported-project-name', type: 'text', 'aria-label': 'Imported project name' });
  const importButton = element('button', { type: 'submit' }, 'Import project');
  const importAlert = element('p', { role: 'alert', hidden: '' });
  importForm.append(jsonLabel, jsonInput, importedNameLabel, importedNameInput, importButton, importAlert);
  importForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const result = await request('/api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: jsonInput.value, name: importedNameInput.value }) });
      history.pushState({}, '', `/projects/${encodeURIComponent(result.id)}`);
      render();
    } catch (error) {
      importAlert.textContent = error.message === 'Project name is required' ? error.message : 'Invalid project JSON';
      importAlert.hidden = false;
    }
  });
  app.append(importForm);
  const labelFilter = element('label', { for: 'project-filter' }, 'Project filter');
  const filter = element('select', { id: 'project-filter' });
  for (const value of ['Active', 'Archived']) filter.append(element('option', { value }, value));
  const projectSearchInput = element('input', { type: 'text', 'aria-label': 'Project search' });
  const projectSearchButton = element('button', { type: 'button' }, 'Search projects');
  let projectQuery = '';
  const list = element('section', { 'aria-label': 'Projects' });
  app.append(labelFilter, filter, projectSearchInput, projectSearchButton, list);
  const renderProjects = async () => {
    const projects = await request(`/api/projects?archived=${filter.value === 'Archived'}`);
    list.replaceChildren();
    const query = normalizeSearch(projectQuery);
    for (const project of projects) {
      if (!normalizeSearch(project.name).includes(query)) continue;
      const row = element('div', { 'data-testid': 'project-row', class: 'project-row' });
      row.append(element('span', {}, project.name));
      row.append(element('span', { 'data-testid': 'project-summary' }, `${project.completedCount}/${project.totalCount} completed`));
      const open = element('button', { type: 'button' }, 'Open project');
      open.addEventListener('click', () => { projectViewState.delete(String(project.id)); history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`); render(); });
      const action = element('button', { type: 'button' }, project.archived ? 'Restore project' : 'Archive project');
      action.addEventListener('click', async () => {
        await request(`/api/projects/${encodeURIComponent(project.id)}/archive`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !project.archived }) });
        await renderProjects();
      });
      row.append(open, action); list.append(row);
    }
  };
  projectSearchButton.addEventListener('click', () => { projectQuery = projectSearchInput.value.trim(); renderProjects(); });
  filter.addEventListener('change', renderProjects);
  await renderProjects();
}

window.addEventListener('popstate', () => { projectViewState.clear(); render(); });
render().catch(error => app.replaceChildren(element('p', { role: 'alert' }, error.message)));
