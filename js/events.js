import { akronWallTimeToDate, zoneParts } from './calendar.js';

function startOf(dateStr, time) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  if (time) {
    const [hour, minute] = String(time).split(':').map(Number);
    return akronWallTimeToDate(year, month, day, hour || 0, minute || 0);
  }
  return akronWallTimeToDate(year, month, day, 23, 59);
}

function isoDay(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return isoDay(year, month, day + days);
}

function daysBetween(a, b) {
  const [y1, m1, d1] = String(a).split('-').map(Number);
  const [y2, m2, d2] = String(b).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// A weekly event is stored once, with its first date. This finds the next
// time it happens, on or after now, and stops after its last date if it has one.
export function nextOccurrence(event, now) {
  if (!event || !event.date) return null;
  const repeat = event.repeat === 'weekly' || event.repeat === 'biweekly' ? event.repeat : '';
  if (!repeat) {
    const start = startOf(event.date, event.time);
    return start && start.getTime() >= now.getTime() ? { date: event.date, start } : null;
  }
  const step = repeat === 'biweekly' ? 14 : 7;
  const today = zoneParts(now);
  const todayIso = isoDay(today.year, today.month, today.day);
  let date = event.date;
  const gap = daysBetween(event.date, todayIso);
  if (gap > 0) date = addDays(event.date, Math.floor(gap / step) * step);
  for (let i = 0; i < 3; i += 1) {
    const start = startOf(date, event.time);
    if (!start) return null;
    if (event.until && date > event.until) return null;
    if (start.getTime() >= now.getTime()) return { date, start };
    date = addDays(date, step);
  }
  return null;
}

export function eventStart(event) {
  if (!event || !event.date) return null;
  return startOf(event.date, event.time);
}

export function isCurrentEvent(event, now) {
  if (!event || !String(event.title || '').trim()) return false;
  return Boolean(nextOccurrence(event, now));
}

export function upcomingEvents(events, now) {
  return (events || [])
    .filter((event) => String(event?.title || '').trim())
    .map((event) => {
      const next = nextOccurrence(event, now);
      return next ? { ...event, date: next.date, _start: next.start } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a._start - b._start);
}

export function formatClockNumbers(hhmm) {
  if (!hhmm) return '';
  const [hour, minute] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(hour)) return '';
  const sample = new Date(2020, 0, 1, hour, minute || 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
    .format(sample)
    .replace(/ /g, ' ');
}

export function eventDateParts(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const local = new Date(year, month - 1, day);
  return {
    dow: local.toLocaleDateString('en-US', { weekday: 'short' }),
    dowLong: local.toLocaleDateString('en-US', { weekday: 'long' }),
    month: local.toLocaleDateString('en-US', { month: 'short' }),
    day: String(day),
  };
}

// A piece can be limited to a date range (Akron days). Empty means always.
export function inDateRange(range, now) {
  if (!range) return true;
  const today = zoneParts(now);
  const todayIso = isoDay(today.year, today.month, today.day);
  if (range.showFrom && todayIso < range.showFrom) return false;
  if (range.showUntil && todayIso > range.showUntil) return false;
  return true;
}
