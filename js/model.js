import { normalizeTheme } from './themes.js';
import { defaultSettings, defaultTakeover } from './widgets.js';

export function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tv';
}

export function uniqueId(tvs, base) {
  const used = new Set((tvs || []).map((tv) => String(tv.id || '').toLowerCase()));
  let id = base || 'tv';
  let n = 2;
  while (used.has(id.toLowerCase())) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function normalizeScreen(screen) {
  const next = screen || {};
  next.widgets = next.widgets || [];
  next.duration = Number(next.duration) || 30;
  next.name = next.name || 'Main';
  next.id = next.id || 'main';
  // A draft screen is saved with the board but never shown on the TV.
  if (next.draft) next.draft = true;
  else delete next.draft;
  next.widgets.forEach((widget) => {
    widget.settings = { ...defaultSettings(widget.type), ...(widget.settings || {}) };
    widget.place = widget.place || {};
    if (!widget.locked) delete widget.locked;
    if (!widget.showFrom) delete widget.showFrom;
    if (!widget.showUntil) delete widget.showUntil;
  });
  return next;
}

export function normalizeTv(tv, fallbackName) {
  const next = { ...(tv || {}) };
  next.id = String(next.id || 'lobby');
  next.name = next.name || fallbackName || 'Lobby';
  next.orientation = next.orientation === 'portrait' ? 'portrait' : 'landscape';
  next.cycleScreens = Boolean(next.cycleScreens);
  const rotation = Number(next.rotation);
  next.rotation = rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
  next.activeScreen = next.activeScreen || 0;
  if (!Array.isArray(next.screens) || !next.screens.length) {
    next.screens = [{ id: 'main', name: 'Main', duration: 30, widgets: [] }];
  }
  next.screens = next.screens.map((screen) => normalizeScreen(screen));
  // The screen the TV shows when it is not cycling. Older boards used the tab
  // that was open in the editor when they were saved, so start from that.
  const ids = next.screens.map((screen) => screen.id);
  const shown = next.screens.filter((screen) => !screen.draft).map((screen) => screen.id);
  if (!shown.includes(next.liveScreen)) {
    const guess = ids[Math.min(ids.length - 1, Math.max(0, Number(next.activeScreen) || 0))];
    next.liveScreen = shown.includes(guess) ? guess : (shown[0] || ids[0]);
  }
  next.takeover = { ...defaultTakeover(), ...(next.takeover || {}) };
  next.theme = normalizeTheme(next.theme);
  next.transition = SCREEN_TRANSITIONS.some(([id]) => id === next.transition) ? next.transition : 'fade';
  next.shabbosMode = normalizeShabbosMode(next.shabbosMode, next.screens);
  return next;
}

export const SCREEN_TRANSITIONS = [
  ['fade', 'Soft fade'],
  ['rise', 'Fade and rise'],
  ['slide', 'Slide across'],
  ['none', 'Cut, no movement'],
];

// Shabbos mode is off unless an editor turns it on. When on, the TV shows one
// chosen screen from shortly before candle lighting until after havdalah.
export function normalizeShabbosMode(raw, screens) {
  const mode = raw && typeof raw === 'object' ? raw : {};
  const ids = (screens || []).map((screen) => screen.id);
  const clamp = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(240, Math.max(0, Math.round(n))) : fallback;
  };
  return {
    enabled: Boolean(mode.enabled),
    screenId: ids.includes(mode.screenId) ? mode.screenId : '',
    before: clamp(mode.before, 20),
    after: clamp(mode.after, 10),
    yomTov: mode.yomTov !== false,
  };
}

// Old files kept the board on the root. Those become TV 1, named Lobby.
export function normalizeConfig(config) {
  const raw = structuredClone(config || {});
  let tvs;
  if (Array.isArray(raw.tvs) && raw.tvs.length) {
    tvs = raw.tvs.map((tv, index) => normalizeTv(tv, index === 0 ? 'Lobby' : `TV ${index + 1}`));
  } else {
    tvs = [normalizeTv({
      id: 'lobby',
      name: 'Lobby',
      orientation: raw.orientation,
      cycleScreens: raw.cycleScreens,
      activeScreen: raw.activeScreen,
      screens: raw.screens,
      takeover: raw.takeover,
    }, 'Lobby')];
  }
  let activeTv = Number(raw.activeTv);
  if (!Number.isInteger(activeTv) || activeTv < 0 || activeTv >= tvs.length) activeTv = 0;
  const google = {
    photosClientId: String(raw.google?.photosClientId || '').trim().slice(0, 200),
  };
  // Every picture uploaded or copied from Google Photos, so it can be used again.
  const seen = new Set();
  const library = (Array.isArray(raw.library) ? raw.library : [])
    .filter((item) => item && /^https?:\/\//i.test(String(item.url || '')) && !seen.has(item.url) && seen.add(item.url))
    .slice(-1000)
    .map((item) => ({ url: String(item.url), name: String(item.name || '').slice(0, 120), from: item.from === 'google-photos' ? 'google-photos' : 'upload', at: String(item.at || '') }));
  return { version: 2, activeTv, tvs, google, library };
}

export function pickTv(config, param) {
  const tvs = config?.tvs || [];
  if (!tvs.length) return null;
  if (param == null || String(param).trim() === '') return tvs[0];
  const value = String(param).trim();
  const lower = value.toLowerCase();
  const byId = tvs.find((tv) => String(tv.id).toLowerCase() === lower);
  if (byId) return byId;
  const index = Number(value);
  if (Number.isInteger(index) && String(index) === value && index >= 1 && index <= tvs.length) return tvs[index - 1];
  return tvs[0];
}

export function tvPageUrl(tv) {
  const params = new URLSearchParams();
  params.set('tv', tv.id);
  const rotate = Number(tv?.rotation) || 0;
  if (rotate === 90 || rotate === 180 || rotate === 270) params.set('rotate', String(rotate));
  return `./index.html?${params}`;
}

// Layout size of the stage before CSS rotation. A 90 or 270 turn swaps the
// box so container-query text sizes match a real portrait screen.
export function frameSize(vw, vh, orientation, rotate) {
  const turn = [90, 180, 270].includes(Number(rotate)) ? Number(rotate) : 0;
  const swap = turn === 90 || turn === 270;
  const design = orientation === 'portrait' ? 9 / 16 : 16 / 9;
  const visual = swap ? 1 / design : design;
  const width = Math.max(0, Number(vw) || 0);
  const height = Math.max(0, Number(vh) || 0);
  if (!width || !height) return { width: 0, height: 0, rotate: turn };
  let visualW;
  let visualH;
  if (width / height > visual) {
    visualH = height;
    visualW = height * visual;
  } else {
    visualW = width;
    visualH = width / visual;
  }
  return {
    width: swap ? visualH : visualW,
    height: swap ? visualW : visualH,
    rotate: turn,
  };
}

export function blankTv(name, id) {
  const welcome = {
    id: `w-${id}`,
    type: 'welcome',
    settings: { ...defaultSettings('welcome'), text: name || 'Welcome' },
    place: {
      landscape: { x: 0, y: 40, w: 100, h: 18 },
      portrait: { x: 0, y: 40, w: 100, h: 12 },
    },
  };
  return normalizeTv({
    id,
    name,
    orientation: 'landscape',
    cycleScreens: false,
    activeScreen: 0,
    screens: [{ id: 'main', name: 'Main', duration: 30, widgets: [welcome] }],
    takeover: {
      ...defaultTakeover(),
      title: 'Welcome',
      subtitle: '',
      details: '',
      footer: name || '',
    },
  });
}
