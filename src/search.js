export function normalizeSearch(value) {
  return (value ?? '').trim();
}

function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

// Literal substring matching preserves internal whitespace and non-ASCII case.
export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query));
}
