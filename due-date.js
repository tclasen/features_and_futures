// Calendar dates remain strings: no timezone or JavaScript Date normalization.
// An empty string clears the date; null indicates invalid input.
export function parseDueDate(value) {
  const date = value.trim();
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? date : null;
}

export function parseDueRange(fromValue, throughValue) {
  const from = parseDueDate(fromValue);
  const through = parseDueDate(throughValue);
  if (from === null || through === null) {
    return { error: 'Due range must use valid YYYY-MM-DD dates' };
  }
  if (from && through && from > through) {
    return { error: 'Due from must not be after Due through' };
  }
  return { from, through };
}

export function matchesDueRange(date, { from, through }) {
  if (!from && !through) return true;
  return Boolean(date) && (!from || date >= from) && (!through || date <= through);
}
