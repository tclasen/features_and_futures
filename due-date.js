// Calendar days are validated directly, without Date parsing or timezone conversion.
// An empty string clears a date; null signals invalid input.
export function normalizeDueDate(value) {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  if (!date) return '';
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? date : null;
}

export function normalizeDueRange(fromValue, throughValue) {
  const from = normalizeDueDate(fromValue);
  const through = normalizeDueDate(throughValue);
  if (from === null || through === null) {
    return { error: 'Due range must use valid YYYY-MM-DD dates' };
  }
  if (from && through && from > through) {
    return { error: 'Due from must not be after Due through' };
  }
  return { from, through };
}

export function matchesDueRange(dueDate, { from, through }) {
  if (!from && !through) return true;
  // Canonical, fixed-width calendar dates sort chronologically as strings.
  return Boolean(dueDate) && (!from || dueDate >= from) && (!through || dueDate <= through);
}
