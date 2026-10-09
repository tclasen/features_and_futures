document.addEventListener('DOMContentLoaded', () => {
  const projectListEl = document.getElementById('project-list');
  const alertEl = document.getElementById('alert');
  const nameInput = document.getElementById('project-name-input');
  const createBtn = document.getElementById('create-project-btn');

  function showAlert(message) {
    alertEl.textContent = message;
    alertEl.style.display = 'block';
  }
  function hideAlert() {
    alertEl.style.display = 'none';
  }

  async function loadProjects() {
    const resp = await fetch('/api/projects');
    if (!resp.ok) return;
    const projects = await resp.json();
    projectListEl.innerHTML = '';
    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.testid = 'project-row';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      row.appendChild(nameSpan);

      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open project';
      openBtn.style.marginLeft = '8px';
      openBtn.addEventListener('click', () => {
        location.href = `/projects/${p.id}`;
      });
      row.appendChild(openBtn);

      projectListEl.appendChild(row);
    });
  }

  createBtn.addEventListener('click', async () => {
    hideAlert();
    const name = nameInput.value.trim();
    if (!name) {
      showAlert('Project name is required');
      return;
    }
    try {
      const resp = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (resp.status === 201) {
        nameInput.value = '';
        loadProjects();
      } else {
        const err = await resp.json();
        showAlert(err.error || 'Error creating project');
      }
    } catch (e) {
      showAlert('Network error');
    }
  });

  loadProjects();
});
