// Simple client‑side logic for the Workboard SPA.

const API_BASE = '/api';

function showAlert(message) {
  const alertEl = document.getElementById('alert');
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.style.display = 'block';
  setTimeout(() => { alertEl.style.display = 'none'; }, 3000);
}

function fetchJson(url, options) {
  return fetch(url, options).then(res => {
    if (!res.ok) return res.json().then(err => Promise.reject(err));
    return res.json();
  });
}

// ---------- Index page ----------
if (document.getElementById('create-project-btn')) {
  const nameInput = document.getElementById('project-name-input');
  const createBtn = document.getElementById('create-project-btn');
  const listDiv = document.getElementById('projects-list');

  function renderProjects(projects) {
    listDiv.innerHTML = '';
    projects.forEach(p => {
      const row = document.createElement('div');
      row.setAttribute('data-testid', 'project-row');
      row.className = 'project-row';
      row.textContent = p.name;
      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open project';
      openBtn.addEventListener('click', () => {
        window.location.href = `/projects/${p.id}`;
      });
      row.appendChild(openBtn);
      listDiv.appendChild(row);
    });
  }

  function loadProjects() {
    fetchJson(`${API_BASE}/projects`).then(renderProjects).catch(console.error);
  }

  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      showAlert('Project name is required');
      return;
    }
    fetchJson(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then(() => {
        nameInput.value = '';
        loadProjects();
      })
      .catch(err => {
        if (err.error) showAlert(err.error);
        else console.error(err);
      });
  });

  loadProjects();
}

// ---------- Project detail page ----------
if (document.getElementById('back-btn')) {
  const backBtn = document.getElementById('back-btn');
  const heading = document.getElementById('project-heading');
  backBtn.addEventListener('click', () => {
    window.location.href = '/';
  });
  // Extract ID from URL
  const match = location.pathname.match(/^\/projects\/(\d+)$/);
  if (match) {
    const id = match[1];
    fetchJson(`${API_BASE}/projects/${id}`)
      .then(project => {
        heading.textContent = project.name;
      })
      .catch(() => {
        heading.textContent = 'Project not found';
      });
  }
}

