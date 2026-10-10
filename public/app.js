const content = document.querySelector('#content');

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
  content.append(heading, form, filterLabel, filter, list);
  let projects = await getProjects();
  function drawProjects() {
    list.replaceChildren();
    const archived = filter.value === 'Archived';
    for (const project of projects) if (project.archived === archived) list.append(projectRow(project));
  }
  filter.addEventListener('change', drawProjects);
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
    const list = document.createElement('div');
    list.className = 'task-list';
    const tasksResponse = await fetch(`/api/projects/${id}/tasks`);
    if (!tasksResponse.ok) throw new Error('Could not load tasks');
    let tasks = await tasksResponse.json();
    function drawTasks() {
      list.replaceChildren();
      for (const task of tasks) {
        if (filter.value === 'Open' && task.completed) continue;
        if (filter.value === 'Completed' && !task.completed) continue;
        if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
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
        row.append(title, renameForm, priority, checkbox);
        list.append(row);
      }
    }
    filter.addEventListener('change', drawTasks);
    priorityFilter.addEventListener('change', drawTasks);
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
    content.append(renameForm, form, filterLabel, filter, priorityFilterLabel, priorityFilter, list);
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
