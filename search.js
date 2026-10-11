// Queries are transient view state, not data. Matching folds only ASCII
// letters and runs of spaces/tabs; saved names and titles stay untouched.
export function normalizeSearch(value) {
  return (value ?? '').trim();
}

function normalizeForMatching(value) {
  return value.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return normalizeForMatching(value).includes(normalizeForMatching(query));
}
