export function normalizeSearchQuery(query) {
  return query.trim();
}

function normalizeSearchText(value) {
  return value.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return normalizeSearchText(value).includes(normalizeSearchText(normalizeSearchQuery(query)));
}
