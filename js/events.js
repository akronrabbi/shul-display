import { akronWallTimeToDate } from './calendar.js';

export function eventStart(event) {
  if (!event || !event.date) return null;
  const [year, month, day] = String(event.date).split('-').map(Number);
  if (!year || !month || !day) return null;
  if (event.time) {
    const [hour, minute] = String(event.time).split(':').map(Number);
    return akronWallTimeToDate(year, month, day, hour || 0, minute || 0);
  }
  return akronWallTimeToDate(year, month, day, 23, 59);
}

export function isCurrentEvent(event, now) {
  if (!event || !String(event.title || '').trim()) return false;
  const start = eventStart(event);
  if (!start) return false;
  return start.getTime() >= now.getTime();
}

export function upcomingEvents(events, now) {
  return (events || [])
    .filter((event) => isCurrentEvent(event, now))
    .sort((a, b) => eventStart(a) - eventStart(b));
}

export function formatClockNumbers(hhmm) {
  if (!hhmm) return '';
  const [hour, minute] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(hour)) return '';
  const sample = new Date(2020, 0, 1, hour, minute || 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
    .format(sample)
    .replace(/\u202f/g, ' ');
}

export function eventDateParts(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const local = new Date(year, month - 1, day);
  return {
    dow: local.toLocaleDateString('en-US', { weekday: 'short' }),
    month: local.toLocaleDateString('en-US', { month: 'short' }),
    day: String(day),
  };
}
