export function normalizeDueRange(from, through) {
  let range;
  try {
    range = { from: normalizeDueDate(from), through: normalizeDueDate(through) };
  } catch {
    throw new Error('Due range must use valid YYYY-MM-DD dates');
  }
  if (range.from && range.through && range.from > range.through) {
    throw new Error('Due from must not be after Due through');
  }
  return range;
}

export function matchesDueRange(date, { from, through }) {
  if (!from && !through) return true;
  return Boolean(date) && (!from || date >= from) && (!through || date <= through);
}

// Calendar days are validated numerically, without timezone or Date normalization.
export function normalizeDueDate(value) {
  const date = value.trim();
  if (!date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]) {
      return date;
    }
  }
  throw new Error('Due date must be a valid YYYY-MM-DD date');
}
