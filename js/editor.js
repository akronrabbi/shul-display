import { createCalendar } from './calendar.js';
import { authReady, currentUser, editorToken, sendEmailCode, signInWithCode, signInWithGoogle, signOut } from './auth.js';
import { SCREEN_TRANSITIONS, blankTv, normalizeConfig as normalize, slugify, tvPageUrl, uniqueId } from './model.js';
import { CARD_STYLES, FONT_PAIRINGS, PRESETS, applyTheme, normalizeTheme, resolveTheme } from './themes.js';
import { FIT_TYPES, MAX_EXTRA_FONTS, TEXT_FONTS, TYPE_PARTS, canonicalFont, extraFontsUsed, setFit, setPart } from './type.js';
import { createStorage, collectAssetIds } from './storage.js';
import { classifyImageList, PHOTOS_HELP } from './images.js';
import { explainDriveError, listDriveFolderImages } from './drive.js';
import { inDateRange, isCurrentEvent } from './events.js';
import { readTvStatus } from './cloud.js';
import { TEMPLATES, applyTemplate } from './templates.js';
import { connectPhotos, downloadPhoto, endPickSession, photosConnected, pickPhotos } from './gphotos.js';
import {
  PHOTO_TRANSITIONS,
  WIDGET_TYPES,
  defaultSettings,
  mountWidget,
  photoTransition,
  renderTakeover,
  toneChoices,
} from './widgets.js';

const storage = createStorage({ getToken: editorToken });
const calendar = createCalendar(globalThis.hebcal);
const canvas = document.getElementById('canvas');
const palette = document.getElementById('palette');
const inspector = document.getElementById('inspector');
const tabs = document.getElementById('tabs');
const status = document.getElementById('status');

let state;
let savedJson = '';
let hasLocal = false;
let selectedId = null;
let mode = 'screen';
let previewTakeover = false;
let renderToken = 0;
const mounts = new Map();
// Pieces picked together with Shift-click (or "Select several" on a phone).
const multi = new Set();
let tvStatus = { ok: false, rows: [] };

function setStatus(text, state = '') {
  status.textContent = text;
  status.title = text;
  if (state) status.dataset.state = state;
  else delete status.dataset.state;
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function tv() {
  return state.tvs[Math.min(state.tvs.length - 1, Math.max(0, state.activeTv || 0))];
}

function screen() {
  const board = tv();
  return board.screens[Math.min(board.screens.length - 1, Math.max(0, board.activeScreen || 0))];
}

function findWidget(id) {
  return screen().widgets.find((widget) => widget.id === id) || null;
}

function shabbosSettings() {
  return screen().widgets.find((widget) => widget.type === 'shabbos')?.settings || null;
}

function ctx() {
  return {
    calendar,
    shabbosSettings: shabbosSettings(),
    now: () => new Date(),
    resolveAsset: (id) => storage.assetURL(id),
    assetBuffer: (id) => storage.assetBuffer(id),
  };
}

function dirty() {
  return JSON.stringify(state) !== savedJson;
}

const undoPast = [];
const undoFuture = [];
let undoTimer = 0;
let undoLock = false;

function paintUndo() {
  const undo = document.getElementById('undo');
  const redo = document.getElementById('redo');
  if (undo) undo.disabled = undoPast.length < 2;
  if (redo) redo.disabled = !undoFuture.length;
}

function commitUndo() {
  if (undoLock) return;
  const snap = JSON.stringify(state);
  if (undoPast[undoPast.length - 1] === snap) return;
  undoPast.push(snap);
  if (undoPast.length > 60) undoPast.shift();
  undoFuture.length = 0;
  paintUndo();
}

function seedUndo() {
  undoPast.length = 0;
  undoFuture.length = 0;
  undoPast.push(JSON.stringify(state));
  paintUndo();
}

function showSnapshot(json) {
  undoLock = true;
  state = normalize(JSON.parse(json));
  selectedId = null;
  previewTakeover = false;
  mode = 'screen';
  paintChrome();
  renderCanvas();
  buildInspector();
  status.textContent = dirty() ? 'Not saved yet' : 'All changes are saved';
  undoLock = false;
  paintUndo();
}

function undo() {
  clearTimeout(undoTimer);
  commitUndo();
  if (undoPast.length < 2) return;
  undoFuture.push(undoPast.pop());
  showSnapshot(undoPast[undoPast.length - 1]);
}

function redo() {
  if (!undoFuture.length) return;
  const next = undoFuture.pop();
  undoPast.push(next);
  showSnapshot(next);
}

function markDirty() {
  if (dirty()) setStatus('Not saved yet', 'dirty');
  else if (!hasLocal) setStatus('Published layout. Press Save to put it online.', 'dirty');
  else setStatus('Saved. The TV is up to date.', 'saved');
  if (undoLock) return;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(commitUndo, 400);
}

function clampRaw(place) {
  const w = Math.max(12, Math.min(100, place.w));
  const h = Math.max(8, Math.min(100, place.h));
  return {
    x: Math.min(Math.max(0, place.x), 100 - w),
    y: Math.min(Math.max(0, place.y), 100 - h),
    w,
    h,
  };
}

// Half-percent steps keep pieces on the guides they snapped to.
function snapPlace(place) {
  const half = (n) => Math.round(n * 2) / 2;
  return clampRaw({
    x: half(place.x),
    y: half(place.y),
    w: Math.max(12, half(place.w)),
    h: Math.max(8, half(place.h)),
  });
}

const SNAP = 1.2;

// Lines a moving piece can snap to: the screen edges and middle, the even
// margins the ready layouts use, and the edges and middles of the other pieces.
function snapTargets(skipId, orientation) {
  const margin = orientation === 'portrait' ? 4 : 3;
  const xs = [0, margin, 50, 100 - margin, 100];
  const ys = [0, margin, 50, 100 - margin, 100];
  for (const other of screen().widgets) {
    if (other.id === skipId) continue;
    const p = other.place[orientation];
    if (!p) continue;
    xs.push(p.x, p.x + p.w / 2, p.x + p.w, p.x - 2, p.x + p.w + 2);
    ys.push(p.y, p.y + p.h / 2, p.y + p.h, p.y - 2, p.y + p.h + 2);
  }
  return { xs, ys };
}

function nearest(values, targets) {
  let best = null;
  for (const value of values) {
    for (const target of targets) {
      const delta = target - value;
      if (Math.abs(delta) <= SNAP && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line: target };
    }
  }
  return best;
}

function showGuides(lines) {
  canvas.querySelectorAll('.guide').forEach((node) => node.remove());
  for (const [axis, at] of lines) {
    const line = document.createElement('div');
    line.className = `guide ${axis}`;
    if (axis === 'v') line.style.left = `${at}%`;
    else line.style.top = `${at}%`;
    canvas.append(line);
  }
}

function snapMove(next, dir, targets) {
  const lines = [];
  if (!dir) {
    const sx = nearest([next.x, next.x + next.w / 2, next.x + next.w], targets.xs);
    if (sx) { next.x += sx.delta; lines.push(['v', sx.line]); }
    const sy = nearest([next.y, next.y + next.h / 2, next.y + next.h], targets.ys);
    if (sy) { next.y += sy.delta; lines.push(['h', sy.line]); }
    return lines;
  }
  if (dir.includes('e')) {
    const s = nearest([next.x + next.w], targets.xs);
    if (s) { next.w += s.delta; lines.push(['v', s.line]); }
  }
  if (dir.includes('w')) {
    const s = nearest([next.x], targets.xs);
    if (s) { next.x += s.delta; next.w -= s.delta; lines.push(['v', s.line]); }
  }
  if (dir.includes('s')) {
    const s = nearest([next.y + next.h], targets.ys);
    if (s) { next.h += s.delta; lines.push(['h', s.line]); }
  }
  if (dir.includes('n')) {
    const s = nearest([next.y], targets.ys);
    if (s) { next.y += s.delta; next.h -= s.delta; lines.push(['h', s.line]); }
  }
  return lines;
}

function applyPlace(shell, place) {
  shell.style.left = `${place.x}%`;
  shell.style.top = `${place.y}%`;
  shell.style.width = `${place.w}%`;
  shell.style.height = `${place.h}%`;
}

function specOf(type) {
  return WIDGET_TYPES.find((item) => item.type === type);
}

function stackedPlace(type, orientation) {
  const spec = specOf(type);
  const size = orientation === 'portrait' ? spec.portrait : spec.size;
  let y = 2;
  for (const widget of screen().widgets) {
    const place = widget.place[orientation];
    if (place) y = Math.max(y, place.y + place.h + 2);
  }
  if (y + size.h > 100) y = 2;
  return snapPlace({ x: orientation === 'portrait' ? 6 : 4, y, ...size });
}

function addWidget(type, place) {
  const spec = specOf(type);
  const orientation = tv().orientation;
  const other = orientation === 'portrait' ? 'landscape' : 'portrait';
  const widget = {
    id: uid('w'),
    type,
    settings: defaultSettings(type),
    place: {
      [orientation]: snapPlace(place),
      [other]: stackedPlace(type, other),
    },
  };
  // stackedPlace saw the widget list before push, which is what we want.
  screen().widgets.push(widget);
  selectedId = widget.id;
  mode = 'widget';
  markDirty();
  renderCanvas();
  buildInspector();
}

function pointInCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

function dropPlace(type, clientX, clientY) {
  const spec = specOf(type);
  const size = tv().orientation === 'portrait' ? spec.portrait : spec.size;
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 100 - size.w / 2;
  const y = ((clientY - rect.top) / rect.height) * 100 - size.h / 2;
  return { x, y, ...size };
}

function clearMounts() {
  mounts.forEach((dispose) => {
    try { dispose(); } catch { /* ignore */ }
  });
  mounts.clear();
}

async function renderCanvas() {
  const token = ++renderToken;
  clearMounts();
  canvas.replaceChildren();
  applyTheme(canvas, tv().theme);
  fitCanvas();
  if (previewTakeover) {
    const flag = document.createElement('div');
    flag.className = 'preview-flag';
    flag.textContent = 'Preview only';
    canvas.append(flag);
    const host = document.createElement('div');
    host.className = 'takeover-slot';
    host.style.inset = '0';
    canvas.append(host);
    const dispose = await renderTakeover(host, tv().takeover, ctx());
    if (token !== renderToken) {
      dispose();
      return;
    }
    mounts.set('takeover', dispose);
    window.__ready = true;
    return;
  }
  const widgets = screen().widgets;
  if (!widgets.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-note';
    empty.textContent = 'Drag a piece here, or click one to add it.';
    canvas.append(empty);
  }
  for (const widget of widgets) {
    const shell = document.createElement('div');
    shell.className = `widget tone-${widget.settings.tone || 'ivory'}`;
    shell.dataset.id = widget.id;
    if (widget.id === selectedId || multi.has(widget.id)) shell.classList.add('selected');
    if (multi.size > 1 && multi.has(widget.id)) shell.classList.add('multi');
    if (widget.locked) shell.classList.add('locked');
    if (!inDateRange(widget, new Date())) {
      shell.classList.add('off-air');
      shell.dataset.offAir = 'Not on the TV today';
    }
    const place = widget.place[tv().orientation] || stackedPlace(widget.type, tv().orientation);
    widget.place[tv().orientation] = place;
    applyPlace(shell, place);
    shell.style.zIndex = String(10 + widgets.indexOf(widget));
    const body = document.createElement('div');
    body.className = 'widget-body';
    shell.append(body);
    for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const handle = document.createElement('i');
      handle.className = `handle ${dir}`;
      handle.dataset.dir = dir;
      shell.append(handle);
    }
    canvas.append(shell);
    wireShell(shell, widget);
    const dispose = await mountWidget(body, widget, ctx());
    if (token !== renderToken) {
      dispose();
      return;
    }
    mounts.set(widget.id, dispose);
  }
  window.__ready = true;
}

async function refreshWidget(id) {
  const widget = findWidget(id);
  const shell = canvas.querySelector(`[data-id="${id}"]`);
  if (!widget || !shell) {
    renderCanvas();
    return;
  }
  shell.className = `widget tone-${widget.settings.tone || 'ivory'}${widget.id === selectedId ? ' selected' : ''}${widget.locked ? ' locked' : ''}${inDateRange(widget, new Date()) ? '' : ' off-air'}`;
  const previous = mounts.get(id);
  if (previous) previous();
  const body = shell.querySelector('.widget-body');
  const dispose = await mountWidget(body, widget, ctx());
  mounts.set(id, dispose);
}

function paintSelection() {
  canvas.querySelectorAll('.widget').forEach((node) => {
    const id = node.dataset.id;
    node.classList.toggle('selected', id === selectedId || multi.has(id));
    node.classList.toggle('multi', multi.size > 1 && multi.has(id));
  });
}

function toggleMulti(id) {
  if (!multi.size && selectedId && selectedId !== id) multi.add(selectedId);
  if (multi.has(id)) multi.delete(id);
  else multi.add(id);
  selectedId = null;
  mode = multi.size ? 'multi' : 'screen';
  if (!multi.size) mode = 'screen';
  paintSelection();
  buildInspector();
}

function wireShell(shell, widget) {
  shell.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey || mode === 'multi') {
      toggleMulti(widget.id);
      return;
    }
    multi.clear();
    selectedId = widget.id;
    mode = 'widget';
    delete document.body.dataset.sheet;
    paintSelection();
    if (isPhone()) document.body.classList.remove('sheet-open');
    else buildInspector();
    if (widget.locked) {
      if (isPhone()) buildInspector();
      return;
    }
    const handle = event.target.closest('.handle');
    const orientation = tv().orientation;
    const startPlace = { ...widget.place[orientation] };
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = canvas.getBoundingClientRect();
    const targets = snapTargets(widget.id, orientation);
    try { shell.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    document.body.classList.add('is-dragging');
    let dragged = false;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) dragged = true;
      ev.preventDefault();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const next = { ...startPlace };
      const dir = handle ? handle.dataset.dir : '';
      if (!dir) {
        next.x = startPlace.x + dx;
        next.y = startPlace.y + dy;
      } else {
        if (dir.includes('e')) next.w = startPlace.w + dx;
        if (dir.includes('s')) next.h = startPlace.h + dy;
        if (dir.includes('w')) {
          next.x = startPlace.x + dx;
          next.w = startPlace.w - dx;
        }
        if (dir.includes('n')) {
          next.y = startPlace.y + dy;
          next.h = startPlace.h - dy;
        }
      }
      // Hold Alt to place freely, without snapping.
      const lines = ev.altKey ? [] : snapMove(next, dir, targets);
      showGuides(dragged ? lines : []);
      widget.place[orientation] = clampRaw(next);
      applyPlace(shell, widget.place[orientation]);
    };
    const up = () => {
      shell.removeEventListener('pointermove', move);
      shell.removeEventListener('pointerup', up);
      shell.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-dragging');
      showGuides([]);
      widget.place[orientation] = snapPlace(widget.place[orientation]);
      applyPlace(shell, widget.place[orientation]);
      markDirty();
      if (isPhone() && !dragged) buildInspector();
    };
    shell.addEventListener('pointermove', move);
    shell.addEventListener('pointerup', up);
    shell.addEventListener('pointercancel', up);
  });
}

function duplicateWidget(id) {
  const widget = findWidget(id);
  if (!widget) return;
  const copy = structuredClone(widget);
  copy.id = uid('w');
  delete copy.locked;
  for (const key of Object.keys(copy.place)) {
    const p = copy.place[key];
    copy.place[key] = snapPlace({ ...p, x: p.x + 3, y: p.y + 3 });
  }
  const widgets = screen().widgets;
  widgets.splice(widgets.indexOf(widget) + 1, 0, copy);
  selectedId = copy.id;
  multi.clear();
  mode = 'widget';
  markDirty();
  renderCanvas();
  buildInspector();
  setStatus('Made a copy. Drag it where you want it.', 'dirty');
}

function toEdge(id, front) {
  const widgets = screen().widgets;
  const index = widgets.findIndex((widget) => widget.id === id);
  if (index < 0) return;
  const [widget] = widgets.splice(index, 1);
  if (front) widgets.push(widget);
  else widgets.unshift(widget);
  markDirty();
  renderCanvas();
}

// Line up or space out the pieces picked with Shift-click.
function arrange(kind) {
  const orientation = tv().orientation;
  const picked = screen().widgets.filter((widget) => multi.has(widget.id) && !widget.locked);
  if (picked.length < 2) return;
  const places = picked.map((widget) => widget.place[orientation]);
  const minX = Math.min(...places.map((p) => p.x));
  const maxR = Math.max(...places.map((p) => p.x + p.w));
  const minY = Math.min(...places.map((p) => p.y));
  const maxB = Math.max(...places.map((p) => p.y + p.h));
  const first = places[0];
  if (kind === 'left') places.forEach((p) => { p.x = minX; });
  if (kind === 'right') places.forEach((p) => { p.x = maxR - p.w; });
  if (kind === 'hcenter') places.forEach((p) => { p.x = (minX + maxR) / 2 - p.w / 2; });
  if (kind === 'top') places.forEach((p) => { p.y = minY; });
  if (kind === 'bottom') places.forEach((p) => { p.y = maxB - p.h; });
  if (kind === 'vcenter') places.forEach((p) => { p.y = (minY + maxB) / 2 - p.h / 2; });
  if (kind === 'width') places.forEach((p) => { p.w = first.w; });
  if (kind === 'height') places.forEach((p) => { p.h = first.h; });
  if (kind === 'hspace' && places.length > 2) {
    const sorted = [...places].sort((a, b) => a.x - b.x);
    const total = sorted.reduce((sum, p) => sum + p.w, 0);
    const gap = (maxR - minX - total) / (sorted.length - 1);
    let x = minX;
    sorted.forEach((p) => { p.x = x; x += p.w + gap; });
  }
  if (kind === 'vspace' && places.length > 2) {
    const sorted = [...places].sort((a, b) => a.y - b.y);
    const total = sorted.reduce((sum, p) => sum + p.h, 0);
    const gap = (maxB - minY - total) / (sorted.length - 1);
    let y = minY;
    sorted.forEach((p) => { p.y = y; y += p.h + gap; });
  }
  picked.forEach((widget) => {
    widget.place[orientation] = snapPlace(widget.place[orientation]);
  });
  markDirty();
  renderCanvas();
}

function buildMultiForm() {
  const count = multi.size;
  inspector.append(el('h2', 'side-title', `${count} piece${count === 1 ? '' : 's'} selected`));
  inspector.append(el('p', 'hint', 'Tap or Shift-click more pieces to add them. Then line them up or space them evenly. Locked pieces stay put.'));
  const group = (title, items) => {
    const box = el('div', 'tool-group');
    box.append(el('span', 'tool-label', title));
    const row = el('div', 'tool-row');
    items.forEach(([kind, label]) => {
      const button = actionButton(label, () => arrange(kind));
      button.disabled = count < 2 || ((kind === 'hspace' || kind === 'vspace') && count < 3);
      row.append(button);
    });
    box.append(row);
    inspector.append(box);
  };
  group('Line up', [['left', 'Left edges'], ['hcenter', 'Centers'], ['right', 'Right edges'], ['top', 'Tops'], ['vcenter', 'Middles'], ['bottom', 'Bottoms']]);
  group('Space evenly', [['hspace', 'Across'], ['vspace', 'Down']]);
  group('Same size as the first one', [['width', 'Width'], ['height', 'Height']]);
  inspector.append(actionButton('Done selecting', () => {
    multi.clear();
    mode = 'screen';
    paintSelection();
    buildInspector();
  }));
}

function isPhone() {
  return window.matchMedia('(max-width: 820px)').matches;
}

function syncSheet() {
  const open = isPhone() && (Boolean(selectedId) || ['takeover', 'theme', 'layouts', 'history', 'week', 'templates', 'multi'].includes(mode) || document.body.dataset.sheet === 'screen');
  document.body.classList.toggle('sheet-open', open);
  const title = document.getElementById('sheet-title');
  if (!title) return;
  if (mode === 'theme') title.textContent = 'Theme';
  else if (mode === 'week') title.textContent = 'This week';
  else if (mode === 'templates') title.textContent = 'Ready layouts';
  else if (mode === 'multi') title.textContent = 'Line up pieces';
  else if (mode === 'layouts') title.textContent = 'Saved layouts';
  else if (mode === 'history') title.textContent = 'History';
  else if (mode === 'takeover') title.textContent = 'Full-screen message';
  else if (selectedId) {
    const widget = findWidget(selectedId);
    title.textContent = widget ? (specOf(widget.type)?.label || 'This piece') : 'This piece';
  } else title.textContent = 'This screen';
}

function fitCanvas() {
  const frame = document.getElementById('board-frame');
  const ratio = tv().orientation === 'portrait' ? 9 / 16 : 16 / 9;
  let width = frame.clientWidth || 320;
  let height = width / ratio;
  if (!isPhone() && frame.clientHeight > 80 && height > frame.clientHeight) {
    height = frame.clientHeight;
    width = height * ratio;
  }
  canvas.style.width = `${Math.max(160, Math.floor(width))}px`;
  canvas.style.height = `${Math.max(120, Math.floor(height))}px`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(label, control) {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label), control);
  return wrap;
}

function textInput(value, apply, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('input', () => {
    apply(input.value);
    markDirty();
    if (selectedId) refreshWidget(selectedId);
  });
  return input;
}

function areaInput(value, apply) {
  const input = document.createElement('textarea');
  input.value = value || '';
  input.addEventListener('input', () => {
    apply(input.value);
    markDirty();
    if (selectedId) refreshWidget(selectedId);
  });
  return input;
}

function checkInput(checked, label, apply) {
  const wrap = el('label', 'field check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  input.addEventListener('change', () => {
    apply(input.checked);
    markDirty();
    if (selectedId) refreshWidget(selectedId);
    else if (previewTakeover) renderCanvas();
  });
  wrap.append(input, document.createTextNode(label));
  return wrap;
}

function selectInput(value, options, apply) {
  const select = document.createElement('select');
  options.forEach(([optionValue, label, disabled]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.disabled = Boolean(disabled) && optionValue !== value;
    option.selected = optionValue === value;
    select.append(option);
  });
  select.addEventListener('change', () => {
    apply(select.value);
    markDirty();
    if (selectedId) refreshWidget(selectedId);
    if (previewTakeover) renderCanvas();
  });
  return select;
}

function numberInput(value, apply) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  input.addEventListener('input', () => {
    apply(input.value);
    markDirty();
    if (selectedId) refreshWidget(selectedId);
  });
  return input;
}

function setTheme(patch, { rebuild = false } = {}) {
  tv().theme = normalizeTheme({ ...tv().theme, ...patch });
  markDirty();
  applyTheme(canvas, tv().theme);
  if (previewTakeover) renderCanvas();
  if (rebuild) {
    paintThemeBlock();
    if (mode === 'theme') buildThemeForm();
  }
}

function fillThemeControls(parent) {
  const theme = normalizeTheme(tv().theme);
  const resolved = resolveTheme(theme);
  parent.append(el('p', 'hint', 'This television only. Another TV can wear a different theme.'));
  const grid = el('div', 'theme-grid');
  PRESETS.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `swatch${preset.id === theme.preset ? ' on' : ''}`;
    const face = document.createElement('span');
    face.className = 'swatch-face';
    face.style.background = `linear-gradient(160deg, ${preset.bg2}, ${preset.bg})`;
    if (preset.cards === 'glass' || preset.cards === 'line') button.classList.add('modern');
    const surface = document.createElement('span');
    surface.className = 'swatch-chip';
    surface.style.background = preset.surface;
    const accent = document.createElement('span');
    accent.className = 'swatch-chip';
    accent.style.background = preset.accent;
    face.append(surface, accent);
    const name = document.createElement('span');
    name.className = 'swatch-name';
    name.textContent = preset.label;
    button.append(face, name);
    button.addEventListener('click', () => {
      setTheme({
        preset: preset.id,
        font: preset.font,
        ground: preset.ground,
        cards: preset.cards || 'solid',
        accent: null,
        background: null,
      }, { rebuild: true });
    });
    grid.append(button);
  });
  parent.append(grid);

  const fonts = FONT_PAIRINGS.map((item) => [item.id, item.label]);
  parent.append(field('Letters', selectInput(theme.font, fonts, (value) => {
    setTheme({ font: value }, { rebuild: true });
  })));
  const pairing = FONT_PAIRINGS.find((item) => item.id === theme.font);
  parent.append(el('p', 'hint', pairing?.note || ''));

  const grounds = el('div', 'ground-row');
  [['solid', 'Solid'], ['gradient', 'Soft gradient'], ['texture', 'Texture']].forEach(([value, label]) => {
    const button = el('button', value === theme.ground ? 'on' : '', label);
    button.type = 'button';
    button.addEventListener('click', () => setTheme({ ground: value }, { rebuild: true }));
    grounds.append(button);
  });
  parent.append(field('Background', grounds));

  const cardRow = el('div', 'ground-row');
  CARD_STYLES.forEach((item) => {
    const button = el('button', item.id === theme.cards ? 'on' : '', item.label);
    button.type = 'button';
    button.addEventListener('click', () => setTheme({ cards: item.id }, { rebuild: true }));
    cardRow.append(button);
  });
  parent.append(field('Cards', cardRow));

  const accentRow = el('div', 'color-row');
  const accent = document.createElement('input');
  accent.type = 'color';
  accent.value = resolved.vars['--accent'];
  accent.setAttribute('aria-label', 'Accent color');
  accent.addEventListener('input', () => setTheme({ accent: accent.value }));
  accentRow.append(accent);
  if (theme.accent) {
    const reset = el('button', 'btn', 'Use the preset accent');
    reset.type = 'button';
    reset.addEventListener('click', () => setTheme({ accent: null }, { rebuild: true }));
    accentRow.append(reset);
  }
  parent.append(field('Accent color', accentRow));

  const backRow = el('div', 'color-row');
  const background = document.createElement('input');
  background.type = 'color';
  background.value = resolved.vars['--bg'];
  background.setAttribute('aria-label', 'Background color');
  background.addEventListener('input', () => setTheme({ background: background.value }));
  backRow.append(background);
  if (theme.background) {
    const reset = el('button', 'btn', 'Use the preset background');
    reset.type = 'button';
    reset.addEventListener('click', () => setTheme({ background: null }, { rebuild: true }));
    backRow.append(reset);
  }
  parent.append(field('Background color', backRow));
  parent.append(el('p', 'hint', 'Text on the accent and on the background switches to light or dark so it stays readable.'));
}

function paintThemeBlock() {
  const host = document.getElementById('theme-block');
  if (!host) return;
  host.replaceChildren(el('h2', 'side-title', 'Theme'));
  fillThemeControls(host);
}

function buildThemeForm() {
  inspector.replaceChildren();
  fillThemeControls(inspector);
}

let inspectorKey = '';

function buildInspector() {
  const key = `${mode}:${selectedId || ''}:${state.activeTv}:${tv().activeScreen}`;
  const keepScroll = key === inspectorKey ? inspector.scrollTop : 0;
  inspectorKey = key;
  requestAnimationFrame(() => { inspector.scrollTop = keepScroll; });
  inspector.replaceChildren();
  if (mode === 'theme') {
    buildThemeForm();
    syncSheet();
    return;
  }
  if (mode === 'layouts' || mode === 'history') {
    buildInspectorArchive();
    return;
  }
  if (mode === 'takeover') {
    buildTakeoverForm();
    syncSheet();
    return;
  }
  if (mode === 'week') {
    buildWeekForm();
    syncSheet();
    return;
  }
  if (mode === 'templates') {
    buildTemplatesForm();
    syncSheet();
    return;
  }
  if (mode === 'multi' && multi.size) {
    buildMultiForm();
    syncSheet();
    return;
  }
  const widget = selectedId ? findWidget(selectedId) : null;
  if (!widget) {
    buildScreenForm();
    syncSheet();
    return;
  }
  const settings = widget.settings;
  const meta = specOf(widget.type);
  inspector.append(el('h2', 'side-title', meta.label));
  inspector.append(el('p', 'hint', 'Change it here. The screen updates as you type. Save when you want the TV to follow.'));
  inspector.append(pieceToolbar(widget));

  if (widget.type === 'welcome') {
    inspector.append(field('Words', areaInput(settings.text, (value) => { settings.text = value; })));
    inspector.append(field('How it moves', selectInput(settings.mode, [['static', 'Still'], ['scroll', 'Scrolling']], (value) => { settings.mode = value; })));
  }
  if (widget.type === 'date') {
    inspector.append(checkInput(settings.showClock, 'Show the clock', (value) => { settings.showClock = value; }));
    inspector.append(checkInput(settings.showEnglish, 'English date', (value) => { settings.showEnglish = value; }));
    inspector.append(checkInput(settings.showHebrew, 'Hebrew date', (value) => { settings.showHebrew = value; }));
    inspector.append(field('Hebrew letters', selectInput(settings.hebrewStyle, [['nikud', 'With vowels'], ['plain', 'Without vowels']], (value) => { settings.hebrewStyle = value; })));
    inspector.append(checkInput(settings.showTranslit, 'Hebrew date in English letters', (value) => { settings.showTranslit = value; }));
    inspector.append(checkInput(settings.showParsha, 'Parsha of the week', (value) => { settings.showParsha = value; }));
  }
  if (widget.type === 'shabbos') {
    inspector.append(field('Heading', textInput(settings.heading, (value) => { settings.heading = value; })));
    inspector.append(checkInput(settings.showParsha, 'Show the parsha', (value) => { settings.showParsha = value; }));
    inspector.append(checkInput(settings.showHebrewParsha, 'Parsha in Hebrew', (value) => { settings.showHebrewParsha = value; }));
    inspector.append(field('Candle lighting, minutes before sunset', numberInput(settings.candleLightingMins, (value) => { settings.candleLightingMins = Number(value); })));
    inspector.append(field('Havdalah', selectInput(settings.havdalahMode, [
      ['degrees', 'Nightfall, 8.5 degrees (matches Hebcal)'],
      ['minutes', 'Minutes after sunset'],
    ], (value) => {
      settings.havdalahMode = value;
      buildInspector();
    })));
    if (settings.havdalahMode === 'minutes') {
      inspector.append(field('Minutes after sunset', selectInput(String(settings.havdalahMins), [
        ['42', '42 minutes'],
        ['50', '50 minutes'],
        ['72', '72 minutes'],
      ], (value) => { settings.havdalahMins = Number(value); })));
    }
    inspector.append(el('p', 'note', 'Times are for Akron, Ohio, Eastern Time. Candle lighting starts at 18 minutes before sunset, which is what Hebcal uses for this shul.'));
  }
  if (widget.type === 'logo') {
    inspector.append(checkInput(settings.showName, 'Show a name under the mark', (value) => { settings.showName = value; }));
    inspector.append(field('Name', textInput(settings.name, (value) => { settings.name = value; })));
    inspector.append(field('Line under the name', textInput(settings.subtitle, (value) => { settings.subtitle = value; })));
    inspector.append(fileButton('Upload a picture', 'image/*', async (file) => {
      const uploaded = await storeFile(file);
      if (!uploaded) return;
      settings.url = uploaded.url;
      settings.assetId = null;
      markDirty();
      refreshWidget(widget.id);
      buildInspector();
    }));
    if (settings.assetId) {
      inspector.append(el('p', 'note', 'Using your uploaded picture. Remove it to return to the shul mark.'));
      const clear = el('button', 'btn', 'Use the shul mark');
      clear.type = 'button';
      clear.addEventListener('click', async () => {
        const id = settings.assetId;
        settings.assetId = null;
        settings.url = 'assets/akron-shul-logo.png';
        if (id) await storage.deleteAsset(id);
        markDirty();
        refreshWidget(widget.id);
        buildInspector();
      });
      inspector.append(clear);
    }
  }
  if (widget.type === 'text') {
    inspector.append(field('Small heading', textInput(settings.eyebrow, (value) => { settings.eyebrow = value; })));
    inspector.append(field('Main line', textInput(settings.title, (value) => { settings.title = value; })));
    inspector.append(field('Note', areaInput(settings.body, (value) => { settings.body = value; })));
  }
  if (widget.type === 'events') buildEventsForm(settings, inspector, () => refreshWidget(widget.id));
  if (widget.type === 'photos') buildPhotosForm(settings);
  if (widget.type === 'pdf') buildPdfForm(settings);
  if (widget.type === 'zmanim') {
    inspector.append(field('Heading', textInput(settings.heading, (value) => { settings.heading = value; })));
    const labels = {
      sunrise: 'Sunrise',
      misheyakir: 'Misheyakir',
      sofZmanShma: 'Latest Shema',
      sofZmanTfilla: 'Latest Shacharit',
      chatzot: 'Midday',
      minchaGedola: 'Earliest Mincha',
      plag: 'Plag haMincha',
      sunset: 'Sunset',
      tzeit: 'Nightfall',
    };
    Object.keys(labels).forEach((key) => {
      inspector.append(checkInput(settings.show[key] !== false && settings.show[key], labels[key], (value) => {
        settings.show[key] = value;
      }));
    });
  }

  if (widget.type === 'date') {
    inspector.append(field('Small label', textInput(settings.kicker || 'Today', (value) => { settings.kicker = value; })));
  }
  if (widget.type === 'shabbos') {
    inspector.append(field('Candle lighting label', textInput(settings.candleLabel || 'Candle lighting', (value) => { settings.candleLabel = value; })));
    inspector.append(field('Havdalah label', textInput(settings.havdalahLabel || 'Havdalah', (value) => { settings.havdalahLabel = value; })));
  }
  if (widget.type === 'photos' || widget.type === 'pdf') {
    inspector.append(field('Caption', textInput(settings.caption || '', (value) => { settings.caption = value; })));
  }
  if (widget.type !== 'welcome') {
    inspector.append(field('Color', selectInput(settings.tone, toneChoices(widget.type), (value) => { settings.tone = value; })));
  } else {
    inspector.append(field('Color', selectInput(settings.tone, toneChoices('welcome'), (value) => { settings.tone = value; })));
  }
  appendTypePanel(settings, TYPE_PARTS[widget.type] || [], () => refreshWidget(widget.id), FIT_TYPES.includes(widget.type));
  inspector.append(dateRangeBlock(widget, () => renderCanvas()));

  const order = el('div', 'tool-group');
  order.append(el('span', 'tool-label', 'Layer'));
  const orderRow = el('div', 'tool-row');
  orderRow.append(actionButton('To front', () => toEdge(widget.id, true)));
  orderRow.append(actionButton('Forward', () => reorder(widget.id, 1)));
  orderRow.append(actionButton('Backward', () => reorder(widget.id, -1)));
  orderRow.append(actionButton('To back', () => toEdge(widget.id, false)));
  order.append(orderRow);
  inspector.append(order);
  const remove = actionButton('Remove this piece', () => removeWidget(widget.id));
  remove.classList.add('btn-danger');
  inspector.append(remove);
  syncSheet();
}

function pieceToolbar(widget) {
  const bar = el('div', 'piece-tools');
  const lock = actionButton(widget.locked ? 'Unlock' : 'Lock in place', () => {
    if (widget.locked) delete widget.locked;
    else widget.locked = true;
    markDirty();
    renderCanvas();
    buildInspector();
  });
  if (widget.locked) lock.classList.add('on');
  bar.append(lock);
  bar.append(actionButton('Duplicate', () => duplicateWidget(widget.id)));
  bar.append(actionButton('Select several', () => {
    multi.clear();
    multi.add(widget.id);
    selectedId = null;
    mode = 'multi';
    paintSelection();
    buildInspector();
  }));
  return bar;
}

// Any piece can be limited to dates, for example an announcement for one week.
function dateRangeBlock(widget, refresh) {
  const box = el('div', 'tool-group');
  box.append(el('span', 'tool-label', 'When it shows on the TV'));
  const row = el('div', 'date-row');
  const from = document.createElement('input');
  from.type = 'date';
  from.value = widget.showFrom || '';
  from.setAttribute('aria-label', 'First day');
  const until = document.createElement('input');
  until.type = 'date';
  until.value = widget.showUntil || '';
  until.setAttribute('aria-label', 'Last day');
  const apply = () => {
    if (from.value) widget.showFrom = from.value;
    else delete widget.showFrom;
    if (until.value) widget.showUntil = until.value;
    else delete widget.showUntil;
    markDirty();
    refresh();
  };
  from.addEventListener('change', apply);
  until.addEventListener('change', apply);
  row.append(field('From', from), field('Until', until));
  box.append(row);
  box.append(el('p', 'note', 'Leave both empty to always show it. On the last day it stays up until midnight, Akron time.'));
  return box;
}

function actionButton(label, onClick) {
  const button = el('button', 'btn', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

// Some browsers (often inside apps, or on phones) silently block pop-up
// confirm and prompt boxes. Ask with a second tap on the same button instead.
function tapTwice(label, confirmLabel, onConfirm) {
  const button = el('button', 'btn', label);
  button.type = 'button';
  let armed = false;
  let timer = 0;
  const reset = () => {
    armed = false;
    button.textContent = label;
    button.classList.remove('confirming');
  };
  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      button.classList.add('confirming');
      clearTimeout(timer);
      timer = setTimeout(reset, 5000);
      return;
    }
    clearTimeout(timer);
    reset();
    button.disabled = true;
    try {
      await onConfirm();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function fileButton(label, accept, onFile) {
  const wrap = el('label', 'btn');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (file) onFile(file);
  });
  wrap.append(input);
  return wrap;
}

function buildEventsForm(settings, host = inspector, refresh = () => refreshWidget(selectedId)) {
  host.append(field('Heading', textInput(settings.heading, (value) => { settings.heading = value; refresh(); })));
  host.append(el('p', 'note', 'Past events stay in this list so you can edit them, but the TV hides them. A weekly event is entered once.'));
  const change = (fn, rebuild = false) => () => {
    fn();
    markDirty();
    refresh();
    if (rebuild) buildInspector();
  };
  settings.events.forEach((event, index) => {
    const card = el('div', 'event-edit');
    if (event.date && !isCurrentEvent(event, new Date()) && event.title) {
      card.append(el('div', 'past-tag', 'Past - hidden on the TV'));
    }
    const input = (type, value, placeholder, label) => {
      const node = document.createElement('input');
      node.type = type;
      node.value = value || '';
      if (placeholder) node.placeholder = placeholder;
      node.setAttribute('aria-label', label);
      return node;
    };
    const title = input('text', event.title, 'Title', 'Event title');
    title.addEventListener('input', change(() => { event.title = title.value; }));
    const date = input('date', event.date, '', 'Date');
    date.addEventListener('change', change(() => { event.date = date.value; }, true));
    const time = input('time', event.time, '', 'Time');
    time.addEventListener('change', change(() => { event.time = time.value; }));
    const location = input('text', event.location, 'Place, if you want one', 'Place');
    location.addEventListener('input', change(() => { event.location = location.value; }));
    const note = input('text', event.note, 'Short note', 'Note');
    note.addEventListener('input', change(() => { event.note = note.value; }));
    const repeat = document.createElement('select');
    repeat.setAttribute('aria-label', 'Repeats');
    [['', 'One time'], ['weekly', 'Every week'], ['biweekly', 'Every other week']].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = (event.repeat || '') === value;
      repeat.append(option);
    });
    repeat.addEventListener('change', change(() => {
      if (repeat.value) event.repeat = repeat.value;
      else {
        delete event.repeat;
        delete event.until;
      }
    }, true));
    const when = el('div', 'date-row');
    when.append(date, time);
    card.append(title, when, repeat);
    if (event.repeat) {
      const until = input('date', event.until, '', 'Last date');
      until.addEventListener('change', change(() => {
        if (until.value) event.until = until.value;
        else delete event.until;
      }));
      card.append(field('Last date (leave empty to keep going)', until));
    }
    card.append(location, note);
    const remove = actionButton('Remove event', change(() => { settings.events.splice(index, 1); }, true));
    card.append(remove);
    host.append(card);
  });
  host.append(actionButton('Add an event', () => {
    settings.events.push({ id: uid('e'), title: '', date: '', time: '', note: '', location: '' });
    markDirty();
    buildInspector();
  }));
}

function buildPhotosForm(settings) {
  inspector.append(el('p', 'note', PHOTOS_HELP));
  buildGooglePhotos(settings);
  const list = el('div');
  settings.images.forEach((image, index) => {
    const row = el('div', 'thumb');
    const img = document.createElement('img');
    img.alt = '';
    if (image.assetId) storage.assetURL(image.assetId).then((url) => { if (url) img.src = url; });
    else img.src = image.url || '';
    row.append(img);
    row.append(actionButton('Remove', async () => {
      const id = image.assetId;
      settings.images.splice(index, 1);
      if (id && !collectAssetIds(state).includes(id)) await storage.deleteAsset(id);
      markDirty();
      refreshWidget(selectedId);
      buildInspector();
    }));
    list.append(row);
  });
  inspector.append(list);
  if (settings.images.length > 1) {
    inspector.append(tapTwice(`Remove all ${settings.images.length} photos`, 'Tap again to remove them all', () => {
      settings.images.splice(0, settings.images.length);
      markDirty();
      refreshWidget(selectedId);
      buildInspector();
    }));
  }
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = 'image/*';
  upload.multiple = true;
  upload.addEventListener('change', async () => {
    for (const file of upload.files) {
      const uploaded = await storeFile(file);
      if (!uploaded) continue;
      settings.images.push({ url: uploaded.url, name: file.name });
    }
    upload.value = '';
    markDirty();
    refreshWidget(selectedId);
    buildInspector();
  });
  inspector.append(field('Upload photos', upload));
  const links = document.createElement('textarea');
  links.placeholder = 'One image address per line';
  inspector.append(field('Or paste image links', links));
  const addLinks = actionButton('Add the links', () => {
    const { images, errors } = classifyImageList(links.value);
    settings.images.push(...images);
    links.value = '';
    markDirty();
    refreshWidget(selectedId);
    buildInspector();
    if (errors.some((item) => item.error === 'photos-album')) {
      inspector.prepend(el('p', 'warn', 'A Google Photos album link was skipped. ' + PHOTOS_HELP));
    } else if (errors.length) {
      inspector.prepend(el('p', 'warn', 'One of those lines was not an image address, so it was skipped.'));
    }
  });
  inspector.append(addLinks);
  const folder = document.createElement('input');
  folder.type = 'text';
  folder.placeholder = 'https://drive.google.com/drive/folders/...';
  folder.value = settings.driveFolder || '';
  folder.spellcheck = false;
  folder.addEventListener('input', () => { settings.driveFolder = folder.value.trim(); markDirty(); });
  inspector.append(field('Google Drive folder link', folder));
  const key = document.createElement('input');
  key.type = 'text';
  key.placeholder = 'API key';
  key.value = settings.driveApiKey || '';
  key.spellcheck = false;
  key.autocomplete = 'off';
  key.addEventListener('input', () => { settings.driveApiKey = key.value.trim(); markDirty(); });
  inspector.append(field('Google API key', key));
  const driveStatus = el('p', 'note', 'The TV looks again about every 10 minutes, so new pictures show up on their own.');
  const check = actionButton('Check the folder', async () => {
    check.disabled = true;
    driveStatus.textContent = 'Looking in the folder...';
    try {
      const images = await listDriveFolderImages(settings.driveFolder, settings.driveApiKey);
      driveStatus.textContent = images.length
        ? `Found ${images.length} picture${images.length === 1 ? '' : 's'}. Save, and the TV will show them.`
        : 'That folder has no pictures yet.';
      refreshWidget(selectedId);
    } catch (error) {
      driveStatus.textContent = explainDriveError(error);
      refreshWidget(selectedId);
    }
    check.disabled = false;
  });
  inspector.append(check);
  inspector.append(driveStatus);
  const steps = document.createElement('details');
  steps.className = 'key-steps';
  steps.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'How to make a safe Google key';
  const stepsBody = el('ol', 'note');
  [
    'Go to console.cloud.google.com and create a project. Any name is fine.',
    'Search for Google Drive API and turn it on.',
    'Open APIs and services, then Credentials, then Create credentials, then API key.',
    'Edit the key. Under Application restrictions choose Websites, and add https://akronrabbi.github.io/* . Under API restrictions choose Restrict key, and allow only the Google Drive API. Save.',
    'In Google Drive, share the folder as Anyone with the link (Viewer is enough). Copy that folder link.',
    'Paste the link and the key above, press Check the folder, then Save.',
  ].forEach((line) => stepsBody.append(el('li', '', line)));
  const caution = el('p', 'note', 'The key is visible in the page, so the limits in step 4 matter. Do not leave it open to every website or every Google API. To try the folder on this computer before the site is published, you can also add http://localhost/* and http://127.0.0.1/* .');
  steps.append(summary, stepsBody, caution);
  inspector.append(steps);
  inspector.append(field('Seconds on each photo', numberInput(settings.interval, (value) => { settings.interval = Number(value); })));
  inspector.append(field('Movement between photos', selectInput(photoTransition(settings), PHOTO_TRANSITIONS, (value) => {
    settings.transition = value;
    settings.crossfade = value !== 'none';
  })));
  inspector.append(field('Order', selectInput(settings.order || 'in-order', [['in-order', 'In order'], ['shuffle', 'Shuffle']], (value) => { settings.order = value; })));
  inspector.append(field('Fit', selectInput(settings.fit, [['cover', 'Fill the box'], ['contain', 'Show the whole photo']], (value) => { settings.fit = value; })));
}

let editingClientId = false;

function googleSettings() {
  if (!state.google) state.google = { photosClientId: '' };
  return state.google;
}

function buildGooglePhotos(settings) {
  const box = el('div', 'gphotos');
  box.append(el('strong', '', 'Google Photos'));
  box.append(el('p', 'note', 'Pick pictures from Google Photos, including a whole album: open the album in the Google window and select its pictures. They are copied into this board, so the TV keeps showing them. To add new ones later, pick again.'));
  const message = el('p', 'note gphotos-status', '');
  const google = googleSettings();
  if (!google.photosClientId || editingClientId) {
    const id = document.createElement('input');
    id.type = 'text';
    id.value = google.photosClientId || '';
    id.placeholder = '1234-abc.apps.googleusercontent.com';
    id.spellcheck = false;
    id.autocomplete = 'off';
    const keep = actionButton('Use this client ID', () => {
      editingClientId = false;
      google.photosClientId = id.value.trim();
      markDirty();
      buildInspector();
    });
    box.append(field('Google client ID (one-time setup)', id), keep);
  } else {
    const run = actionButton(photosConnected() ? 'Choose photos from Google Photos' : 'Connect Google Photos', async () => {
      run.disabled = true;
      try {
        if (!photosConnected()) {
          message.textContent = 'Opening Google...';
          await connectPhotos(google.photosClientId);
          message.textContent = 'Connected. Press the button again to choose photos.';
          run.textContent = 'Choose photos from Google Photos';
          return;
        }
        message.textContent = 'Opening Google Photos...';
        const picked = await pickPhotos({ onStatus: (text) => { message.textContent = text; } });
        let added = 0;
        let failed = 0;
        for (const item of picked.items) {
          message.textContent = `Copying photo ${added + failed + 1} of ${picked.items.length}...`;
          try {
            const file = await downloadPhoto(item);
            const uploaded = await storeFile(file);
            if (!uploaded) {
              failed += 1;
              continue;
            }
            settings.images.push({ url: uploaded.url, name: file.name, from: 'google-photos' });
            added += 1;
          } catch {
            failed += 1;
          }
        }
        endPickSession(picked.sessionId);
        markDirty();
        refreshWidget(selectedId);
        const summary = `Added ${added} photo${added === 1 ? '' : 's'} from Google Photos.${failed ? ` ${failed} could not be copied.` : ''} Press Save for the TV.`;
        setStatus(summary, 'dirty');
        buildInspector();
      } catch (error) {
        message.textContent = error.message || 'Google Photos did not finish.';
      } finally {
        run.disabled = false;
      }
    });
    box.append(run);
    const change = actionButton('Change client ID', () => {
      editingClientId = true;
      buildInspector();
    });
    change.classList.add('btn-quiet');
    box.append(change);
  }
  box.append(message);
  const steps = document.createElement('details');
  steps.className = 'key-steps';
  steps.open = !google.photosClientId;
  const summary = document.createElement('summary');
  summary.textContent = 'One-time setup for Google Photos';
  const list = el('ol', 'note');
  [
    'Go to console.cloud.google.com and pick the same project as the Drive key, or create one.',
    'Search for "Google Photos Picker API" and turn it on.',
    'Open APIs and services, then OAuth consent screen. Choose External, fill in the app name, and add rabbi@akronshul.com (and other editors) as test users.',
    'Open Credentials, then Create credentials, then OAuth client ID. Choose Web application. Under Authorized JavaScript origins add https://akronrabbi.github.io . Create it.',
    'Copy the client ID (it ends in .apps.googleusercontent.com), paste it above, and Save the board.',
  ].forEach((line) => list.append(el('li', '', line)));
  steps.append(summary, list, el('p', 'note', 'A client ID is not a secret. Google only lets it work from the address you listed in step 4.'));
  box.append(steps);
  inspector.append(box);
}

function buildPdfForm(settings) {
  inspector.append(el('p', 'note', 'Upload a flyer. If it has several pages, the TV turns them on its own.'));
  inspector.append(fileButton(settings.assetId || settings.url ? 'Replace the PDF' : 'Upload a PDF', 'application/pdf', async (file) => {
    const previous = settings.assetId;
    const uploaded = await storeFile(file);
    if (!uploaded) return;
    settings.url = uploaded.url;
    settings.assetId = null;
    if (previous) await storage.deleteAsset(previous);
    markDirty();
    refreshWidget(selectedId);
    buildInspector();
  }));
  inspector.append(field('Seconds on each page', numberInput(settings.interval, (value) => { settings.interval = Number(value); })));
}

function buildScreenForm() {
  const current = screen();
  inspector.append(el('h2', 'side-title', 'This screen'));
  inspector.append(el('p', 'hint', 'This is the board the TV will show. Add pieces from the left. You can make more than one screen and cycle through them.'));
  const name = document.createElement('input');
  name.type = 'text';
  name.value = current.name || '';
  name.addEventListener('input', () => {
    current.name = name.value;
    markDirty();
    paintChrome();
  });
  inspector.append(field('Name', name));
  inspector.append(field('Seconds before the next screen', numberInput(current.duration, (value) => {
    current.duration = Math.max(5, Number(value) || 5);
  })));
  inspector.append(el('p', 'note', 'Cycling only happens when "Cycle through screens" is on, and only if you have more than one screen.'));
  inspector.append(field('Movement between screens', selectInput(tv().transition || 'fade', SCREEN_TRANSITIONS, (value) => { tv().transition = value; })));
  const ready = actionButton('Start from a ready layout', () => openMode('templates'));
  inspector.append(ready);
  buildShabbosModeForm();
}

function firstShabbosSettings() {
  for (const item of tv().screens) {
    const found = item.widgets.find((widget) => widget.type === 'shabbos');
    if (found) return found.settings;
  }
  return {};
}

function describeWindow(rest) {
  if (!rest) return '';
  const fmt = (date) => date.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit' });
  const what = rest.kind === 'yomtov' ? 'Yom Tov' : 'Shabbos';
  return rest.active
    ? `On now for ${what}, until ${fmt(rest.end)}.`
    : `Next: ${what}, from ${fmt(rest.start)} until ${fmt(rest.end)}.`;
}

// Optional. When it is on, the TV shows one chosen screen over Shabbos and Yom Tov.
function buildShabbosModeForm() {
  const board = tv();
  const modeSettings = board.shabbosMode;
  const box = el('div', 'mode-box');
  box.append(el('h2', 'side-title', 'Shabbos mode'));
  box.append(el('p', 'hint', 'Optional. When it is on, this TV switches to the screen you choose shortly before candle lighting, and back after havdalah. That screen is left out of the regular cycle.'));
  box.append(checkInput(modeSettings.enabled, 'Turn on Shabbos mode for this TV', (value) => {
    modeSettings.enabled = value;
    if (value && !modeSettings.screenId) {
      const guess = board.screens.find((item) => /shab/i.test(item.name || ''));
      if (guess) modeSettings.screenId = guess.id;
    }
    buildInspector();
  }));
  if (modeSettings.enabled) {
    const options = [['', 'Choose a screen'], ...board.screens.map((item, index) => [item.id, item.name || `Screen ${index + 1}`])];
    box.append(field('Screen to show', selectInput(modeSettings.screenId, options, (value) => {
      modeSettings.screenId = value;
      buildInspector();
    })));
    if (board.screens.length < 2) {
      box.append(el('p', 'warn', 'Add a second screen for Shabbos first (+ Screen above, then Ready layouts, Shabbos).'));
    }
    const row = el('div', 'date-row');
    row.append(field('Minutes before candle lighting', numberInput(modeSettings.before, (value) => { modeSettings.before = Math.max(0, Number(value) || 0); })));
    row.append(field('Minutes after havdalah', numberInput(modeSettings.after, (value) => { modeSettings.after = Math.max(0, Number(value) || 0); })));
    box.append(row);
    box.append(checkInput(modeSettings.yomTov, 'Also on Yom Tov', (value) => { modeSettings.yomTov = value; buildInspector(); }));
    if (!modeSettings.screenId) box.append(el('p', 'warn', 'Choose a screen, or Shabbos mode stays off.'));
    else {
      const rest = calendar.restWindow(new Date(), firstShabbosSettings(), modeSettings);
      box.append(el('p', 'note', describeWindow(rest)));
    }
  }
  inspector.append(box);
}

function openMode(next) {
  mode = next;
  selectedId = null;
  multi.clear();
  previewTakeover = false;
  document.body.classList.remove('menu-open');
  paintSelection();
  buildInspector();
}

// Everything that usually changes week to week, for this TV, in one place.
function buildWeekForm() {
  const board = tv();
  inspector.append(el('h2', 'side-title', 'This week'));
  inspector.append(el('p', 'hint', `The words and events on ${board.name || 'this TV'}, from every screen, in one list. Change them here, then Save. The layout stays as it is.`));
  let found = 0;
  board.screens.forEach((item, screenIndex) => {
    const pieces = item.widgets.filter((widget) => ['welcome', 'text', 'events'].includes(widget.type));
    if (!pieces.length) return;
    const section = el('section', 'week-section');
    section.append(el('h3', 'week-title', item.name || `Screen ${screenIndex + 1}`));
    pieces.forEach((widget) => {
      found += 1;
      const settings = widget.settings;
      const refresh = () => {
        if (findWidget(widget.id)) refreshWidget(widget.id);
      };
      const card = el('div', 'week-card');
      card.append(el('span', 'tool-label', specOf(widget.type).label));
      if (widget.type === 'welcome') {
        card.append(areaInput(settings.text, (value) => { settings.text = value; refresh(); }));
      }
      if (widget.type === 'text') {
        card.append(field('Small heading', textInput(settings.eyebrow, (value) => { settings.eyebrow = value; refresh(); })));
        card.append(field('Main line', textInput(settings.title, (value) => { settings.title = value; refresh(); })));
        card.append(field('Note', areaInput(settings.body, (value) => { settings.body = value; refresh(); })));
        card.append(dateRangeBlock(widget, () => { if (findWidget(widget.id)) renderCanvas(); }));
      }
      if (widget.type === 'events') buildEventsForm(settings, card, refresh);
      section.append(card);
    });
    inspector.append(section);
  });
  if (!found) {
    inspector.append(el('p', 'note', 'This TV has no welcome line, announcement, or events list yet. Add one from the pieces, or start from a ready layout.'));
  }
  const takeover = el('div', 'week-card');
  takeover.append(el('span', 'tool-label', 'Full-screen message'));
  takeover.append(el('p', 'note', board.takeover.enabled ? 'On for this TV.' : 'Off.'));
  takeover.append(actionButton('Open the full-screen message', () => openMode('takeover')));
  inspector.append(takeover);
}

function templatePreview(template) {
  const orientation = tv().orientation;
  const frame = el('div', `tpl-preview ${orientation}`);
  template.items.forEach((item) => {
    const p = item[orientation];
    const box = el('span', `tpl-box tpl-${item.type}`, specOf(item.type)?.label || '');
    box.style.left = `${p.x}%`;
    box.style.top = `${p.y}%`;
    box.style.width = `${p.w}%`;
    box.style.height = `${p.h}%`;
    frame.append(box);
  });
  return frame;
}

function buildTemplatesForm() {
  inspector.append(el('h2', 'side-title', 'Ready layouts'));
  inspector.append(el('p', 'hint', 'Professionally spaced starting points. Your words, events, and photos carry over where the layout has the same kind of piece. Afterwards, move or change anything. Undo puts the old one back.'));
  TEMPLATES.forEach((template) => {
    const card = el('div', 'tpl-card');
    card.append(templatePreview(template));
    card.append(el('strong', '', template.label));
    card.append(el('p', 'note', template.blurb));
    const row = el('div', 'tool-row');
    const use = () => {
      screen().widgets = applyTemplate(template, screen().widgets, defaultSettings, () => uid('w'));
      selectedId = null;
      markDirty();
      renderCanvas();
      setStatus(`Applied ${template.label}. Change anything you like, then Save.`, 'dirty');
    };
    row.append(screen().widgets.length
      ? tapTwice('Use on this screen', 'Tap again to replace this screen', use)
      : actionButton('Use on this screen', use));
    row.append(actionButton('As a new screen', () => {
      const created = {
        id: uid('s'),
        name: template.label,
        duration: 20,
        widgets: applyTemplate(template, [], defaultSettings, () => uid('w')),
      };
      tv().screens.push(created);
      tv().activeScreen = tv().screens.length - 1;
      selectedId = null;
      markDirty();
      paintChrome();
      renderCanvas();
      setStatus(`Added a ${template.label} screen. Change anything you like, then Save.`, 'dirty');
    }));
    card.append(row);
    inspector.append(card);
  });
}

// Which Text style sections are open, so a rebuild keeps the person where they were.
const openTypeParts = new Set();

function sliderRow(label, value, { min, max, step, unit = '', empty = 'Theme' }, apply) {
  const row = el('div', 'size-row');
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.setAttribute('aria-label', label);
  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(min);
  number.max = String(max);
  number.step = String(step);
  number.placeholder = empty;
  number.setAttribute('aria-label', `${label} value`);
  const has = value !== '' && value != null && Number.isFinite(Number(value));
  number.value = has ? String(value) : '';
  range.value = has ? String(value) : String(min + (max - min) / 2);
  range.classList.toggle('unset', !has);
  const set = (raw) => {
    if (raw === '' || raw == null) {
      number.value = '';
      range.classList.add('unset');
      apply('');
      return;
    }
    const next = Math.min(max, Math.max(min, Number(raw)));
    if (!Number.isFinite(next)) return;
    range.value = String(next);
    range.classList.remove('unset');
    if (document.activeElement !== number) number.value = String(next);
    apply(next);
  };
  range.addEventListener('input', () => {
    number.value = range.value;
    set(range.value);
  });
  number.addEventListener('input', () => set(number.value));
  const reset = el('button', 'btn btn-quiet mini', 'Reset');
  reset.type = 'button';
  reset.addEventListener('click', () => set(''));
  row.append(range, number);
  if (unit) row.append(el('span', '', unit));
  row.append(reset);
  return field(label, row);
}

function appendTypePanel(target, parts, refresh, fits = true) {
  const box = el('div', 'type-panel');
  box.append(el('h2', 'side-title', 'Text style'));
  const change = (partId, patch) => {
    setPart(target, partId, patch);
    markDirty();
    refresh();
  };
  if (fits) {
    const fit = target.type?.fit === 'fixed' ? 'fixed' : 'auto';
    box.append(el('p', 'hint', fit === 'fixed'
      ? 'Exact size: 100% is the size that fills the box. Each Text size below is used as set, so 150% is half again as big, even if it runs past the box.'
      : 'Fill the box: the words grow or shrink to fill the box. Text size sets how big each part is next to the others.'));
    const fitRow = el('div', 'ground-row');
    [['auto', 'Fill the box'], ['fixed', 'Exact size']].forEach(([value, label]) => {
      const button = el('button', value === fit ? 'on' : '', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        setFit(target, value);
        markDirty();
        refresh();
        buildInspector();
      });
      fitRow.append(button);
    });
    box.append(fitRow);
  } else {
    box.append(el('p', 'hint', 'These sizes follow the size of the box. Make the box bigger or smaller, or use Text size to adjust one part.'));
  }
  parts.forEach((part) => {
    const details = document.createElement('details');
    details.className = 'type-part';
    const key = `${part.id}`;
    details.open = openTypeParts.has(key) || (Boolean(part.open) && !openTypeParts.has(`closed:${key}`));
    details.addEventListener('toggle', () => {
      if (details.open) {
        openTypeParts.add(key);
        openTypeParts.delete(`closed:${key}`);
      } else {
        openTypeParts.delete(key);
        openTypeParts.add(`closed:${key}`);
      }
    });
    const summary = document.createElement('summary');
    summary.textContent = part.label;
    details.append(summary);
    const style = target.type?.parts?.[part.id] || {};
    const used = extraFontsUsed(tv(), { target, partId: part.id });
    const full = used.size >= MAX_EXTRA_FONTS;
    const fonts = TEXT_FONTS.map((item) => [
      item.id,
      item.id !== 'theme' && full && !used.has(item.id) ? `${item.label} - limit reached` : item.label,
      item.id !== 'theme' && full && !used.has(item.id),
    ]);
    details.append(field('Font', selectInput(canonicalFont(style.font) || 'theme', fonts, (value) => {
      change(part.id, { font: value === 'theme' ? '' : value });
      buildInspector();
    })));
    if (full) details.append(el('p', 'note', `This TV already uses ${MAX_EXTRA_FONTS} fonts beyond its theme. To keep the board clean, choose one of those, or put a piece back to Theme default.`));
    details.append(sliderRow('Text size', Number(style.size) || 100, { min: 40, max: 250, step: 5, unit: '%', empty: '100' }, (value) => {
      change(part.id, { size: value === '' ? '' : value });
    }));
    details.append(field('Weight', selectInput(String(style.weight || ''), [['', 'Theme default'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['650', 'Semibold'], ['800', 'Bold']], (value) => {
      change(part.id, { weight: value });
    })));
    details.append(checkInput(Boolean(style.italic), 'Italic', (value) => change(part.id, { italic: value })));
    const colorRow = el('div', 'color-row');
    const color = document.createElement('input');
    color.type = 'color';
    color.value = style.color || '#241c16';
    color.setAttribute('aria-label', `${part.label} color`);
    color.addEventListener('input', () => change(part.id, { color: color.value }));
    colorRow.append(color);
    const clear = el('button', 'btn', 'Theme color');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      change(part.id, { color: '' });
      buildInspector();
    });
    colorRow.append(clear);
    details.append(field('Text color', colorRow));
    const alignRow = el('div', 'ground-row');
    [['', 'Theme'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']].forEach(([value, label]) => {
      const button = el('button', (style.align || '') === value ? 'on' : '', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        change(part.id, { align: value });
        buildInspector();
      });
      alignRow.append(button);
    });
    details.append(field('Alignment', alignRow));
    details.append(sliderRow('Line spacing', style.line, { min: 0.8, max: 2.5, step: 0.05, unit: 'x' }, (value) => change(part.id, { line: value })));
    if (part.para) {
      details.append(sliderRow('Space between paragraphs', style.para, { min: 0, max: 2, step: 0.05, unit: 'em' }, (value) => change(part.id, { para: value })));
    }
    details.append(sliderRow('Letter spacing', style.track, { min: -0.05, max: 0.4, step: 0.01, unit: 'em' }, (value) => change(part.id, { track: value })));
    details.append(field('Case', selectInput(style.case || '', [['', 'Normal'], ['upper', 'Uppercase']], (value) => change(part.id, { case: value }))));
    box.append(details);
  });
  const reset = el('button', 'btn', 'Reset all text to the theme');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    delete target.type;
    markDirty();
    refresh();
    buildInspector();
  });
  box.append(reset);
  inspector.append(box);
}

function buildTakeoverForm() {
  const takeover = tv().takeover;
  inspector.append(el('h2', 'side-title', 'Full-screen message'));
  inspector.append(el('p', 'hint', 'This covers only the TV you are editing. The sample wording is only an example. Change it before you turn it on.'));
  const enabled = checkInput(takeover.enabled, 'Show this message on this TV', (value) => { takeover.enabled = value; });
  inspector.append(enabled);
  inspector.append(field('Small line', textInput(takeover.eyebrow, (value) => { takeover.eyebrow = value; if (previewTakeover) renderCanvas(); })));
  inspector.append(field('Main message', areaInput(takeover.title, (value) => { takeover.title = value; if (previewTakeover) renderCanvas(); })));
  inspector.append(field('Second line', textInput(takeover.subtitle, (value) => { takeover.subtitle = value; if (previewTakeover) renderCanvas(); })));
  inspector.append(field('Details', textInput(takeover.details, (value) => { takeover.details = value; if (previewTakeover) renderCanvas(); })));
  inspector.append(field('Footer', textInput(takeover.footer, (value) => { takeover.footer = value; if (previewTakeover) renderCanvas(); })));
  const templates = el('div', 'templates');
  [['classic', 'Navy and gold'], ['burgundy', 'Burgundy'], ['photo', 'Photograph']].forEach(([value, label]) => {
    const button = el('button', value === takeover.template ? 'on' : '', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      takeover.template = value;
      markDirty();
      buildInspector();
      if (previewTakeover) renderCanvas();
    });
    templates.append(button);
  });
  inspector.append(field('Look', templates));
  inspector.append(fileButton('Upload a background photo', 'image/*', async (file) => {
    const uploaded = await storeFile(file);
    if (!uploaded) return;
    takeover.backgroundUrl = uploaded.url;
    takeover.backgroundAssetId = null;
    markDirty();
    if (previewTakeover) renderCanvas();
  }));
  inspector.append(checkInput(takeover.scheduleEnabled, 'Only between a start and an end', (value) => { takeover.scheduleEnabled = value; }));
  const start = document.createElement('input');
  start.type = 'datetime-local';
  start.value = takeover.start || '';
  start.addEventListener('change', () => { takeover.start = start.value; markDirty(); });
  const end = document.createElement('input');
  end.type = 'datetime-local';
  end.value = takeover.end || '';
  end.addEventListener('change', () => { takeover.end = end.value; markDirty(); });
  inspector.append(field('Start (Akron time)', start));
  inspector.append(field('End (Akron time)', end));
  const preview = actionButton(previewTakeover ? 'Back to the layout' : 'Preview this message here', () => {
    previewTakeover = !previewTakeover;
    renderCanvas();
    buildInspector();
  });
  inspector.append(preview);
  inspector.append(el('p', 'note', 'Preview stays on this page. The TV changes only after you turn the message on and press Save.'));
  appendTypePanel(takeover, TYPE_PARTS.takeover, () => { if (previewTakeover) renderCanvas(); }, true);
}

function reorder(id, direction) {
  const widgets = screen().widgets;
  const index = widgets.findIndex((widget) => widget.id === id);
  const next = index + direction;
  if (next < 0 || next >= widgets.length) return;
  const [widget] = widgets.splice(index, 1);
  widgets.splice(next, 0, widget);
  markDirty();
  renderCanvas();
}

async function removeWidget(id) {
  const before = collectAssetIds(state);
  const widgets = screen().widgets;
  const index = widgets.findIndex((widget) => widget.id === id);
  if (index < 0) return;
  widgets.splice(index, 1);
  selectedId = null;
  mode = 'screen';
  const still = new Set(collectAssetIds(state));
  for (const assetId of before) {
    if (!still.has(assetId)) await storage.deleteAsset(assetId);
  }
  markDirty();
  renderCanvas();
  buildInspector();
}

function selectTv(index) {
  if (index === state.activeTv) return;
  state.activeTv = index;
  selectedId = null;
  previewTakeover = false;
  mode = 'screen';
  markDirty();
  paintChrome();
  renderCanvas();
  buildInspector();
}

function addTv() {
  const name = `TV ${state.tvs.length + 1}`;
  state.tvs.push(blankTv(name, uniqueId(state.tvs, slugify(name))));
  state.activeTv = state.tvs.length - 1;
  selectedId = null;
  previewTakeover = false;
  mode = 'screen';
  markDirty();
  paintChrome();
  renderCanvas();
  buildInspector();
}

function deleteTv() {
  if (state.tvs.length < 2) return;
  const current = tv();
  const label = `TV ${state.activeTv + 1} - ${current.name || 'Untitled'}`;
  const button = document.getElementById('delete-tv');
  if (button.dataset.armed !== '1') {
    button.dataset.armed = '1';
    button.textContent = `Tap again to remove ${label}`;
    setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = 'Remove this TV';
    }, 5000);
    return;
  }
  delete button.dataset.armed;
  button.textContent = 'Remove this TV';
  state.tvs.splice(state.activeTv, 1);
  state.activeTv = Math.max(0, state.activeTv - 1);
  selectedId = null;
  previewTakeover = false;
  mode = 'screen';
  markDirty();
  paintChrome();
  renderCanvas();
  buildInspector();
}

function placeSource() {
  const block = document.getElementById('source-block');
  if (!block) return;
  if (isPhone()) document.getElementById('top-actions').append(block);
  else document.getElementById('palette').append(block);
}

function currentTvUrl() {
  return new URL(tvPageUrl(tv()), location.href).href;
}

function paintTvBar() {
  const select = document.getElementById('tv-select');
  if (select) {
    select.replaceChildren();
    state.tvs.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `TV ${index + 1} - ${item.name || 'Untitled'}`;
      select.append(option);
    });
    const extra = document.createElement('option');
    extra.value = 'add';
    extra.textContent = '+ Add TV';
    select.append(extra);
    select.value = String(state.activeTv);
  }
  const host = document.getElementById('tv-tabs');
  host.replaceChildren();
  state.tvs.forEach((item, index) => {
    const button = el('button', `tv-tab${index === state.activeTv ? ' on' : ''}`, `TV ${index + 1} - ${item.name || 'Untitled'}`);
    button.type = 'button';
    button.addEventListener('click', () => selectTv(index));
    host.append(button);
  });
  const add = el('button', 'tv-tab add', '+ Add TV');
  add.type = 'button';
  add.addEventListener('click', addTv);
  host.append(add);
  const name = document.getElementById('tv-name');
  if (document.activeElement !== name) name.value = tv().name || '';
  const url = currentTvUrl();
  const link = document.getElementById('tv-url');
  link.textContent = url;
  link.title = url;
  document.getElementById('delete-tv').disabled = state.tvs.length < 2;
  paintTvStatus();
}

function ago(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function paintTvStatus() {
  const pill = document.getElementById('tv-status');
  if (!pill) return;
  if (!tvStatus.ok) {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  const row = tvStatus.rows.find((item) => item.tv_id === tv().id);
  if (!row) {
    pill.dataset.state = 'unknown';
    pill.textContent = 'Not seen yet';
    pill.title = 'This TV has not checked in since the status check was set up. Open its address on the TV computer.';
    return;
  }
  const age = Date.now() - new Date(row.last_seen).getTime();
  const online = age < 3 * 60000;
  pill.dataset.state = online ? 'online' : 'offline';
  pill.textContent = online ? `Online, seen ${ago(age)}` : `Offline, last seen ${ago(age)}`;
  pill.title = row.info?.screen ? `Showing: ${row.info.screen}` : '';
}

async function refreshTvStatus() {
  try {
    const auth = await storage.withToken();
    if (!auth.ok) {
      tvStatus = { ok: false, rows: [] };
    } else {
      tvStatus = await readTvStatus(auth.token);
    }
  } catch {
    tvStatus = { ok: false, rows: [] };
  }
  paintTvStatus();
}

function paintChrome() {
  paintTvBar();
  document.getElementById('orient-land').classList.toggle('on', tv().orientation === 'landscape');
  document.getElementById('orient-port').classList.toggle('on', tv().orientation === 'portrait');
  document.getElementById('cycle').checked = Boolean(tv().cycleScreens);
  const rotate = document.getElementById('tv-rotate');
  if (rotate && document.activeElement !== rotate) rotate.value = String(tv().rotation || 0);
  tabs.replaceChildren();
  tv().screens.forEach((item, index) => {
    const button = el('button', `tab${index === tv().activeScreen ? ' on' : ''}`, item.name || `Screen ${index + 1}`);
    button.type = 'button';
    button.addEventListener('click', () => {
      tv().activeScreen = index;
      selectedId = null;
      mode = 'screen';
      previewTakeover = false;
      markDirty();
      paintChrome();
      renderCanvas();
      buildInspector();
    });
    tabs.append(button);
  });
  const add = el('button', 'tab', '+ Screen');
  add.type = 'button';
  add.addEventListener('click', () => {
    tv().screens.push({ id: uid('s'), name: `Screen ${tv().screens.length + 1}`, duration: 20, widgets: [] });
    tv().activeScreen = tv().screens.length - 1;
    selectedId = null;
    mode = 'screen';
    previewTakeover = false;
    markDirty();
    paintChrome();
    renderCanvas();
    buildInspector();
  });
  tabs.append(add);
  if (tv().screens.length > 1) {
    const remove = el('button', 'tab', 'Remove screen');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (tv().screens.length < 2) return;
      tv().screens.splice(tv().activeScreen, 1);
      tv().activeScreen = Math.max(0, tv().activeScreen - 1);
      selectedId = null;
      markDirty();
      paintChrome();
      renderCanvas();
      buildInspector();
    });
    tabs.append(remove);
  }
}

function paintPalette() {
  palette.replaceChildren();
  palette.append(el('h2', 'side-title', 'Add a piece'));
  palette.append(el('p', 'hint', 'Drag it onto the screen, or click it to add it.'));
  WIDGET_TYPES.forEach((item) => {
    const button = el('button', 'piece');
    button.type = 'button';
    button.append(el('strong', '', item.label), el('span', '', item.blurb));
    button.addEventListener('pointerdown', (event) => {
      if (isPhone()) return;
      startPaletteDrag(item.type, event);
    });
    button.addEventListener('click', () => {
      if (!isPhone()) return;
      previewTakeover = false;
      document.body.classList.remove('menu-open');
      addWidget(item.type, stackedPlace(item.type, tv().orientation));
    });
    palette.append(button);
  });
  const block = el('div', 'side-block');
  const takeover = el('button', 'btn', 'Full-screen message');
  takeover.type = 'button';
  takeover.addEventListener('click', () => {
    mode = 'takeover';
    selectedId = null;
    buildInspector();
  });
  const themeButton = el('button', 'btn mobile-only', 'Theme');
  themeButton.type = 'button';
  themeButton.addEventListener('click', () => {
    mode = 'theme';
    selectedId = null;
    previewTakeover = false;
    document.body.classList.remove('menu-open');
    buildInspector();
  });
  block.append(themeButton);
  block.append(takeover);
  if (tv().takeover.enabled) block.append(el('p', 'note', 'The full-screen message is on for this TV. It shows after you save.'));
  palette.append(block);

  const themeBlock = el('div', 'side-block');
  themeBlock.id = 'theme-block';
  palette.append(themeBlock);
  paintThemeBlock();

  const sourceBlock = el('div', 'side-block');
  sourceBlock.id = 'source-block';
  sourceBlock.append(el('h2', 'side-title', 'Where the TV looks'));
  const current = storage.getSource();
  [['auto', 'The online board, then this computer if the network is down'], ['local', 'Only this computer'], ['published', 'Only the published file']].forEach(([value, label]) => {
    const labelNode = el('label', 'choice');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'source';
    input.value = value;
    input.checked = current === value;
    input.addEventListener('change', () => {
      if (input.checked) storage.setSource(value);
    });
    labelNode.append(input, document.createTextNode(label));
    sourceBlock.append(labelNode);
  });
  palette.append(sourceBlock);
}

function startPaletteDrag(type, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  const ghost = el('div', 'drag-ghost', specOf(type).label);
  ghost.style.left = `${startX}px`;
  ghost.style.top = `${startY}px`;
  document.body.append(ghost);
  const move = (ev) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) moved = true;
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
  };
  const up = (ev) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove();
    previewTakeover = false;
    if (pointInCanvas(ev)) addWidget(type, dropPlace(type, ev.clientX, ev.clientY));
    else if (!moved) addWidget(type, stackedPlace(type, tv().orientation));
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

async function storeFile(file) {
  try {
    return await storage.upload(file);
  } catch (error) {
    status.textContent = error.message || 'The file could not be uploaded.';
    return null;
  }
}

async function save() {
  state = normalize(state);
  setStatus('Saving online...', 'busy');
  try {
    const result = await storage.saveOnline(state);
    if (result.ok) {
      savedJson = JSON.stringify(state);
      hasLocal = true;
      setStatus('Saved. The TV updates within a minute.', 'saved');
      return;
    }
    status.dataset.state = 'error';
    if (result.reason === 'signed-out') {
      status.textContent = 'Sign in to save online.';
      return;
    }
    if (result.reason === 'error') {
      status.textContent = result.message || 'Could not save online.';
      return;
    }
    const user = await currentUser();
    status.textContent = user?.email
      ? `Signed in as ${user.email}. That address is not an editor. An editor address is rabbi@akronshul.com.`
      : 'That sign-in is not an editor. An editor address is rabbi@akronshul.com.';
  } catch (error) {
    const raw = error?.message || '';
    status.dataset.state = 'error';
    status.textContent = /load failed|failed to fetch|network/i.test(raw)
      ? 'Could not reach the online board. Nothing was changed.'
      : (raw || 'Could not save online.');
  }
}

async function exportFile() {
  const documentConfig = await storage.exportDocument(state);
  const blob = new Blob([JSON.stringify(documentConfig, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'akron-shul-display.json';
  link.click();
  URL.revokeObjectURL(url);
}

function bindChrome() {
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('open-tv').addEventListener('click', () => {
    window.open(tvPageUrl(tv()), `shul-${tv().id}`);
  });
  document.getElementById('copy-link').addEventListener('click', async () => {
    const url = currentTvUrl();
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied.';
    } catch {
      status.textContent = url;
    }
  });
  document.getElementById('delete-tv').addEventListener('click', deleteTv);
  document.getElementById('tv-name').addEventListener('input', (event) => {
    tv().name = event.target.value;
    markDirty();
    paintTvBar();
  });
  document.getElementById('export').addEventListener('click', exportFile);
  document.getElementById('import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    const config = await storage.importDocument(parsed);
    state = normalize(config);
    savedJson = JSON.stringify(state);
    hasLocal = true;
    selectedId = null;
    previewTakeover = false;
    paintChrome();
    renderCanvas();
    buildInspector();
    await save();
  });
  document.getElementById('orient-land').addEventListener('click', () => {
    tv().orientation = 'landscape';
    previewTakeover = false;
    markDirty();
    paintChrome();
    renderCanvas();
  });
  document.getElementById('orient-port').addEventListener('click', () => {
    tv().orientation = 'portrait';
    previewTakeover = false;
    markDirty();
    paintChrome();
    renderCanvas();
  });
  document.getElementById('cycle').addEventListener('change', (event) => {
    tv().cycleScreens = event.target.checked;
    markDirty();
  });
  document.getElementById('tv-rotate').addEventListener('change', (event) => {
    tv().rotation = Number(event.target.value) || 0;
    markDirty();
    paintTvBar();
  });
  document.getElementById('week').addEventListener('click', () => openMode('week'));
  document.getElementById('templates').addEventListener('click', () => openMode('templates'));
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.getElementById('layouts').addEventListener('click', () => openArchive('layouts'));
  document.getElementById('save-as-layout').addEventListener('click', () => {
    pendingLayoutFocus = true;
    openArchive('layouts');
  });
  document.getElementById('history').addEventListener('click', () => openArchive('history'));
  document.getElementById('reload-published').addEventListener('click', async () => {
    const published = await storage.loadPublished();
    if (!published) {
      status.textContent = 'The published file could not be read.';
      return;
    }
    state = normalize(published);
    selectedId = null;
    previewTakeover = false;
    markDirty();
    paintChrome();
    renderCanvas();
    buildInspector();
    status.textContent = 'Loaded the published file. Save if the TV should use it.';
  });
  window.addEventListener('resize', () => {
    fitCanvas();
    placeSource();
    syncSheet();
  });
  document.getElementById('top-actions').addEventListener('click', (event) => {
    if (event.target.closest('button')) {
      document.body.classList.remove('menu-open');
      document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
    }
  });
  document.getElementById('menu-toggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('pointerdown', (event) => {
    if (!document.body.classList.contains('menu-open')) return;
    if (event.target.closest('#top-actions') || event.target.closest('#menu-toggle')) return;
    document.body.classList.remove('menu-open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
  });
  document.getElementById('tv-select').addEventListener('change', (event) => {
    if (event.target.value === 'add') addTv();
    else selectTv(Number(event.target.value));
  });
  document.getElementById('screen-settings').addEventListener('click', () => {
    selectedId = null;
    mode = 'screen';
    previewTakeover = false;
    document.body.dataset.sheet = 'screen';
    canvas.querySelectorAll('.widget').forEach((node) => node.classList.remove('selected'));
    buildInspector();
  });
  const closeSheet = () => {
    delete document.body.dataset.sheet;
    selectedId = null;
    mode = 'screen';
    previewTakeover = false;
    canvas.querySelectorAll('.widget').forEach((node) => node.classList.remove('selected'));
    buildInspector();
  };
  document.getElementById('sheet-done').addEventListener('click', closeSheet);
  document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const cmd = event.metaKey || event.ctrlKey;
    if (cmd && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (cmd && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (cmd && event.key.toLowerCase() === 'd' && selectedId) {
      event.preventDefault();
      duplicateWidget(selectedId);
      return;
    }
    if (event.key === 'Escape' && (selectedId || multi.size)) {
      multi.clear();
      selectedId = null;
      mode = 'screen';
      paintSelection();
      buildInspector();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      event.preventDefault();
      if (findWidget(selectedId)?.locked) {
        setStatus('That piece is locked. Unlock it first.');
        return;
      }
      removeWidget(selectedId);
    }
    if (selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const widget = findWidget(selectedId);
      if (!widget || widget.locked) return;
      const place = widget.place[tv().orientation];
      const step = event.shiftKey ? 5 : 0.5;
      if (event.key === 'ArrowLeft') place.x -= step;
      if (event.key === 'ArrowRight') place.x += step;
      if (event.key === 'ArrowUp') place.y -= step;
      if (event.key === 'ArrowDown') place.y += step;
      widget.place[tv().orientation] = snapPlace(place);
      const shell = canvas.querySelector(`[data-id="${selectedId}"]`);
      if (shell) applyPlace(shell, widget.place[tv().orientation]);
      markDirty();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.target !== canvas) return;
    selectedId = null;
    multi.clear();
    mode = 'screen';
    paintSelection();
    buildInspector();
  });
}

async function refreshAuth() {
  const box = document.getElementById('signin');
  const who = document.getElementById('who');
  const email = document.getElementById('who-email');
  const message = document.getElementById('auth-message');
  if (!(await authReady())) {
    message.textContent = 'Sign-in could not be loaded. Check the connection and reload.';
  }
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (user?.email) {
    box.hidden = true;
    who.hidden = false;
    email.textContent = user.email;
  } else {
    box.hidden = false;
    who.hidden = true;
    email.textContent = '';
  }
}

function wireAuth() {
  const message = document.getElementById('auth-message');
  document.getElementById('google-sign-in').addEventListener('click', async () => {
    message.textContent = 'Opening Google...';
    try { await signInWithGoogle(); }
    catch (error) { message.textContent = error.message || 'Google sign-in did not start.'; }
  });
  document.getElementById('email-start').addEventListener('click', () => {
    document.getElementById('email-code').hidden = false;
  });
  document.getElementById('email-send').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    message.textContent = 'Sending a code...';
    try {
      await sendEmailCode(email);
      document.getElementById('code-row').hidden = false;
      message.textContent = 'Check your email for the code, then enter it here.';
    } catch (error) {
      message.textContent = error.message || 'The code could not be sent.';
    }
  });
  document.getElementById('email-verify').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const otp = document.getElementById('auth-code').value.trim();
    message.textContent = 'Checking the code...';
    try {
      await signInWithCode(email, otp);
      message.textContent = '';
      await refreshAuth();
      refreshTvStatus();
    } catch (error) {
      message.textContent = error.message || 'That code did not work.';
    }
  });
  document.getElementById('sign-out').addEventListener('click', async () => {
    try { await signOut(); } catch { /* still hide the name */ }
    await refreshAuth();
    status.textContent = 'Signed out.';
  });
}

function archiveNote(result, fallback) {
  if (result?.reason === 'signed-out') return 'Sign in to use saved layouts.';
  if (result?.reason === 'not-editor') return 'That sign-in is not an editor.';
  if (result?.reason === 'locked') return 'That layout is locked. Unlock it first.';
  return result?.message || fallback;
}

function stamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function freshWidgets(widgets) {
  return structuredClone(widgets || []).map((widget) => ({ ...widget, id: uid('w') }));
}

// What to take from a saved layout, and where to put it. A saved layout holds
// every TV and all their screens, so the person picks one screen (or one TV)
// from it and puts it on the screen or TV open in the editor.
function layoutUsePanel(layoutName, saved, say) {
  const panel = el('div', 'use-panel');
  const sources = [];
  saved.tvs.forEach((item, tvIndex) => {
    item.screens.forEach((scr, screenIndex) => {
      sources.push({ tvIndex, screenIndex, label: `${item.name || `TV ${tvIndex + 1}`}: ${scr.name || `Screen ${screenIndex + 1}`} (${scr.widgets.length} piece${scr.widgets.length === 1 ? '' : 's'})` });
    });
  });
  const pick = document.createElement('select');
  sources.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = item.label;
    pick.append(option);
  });
  // Start on the screen that was open in the editor when the layout was saved.
  const fromTv = Math.min(saved.tvs.length - 1, Math.max(0, Number(saved.activeTv) || 0));
  const fromScreen = Math.max(0, Number(saved.tvs[fromTv]?.activeScreen) || 0);
  const preferred = sources.findIndex((item) => item.tvIndex === fromTv && item.screenIndex === fromScreen);
  pick.value = String(Math.max(0, preferred));
  if (sources.length > 1) panel.append(field('Take this screen from the layout', pick));
  const chosen = () => sources[Number(pick.value) || 0];
  const sourceTv = () => saved.tvs[chosen().tvIndex];
  const sourceScreen = () => sourceTv().screens[chosen().screenIndex];
  const here = `"${screen().name || 'this screen'}" on ${tv().name || 'this TV'}`;
  const done = (text) => {
    selectedId = null;
    multi.clear();
    markDirty();
    paintChrome();
    renderCanvas();
    setStatus(`${text} Press Save to send it to the TV.`, 'dirty');
    say('Done. Press Save (top right) to send it to the TV. Undo takes it back.', 'busy');
  };

  const row = el('div', 'tool-row');
  const replaceScreen = () => {
    screen().widgets = freshWidgets(sourceScreen().widgets);
    done(`Put "${layoutName}" on ${here}.`);
  };
  row.append(screen().widgets.length
    ? tapTwice('Replace this screen', `Tap again: replace ${screen().name || 'this screen'}`, replaceScreen)
    : actionButton('Put on this screen', replaceScreen));
  row.append(actionButton('Add as a new screen', () => {
    const from = sourceScreen();
    tv().screens.push({
      id: uid('s'),
      name: from.name && from.name !== 'Main' ? from.name : layoutName.slice(0, 40),
      duration: from.duration || 20,
      widgets: freshWidgets(from.widgets),
    });
    tv().activeScreen = tv().screens.length - 1;
    done(`Added "${layoutName}" as a new screen on ${tv().name || 'this TV'}.`);
  }));
  row.append(tapTwice('Replace this whole TV', `Tap again: replace all of ${tv().name || 'this TV'}`, () => {
    const from = structuredClone(sourceTv());
    const current = tv();
    // Keep this TV's own name, address, and rotation. Take everything else.
    Object.assign(current, from, { id: current.id, name: current.name, rotation: current.rotation, activeScreen: 0 });
    done(`${current.name || 'This TV'} now matches "${from.name || 'the saved TV'}" from "${layoutName}".`);
  }));
  panel.append(row);
  panel.append(el('p', 'note', 'These change the editor first, so you can look before the TV does. Replace this whole TV copies every screen and the theme of the TV chosen above.'));

  const all = tapTwice('Put on every TV now', 'Tap again: replace every TV and save', async () => {
    if (await keepOnline(saved)) setStatus(`"${layoutName}" is now on every TV. The board it replaced is in History.`, 'saved');
  });
  all.classList.add('btn-quiet');
  panel.append(all);
  if (sources.length < 2) pick.hidden = true;
  return panel;
}

async function keepOnline(next) {
  state = normalize(next);
  const result = await storage.saveOnline(state);
  if (!result.ok) {
    setStatus(archiveNote(result, 'Could not save online.'), 'error');
    return false;
  }
  savedJson = JSON.stringify(state);
  hasLocal = true;
  seedUndo();
  paintChrome();
  renderCanvas();
  buildInspector();
  status.textContent = 'Saved online.';
  return true;
}

function openArchive(kind) {
  mode = kind;
  selectedId = null;
  previewTakeover = false;
  document.body.classList.remove('menu-open');
  buildInspector();
}

function nameForm(placeholder, value, buttonLabel, onSubmit) {
  const form = el('form', 'name-form');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.placeholder = placeholder;
  input.value = value || '';
  input.setAttribute('aria-label', placeholder);
  const go = el('button', 'btn btn-primary', buttonLabel);
  go.type = 'submit';
  form.append(input, go);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    go.disabled = true;
    try {
      await onSubmit(name);
    } finally {
      go.disabled = false;
    }
  });
  return { form, input };
}

function panelMessage(host) {
  const line = el('p', 'panel-message', '');
  host.append(line);
  return (text, kind = '') => {
    line.textContent = text;
    line.dataset.kind = kind;
  };
}

async function buildLayouts() {
  inspector.replaceChildren(el('h2', 'side-title', 'Saved layouts'));
  syncSheet();
  inspector.append(el('p', 'hint', 'Save (top right) updates the TVs. A saved layout is a named copy of every TV that you can come back to, such as Regular week or Shabbos. History keeps the last 30 boards that a Save replaced.'));
  const { form, input } = nameForm('Layout name, e.g. Shabbos', '', 'Save as layout', async (name) => {
    say('Saving the layout...', 'busy');
    const result = await storage.writeLayout({
      id: layoutId(),
      name: name.slice(0, 80),
      config: normalize(state),
      locked: false,
    });
    if (result.ok) {
      setStatus(`Saved the layout "${name}".`, 'saved');
      buildLayouts();
    } else {
      say(archiveNote(result, 'Could not save that layout.'), 'error');
    }
  });
  inspector.append(form);
  const say = panelMessage(inspector);
  if (pendingLayoutFocus) {
    pendingLayoutFocus = false;
    setTimeout(() => input.focus(), 50);
  }
  inspector.append(el('h3', 'week-title', 'Your layouts'));
  const listed = await storage.listLayouts();
  if (mode !== 'layouts') return;
  if (!listed.ok) {
    say(archiveNote(listed, 'Could not load layouts.'), 'error');
    syncSheet();
    return;
  }
  if (!listed.rows.length) inspector.append(el('p', 'note', 'No saved layouts yet. Type a name above and press Save as layout.'));
  listed.rows.forEach((row) => {
    const card = el('div', 'archive-card');
    card.append(el('strong', '', row.name));
    card.append(el('p', 'note', `${stamp(row.updated_at)}${row.updated_by ? `  -  ${row.updated_by}` : ''}${row.locked ? '  -  Locked' : ''}`));
    const rowSay = panelMessage(card);
    const open = async () => {
      const full = await storage.readLayout(row.id);
      if (!full.ok || !full.rows[0]) {
        rowSay(archiveNote(full, 'Could not open that layout.'), 'error');
        return null;
      }
      return full.rows[0].config;
    };
    const rowActions = el('div', 'row-actions');
    const use = actionButton('Use this layout...', async () => {
      use.disabled = true;
      const config = await open();
      use.disabled = false;
      if (!config) return;
      const panel = layoutUsePanel(row.name, normalize(config), rowSay);
      card.querySelector('.use-panel')?.remove();
      card.insertBefore(panel, rowActions);
      use.hidden = true;
    });
    use.classList.add('btn-primary');
    rowActions.append(use);
    rowActions.append(actionButton('Rename', () => {
      if (row.locked) {
        rowSay('That layout is locked. Unlock it first.', 'error');
        return;
      }
      const rename = nameForm('New name', row.name, 'Rename', async (name) => {
        const result = await storage.patchLayout(row.id, { name: name.slice(0, 80) });
        if (result.ok) buildLayouts();
        else rowSay(archiveNote(result, 'Could not rename that layout.'), 'error');
      });
      rowActions.replaceWith(rename.form);
      rename.input.focus();
      rename.input.select();
    }));
    rowActions.append(actionButton(row.locked ? 'Unlock' : 'Lock', async () => {
      const result = await storage.patchLayout(row.id, { locked: !row.locked });
      if (result.ok) buildLayouts();
      else rowSay(archiveNote(result, 'Could not change the lock.'), 'error');
    }));
    if (!row.locked) {
      const remove = tapTwice('Delete', 'Tap again to delete it', async () => {
        const result = await storage.removeLayout(row.id);
        if (result.ok) buildLayouts();
        else rowSay(archiveNote(result, 'Could not delete that layout.'), 'error');
      });
      remove.classList.add('btn-danger');
      rowActions.append(remove);
    }
    card.append(rowActions);
    inspector.append(card);
  });
  syncSheet();
}

let pendingLayoutFocus = false;

function layoutId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function buildHistory() {
  inspector.replaceChildren(el('h2', 'side-title', 'History'));
  syncSheet();
  inspector.append(el('p', 'hint', 'Each Save keeps the board it replaced. The last 30 are here. Restoring keeps the current board in this list, so you can undo it.'));
  const say = panelMessage(inspector);
  const now = el('div', 'archive-card current');
  let savedAt = '';
  try { savedAt = localStorage.getItem('shul-display-updated-at') || ''; } catch { savedAt = ''; }
  now.append(el('strong', '', 'On the TVs now'));
  now.append(el('p', 'note', `${savedAt ? `Saved ${stamp(savedAt)}. ` : ''}${dirty() ? 'You have changes that are not saved yet.' : 'This is what the editor shows.'}`));
  inspector.append(now);
  const listed = await storage.listHistory();
  if (mode !== 'history') return;
  if (!listed.ok) {
    say(archiveNote(listed, 'Could not load history.'), 'error');
    syncSheet();
    return;
  }
  if (!listed.rows.length) inspector.append(el('p', 'note', 'No earlier boards yet. The next time you Save, the board it replaces will show up here.'));
  listed.rows.forEach((row) => {
    const card = el('div', 'archive-card');
    card.append(el('strong', '', stamp(row.saved_at) || 'Saved'));
    card.append(el('p', 'note', `Replaced by a save${row.saved_by ? ` from ${row.saved_by}` : ''}`));
    const rowSay = panelMessage(card);
    const rowActions = el('div', 'row-actions');
    rowActions.append(actionButton('Preview', async () => {
      const full = await storage.readHistory(row.id);
      if (!full.ok || !full.rows[0]) {
        rowSay(archiveNote(full, 'Could not open that version.'), 'error');
        return;
      }
      clearTimeout(undoTimer);
      commitUndo();
      state = normalize(full.rows[0].config);
      paintChrome();
      renderCanvas();
      setStatus('Previewing a past version. Restore keeps it. Undo goes back.', 'dirty');
    }));
    rowActions.append(tapTwice('Restore', 'Tap again to put it on every TV', async () => {
      const full = await storage.readHistory(row.id);
      if (!full.ok || !full.rows[0]) {
        rowSay(archiveNote(full, 'Could not open that version.'), 'error');
        return;
      }
      if (await keepOnline(full.rows[0].config)) setStatus('Restored that version on every TV.', 'saved');
    }));
    card.append(rowActions);
    inspector.append(card);
  });
  syncSheet();
}

function buildInspectorArchive() {
  if (mode === 'layouts') buildLayouts();
  else buildHistory();
}

async function init() {
  wireAuth();
  refreshAuth();
  let config = null;
  try {
    const online = await storage.loadCloud();
    if (online?.config) config = online.config;
  } catch { config = null; }
  if (!config) config = storage.loadLocal();
  if (!config) {
    try { config = await storage.loadPublished(); } catch { config = null; }
  }
  hasLocal = Boolean(storage.loadLocal());
  state = normalize(config);
  savedJson = JSON.stringify(state);
  bindChrome();
  paintPalette();
  placeSource();
  paintChrome();
  buildInspector();
  await renderCanvas();
  seedUndo();
  markDirty();
  refreshTvStatus();
  setInterval(refreshTvStatus, 60000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.__ready = true;
}

init();
