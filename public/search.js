// Only ASCII case is ignored; internal whitespace and non-ASCII letters are literal.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(text, query) {
  const trimmedQuery = query.trim();
  return !trimmedQuery || foldAscii(text).includes(foldAscii(trimmedQuery));
}
