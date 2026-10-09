/**
 * Load the list of projects from the server and render them.
 * Each project row is a <li> element with data-testid="project-row" and an "Open project" button.
 */
async function loadProjects() {
  const resp = await fetch('/api/projects');
  const projects = await resp.json();
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  for (const p of projects) {
    const li = document.createElement('li');
    li.setAttribute('data-testid', 'project-row');
    li.textContent = p.name + ' ';

    const btn = document.createElement('button');
    btn.textContent = 'Open project';
    btn.addEventListener('click', () => {
      window.location.href = `/projects/${p.id}`;
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

/**
 * Handle creation of a new project.
 * Validates that the name is not blank; otherwise shows a visible alert.
 */
document.getElementById('create-project-btn').addEventListener('click', async () => {
  const input = document.getElementById('project-name-input');
  const name = input.value.trim();
  const alertDiv = document.getElementById('alert');
  if (!name) {
    alertDiv.textContent = 'Project name is required';
    alertDiv.style.display = 'block';
    return;
  }
  alertDiv.style.display = 'none';
  const resp = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (resp.ok) {
    input.value = '';
    await loadProjects();
  } else {
    const err = await resp.json();
    alertDiv.textContent = err.error || 'Error';
    alertDiv.style.display = 'block';
  }
});

// Initial load of projects
loadProjects();

