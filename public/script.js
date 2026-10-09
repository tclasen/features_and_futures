// Helper to show alerts
function showAlert(message) {
  const alertEl = document.getElementById('alert');
  alertEl.textContent = message;
  alertEl.classList.remove('hidden');
  setTimeout(() => alertEl.classList.add('hidden'), 3000);
}

async function fetchProjects() {
  const res = await fetch('/api/projects');
  if (!res.ok) return [];
  return res.json();
}

function renderProjects(projects) {
  const list = document.getElementById('projectList');
  list.innerHTML = '';
  projects.forEach(p => {
    const li = document.createElement('li');
    li.setAttribute('data-testid', 'project-row');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open project';
    openBtn.addEventListener('click', () => {
      window.location.href = `/projects/${p.id}`;
    });
    li.appendChild(nameSpan);
    li.appendChild(openBtn);
    list.appendChild(li);
  });
}

async function loadAndRender() {
  const projects = await fetchProjects();
  renderProjects(projects);
}

document.getElementById('createBtn').addEventListener('click', async () => {
  const input = document.getElementById('projectNameInput');
  const name = input.value.trim();
  if (!name) {
    showAlert('Project name is required');
    return;
  }
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    input.value = '';
    loadAndRender();
  } else {
    const data = await res.json();
    showAlert(data.error || 'Failed to create project');
  }
});

// Initial load
loadAndRender();
