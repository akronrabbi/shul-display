import { anonymousToken, boardHasLayout, pingTv, readBoard } from './cloud.js';
import { applyTheme } from './themes.js';
import { createCalendar, zoneParts } from './calendar.js';
import { inDateRange } from './events.js';
import { frameSize, normalizeConfig, pickTv } from './model.js';
import { createStorage } from './storage.js';
import { mountWidget, renderTakeover, takeoverActive } from './widgets.js';

const stage = document.getElementById('stage');
const frame = document.getElementById('frame');
const slot = document.getElementById('takeover');
const storage = createStorage();

let calendar;
try {
  calendar = createCalendar(globalThis.hebcal);
} catch (error) {
  stage.innerHTML = '<div class="boot-error">The calendar library did not load. Check the connection once, then this screen can keep running.</div>';
  console.error(error);
}

let source = storage.getSource();
let config = null;
let loadedKey = '';
let currentKey = '';
let token = 0;
let disposers = [];

const params = new URLSearchParams(location.search);
const forcedSource = params.get('source');

function board() {
  return pickTv(config, params.get('tv'));
}

function rotationOf(tv) {
  const raw = params.get('rotate');
  if (raw != null && raw !== '') {
    const query = Number(raw);
    if (query === 0 || query === 90 || query === 180 || query === 270) return query;
  }
  const saved = Number(tv?.rotation);
  return saved === 90 || saved === 180 || saved === 270 ? saved : 0;
}

function fitFrame() {
  if (!frame || !config) return;
  const current = board();
  if (!current) return;
  const bezel = frame.parentElement;
  const orientation = params.get('orientation') || current.orientation || 'landscape';
  const box = frameSize(bezel.clientWidth, bezel.clientHeight, orientation, rotationOf(current));
  frame.style.width = `${box.width}px`;
  frame.style.height = `${box.height}px`;
  frame.style.transform = `translate(-50%, -50%) rotate(${box.rotate}deg)`;
}

function shabbosSettingsOf(tv) {
  for (const screen of tv?.screens || []) {
    const found = (screen.widgets || []).find((widget) => widget.type === 'shabbos');
    if (found) return found.settings;
  }
  return {};
}

// Which screen is up now. Shabbos mode, when an editor turned it on, wins
// from shortly before candle lighting until shortly after havdalah.
function pickScreen(now) {
  const current = board();
  const screens = current?.screens || [];
  const mode = current?.shabbosMode;
  const restScreen = mode?.enabled ? screens.find((screen) => screen.id === mode.screenId) : null;
  if (restScreen && calendar) {
    const rest = calendar.restWindow(now, shabbosSettingsOf(current), mode);
    if (rest?.active) return { screen: restScreen, index: screens.indexOf(restScreen), rest: true };
  }
  let pool = screens.map((screen, index) => ({ screen, index }));
  if (restScreen && pool.length > 1) pool = pool.filter((item) => item.screen !== restScreen);
  if (pool.length < 2 || !current.cycleScreens) {
    const pick = pool.find((item) => item.screen.id === current.liveScreen) || pool[0];
    return pick ? { ...pick, rest: false } : { screen: { widgets: [] }, index: 0, rest: false };
  }
  const durations = pool.map((item) => Math.max(5, Number(item.screen.duration) || 20));
  const total = durations.reduce((sum, value) => sum + value, 0);
  let cursor = Math.floor(now.getTime() / 1000) % total;
  for (let i = 0; i < pool.length; i += 1) {
    cursor -= durations[i];
    if (cursor < 0) return { ...pool[i], rest: false };
  }
  return { ...pool[0], rest: false };
}

function makeCtx(screen) {
  const shabbos = (screen?.widgets || []).find((widget) => widget.type === 'shabbos');
  return {
    calendar,
    shabbosSettings: shabbos?.settings || null,
    now: () => new Date(),
    resolveAsset: async (id) => {
      const embedded = config.assets?.[id]?.dataUrl;
      if (embedded) return embedded;
      return storage.assetURL(id);
    },
    assetBuffer: async (id) => {
      const embedded = config.assets?.[id]?.dataUrl;
      if (embedded) {
        const response = await fetch(embedded);
        return response.arrayBuffer();
      }
      return storage.assetBuffer(id);
    },
  };
}

function placeOf(widget, orientation) {
  return widget.place?.[orientation] || widget.place?.landscape || widget.place?.portrait || { x: 4, y: 4, w: 30, h: 20 };
}

let layer = null;

function buildShells(host, widgets, orientation) {
  const shells = [];
  for (const widget of widgets) {
    const shell = document.createElement('div');
    const place = placeOf(widget, orientation);
    shell.className = `widget tone-${widget.settings?.tone || 'ivory'}`;
    shell.style.left = `${place.x}%`;
    shell.style.top = `${place.y}%`;
    shell.style.width = `${place.w}%`;
    shell.style.height = `${place.h}%`;
    const body = document.createElement('div');
    body.className = 'widget-body';
    shell.append(body);
    host.append(shell);
    shells.push({ shell, body, widget });
  }
  return shells;
}

// The next screen is drawn on a hidden layer above the old one, then faded in,
// so the TV never flashes an empty frame between screens.
function swapLayer(next, nextDisposers, transition) {
  const oldLayer = layer;
  const oldDisposers = disposers;
  layer = next;
  disposers = nextDisposers;
  stage.dataset.move = transition;
  const finish = () => {
    oldDisposers.forEach((fn) => {
      try { fn(); } catch { /* already gone */ }
    });
    if (oldLayer) oldLayer.remove();
  };
  if (transition === 'none' || !oldLayer) {
    next.classList.remove('entering');
    finish();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    next.classList.remove('entering');
    oldLayer.classList.add('leaving');
  }));
  setTimeout(finish, 1300);
}

async function paint() {
  if (!calendar || !config) return;
  const now = new Date();
  const current = board();
  if (!current) return;
  const orientation = params.get('orientation') || current.orientation || 'landscape';
  const force = params.get('takeover');
  applyTheme(document.querySelector('.bezel'), current.theme);
  fitFrame();
  const showTakeover = takeoverActive(current.takeover, now, force);
  const picked = pickScreen(now);
  const screen = picked.screen;
  const widgets = (screen.widgets || []).filter((widget) => inDateRange(widget, now));
  const key = JSON.stringify({
    tv: current.id,
    showTakeover,
    index: picked.index,
    orientation,
    widgets,
    takeover: showTakeover ? current.takeover : null,
    force,
  });
  if (key === currentKey) return;
  currentKey = key;
  currentScreenName = screen.name || '';
  const my = ++token;
  const next = document.createElement('div');
  next.className = 'stage-layer entering';
  stage.append(next);
  const nextDisposers = [];
  const abandon = () => {
    nextDisposers.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
    next.remove();
  };
  const ctx = makeCtx(screen);
  if (showTakeover) {
    const dispose = await renderTakeover(next, current.takeover || {}, ctx);
    nextDisposers.push(dispose);
  } else {
    const shells = buildShells(next, widgets, orientation);
    for (const item of shells) {
      if (my !== token) {
        abandon();
        return;
      }
      nextDisposers.push(await mountWidget(item.body, item.widget, ctx));
    }
  }
  if (my !== token) {
    abandon();
    return;
  }
  stage.querySelectorAll('.boot-error').forEach((node) => node.remove());
  swapLayer(next, nextDisposers, current.transition || 'fade');
  window.__ready = true;
}

function usingLocal() {
  if (forcedSource === 'published') return false;
  if (forcedSource === 'local') return true;
  if (source === 'published') return false;
  if (source === 'local') return true;
  return storage.loadLocal() != null;
}

let cloudStamp = '';

function applyRaw(raw) {
  config = normalizeConfig(raw);
  const nextKey = JSON.stringify(config);
  if (nextKey === loadedKey && currentKey) return;
  loadedKey = nextKey;
  currentKey = '';
  return paint();
}

function cloudOn() {
  if (forcedSource === 'local' || forcedSource === 'published') return false;
  if (source === 'local' || source === 'published') return false;
  return true;
}

async function load() {
  if (!calendar) return;
  const local = storage.loadLocal();
  if (!cloudOn()) {
    if ((forcedSource === 'local' || source === 'local') && local) {
      await applyRaw(local);
      return;
    }
    try {
      const published = await storage.loadPublished();
      if (published) await applyRaw(published);
    } catch { /* ignore */ }
    if (!config) stage.innerHTML = '<div class="boot-error">The published file could not be read.</div>';
    return;
  }
  if (boardHasLayout(local)) await applyRaw(local);
  try {
    const token = await anonymousToken();
    const row = await readBoard(token);
    if (row) cloudStamp = row.updated_at || '';
    if (boardHasLayout(row?.config)) {
      storage.saveLocal(row.config);
      await applyRaw(row.config);
      return;
    }
  } catch {
    // The last copy on this television stays up.
  }
  if (config) return;
  try {
    const published = await storage.loadPublished();
    if (published) await applyRaw(published);
  } catch { /* ignore */ }
  if (!config) {
    stage.innerHTML = '<div class="boot-error">No layout is saved on this computer, and the online board could not be read.</div>';
  }
}

async function pollCloud() {
  if (!calendar || !cloudOn()) return;
  try {
    const token = await anonymousToken();
    const stamp = await readBoard(token, { stampOnly: true });
    if (!stamp?.updated_at || stamp.updated_at === cloudStamp) return;
    const row = await readBoard(token);
    cloudStamp = row?.updated_at || stamp.updated_at;
    if (!boardHasLayout(row?.config)) return;
    storage.saveLocal(row.config);
    await applyRaw(row.config);
  } catch {
    // Keep the picture that is already on screen.
  }
}

storage.subscribe((message) => {
  if (message.type === 'source' && !forcedSource) {
    source = message.source;
    load();
    return;
  }
  if (message.type === 'save' && message.config && usingLocal()) {
    config = normalizeConfig(message.config);
    currentKey = '';
    paint();
  }
});

let cursorTimer;
function showCursor() {
  document.body.classList.add('show-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.remove('show-cursor'), 2500);
}
document.addEventListener('mousemove', showCursor);
showCursor();

document.getElementById('fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
});

let currentScreenName = '';
const startedAt = new Date();

async function heartbeat() {
  const current = board();
  if (!current || !navigator.onLine) return;
  try {
    const pass = await anonymousToken();
    await pingTv(pass, current.id, {
      screen: currentScreenName,
      width: String(window.screen?.width || window.innerWidth || ''),
      height: String(window.screen?.height || window.innerHeight || ''),
      source: forcedSource || source,
      started: startedAt.toISOString(),
    });
  } catch {
    // The status table may not exist yet. The board does not depend on it.
  }
}

// A television can run for weeks. A quiet reload once a night, around 3 AM in
// Akron, clears anything that built up. The service worker keeps a copy, so
// this is safe even if the network is down at that moment.
function nightlyRefresh() {
  if (params.get('noreload') === '1') return;
  const uptime = Date.now() - startedAt.getTime();
  const akron = zoneParts(new Date());
  if (akron.hour === 3 && akron.minute < 15 && uptime > 2 * 60 * 60 * 1000) {
    location.reload();
  }
}

window.addEventListener('resize', () => fitFrame());
setInterval(heartbeat, 60000);
setTimeout(heartbeat, 8000);
setInterval(nightlyRefresh, 60000);
setInterval(() => { paint(); }, 1000);
setInterval(() => { pollCloud(); }, 30000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

load();
