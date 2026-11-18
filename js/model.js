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
  next.widgets.forEach((widget) => {
    widget.settings = { ...defaultSettings(widget.type), ...(widget.settings || {}) };
    widget.place = widget.place || {};
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
  next.takeover = { ...defaultTakeover(), ...(next.takeover || {}) };
  next.theme = normalizeTheme(next.theme);
  return next;
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
  return { version: 2, activeTv, tvs };
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
