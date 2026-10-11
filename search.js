export function normalizeSearchQuery(query) {
  return query.trim();
}

function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(normalizeSearchQuery(query)));
}
