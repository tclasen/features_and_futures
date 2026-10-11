// Calendar days are validated directly, without parsing timestamps or timezones.
// Empty input clears the date; null identifies invalid nonempty input.
export function normalizeDueDate(value) {
  const date = value.trim();
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? date : null;
}

export function normalizeDueRange(from, through) {
  const start = normalizeDueDate(from);
  const end = normalizeDueDate(through);
  if (start === null || end === null) {
    return { error: 'Due range must use valid YYYY-MM-DD dates' };
  }
  if (start && end && start > end) {
    return { error: 'Due from must not be after Due through' };
  }
  return { from: start, through: end };
}

export function matchesDueRange(date, range) {
  if (!range.from && !range.through) return true;
  return Boolean(date) && (!range.from || date >= range.from)
    && (!range.through || date <= range.through);
}
