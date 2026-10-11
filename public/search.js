// Normalize only for matching; saved names and titles remain untouched.
function normalizeSearch(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, letter => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return normalizeSearch(value).includes(normalizeSearch(query.trim()));
}
