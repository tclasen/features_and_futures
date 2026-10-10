export function normalizeSearchQuery(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSearchText(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(text, query) {
  return normalizeSearchText(text).includes(normalizeSearchText(normalizeSearchQuery(query)));
}
