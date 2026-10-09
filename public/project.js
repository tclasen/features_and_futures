const projectId = window.location.pathname.match(/^\/projects\/(\d+)\/?$/)?.[1];
const title = document.querySelector('#project-title');

document.querySelector('#back-button').addEventListener('click', () => {
  window.location.href = '/';
});

if (projectId) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (response.ok) {
    const project = await response.json();
    title.textContent = project.name;
    document.title = `${project.name} | Workboard`;
  } else {
    title.textContent = 'Project not found';
  }
}
