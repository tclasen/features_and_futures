async function loadProject() {
  const id = window.location.pathname.split('/').pop();
  const resp = await fetch(`/api/projects/${id}`);
  if (resp.ok) {
    const proj = await resp.json();
    document.getElementById('project-heading').textContent = proj.name;
  } else {
    document.getElementById('project-heading').textContent = 'Project not found';
  }
}

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = '/';
});

loadProject();
