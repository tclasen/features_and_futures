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
