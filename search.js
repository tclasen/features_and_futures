// Normalize only for matching; stored text and applied queries stay unchanged.
function matchingText(value) {
  return value.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function normalizeSearch(value) {
  return value.trim();
}

export function matchesSearch(value, query) {
  return matchingText(value).includes(matchingText(normalizeSearch(query)));
}
