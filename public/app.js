const content = document.querySelector('#content');

function normalizedSearch(value) {
  return value.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

async function getProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects');
  return response.json();
}

function projectRow(project) {
  const row = document.createElement('article');
  row.className = 'project-row';
  row.dataset.testid = 'project-row';
  const name = document.createElement('span');
  name.textContent = project.name;
  const summary = document.createElement('span');
  summary.dataset.testid = 'project-summary';
  summary.textContent = `${project.completedCount}/${project.totalCount} completed`;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open project';
  open.addEventListener('click', () => { window.location.href = `/projects/${project.id}`; });
  row.append(name, summary, open);
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.textContent = project.archived ? 'Restore project' : 'Archive project';
  archive.addEventListener('click', async () => {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archived: !project.archived }),
    });
    if (!response.ok) { showError('Could not update project'); return; }
    await renderList();
  });
  row.append(archive);
  return row;
}

function showError(message) {
  const alert = document.createElement('p');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  content.prepend(alert);
}

async function renderList() {
  content.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Workboard';
  const form = document.createElement('form');
  form.className = 'create-form';
  const label = document.createElement('label');
  label.htmlFor = 'project-name';
  label.textContent = 'Project name';
  const input = document.createElement('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create project';
  form.append(label, input, submit);
  const list = document.createElement('div');
  list.className = 'project-list';
  const searchLabel = document.createElement('label');
  searchLabel.htmlFor = 'project-search';
  searchLabel.textContent = 'Project search';
  const searchInput = document.createElement('input');
  searchInput.id = 'project-search';
  searchInput.type = 'text';
  const searchButton = document.createElement('button');
  searchButton.type = 'button';
  searchButton.textContent = 'Search projects';
  let appliedProjectQuery = '';
  const filterLabel = document.createElement('label');
  filterLabel.htmlFor = 'project-filter';
  filterLabel.textContent = 'Project filter';
  const filter = document.createElement('select');
  filter.id = 'project-filter';
  for (const value of ['Active', 'Archived']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    filter.append(option);
  }
  content.append(heading, form, searchLabel, searchInput, searchButton, filterLabel, filter, list);
  let projects = await getProjects();
  function drawProjects() {
    list.replaceChildren();
    const archived = filter.value === 'Archived';
    for (const project of projects) {
      const name = normalizedSearch(project.name);
      if (project.archived === archived && name.includes(appliedProjectQuery)) list.append(projectRow(project));
    }
  }
  filter.addEventListener('change', drawProjects);
  searchButton.addEventListener('click', () => {
    appliedProjectQuery = normalizedSearch(searchInput.value);
    content.querySelector('[role="alert"]')?.remove();
    drawProjects();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      content.querySelector('[role="alert"]')?.remove();
      showError('Project name is required');
      input.focus();
      return;
    }
    const response = await fetch('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const result = await response.json();
      showError(result.error || 'Could not create project');
      return;
    }
    const project = await response.json();
    content.querySelector('[role="alert"]')?.remove();
    projects.push(project);
    drawProjects();
    form.reset();
    input.focus();
  });
  drawProjects();
}

async function renderProject(id) {
  const projects = await getProjects();
  const project = projects.find((item) => String(item.id) === id);
  content.replaceChildren();
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Projects';
  back.addEventListener('click', () => { window.location.href = '/'; });
  content.append(back);
  if (project) {
    if (project.archived) {
      const archivedMessage = document.createElement('p');
      archivedMessage.textContent = 'Archived project';
      content.append(archivedMessage);
    }
    const heading = document.createElement('h1');
    heading.textContent = project.name;
    content.append(heading);
    const renameForm = document.createElement('form');
    renameForm.className = 'create-form';
    const renameLabel = document.createElement('label');
    renameLabel.htmlFor = 'new-project-name';
    renameLabel.textContent = 'New project name';
    const renameInput = document.createElement('input');
    renameInput.id = 'new-project-name';
    renameInput.name = 'name';
    renameInput.type = 'text';
    renameInput.value = project.name;
    renameInput.disabled = project.archived;
    const renameButton = document.createElement('button');
    renameButton.type = 'submit';
    renameButton.textContent = 'Rename project';
    renameButton.disabled = project.archived;
    renameForm.append(renameLabel, renameInput, renameButton);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = renameInput.value.trim();
      if (!name) {
        content.querySelector('[role="alert"]')?.remove();
        showError('Project name is required');
        renameInput.focus();
        return;
      }
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const result = await response.json();
        showError(result.error || 'Could not rename project');
        return;
      }
      project.name = name;
      heading.textContent = name;
      renameInput.value = name;
      content.querySelector('[role="alert"]')?.remove();
    });
    const defaultPriorityLabel = document.createElement('label');
    defaultPriorityLabel.htmlFor = 'default-task-priority';
    defaultPriorityLabel.textContent = 'Default task priority';
    const defaultPriority = document.createElement('select');
    defaultPriority.id = 'default-task-priority';
    defaultPriority.disabled = project.archived;
    for (const value of ['Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      defaultPriority.append(option);
    }
    defaultPriority.value = project.defaultPriority || 'Normal';
    defaultPriority.addEventListener('change', async () => {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaultPriority: defaultPriority.value }),
      });
      if (!response.ok) {
        defaultPriority.value = project.defaultPriority || 'Normal';
        showError('Could not update default task priority');
        return;
      }
      project.defaultPriority = defaultPriority.value;
    });
    const form = document.createElement('form');
    form.className = 'create-form';
    const label = document.createElement('label');
    label.htmlFor = 'task-title';
    label.textContent = 'Task title';
    const input = document.createElement('input');
    input.id = 'task-title';
    input.name = 'title';
    input.type = 'text';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Create task';
    submit.disabled = project.archived;
    input.disabled = project.archived;
    form.append(label, input, submit);
    const filterLabel = document.createElement('label');
    filterLabel.htmlFor = 'task-filter';
    filterLabel.textContent = 'Task filter';
    const filter = document.createElement('select');
    filter.id = 'task-filter';
    for (const value of ['All', 'Open', 'Completed']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      filter.append(option);
    }
    const priorityFilterLabel = document.createElement('label');
    priorityFilterLabel.htmlFor = 'priority-filter';
    priorityFilterLabel.textContent = 'Priority filter';
    const priorityFilter = document.createElement('select');
    priorityFilter.id = 'priority-filter';
    for (const value of ['All', 'Low', 'Normal', 'High']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priorityFilter.append(option);
    }
    const dueFromLabel = document.createElement('label');
    dueFromLabel.htmlFor = 'due-from';
    dueFromLabel.textContent = 'Due from';
    const dueFrom = document.createElement('input');
    dueFrom.id = 'due-from';
    dueFrom.type = 'text';
    const dueThroughLabel = document.createElement('label');
    dueThroughLabel.htmlFor = 'due-through';
    dueThroughLabel.textContent = 'Due through';
    const dueThrough = document.createElement('input');
    dueThrough.id = 'due-through';
    dueThrough.type = 'text';
    const applyDueRange = document.createElement('button');
    applyDueRange.type = 'button';
    applyDueRange.textContent = 'Apply due range';
    let appliedDueFrom = '';
    let appliedDueThrough = '';
    const list = document.createElement('div');
    list.className = 'task-list';
    const taskSearchLabel = document.createElement('label');
    taskSearchLabel.htmlFor = 'task-search';
    taskSearchLabel.textContent = 'Task search';
    const taskSearchInput = document.createElement('input');
    taskSearchInput.id = 'task-search';
    taskSearchInput.type = 'text';
    const taskSearchButton = document.createElement('button');
    taskSearchButton.type = 'button';
    taskSearchButton.textContent = 'Search tasks';
    let appliedTaskQuery = '';
    const tasksResponse = await fetch(`/api/projects/${id}/tasks`);
    if (!tasksResponse.ok) throw new Error('Could not load tasks');
    let tasks = await tasksResponse.json();
    function drawTasks() {
      list.replaceChildren();
      for (const task of tasks) {
        if (filter.value === 'Open' && task.completed) continue;
        if (filter.value === 'Completed' && !task.completed) continue;
        if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
        if (!normalizedSearch(task.title).includes(appliedTaskQuery)) continue;
        if ((appliedDueFrom || appliedDueThrough) && !task.dueDate) continue;
        if (appliedDueFrom && task.dueDate < appliedDueFrom) continue;
        if (appliedDueThrough && task.dueDate > appliedDueThrough) continue;
        const row = document.createElement('article');
        row.className = 'task-row';
        row.dataset.testid = 'task-row';
        const title = document.createElement('span');
        title.textContent = task.title;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = project.archived;
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked }),
          });
          if (!response.ok) { checkbox.checked = task.completed; showError('Could not update task'); return; }
          task.completed = checkbox.checked;
          drawTasks();
        });
        const priority = document.createElement('select');
        priority.setAttribute('aria-label', 'Task priority');
        priority.disabled = project.archived;
        for (const value of ['Low', 'Normal', 'High']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          priority.append(option);
        }
        priority.value = task.priority || 'Normal';
        priority.addEventListener('change', async () => {
          const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ priority: priority.value }),
          });
          if (!response.ok) { priority.value = task.priority || 'Normal'; showError('Could not update task priority'); return; }
          task.priority = priority.value;
          drawTasks();
        });
        const renameForm = document.createElement('form');
        renameForm.className = 'task-rename-form';
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.value = task.title;
        renameInput.setAttribute('aria-label', 'New task title');
        renameInput.disabled = project.archived;
        const renameButton = document.createElement('button');
        renameButton.type = 'submit';
        renameButton.textContent = 'Rename task';
        renameButton.disabled = project.archived;
        renameForm.append(renameInput, renameButton);
        renameForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const newTitle = renameInput.value.trim();
          if (!newTitle) {
            content.querySelector('[role="alert"]')?.remove();
            showError('Task title is required');
            renameInput.focus();
            return;
          }
          const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          if (!response.ok) {
            const result = await response.json();
            showError(result.error || 'Could not rename task');
            return;
          }
          task.title = newTitle;
          content.querySelector('[role="alert"]')?.remove();
          drawTasks();
        });
        const dueDateInput = document.createElement('input');
        dueDateInput.type = 'text';
        dueDateInput.value = task.dueDate || '';
        dueDateInput.setAttribute('aria-label', 'Task due date');
        dueDateInput.disabled = project.archived;
        const saveDueDate = document.createElement('button');
        saveDueDate.type = 'button';
        saveDueDate.textContent = 'Save due date';
        saveDueDate.disabled = project.archived;
        saveDueDate.addEventListener('click', async () => {
          const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dueDate: dueDateInput.value }),
          });
          if (!response.ok) {
            const result = await response.json();
            showError(result.error || 'Could not save due date');
            return;
          }
          const result = await response.json();
          task.dueDate = result.dueDate;
          dueDateInput.value = result.dueDate || '';
          content.querySelector('[role="alert"]')?.remove();
          drawTasks();
        });
        const destination = document.createElement('select');
        destination.setAttribute('aria-label', 'Destination project');
        const destinations = projects.filter((candidate) => !candidate.archived && candidate.id !== project.id);
        for (const candidate of destinations) {
          const option = document.createElement('option');
          option.value = String(candidate.id);
          option.textContent = candidate.name;
          destination.append(option);
        }
        destination.disabled = project.archived || destinations.length === 0;
        const move = document.createElement('button');
        move.type = 'button';
        move.textContent = 'Move task';
        move.disabled = project.archived || destinations.length === 0;
        move.addEventListener('click', async () => {
          const response = await fetch(`/api/projects/${id}/tasks/${task.id}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ destinationProjectId: Number(destination.value) }),
          });
          if (!response.ok) { showError('Could not move task'); return; }
          tasks = tasks.filter((item) => item.id !== task.id);
          content.querySelector('[role="alert"]')?.remove();
          drawTasks();
        });
        row.append(title, renameForm, priority, checkbox, dueDateInput, saveDueDate, destination, move);
        list.append(row);
      }
    }
    filter.addEventListener('change', drawTasks);
    priorityFilter.addEventListener('change', drawTasks);
    taskSearchButton.addEventListener('click', () => {
      appliedTaskQuery = normalizedSearch(taskSearchInput.value);
      content.querySelector('[role="alert"]')?.remove();
      drawTasks();
    });
    applyDueRange.addEventListener('click', () => {
      const from = dueFrom.value.trim();
      const through = dueThrough.value.trim();
      const validDate = (value) => {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return false;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (year < 1 || month < 1 || month > 12) return false;
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return day >= 1 && day <= days[month - 1];
      };
      if ((from && !validDate(from)) || (through && !validDate(through))) {
        content.querySelector('[role="alert"]')?.remove();
        showError('Due range must use valid YYYY-MM-DD dates');
        return;
      }
      if (from && through && from > through) {
        content.querySelector('[role="alert"]')?.remove();
        showError('Due from must not be after Due through');
        return;
      }
      appliedDueFrom = from;
      appliedDueThrough = through;
      content.querySelector('[role="alert"]')?.remove();
      drawTasks();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        content.querySelector('[role="alert"]')?.remove();
        showError('Task title is required');
        input.focus();
        return;
      }
      const response = await fetch(`/api/projects/${id}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
      });
      if (!response.ok) { const result = await response.json(); showError(result.error || 'Could not create task'); return; }
      tasks.push(await response.json());
      content.querySelector('[role="alert"]')?.remove();
      form.reset();
      drawTasks();
      input.focus();
    });
    content.append(renameForm, defaultPriorityLabel, defaultPriority, form, taskSearchLabel, taskSearchInput, taskSearchButton,
      filterLabel, filter, priorityFilterLabel, priorityFilter,
      dueFromLabel, dueFrom, dueThroughLabel, dueThrough, applyDueRange, list);
    drawTasks();
  } else {
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = 'Project not found';
    content.append(alert);
  }
}

const projectMatch = window.location.pathname.match(/^\/projects\/(\d+)\/?$/);
(projectMatch ? renderProject(projectMatch[1]) : renderList()).catch((error) => {
  console.error(error);
  showError('Could not load projects');
});
