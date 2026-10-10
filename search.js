// Fold ASCII letters only; other characters and internal whitespace stay exact.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(text, query) {
  return foldAscii(text).includes(foldAscii(query.trim()));
}
