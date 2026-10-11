// Directory updates resolve in place so a pending form navigation cannot abort
// a reload or another action. The server remains authoritative for all matches.
let updating = false;

document.addEventListener('change', (event) => {
  if (event.target.id !== 'visible-tasks-priority') return;
  for (const field of document.querySelectorAll('[name="visiblePriority"]')) {
    field.value = event.target.value;
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  const target = new URL(form.action, location.href);
  if (target.pathname !== '/directory' && !target.pathname.startsWith('/directory/')) return;
  event.preventDefault();
  if (updating) return;
  updating = true;

  // Capture the clicked button as well as the form, before disabling controls.
  const fields = new URLSearchParams(new FormData(form));
  if (event.submitter?.name) fields.set(event.submitter.name, event.submitter.value);
  const main = document.querySelector('main');
  const controls = [...main.querySelectorAll('input, textarea, select, button')];
  const disabled = controls.map((control) => control.disabled);
  const empty = document.getElementById('directory-empty');
  if (empty) empty.hidden = true;
  main.setAttribute('aria-busy', 'true');
  controls.forEach((control) => { control.disabled = true; });
  main.querySelector('[data-directory-error]')?.remove();

  try {
    const method = form.method.toUpperCase();
    if (method === 'GET') target.search = fields.toString();
    const response = await fetch(target, {
      method,
      ...(method === 'GET' ? {} : { body: fields }),
    });
    // Validation errors render the previous applied result and its alert.
    if (!response.ok && response.status !== 422) throw new Error('Directory update failed');
    const resolved = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextMain = resolved.querySelector('main');
    if (!nextMain) throw new Error('Missing directory result');
    if (response.ok) history.replaceState(null, '', response.url);
    main.innerHTML = nextMain.innerHTML;
  } catch {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    if (empty) empty.hidden = false;
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.setAttribute('data-directory-error', '');
    alert.textContent = 'Could not update task directory. Please try again.';
    main.prepend(alert);
  } finally {
    main.removeAttribute('aria-busy');
    updating = false;
  }
});
