function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

// Only ASCII letters are case-insensitive; internal query whitespace is literal.
export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query.trim()));
}
