// Calendar days are validated arithmetically, without timezone conversion.
// null clears a date; undefined signals invalid input.
export function normalizeDueDate(value) {
  const date = value.trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return undefined;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? date : undefined;
}

export function normalizeDueRange(from, through) {
  const dueFrom = normalizeDueDate(from);
  const dueThrough = normalizeDueDate(through);
  if (dueFrom === undefined || dueThrough === undefined) {
    return { error: 'Due range must use valid YYYY-MM-DD dates' };
  }
  if (dueFrom && dueThrough && dueFrom > dueThrough) {
    return { error: 'Due from must not be after Due through' };
  }
  return { dueFrom: dueFrom ?? '', dueThrough: dueThrough ?? '' };
}
