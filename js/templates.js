// Ready layouts. Each one is spaced on an even grid: 3% side margins and 2% gaps
// in landscape, 4% margins in portrait. After it is applied, every piece can be
// moved, resized, or removed like any other.

const L = (x, y, w, h) => ({ x, y, w, h });

export const TEMPLATES = [
  {
    id: 'weekly',
    label: 'Weekly board',
    blurb: 'Date, Shabbos, zmanim, events, and a note, in an even grid',
    items: [
      { type: 'welcome', landscape: L(0, 0, 100, 12), portrait: L(0, 0, 100, 7) },
      { type: 'date', landscape: L(3, 15, 30, 40), portrait: L(4, 9, 92, 18) },
      { type: 'shabbos', landscape: L(35, 15, 30, 40), portrait: L(4, 29, 44, 22) },
      { type: 'zmanim', landscape: L(67, 15, 30, 40), portrait: L(52, 29, 44, 22) },
      { type: 'events', landscape: L(3, 57, 62, 40), portrait: L(4, 53, 92, 26) },
      { type: 'text', landscape: L(67, 57, 30, 40), portrait: L(4, 81, 92, 16) },
    ],
  },
  {
    id: 'shabbos',
    label: 'Shabbos',
    blurb: 'Times up front, with the date and a photo strip',
    items: [
      { type: 'welcome', landscape: L(0, 0, 100, 12), portrait: L(0, 0, 100, 7), settings: { text: 'Good Shabbos' } },
      { type: 'logo', landscape: L(3, 15, 22, 38), portrait: L(30, 9, 40, 13) },
      { type: 'shabbos', landscape: L(27, 15, 40, 38), portrait: L(4, 24, 92, 22) },
      { type: 'date', landscape: L(69, 15, 28, 38), portrait: L(4, 48, 92, 17) },
      { type: 'photos', landscape: L(3, 55, 94, 42), portrait: L(4, 67, 92, 30) },
    ],
  },
  {
    id: 'showcase',
    label: 'Photo showcase',
    blurb: 'A large slideshow beside the essentials',
    items: [
      { type: 'photos', landscape: L(3, 5, 59, 90), portrait: L(4, 3, 92, 50) },
      { type: 'logo', landscape: L(65, 5, 32, 24), portrait: L(4, 55, 28, 14) },
      { type: 'date', landscape: L(65, 31, 32, 32), portrait: L(34, 55, 62, 14) },
      { type: 'shabbos', landscape: L(65, 65, 32, 31), portrait: L(4, 71, 92, 26) },
    ],
  },
  {
    id: 'events',
    label: 'Events and news',
    blurb: 'A tall events list with Shabbos times and a note',
    items: [
      { type: 'welcome', landscape: L(0, 0, 100, 12), portrait: L(0, 0, 100, 7) },
      { type: 'events', landscape: L(3, 15, 56, 82), portrait: L(4, 9, 92, 40) },
      { type: 'shabbos', landscape: L(61, 15, 36, 40), portrait: L(4, 51, 92, 22) },
      { type: 'text', landscape: L(61, 57, 36, 40), portrait: L(4, 75, 92, 22) },
    ],
  },
  {
    id: 'flyer',
    label: 'Flyer',
    blurb: 'A PDF flyer with the date, times, and events',
    items: [
      { type: 'pdf', landscape: L(3, 4, 42, 92), portrait: L(4, 3, 92, 56) },
      { type: 'date', landscape: L(47, 4, 50, 30), portrait: L(4, 61, 44, 19) },
      { type: 'shabbos', landscape: L(47, 36, 50, 30), portrait: L(52, 61, 44, 19) },
      { type: 'events', landscape: L(47, 68, 50, 28), portrait: L(4, 82, 92, 15) },
    ],
  },
  {
    id: 'minimal',
    label: 'Minimal',
    blurb: 'Logo, date, and Shabbos, floating on the background',
    items: [
      { type: 'logo', landscape: L(38, 8, 24, 30), portrait: L(25, 10, 50, 18) },
      { type: 'date', landscape: L(18, 41, 64, 31), portrait: L(6, 32, 88, 26), settings: { tone: 'clear' } },
      { type: 'shabbos', landscape: L(18, 74, 64, 22), portrait: L(6, 62, 88, 28), settings: { tone: 'clear' } },
    ],
  },
];

export function templateById(id) {
  return TEMPLATES.find((item) => item.id === id) || null;
}

// Build the widgets for a template. Content already on the screen is kept:
// the first events list, photos, flyer, and so on carry over to the new places.
export function applyTemplate(template, currentWidgets, defaultSettings, makeId) {
  const pool = [...(currentWidgets || [])];
  const take = (type) => {
    const index = pool.findIndex((widget) => widget.type === type);
    if (index < 0) return null;
    return pool.splice(index, 1)[0];
  };
  return template.items.map((item) => {
    const existing = take(item.type);
    const settings = existing
      ? structuredClone(existing.settings)
      : { ...defaultSettings(item.type), ...(item.settings || {}) };
    if (existing && item.settings?.tone) settings.tone = item.settings.tone;
    return {
      id: existing?.id || makeId(),
      type: item.type,
      settings,
      place: { landscape: { ...item.landscape }, portrait: { ...item.portrait } },
    };
  });
}
