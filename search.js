// Normalize only for matching; saved and displayed text remains unchanged.
function normalizeSearch(text) {
  return text.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function matchesSearch(value, query) {
  return normalizeSearch(value).includes(normalizeSearch(query.trim()));
}
