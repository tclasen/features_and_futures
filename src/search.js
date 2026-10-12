export function normalizeSearch(value) {
  return (value ?? '').trim();
}

function normalizeForMatching(value) {
  return value.replace(/[ \t]+/g, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

// Normalize only for comparison; stored text and displayed queries stay intact.
export function matchesSearch(value, query) {
  return normalizeForMatching(value).includes(normalizeForMatching(query));
}
