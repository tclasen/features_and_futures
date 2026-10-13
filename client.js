// Keep the current document until the server has saved and resolved an update.
// Native form navigation otherwise allows the next interaction to cancel a save.
let updating = false;

document.addEventListener('submit', async event => {
  const form = event.target;
  const url = new URL(form.action, location.href);
  if (url.pathname.endsWith('/export')) return;
  event.preventDefault();
  if (updating) return;

  const fields = new URLSearchParams(new FormData(form));
  const method = form.method.toUpperCase();
  if (method === 'GET') url.search = fields.toString();
  const main = document.querySelector('main');
  const controls = [...main.querySelectorAll('input, textarea, select, button')]
    .map(control => ({ control, disabled: control.disabled }));
  const announcement = document.getElementById('directory-empty');
  if (announcement) announcement.hidden = true;
  updating = true;
  main.setAttribute('aria-busy', 'true');
  for (const { control } of controls) control.disabled = true;

  try {
    const response = await fetch(url, {
      method,
      ...(method === 'GET' ? {} : { body: fields }),
      // Finish writes even if the user reloads or closes this document.
      keepalive: method !== 'GET' && fields.toString().length < 60_000,
    });
    const next = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextMain = next.querySelector('main');
    if (!nextMain) throw new Error('Missing page content');
    main.replaceWith(nextMain);
    document.title = next.title;
    if (response.url !== location.href) history.pushState(null, '', response.url);
  } catch {
    for (const { control, disabled } of controls) control.disabled = disabled;
    main.removeAttribute('aria-busy');
    if (announcement) announcement.hidden = false;
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = 'Unable to update Workboard. Please try again.';
    main.prepend(alert);
  } finally {
    updating = false;
  }
});

window.addEventListener('popstate', () => location.reload());
