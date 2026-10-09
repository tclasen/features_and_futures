// Simple client-side logic for the Workboard UI.
const apiBase = '/api';

async function fetchProjects() {
  const resp = await fetch(`${apiBase}/projects`);
  if (!resp.ok) return [];
  return resp.json();
}

function renderProjects(projects) {
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  for (const proj of projects) {
    const row = document.createElement('div');
    row.setAttribute('data-testid', 'project-row');
    row.className = 'project-row';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = proj.name;
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open project';
    // Navigate to the project view page without a file extension, as required by the spec.
    openBtn.addEventListener('click', () => {
      window.location.href = `/projects/${proj.id}`;
    });
    row.appendChild(nameSpan);
    row.appendChild(document.createTextNode(' '));
    row.appendChild(openBtn);
    list.appendChild(row);
  }
}

function showAlert(message) {
  const alertDiv = document.getElementById('alert');
  alertDiv.textContent = message;
  alertDiv.style.display = 'block';
}

function hideAlert() {
  const alertDiv = document.getElementById('alert');
  alertDiv.style.display = 'none';
}

document.getElementById('create-project-btn').addEventListener('click', async () => {
  hideAlert();
  const input = document.getElementById('project-name-input');
  const name = input.value.trim();
  if (!name) {
    showAlert('Project name is required');
    return;
  }
  const resp = await fetch(`${apiBase}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (resp.status === 201) {
    input.value = '';
    const projects = await fetchProjects();
    renderProjects(projects);
  } else if (resp.status === 400) {
    const data = await resp.json();
    showAlert(data.error || 'Invalid request');
  } else {
    showAlert('Failed to create project');
  }
});

// Initial load
fetchProjects().then(renderProjects);

