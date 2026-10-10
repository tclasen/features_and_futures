// Only ASCII letters are case-insensitive; all other characters match literally.
function foldAscii(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return foldAscii(value).includes(foldAscii(query.trim()));
}
