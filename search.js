export function normalizeSearchQuery(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(text, query) {
  return foldAscii(text).includes(foldAscii(normalizeSearchQuery(query)));
}
