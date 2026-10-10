const app = document.querySelector('#app');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function asciiLower(value) {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

function searchForm(kind, apply) {
  const form = element('form');
  const label = element('label', `${kind} search`);
  label.htmlFor = `${kind.toLowerCase()}-search`;
  const input = element('input');
  input.id = label.htmlFor;
  input.type = 'text';
  const button = element('button', kind === 'Project' ? 'Search projects' : 'Search tasks');
  button.type = 'submit';
  form.append(label, input, button);
  form.addEventListener('submit', event => {
    event.preventDefault();
    input.value = input.value.trim();
    apply(asciiLower(input.value));
  });
  return form;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load projects');
  return data;
}

function alertBox() {
  const alert = element('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  app.append(alert);
  return alert;
}

async function showProjects() {
  app.replaceChildren(element('h1', 'Workboard'));
  const form = element('form');
  const label = element('label', 'Project name');
  label.htmlFor = 'project-name';
  const input = element('input');
  input.id = 'project-name';
  input.name = 'name';
  input.type = 'text';
  const create = element('button', 'Create project');
  create.type = 'submit';
  form.append(label, input, create);
  app.append(form);
  const alert = alertBox();
  const filterLabel = element('label', 'Project filter');
  filterLabel.htmlFor = 'project-filter';
  const filter = element('select');
  filter.id = 'project-filter';
  for (const name of ['Active', 'Archived']) {
    const option = element('option', name);
    option.value = name;
    filter.append(option);
  }
  let query = '';
  const search = searchForm('Project', value => {
    query = value;
    render();
  });
  app.append(filterLabel, filter, search);
  let projects = [];
  const list = element('section');
  list.setAttribute('aria-label', 'Projects');
  app.append(list);

  function render() {
    list.replaceChildren();
    for (const project of projects) {
      if (Boolean(project.archived) !== (filter.value === 'Archived')) continue;
      if (!asciiLower(project.name).includes(query)) continue;
      const row = element('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';
      const open = element('button', 'Open project');
      open.type = 'button';
      open.addEventListener('click', () => { location.href = `/projects/${project.id}`; });
      const summary = element('span', `${project.completed}/${project.total} completed`);
      summary.dataset.testid = 'project-summary';
      const archive = element('button', project.archived ? 'Restore project' : 'Archive project');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        archive.disabled = true;
        alert.hidden = true;
        try {
          await request(`/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !project.archived }),
          });
          await refresh();
        } catch (error) { showError(error); }
        finally { archive.disabled = false; }
      });
      row.append(element('span', project.name), summary, open, archive);
      list.append(row);
    }
  }
  function showError(error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
  async function refresh() {
    projects = await request('/api/projects');
    render();
  }
  filter.addEventListener('change', render);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return showError(new Error('Project name is required'));
    create.disabled = true;
    alert.hidden = true;
    try {
      await request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      await refresh();
      input.focus();
    } catch (error) { showError(error); }
    finally { create.disabled = false; }
  });
  try { await refresh(); }
  catch (error) { showError(error); }
}

async function showProject(id) {
  app.replaceChildren();
  const back = element('button', 'Projects');
  back.type = 'button';
  back.addEventListener('click', () => { location.href = '/'; });
  app.append(back);
  const alert = alertBox();
  try {
    const project = await request(`/api/projects/${id}`);
    const destinations = (await request('/api/projects')).filter(other => !other.archived && other.id !== project.id);
    const heading = element('h1', project.name);
    app.prepend(heading);
    document.title = `${project.name} — Workboard`;
    if (project.archived) app.append(element('p', 'Archived project'));
    const renameForm = element('form');
    const renameLabel = element('label', 'New project name');
    renameLabel.htmlFor = 'new-project-name';
    const renameInput = element('input');
    renameInput.id = 'new-project-name';
    renameInput.type = 'text';
    renameInput.disabled = Boolean(project.archived);
    const rename = element('button', 'Rename project');
    rename.type = 'submit';
    rename.disabled = Boolean(project.archived);
    renameForm.append(renameLabel, renameInput, rename);
    app.append(renameForm);
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (project.archived) return;
      const name = renameInput.value.trim();
      if (!name) return showError(new Error('Project name is required'));
      rename.disabled = true;
      alert.hidden = true;
      try {
        const saved = await request(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        project.name = saved.name;
        heading.textContent = saved.name;
        document.title = `${saved.name} — Workboard`;
        renameInput.value = '';
        renameInput.focus();
      } catch (error) { showError(error); }
      finally { rename.disabled = Boolean(project.archived); }
    });
    const defaultLabel = element('label', 'Default task priority');
    defaultLabel.htmlFor = 'default-task-priority';
    const defaultPriority = element('select');
    defaultPriority.id = defaultLabel.htmlFor;
    for (const name of ['Low', 'Normal', 'High']) {
      const option = element('option', name);
      option.value = name;
      defaultPriority.append(option);
    }
    defaultPriority.value = project.default_priority;
    defaultPriority.disabled = Boolean(project.archived);
    app.append(defaultLabel, defaultPriority);
    defaultPriority.addEventListener('change', async () => {
      if (project.archived) return;
      defaultPriority.disabled = true;
      alert.hidden = true;
      try {
        const saved = await request(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default_priority: defaultPriority.value }),
        });
        project.default_priority = saved.default_priority;
      } catch (error) { showError(error); }
      finally {
        defaultPriority.value = project.default_priority;
        defaultPriority.disabled = Boolean(project.archived);
      }
    });
    const form = element('form');
    const label = element('label', 'Task title');
    label.htmlFor = 'task-title';
    const input = element('input');
    input.id = 'task-title';
    input.type = 'text';
    const create = element('button', 'Create task');
    create.type = 'submit';
    create.disabled = Boolean(project.archived);
    form.append(label, input, create);
    const filterLabel = element('label', 'Task filter');
    filterLabel.htmlFor = 'task-filter';
    const filter = element('select');
    filter.id = 'task-filter';
    for (const name of ['All', 'Open', 'Completed']) {
      const option = element('option', name);
      option.value = name;
      filter.append(option);
    }
    const priorityFilterLabel = element('label', 'Priority filter');
    priorityFilterLabel.htmlFor = 'priority-filter';
    const priorityFilter = element('select');
    priorityFilter.id = 'priority-filter';
    for (const name of ['All', 'Low', 'Normal', 'High']) {
      const option = element('option', name);
      option.value = name;
      priorityFilter.append(option);
    }
    const rangeForm = element('form');
    const fromLabel = element('label', 'Due from');
    fromLabel.htmlFor = 'due-from';
    const fromInput = element('input');
    fromInput.id = fromLabel.htmlFor;
    fromInput.type = 'text';
    const throughLabel = element('label', 'Due through');
    throughLabel.htmlFor = 'due-through';
    const throughInput = element('input');
    throughInput.id = throughLabel.htmlFor;
    throughInput.type = 'text';
    const applyRange = element('button', 'Apply due range');
    applyRange.type = 'submit';
    rangeForm.append(fromLabel, fromInput, throughLabel, throughInput, applyRange);
    let dueFrom = '';
    let dueThrough = '';
    rangeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const from = fromInput.value.trim();
      const through = throughInput.value.trim();
      if ((from && !validDate(from)) || (through && !validDate(through))) {
        return showError(new Error('Due range must use valid YYYY-MM-DD dates'));
      }
      if (from && through && from > through) {
        return showError(new Error('Due from must not be after Due through'));
      }
      dueFrom = from;
      dueThrough = through;
      fromInput.value = from;
      throughInput.value = through;
      alert.hidden = true;
      render();
    });
    const list = element('section');
    list.setAttribute('aria-label', 'Tasks');
    let query = '';
    const search = searchForm('Task', value => {
      query = value;
      render();
    });
    app.append(form, filterLabel, filter, priorityFilterLabel, priorityFilter, rangeForm, search, list);
    let tasks = [];
    function showError(error) {
      alert.textContent = error.message;
      alert.hidden = false;
    }
    function render() {
      list.replaceChildren();
      for (const task of tasks) {
        if (!asciiLower(task.title).includes(query)) continue;
        if (filter.value === 'Open' && task.completed) continue;
        if (filter.value === 'Completed' && !task.completed) continue;
        if (priorityFilter.value !== 'All' && task.priority !== priorityFilter.value) continue;
        if ((dueFrom || dueThrough) && (!task.due_date ||
            (dueFrom && task.due_date < dueFrom) ||
            (dueThrough && task.due_date > dueThrough))) continue;
        const row = element('div');
        row.className = 'task-row';
        row.dataset.testid = 'task-row';
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.disabled = Boolean(project.archived);
        checkbox.setAttribute('aria-label', `Complete ${task.title}`);
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          alert.hidden = true;
          try {
            const saved = await request(`/api/projects/${id}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: checkbox.checked }),
            });
            task.completed = saved.completed;
            render();
          } catch (error) {
            checkbox.checked = task.completed;
            showError(error);
          } finally { checkbox.disabled = false; }
        });
        const titleText = element('span', task.title);
        const taskRenameForm = element('form');
        const taskRenameLabel = element('label', 'New task title');
        taskRenameLabel.htmlFor = `new-task-title-${task.id}`;
        const taskRenameInput = element('input');
        taskRenameInput.id = taskRenameLabel.htmlFor;
        taskRenameInput.type = 'text';
        taskRenameInput.disabled = Boolean(project.archived);
        const taskRename = element('button', 'Rename task');
        taskRename.type = 'submit';
        taskRename.disabled = Boolean(project.archived);
        taskRenameForm.append(taskRenameLabel, taskRenameInput, taskRename);
        taskRenameForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (project.archived) return;
          const title = taskRenameInput.value.trim();
          if (!title) return showError(new Error('Task title is required'));
          taskRename.disabled = true;
          alert.hidden = true;
          try {
            const saved = await request(`/api/projects/${id}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title }),
            });
            task.title = saved.title;
            titleText.textContent = saved.title;
            checkbox.setAttribute('aria-label', `Complete ${saved.title}`);
            taskRenameInput.value = '';
            taskRenameInput.focus();
            render();
          } catch (error) { showError(error); }
          finally { taskRename.disabled = Boolean(project.archived); }
        });
        const priorityLabel = element('label', 'Task priority');
        priorityLabel.htmlFor = `task-priority-${task.id}`;
        const priority = element('select');
        priority.id = priorityLabel.htmlFor;
        for (const name of ['Low', 'Normal', 'High']) {
          const option = element('option', name);
          option.value = name;
          priority.append(option);
        }
        priority.value = task.priority;
        priority.disabled = Boolean(project.archived);
        priority.addEventListener('change', async () => {
          priority.disabled = true;
          alert.hidden = true;
          try {
            const saved = await request(`/api/projects/${id}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ priority: priority.value }),
            });
            task.priority = saved.priority;
            render();
          } catch (error) { showError(error); }
          finally {
            priority.value = task.priority;
            priority.disabled = Boolean(project.archived);
          }
        });
        const dueForm = element('form');
        const dueLabel = element('label', 'Task due date');
        dueLabel.htmlFor = `task-due-date-${task.id}`;
        const dueInput = element('input');
        dueInput.id = dueLabel.htmlFor;
        dueInput.type = 'text';
        dueInput.value = task.due_date;
        dueInput.disabled = Boolean(project.archived);
        const saveDue = element('button', 'Save due date');
        saveDue.type = 'submit';
        saveDue.disabled = Boolean(project.archived);
        dueForm.append(dueLabel, dueInput, saveDue);
        dueForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (project.archived) return;
          saveDue.disabled = true;
          alert.hidden = true;
          try {
            const saved = await request(`/api/projects/${id}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ due_date: dueInput.value }),
            });
            task.due_date = saved.due_date;
            dueInput.value = saved.due_date;
            render();
          } catch (error) {
            dueInput.value = task.due_date;
            showError(error);
          } finally { saveDue.disabled = Boolean(project.archived); }
        });
        const moveForm = element('form');
        const destinationLabel = element('label', 'Destination project');
        destinationLabel.htmlFor = `destination-project-${task.id}`;
        const destination = element('select');
        destination.id = destinationLabel.htmlFor;
        for (const other of destinations) {
          const option = element('option', other.name);
          option.value = String(other.id);
          destination.append(option);
        }
        const move = element('button', 'Move task');
        move.type = 'submit';
        const cannotMove = Boolean(project.archived) || destinations.length === 0;
        destination.disabled = cannotMove;
        move.disabled = cannotMove;
        moveForm.append(destinationLabel, destination, move);
        moveForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (cannotMove) return;
          move.disabled = true;
          alert.hidden = true;
          try {
            await request(`/api/projects/${id}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ destination_project_id: Number(destination.value) }),
            });
            tasks = tasks.filter(other => other.id !== task.id);
            render();
          } catch (error) { showError(error); }
          finally { move.disabled = cannotMove; }
        });
        row.append(titleText, checkbox, taskRenameForm, priorityLabel, priority, dueForm, moveForm);
        list.append(row);
      }
    }
    filter.addEventListener('change', render);
    priorityFilter.addEventListener('change', render);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (project.archived) return;
      const title = input.value.trim();
      if (!title) return showError(new Error('Task title is required'));
      create.disabled = true;
      alert.hidden = true;
      try {
        const task = await request(`/api/projects/${id}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        tasks.push(task);
        input.value = '';
        render();
        input.focus();
      } catch (error) { showError(error); }
      finally { create.disabled = false; }
    });
    tasks = await request(`/api/projects/${id}/tasks`);
    render();
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
  }
}

const match = location.pathname.match(/^\/projects\/(\d+)$/);
if (match) showProject(match[1]);
else showProjects();
