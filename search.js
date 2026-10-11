// Search folds ASCII letters only; other characters and internal whitespace
// retain their literal meaning. Queries are transient view state, not data.
export function normalizeSearch(value) {
  return (value ?? '').trim();
}

function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query));
}
