export function normalizeSearch(value) {
  return (value || '').trim();
}

function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query));
}
