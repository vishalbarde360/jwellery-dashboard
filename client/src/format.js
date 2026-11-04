// Dates are shown in the SHOP's time zone (Business setup).
export const fmtDateTime = (d, tz = 'Asia/Kolkata') => new Intl.DateTimeFormat('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
export const fmtDate = (d, tz = 'Asia/Kolkata') => new Intl.DateTimeFormat('en-IN', { timeZone: tz, dateStyle: 'medium' }).format(new Date(d));
export const isoToday = (tz = 'Asia/Kolkata') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
