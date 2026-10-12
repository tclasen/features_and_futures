// Keep filter controls in place: a pending automatic navigation must not discard
// text entered into search/range fields or submit an older selection.
let pendingFilter;

document.addEventListener('submit', () => pendingFilter?.abort());

document.addEventListener('change', async (event) => {
  const control = event.target;
  if (!control.matches('[data-auto-submit]')) return;
  const form = control.form;
  const results = document.querySelector('[data-filter-results]');
  if (form.method !== 'get' || !results) {
    form.requestSubmit();
    return;
  }

  // Every action carries the applied filters, including actions submitted while
  // the result request is still in flight. Leave unrelated draft fields alone.
  for (const input of document.querySelectorAll('input[type="hidden"]')) {
    if (input.name === control.name) input.value = control.value;
  }
  const url = new URL(form.action);
  url.search = new URLSearchParams(new FormData(form)).toString();
  history.replaceState(null, '', url);
  pendingFilter?.abort();
  const request = new AbortController();
  pendingFilter = request;
  try {
    const response = await fetch(url, { signal: request.signal });
    if (!response.ok) throw new Error('Unable to load filtered results');
    const html = await response.text();
    if (request.signal.aborted) return;
    const next = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('[data-filter-results]');
    if (!next) throw new Error('Missing filtered results');
    results.replaceChildren(...next.childNodes);
  } catch (error) {
    if (!request.signal.aborted) location.assign(url);
  } finally {
    if (pendingFilter === request) pendingFilter = undefined;
  }
});
