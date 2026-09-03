// utils/dateRange.js
// Mongo has no FORMAT(date,'yyyy-MM') — the idiomatic replacement is a
// $gte/$lt range on the real Date field. monthRange('2026-07') covers the
// whole calendar month in UTC (matches how DATE-only SQL columns were
// stored/compared before — no time component).
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function yearRange(year) {
  const y = Number(year);
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y + 1, 0, 1));
  return { start, end };
}

function dayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// 'YYYY-MM' for a given JS Date, UTC-based (mirrors FORMAT(date,'yyyy-MM')).
function toMonthKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = { monthRange, yearRange, dayRange, toMonthKey };
