// Only ASCII letters are case-insensitive; other characters remain significant.
function foldASCII(value) {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldASCII(value).includes(foldASCII(query.trim()));
}
