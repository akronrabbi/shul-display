// Per-piece text styling. Missing values mean "use the theme", so old layouts stay as they are.

import { FONT_PAIRINGS } from './themes.js';

export const TEXT_FONTS = [
  { id: 'theme', label: 'Theme default' },
  ...FONT_PAIRINGS.map((item) => ({
    id: item.id,
    label: item.label,
    css: item.heading,
    hebrew: item.hebrew,
  })),
  {
    id: 'heebo',
    label: 'Heebo',
    css: '"Heebo", "Segoe UI", sans-serif',
    hebrew: '"Heebo", "Arial Hebrew", sans-serif',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    css: '"Assistant", "Segoe UI", sans-serif',
    hebrew: '"Assistant", "Arial Hebrew", sans-serif',
  },
  {
    id: 'spectral',
    label: 'Spectral',
    css: '"Spectral", Palatino, serif',
    hebrew: '"Noto Serif Hebrew", "Times New Roman", serif',
  },
  {
    id: 'literata',
    label: 'Literata',
    css: '"Literata", Palatino, serif',
    hebrew: '"Frank Ruhl Libre", "Times New Roman", serif',
  },
];

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
    { id: 'body', label: 'Main text' },
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

export function fixedSize(type) {
  return type?.fit === 'fixed';
}

export function fontChoice(id) {
  return TEXT_FONTS.find((item) => item.id === id) || null;
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
