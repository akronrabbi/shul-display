import { anonymousToken, boardHasLayout, readBoard } from './cloud.js';
import { applyTheme } from './themes.js';
import { createCalendar } from './calendar.js';
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

function clearMounts() {
  disposers.forEach((fn) => {
    try { fn(); } catch { /* already gone */ }
  });
  disposers = [];
}

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

function screenIndex(now) {
  const current = board();
  const screens = current?.screens || [];
  if (screens.length < 2 || !current.cycleScreens) {
    return Math.min(Math.max(screens.length - 1, 0), Math.max(0, current?.activeScreen || 0));
  }
  const durations = screens.map((screen) => Math.max(5, Number(screen.duration) || 20));
  const total = durations.reduce((sum, value) => sum + value, 0);
  let cursor = Math.floor(now.getTime() / 1000) % total;
  for (let i = 0; i < screens.length; i += 1) {
    cursor -= durations[i];
    if (cursor < 0) return i;
  }
  return 0;
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
  const index = screenIndex(now);
  const screen = (current.screens || [])[index] || { widgets: [] };
  const key = JSON.stringify({
    tv: current.id,
    showTakeover,
    index,
    orientation,
    widgets: screen.widgets,
    takeover: current.takeover,
    force,
  });
  if (key === currentKey) return;
  currentKey = key;
  const my = ++token;
  if (showTakeover) {
    const holder = document.createElement('div');
    const dispose = await renderTakeover(holder, current.takeover || {}, makeCtx(screen));
    if (my !== token) {
      dispose();
      return;
    }
    clearMounts();
    slot.replaceChildren(...holder.childNodes);
    slot.hidden = false;
    stage.replaceChildren();
    disposers.push(dispose);
  } else {
    const shells = [];
    for (const widget of screen.widgets || []) {
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
      shells.push({ shell, body, widget });
    }
    if (my !== token) return;
    clearMounts();
    slot.hidden = true;
    slot.replaceChildren();
    stage.replaceChildren(...shells.map((item) => item.shell));
    const ctx = makeCtx(screen);
    for (const item of shells) {
      if (my !== token) return;
      const dispose = await mountWidget(item.body, item.widget, ctx);
      if (my !== token) {
        dispose();
        return;
      }
      disposers.push(dispose);
    }
  }
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

window.addEventListener('resize', () => fitFrame());
setInterval(() => { paint(); }, 1000);
setInterval(() => { pollCloud(); }, 30000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

load();
