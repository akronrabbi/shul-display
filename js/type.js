// Per-piece text styling. Missing values mean "use the theme", so old layouts stay as they are.

// One entry per family. A board keeps its theme's fonts and may add at most
// MAX_EXTRA_FONTS more, so the screen never turns into a font sampler.
export const MAX_EXTRA_FONTS = 2;

export const TEXT_FONTS = [
  { id: 'theme', label: 'Theme default' },
  { id: 'inter', label: 'Inter (clean sans)', css: '"Inter", "Segoe UI", sans-serif', hebrew: '"Heebo", "Arial Hebrew", sans-serif' },
  { id: 'outfit', label: 'Outfit (geometric)', css: '"Outfit", "Segoe UI", sans-serif', hebrew: '"Heebo", "Arial Hebrew", sans-serif' },
  { id: 'manrope', label: 'Manrope (modern sans)', css: '"Manrope", "Segoe UI", sans-serif', hebrew: '"Noto Sans Hebrew", "Arial Hebrew", sans-serif' },
  { id: 'fraunces', label: 'Fraunces (elegant serif)', css: '"Fraunces", Palatino, serif', hebrew: '"Noto Serif Hebrew", "Times New Roman", serif' },
  { id: 'source-serif', label: 'Source Serif (editorial)', css: '"Source Serif 4", Palatino, serif', hebrew: '"Noto Serif Hebrew", "Times New Roman", serif' },
  { id: 'baskerville', label: 'Libre Baskerville (classic)', css: '"Libre Baskerville", Palatino, serif', hebrew: '"Frank Ruhl Libre", "Times New Roman", serif' },
  { id: 'literata', label: 'Literata (book)', css: '"Literata", Palatino, serif', hebrew: '"Frank Ruhl Libre", "Times New Roman", serif' },
  { id: 'nunito', label: 'Nunito (rounded)', css: '"Nunito", "Segoe UI", sans-serif', hebrew: '"Rubik", "Arial Hebrew", sans-serif' },
  { id: 'heebo', label: 'Heebo (Hebrew and English)', css: '"Heebo", "Segoe UI", sans-serif', hebrew: '"Heebo", "Arial Hebrew", sans-serif' },
  { id: 'assistant', label: 'Assistant (Hebrew and English)', css: '"Assistant", "Segoe UI", sans-serif', hebrew: '"Assistant", "Arial Hebrew", sans-serif' },
  { id: 'frank-ruhl', label: 'Frank Ruhl (traditional Hebrew)', css: '"Frank Ruhl Libre", Palatino, serif', hebrew: '"Frank Ruhl Libre", "Times New Roman", serif' },
];

// Names used by earlier versions of the editor.
const FONT_ALIASES = {
  elegant: 'fraunces',
  modern: 'manrope',
  book: 'baskerville',
  rounded: 'nunito',
  editorial: 'source-serif',
  spectral: 'literata',
};

export function canonicalFont(id) {
  if (!id) return '';
  return FONT_ALIASES[id] || id;
}

function partsOf(target) {
  return Object.values(target?.type?.parts || {});
}

// Extra fonts a TV uses beyond its theme, across every screen and its full-screen message.
// skip names one piece part (target + partId) so its own current choice does not count.
export function extraFontsUsed(tv, skip) {
  const used = new Set();
  const visit = (target) => {
    Object.entries(target?.type?.parts || {}).forEach(([partId, style]) => {
      if (skip && skip.target === target && skip.partId === partId) return;
      const id = canonicalFont(style?.font);
      if (id && id !== 'theme') used.add(id);
    });
  };
  (tv?.screens || []).forEach((screen) => (screen.widgets || []).forEach((widget) => visit(widget.settings)));
  if (tv?.takeover) visit(tv.takeover);
  return used;
}

export { partsOf };

export const TYPE_PARTS = {
  welcome: [{ id: 'line', label: 'Welcome line', open: true }],
  date: [
    { id: 'title', label: 'Big numbers', open: true },
    { id: 'body', label: 'Main text' },
    { id: 'small', label: 'Small text' },
  ],
  shabbos: [
    { id: 'title', label: 'Times', open: true },
    { id: 'body', label: 'Parsha' },
    { id: 'small', label: 'Labels' },
  ],
  logo: [
    { id: 'title', label: 'Name', open: true },
    { id: 'small', label: 'Small line' },
  ],
  events: [
    { id: 'title', label: 'Event names', open: true },
    { id: 'small', label: 'Heading and dates' },
  ],
  text: [
    { id: 'title', label: 'Title', open: true },
    { id: 'body', label: 'Main text', para: true },
    { id: 'small', label: 'Small heading' },
  ],
  zmanim: [
    { id: 'title', label: 'Times', open: true },
    { id: 'small', label: 'Labels' },
  ],
  photos: [{ id: 'small', label: 'Caption', open: true }],
  pdf: [{ id: 'small', label: 'Caption', open: true }],
  takeover: [
    { id: 'title', label: 'Main message', open: true },
    { id: 'body', label: 'Second line' },
    { id: 'small', label: 'Small text' },
  ],
};

// Pieces whose words are fitted to their box, so Fill the box / Exact size applies.
export const FIT_TYPES = ['welcome', 'events', 'text', 'zmanim', 'takeover'];

export function fixedSize(type) {
  return type?.fit === 'fixed';
}

export function fontChoice(id) {
  const key = canonicalFont(id);
  return TEXT_FONTS.find((item) => item.id === key) || null;
}

function cleanPart(part) {
  const next = { ...(part || {}) };
  Object.keys(next).forEach((key) => {
    const value = next[key];
    if (value === '' || value == null || value === false) delete next[key];
    if (key === 'size' && Number(value) === 100) delete next[key];
    if ((key === 'track' || key === 'para' || key === 'line') && Number(value) === 0) delete next[key];
  });
  return next;
}

export function ensureType(target) {
  if (!target.type || typeof target.type !== 'object' || Array.isArray(target.type)) {
    target.type = { fit: 'auto', parts: {} };
  }
  if (!target.type.parts || typeof target.type.parts !== 'object') target.type.parts = {};
  return target.type;
}

export function setFit(target, fit) {
  const type = ensureType(target);
  type.fit = fit === 'fixed' ? 'fixed' : 'auto';
}

export function setPart(target, partId, patch) {
  const type = ensureType(target);
  const next = cleanPart({ ...(type.parts[partId] || {}), ...patch });
  if (Object.keys(next).length) type.parts[partId] = next;
  else delete type.parts[partId];
}

export function stylePart(el, type, partId) {
  if (!el) return;
  const style = type?.parts?.[partId];
  if (!style) return;
  const scale = Number(style.size);
  if (scale && scale !== 100) el.style.setProperty('--t-scale', String(scale / 100));
  const font = fontChoice(style.font);
  if (font?.css) {
    el.classList.add('typed');
    el.style.fontFamily = font.css;
    if (font.hebrew) el.style.setProperty('--t-hebrew', font.hebrew);
  }
  if (style.weight) el.style.fontWeight = String(style.weight);
  if (style.italic) el.style.fontStyle = 'italic';
  if (style.color) el.style.color = style.color;
  if (style.align) el.style.textAlign = style.align;
  if (style.line) el.style.lineHeight = String(style.line);
  if (style.track != null && style.track !== '' && Number(style.track) !== 0) {
    el.style.letterSpacing = `${style.track}em`;
  }
  if (style.case === 'upper') el.style.textTransform = 'uppercase';
  if (style.para) el.style.setProperty('--t-para', `${style.para}em`);
}
