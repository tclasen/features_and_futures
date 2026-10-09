async function loadProjects() {
  const resp = await fetch('/api/projects');
  const projects = await resp.json();
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  projects.forEach(p => {
    const li = document.createElement('li');
    li.setAttribute('data-testid', 'project-row');
    li.className = 'project-row';
    li.textContent = p.name + ' ';
    const btn = document.createElement('button');
    btn.textContent = 'Open project';
    btn.addEventListener('click', () => {
      window.location.href = `/projects/${p.id}`;
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

document.getElementById('create-project-btn').addEventListener('click', async () => {
  const input = document.getElementById('project-name-input');
  const name = input.value.trim();
  const alertDiv = document.getElementById('alert');
  if (!name) {
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

loadProjects();
