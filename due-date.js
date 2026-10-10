// Calendar days stay as strings so validation and storage never depend on timezones.
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

export function normalizeDueRange(from, through) {
  const start = normalizeDueDate(from);
  const end = normalizeDueDate(through);
  if (start === null || end === null) {
    return { range: null, error: 'Due range must use valid YYYY-MM-DD dates' };
  }
  if (start && end && start > end) {
    return { range: null, error: 'Due from must not be after Due through' };
  }
  return { range: { from: start, through: end }, error: '' };
}

// Canonical, fixed-width calendar dates compare chronologically as strings.
export function matchesDueRange(date, { from = '', through = '' } = {}) {
  if (!from && !through) return true;
  return Boolean(date) && (!from || date >= from) && (!through || date <= through);
}
