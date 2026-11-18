import { createCalendar } from './calendar.js';
import { authReady, currentUser, editorToken, sendEmailCode, signInWithCode, signInWithGoogle, signOut } from './auth.js';
import { blankTv, normalizeConfig as normalize, slugify, tvPageUrl, uniqueId } from './model.js';
import { FONT_PAIRINGS, PRESETS, applyTheme, normalizeTheme, resolveTheme } from './themes.js';
import { TEXT_FONTS, TYPE_PARTS, setFit, setPart } from './type.js';
import { createStorage, collectAssetIds } from './storage.js';
import { classifyImageList, PHOTOS_HELP } from './images.js';
import { explainDriveError, listDriveFolderImages } from './drive.js';
import { isCurrentEvent } from './events.js';
import {
  WIDGET_TYPES,
  defaultSettings,
  mountWidget,
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
  if (dirty()) status.textContent = 'Not saved yet';
  else if (!hasLocal) status.textContent = 'Published layout. Press Save to put it online.';
  else status.textContent = 'All changes are saved';
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

function snapPlace(place) {
  return clampRaw({
    x: Math.round(place.x / 2) * 2,
    y: Math.round(place.y / 2) * 2,
    w: Math.max(12, Math.round(place.w / 2) * 2),
    h: Math.max(8, Math.round(place.h / 2) * 2),
  });
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
    if (widget.id === selectedId) shell.classList.add('selected');
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
  shell.className = `widget tone-${widget.settings.tone || 'ivory'}${widget.id === selectedId ? ' selected' : ''}`;
  const previous = mounts.get(id);
  if (previous) previous();
  const body = shell.querySelector('.widget-body');
  const dispose = await mountWidget(body, widget, ctx());
  mounts.set(id, dispose);
}

function wireShell(shell, widget) {
  shell.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    selectedId = widget.id;
    mode = 'widget';
    delete document.body.dataset.sheet;
    canvas.querySelectorAll('.widget').forEach((node) => node.classList.toggle('selected', node.dataset.id === widget.id));
    if (isPhone()) document.body.classList.remove('sheet-open');
    else buildInspector();
    const handle = event.target.closest('.handle');
    const orientation = tv().orientation;
    const startPlace = { ...widget.place[orientation] };
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = canvas.getBoundingClientRect();
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
      widget.place[orientation] = clampRaw(next);
      applyPlace(shell, widget.place[orientation]);
    };
    const up = () => {
      shell.removeEventListener('pointermove', move);
      shell.removeEventListener('pointerup', up);
      shell.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-dragging');
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

function isPhone() {
  return window.matchMedia('(max-width: 820px)').matches;
}

function syncSheet() {
  const open = isPhone() && (Boolean(selectedId) || mode === 'takeover' || mode === 'theme' || mode === 'layouts' || mode === 'history' || document.body.dataset.sheet === 'screen');
  document.body.classList.toggle('sheet-open', open);
  const title = document.getElementById('sheet-title');
  if (!title) return;
  if (mode === 'theme') title.textContent = 'Theme';
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
  options.forEach(([optionValue, label]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
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
    face.style.background = preset.bg;
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

function buildInspector() {
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
  const widget = selectedId ? findWidget(selectedId) : null;
  if (!widget) {
    buildScreenForm();
    syncSheet();
    return;
  }
  const settings = widget.settings;
  const meta = specOf(widget.type);
  inspector.append(el('h2', 'side-title', meta.label));
  inspector.append(el('p', 'hint', 'Change it here. The screen on the left updates as you type. Save when you want the TV to follow.'));

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
  if (widget.type === 'events') buildEventsForm(settings);
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
  appendTypePanel(settings, TYPE_PARTS[widget.type] || [], () => refreshWidget(widget.id));

  const order = el('div', 'row-actions');
  order.append(actionButton('Bring forward', () => reorder(widget.id, 1)));
  order.append(actionButton('Send backward', () => reorder(widget.id, -1)));
  const remove = actionButton('Remove this piece', () => removeWidget(widget.id));
  order.append(remove);
  inspector.append(order);
  syncSheet();
}

function actionButton(label, onClick) {
  const button = el('button', 'btn', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
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

function buildEventsForm(settings) {
  inspector.append(field('Heading', textInput(settings.heading, (value) => { settings.heading = value; })));
  inspector.append(el('p', 'note', 'Past events stay in this list so you can edit them, but the TV hides them.'));
  settings.events.forEach((event, index) => {
    const card = el('div', 'event-edit');
    if (event.date && !isCurrentEvent(event, new Date()) && event.title) {
      card.append(el('div', 'past-tag', 'Past - hidden on the TV'));
    }
    const title = document.createElement('input');
    title.type = 'text';
    title.placeholder = 'Title';
    title.value = event.title || '';
    title.addEventListener('input', () => { event.title = title.value; markDirty(); refreshWidget(selectedId); });
    const date = document.createElement('input');
    date.type = 'date';
    date.value = event.date || '';
    date.addEventListener('change', () => { event.date = date.value; markDirty(); refreshWidget(selectedId); buildInspector(); });
    const time = document.createElement('input');
    time.type = 'time';
    time.value = event.time || '';
    time.addEventListener('change', () => { event.time = time.value; markDirty(); refreshWidget(selectedId); });
    const location = document.createElement('input');
    location.type = 'text';
    location.placeholder = 'Place, if you want one';
    location.value = event.location || '';
    location.addEventListener('input', () => { event.location = location.value; markDirty(); refreshWidget(selectedId); });
    const note = document.createElement('input');
    note.type = 'text';
    note.placeholder = 'Short note';
    note.value = event.note || '';
    note.addEventListener('input', () => { event.note = note.value; markDirty(); refreshWidget(selectedId); });
    [title, date, time, location, note].forEach((input) => {
      input.style.width = '100%';
      input.style.marginBottom = '6px';
    });
    card.append(title, date, time, location, note);
    card.append(actionButton('Remove event', () => {
      settings.events.splice(index, 1);
      markDirty();
      refreshWidget(selectedId);
      buildInspector();
    }));
    inspector.append(card);
  });
  inspector.append(actionButton('Add an event', () => {
    settings.events.push({ id: uid('e'), title: '', date: '', time: '', note: '', location: '' });
    markDirty();
    buildInspector();
  }));
}

function buildPhotosForm(settings) {
  inspector.append(el('p', 'note', PHOTOS_HELP));
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
  inspector.append(checkInput(settings.crossfade, 'Fade between photos', (value) => { settings.crossfade = value; }));
  inspector.append(field('Fit', selectInput(settings.fit, [['cover', 'Fill the box'], ['contain', 'Show the whole photo']], (value) => { settings.fit = value; })));
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
}

function appendTypePanel(target, parts, refresh) {
  const box = el('div', 'type-panel');
  box.append(el('h2', 'side-title', 'Text style'));
  box.append(el('p', 'hint', 'Leave a choice on Theme default to keep the look of this television. Auto fit shrinks the words to the box. Fixed size uses the percentage you set.'));
  const fitRow = el('div', 'ground-row');
  const fit = target.type?.fit === 'fixed' ? 'fixed' : 'auto';
  [['auto', 'Auto fit'], ['fixed', 'Fixed size']].forEach(([value, label]) => {
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
  parts.forEach((part) => {
    const details = document.createElement('details');
    details.className = 'type-part';
    if (part.open) details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = part.label;
    details.append(summary);
    const style = target.type?.parts?.[part.id] || {};
    const fonts = TEXT_FONTS.map((item) => [item.id, item.label]);
    details.append(field('Font', selectInput(style.font || 'theme', fonts, (value) => {
      setPart(target, part.id, { font: value === 'theme' ? '' : value });
      markDirty();
      refresh();
    })));
    const sizeRow = el('div', 'size-row');
    const scale = Number(style.size) || 100;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '60';
    range.max = '180';
    range.step = '5';
    range.value = String(scale);
    range.setAttribute('aria-label', `${part.label} size`);
    const number = document.createElement('input');
    number.type = 'number';
    number.min = '60';
    number.max = '180';
    number.step = '5';
    number.value = String(scale);
    number.setAttribute('aria-label', `${part.label} size percent`);
    const applySize = (value) => {
      const next = Math.max(60, Math.min(180, Number(value) || 100));
      range.value = String(next);
      number.value = String(next);
      setPart(target, part.id, { size: next });
      markDirty();
      refresh();
    };
    range.addEventListener('input', () => applySize(range.value));
    number.addEventListener('input', () => applySize(number.value));
    sizeRow.append(range, number, el('span', '', '%'));
    details.append(field('Text size', sizeRow));
    details.append(field('Weight', selectInput(String(style.weight || ''), [['', 'Theme default'], ['500', 'Medium'], ['650', 'Semibold'], ['800', 'Bold']], (value) => {
      setPart(target, part.id, { weight: value });
      markDirty();
      refresh();
    })));
    details.append(checkInput(Boolean(style.italic), 'Italic', (value) => {
      setPart(target, part.id, { italic: value });
      markDirty();
      refresh();
    }));
    const colorRow = el('div', 'color-row');
    const color = document.createElement('input');
    color.type = 'color';
    color.value = style.color || '#241c16';
    color.setAttribute('aria-label', `${part.label} color`);
    color.addEventListener('input', () => {
      setPart(target, part.id, { color: color.value });
      markDirty();
      refresh();
    });
    colorRow.append(color);
    const clear = el('button', 'btn', 'Theme color');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      setPart(target, part.id, { color: '' });
      markDirty();
      refresh();
      buildInspector();
    });
    colorRow.append(clear);
    details.append(field('Text color', colorRow));
    const alignRow = el('div', 'ground-row');
    [['', 'Theme'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']].forEach(([value, label]) => {
      const button = el('button', (style.align || '') === value ? 'on' : '', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        setPart(target, part.id, { align: value });
        markDirty();
        refresh();
        buildInspector();
      });
      alignRow.append(button);
    });
    details.append(field('Alignment', alignRow));
    details.append(field('Line spacing', numberInput(style.line || '', (value) => {
      setPart(target, part.id, { line: value === '' ? '' : Number(value) });
      refresh();
    })));
    details.append(field('Paragraph spacing', numberInput(style.para || '', (value) => {
      setPart(target, part.id, { para: value === '' ? '' : Number(value) });
      refresh();
    })));
    details.append(field('Letter spacing', numberInput(style.track || '', (value) => {
      setPart(target, part.id, { track: value === '' ? '' : Number(value) });
      refresh();
    })));
    details.append(field('Case', selectInput(style.case || '', [['', 'Normal'], ['upper', 'Uppercase']], (value) => {
      setPart(target, part.id, { case: value });
      markDirty();
      refresh();
    })));
    box.append(details);
  });
  const reset = el('button', 'btn', 'Reset to theme');
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
  appendTypePanel(takeover, TYPE_PARTS.takeover, () => { if (previewTakeover) renderCanvas(); });
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
  if (!confirm(`Remove ${label}? Its address will stop working.`)) return;
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
  status.textContent = 'Saving online...';
  try {
    const result = await storage.saveOnline(state);
    if (result.ok) {
      savedJson = JSON.stringify(state);
      hasLocal = true;
      status.textContent = 'Saved online.';
      return;
    }
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
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.getElementById('layouts').addEventListener('click', () => openArchive('layouts'));
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
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      event.preventDefault();
      removeWidget(selectedId);
    }
    if (selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const widget = findWidget(selectedId);
      const place = widget.place[tv().orientation];
      const step = 2;
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
    mode = 'screen';
    canvas.querySelectorAll('.widget').forEach((node) => node.classList.remove('selected'));
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

function replaceActiveTv(saved) {
  const source = normalize(saved);
  const incoming = source.tvs.find((item) => item.id === tv().id) || source.tvs[state.activeTv] || source.tvs[0];
  if (!incoming) return;
  const current = tv();
  const id = current.id;
  Object.assign(current, incoming, { id });
}

async function keepOnline(next) {
  state = normalize(next);
  const result = await storage.saveOnline(state);
  if (!result.ok) {
    status.textContent = archiveNote(result, 'Could not save online.');
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

async function buildLayouts() {
  inspector.replaceChildren(el('h2', 'side-title', 'Saved layouts'));
  syncSheet();
  inspector.append(el('p', 'hint', 'Keep a copy you can come back to. History also keeps the last 30 online saves.'));
  const saveAs = el('button', 'btn btn-primary', 'Save as layout...');
  saveAs.type = 'button';
  saveAs.addEventListener('click', async () => {
    const name = window.prompt('Name this layout', 'Regular week');
    if (!name || !name.trim()) return;
    const result = await storage.writeLayout({
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      config: state,
      locked: false,
    });
    status.textContent = result.ok ? `Saved the layout "${name.trim()}".` : archiveNote(result, 'Could not save that layout.');
    if (result.ok) buildLayouts();
  });
  inspector.append(saveAs);
  const listed = await storage.listLayouts();
  if (!listed.ok) {
    inspector.append(el('p', 'note', archiveNote(listed, 'Could not load layouts.')));
    syncSheet();
    return;
  }
  if (!listed.rows.length) inspector.append(el('p', 'note', 'No saved layouts yet.'));
  listed.rows.forEach((row) => {
    const card = el('div', 'archive-card');
    card.append(el('strong', '', row.name));
    card.append(el('p', 'note', `${stamp(row.updated_at)}${row.updated_by ? `  -  ${row.updated_by}` : ''}${row.locked ? '  -  Locked' : ''}`));
    const rowActions = el('div', 'row-actions');
    rowActions.append(actionButton('Every TV', async () => {
      if (!window.confirm(`Replace every TV with "${row.name}"? The current board is kept in History.`)) return;
      const full = await storage.readLayout(row.id);
      if (!full.ok || !full.rows[0]) {
        status.textContent = archiveNote(full, 'Could not open that layout.');
        return;
      }
      if (await keepOnline(full.rows[0].config)) status.textContent = `Restored "${row.name}".`;
    }));
    rowActions.append(actionButton('This TV only', async () => {
      if (!window.confirm(`Replace only this TV with the one from "${row.name}"? The other TVs stay as they are. The current board is kept in History.`)) return;
      const full = await storage.readLayout(row.id);
      if (!full.ok || !full.rows[0]) {
        status.textContent = archiveNote(full, 'Could not open that layout.');
        return;
      }
      const next = structuredClone(state);
      state = next;
      replaceActiveTv(full.rows[0].config);
      if (await keepOnline(state)) status.textContent = `Restored this TV from "${row.name}".`;
    }));
    rowActions.append(actionButton('Rename', async () => {
      if (row.locked) {
        status.textContent = 'That layout is locked. Unlock it first.';
        return;
      }
      const name = window.prompt('New name', row.name);
      if (!name || !name.trim()) return;
      const result = await storage.patchLayout(row.id, { name: name.trim().slice(0, 80) });
      status.textContent = result.ok ? 'Renamed.' : archiveNote(result, 'Could not rename that layout.');
      if (result.ok) buildLayouts();
    }));
    rowActions.append(actionButton(row.locked ? 'Unlock' : 'Lock', async () => {
      const result = await storage.patchLayout(row.id, { locked: !row.locked });
      status.textContent = result.ok ? (row.locked ? 'Unlocked.' : 'Locked.') : archiveNote(result, 'Could not change the lock.');
      if (result.ok) buildLayouts();
    }));
    rowActions.append(actionButton('Delete', async () => {
      if (row.locked) {
        status.textContent = 'That layout is locked. Unlock it first.';
        return;
      }
      if (!window.confirm(`Delete the layout "${row.name}"? This cannot be undone.`)) return;
      const result = await storage.removeLayout(row.id);
      status.textContent = result.ok ? 'Deleted.' : archiveNote(result, 'Could not delete that layout.');
      if (result.ok) buildLayouts();
    }));
    card.append(rowActions);
    inspector.append(card);
  });
  syncSheet();
}

async function buildHistory() {
  inspector.replaceChildren(el('h2', 'side-title', 'History'));
  syncSheet();
  inspector.append(el('p', 'hint', 'Each online save keeps the previous board. The last 30 are here. Restoring keeps today in this list, so you can undo it.'));
  const listed = await storage.listHistory();
  if (!listed.ok) {
    inspector.append(el('p', 'note', archiveNote(listed, 'Could not load history.')));
    syncSheet();
    return;
  }
  if (!listed.rows.length) inspector.append(el('p', 'note', 'No earlier saves yet. Press Save once more and the previous board will show up here.'));
  listed.rows.forEach((row) => {
    const card = el('div', 'archive-card');
    card.append(el('strong', '', stamp(row.saved_at) || 'Saved'));
    card.append(el('p', 'note', row.saved_by || 'Editor'));
    const rowActions = el('div', 'row-actions');
    rowActions.append(actionButton('Preview', async () => {
      const full = await storage.readHistory(row.id);
      if (!full.ok || !full.rows[0]) {
        status.textContent = archiveNote(full, 'Could not open that version.');
        return;
      }
      clearTimeout(undoTimer);
      commitUndo();
      state = normalize(full.rows[0].config);
      paintChrome();
      renderCanvas();
      status.textContent = 'Previewing a past version. Press History, then Restore, to keep it. Undo goes back.';
    }));
    rowActions.append(actionButton('Restore', async () => {
      if (!window.confirm('Put this past version back on every TV? Today\'s board is kept in History so you can return.')) return;
      const full = await storage.readHistory(row.id);
      if (!full.ok || !full.rows[0]) {
        status.textContent = archiveNote(full, 'Could not open that version.');
        return;
      }
      if (await keepOnline(full.rows[0].config)) status.textContent = 'Restored that version.';
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.__ready = true;
}

init();
