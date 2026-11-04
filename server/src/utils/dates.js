// Dates in the SHOP's time zone (Business setup). Works for fixed-offset zones such as Asia/Kolkata.
export function zonedStart(dateStr, tz = 'Asia/Kolkata') {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(guess).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

export const todayStr = (tz = 'Asia/Kolkata') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// { $gte, $lt } for a from..to (inclusive) range of dates
export function dayRange(from, to, tz) {
  const r = {};
  if (from) r.$gte = zonedStart(from, tz);
  if (to) r.$lt = zonedStart(addDays(to, 1), tz);
  return r;
}

export const validTimezone = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
