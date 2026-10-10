// Normalize only for matching; saved and displayed names remain unchanged.
function normalizeSearch(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return normalizeSearch(value).includes(normalizeSearch(query.trim()));
}
