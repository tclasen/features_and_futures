// Validate calendar days directly to avoid timezone conversion and Date's year handling.
export function normalizeDueDate(value) {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  if (date === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
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
    throw new Error('Due range must use valid YYYY-MM-DD dates');
  }
  if (from && through && from > through) {
    throw new Error('Due from must not be after Due through');
  }
  return { from, through };
}
