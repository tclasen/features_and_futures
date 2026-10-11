// Search folds only ASCII letters; punctuation and internal whitespace are literal.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function normalizeSearch(value) {
  return value.trim();
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(normalizeSearch(query)));
}
