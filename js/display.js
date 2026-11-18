import { createCalendar } from './calendar.js';
import { createStorage } from './storage.js';
import { mountWidget, renderTakeover, takeoverActive } from './widgets.js';

const stage = document.getElementById('stage');
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

function screenIndex(now) {
  const screens = config.screens || [];
  if (screens.length < 2 || !config.cycleScreens) {
    return Math.min(screens.length - 1, Math.max(0, config.activeScreen || 0));
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
  const orientation = params.get('orientation') || config.orientation || 'landscape';
  const force = params.get('takeover');
  const showTakeover = takeoverActive(config.takeover, now, force);
  const index = screenIndex(now);
  const screen = (config.screens || [])[index] || { widgets: [] };
  const key = JSON.stringify({
    showTakeover,
    index,
    orientation,
    widgets: screen.widgets,
    takeover: config.takeover,
    force,
  });
  if (key === currentKey) return;
  currentKey = key;
  const my = ++token;
  clearMounts();
  if (showTakeover) {
    stage.replaceChildren();
    slot.hidden = false;
    const dispose = await renderTakeover(slot, config.takeover || {}, makeCtx(screen));
    if (my !== token) {
      dispose();
      return;
    }
    disposers.push(dispose);
  } else {
    slot.hidden = true;
    slot.replaceChildren();
    stage.replaceChildren();
    const ctx = makeCtx(screen);
    for (const widget of screen.widgets || []) {
      if (my !== token) return;
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
      stage.append(shell);
      const dispose = await mountWidget(body, widget, ctx);
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

async function load() {
  if (!calendar) return;
  const local = storage.loadLocal();
  if (usingLocal() && local) config = local;
  else {
    try {
      config = await storage.loadPublished();
    } catch {
      config = null;
    }
    if (!config && local) config = local;
  }
  if (!config) {
    stage.innerHTML = '<div class="boot-error">No layout is saved on this computer, and the published file could not be read.</div>';
    return;
  }
  const nextKey = JSON.stringify(config);
  if (nextKey === loadedKey && currentKey) return;
  loadedKey = nextKey;
  currentKey = '';
  await paint();
}

storage.subscribe((message) => {
  if (message.type === 'source' && !forcedSource) {
    source = message.source;
    load();
    return;
  }
  if (message.type === 'save' && message.config && usingLocal()) {
    config = message.config;
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

setInterval(() => { paint(); }, 1000);
setInterval(() => {
  if (!usingLocal()) load();
}, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

load();
