export function normalizeSearch(value) {
  return (value || '').trim();
}

function searchKey(value) {
  // Normalize only comparison keys; saved text and the applied query stay intact.
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return searchKey(value).includes(searchKey(query));
}
