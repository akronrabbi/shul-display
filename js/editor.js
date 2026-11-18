import { createCalendar } from './calendar.js';
import { blankTv, normalizeConfig as normalize, slugify, tvPageUrl, uniqueId } from './model.js';
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

const storage = createStorage();
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

function markDirty() {
  if (dirty()) status.textContent = 'Not saved yet';
  else if (!hasLocal) status.textContent = 'Published layout. Press Save to keep a copy on this computer.';
  else status.textContent = 'All changes are saved';
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
    canvas.querySelectorAll('.widget').forEach((node) => node.classList.toggle('selected', node.dataset.id === widget.id));
    buildInspector();
    const handle = event.target.closest('.handle');
    const orientation = tv().orientation;
    const startPlace = { ...widget.place[orientation] };
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = canvas.getBoundingClientRect();
    try { shell.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    const move = (ev) => {
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
      widget.place[orientation] = snapPlace(widget.place[orientation]);
      applyPlace(shell, widget.place[orientation]);
      markDirty();
    };
    shell.addEventListener('pointermove', move);
    shell.addEventListener('pointerup', up);
  });
}

function fitCanvas() {
  const frame = document.getElementById('board-frame');
  const ratio = tv().orientation === 'portrait' ? 9 / 16 : 16 / 9;
  let width = frame.clientWidth;
  let height = width / ratio;
  if (height > frame.clientHeight) {
    height = frame.clientHeight;
    width = height * ratio;
  }
  canvas.style.width = `${Math.max(160, width)}px`;
  canvas.style.height = `${Math.max(160, height)}px`;
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

function buildInspector() {
  inspector.replaceChildren();
  if (mode === 'takeover') {
    buildTakeoverForm();
    return;
  }
  const widget = selectedId ? findWidget(selectedId) : null;
  if (!widget) {
    buildScreenForm();
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
      const asset = await storage.putAsset(file);
      settings.assetId = asset.id;
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

  if (widget.type !== 'welcome') {
    inspector.append(field('Color', selectInput(settings.tone, toneChoices(widget.type), (value) => { settings.tone = value; })));
  } else {
    inspector.append(field('Color', selectInput(settings.tone, toneChoices('welcome'), (value) => { settings.tone = value; })));
  }

  const order = el('div', 'row-actions');
  order.append(actionButton('Bring forward', () => reorder(widget.id, 1)));
  order.append(actionButton('Send backward', () => reorder(widget.id, -1)));
  const remove = actionButton('Remove this piece', () => removeWidget(widget.id));
  order.append(remove);
  inspector.append(order);
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
      const asset = await storage.putAsset(file);
      settings.images.push({ assetId: asset.id, name: file.name });
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
  inspector.append(fileButton(settings.assetId ? 'Replace the PDF' : 'Upload a PDF', 'application/pdf', async (file) => {
    const previous = settings.assetId;
    const asset = await storage.putAsset(file);
    settings.assetId = asset.id;
    settings.url = '';
    if (previous && previous !== asset.id) await storage.deleteAsset(previous);
    markDirty();
    refreshWidget(selectedId);
    buildInspector();
  }));
  inspector.append(field('Seconds on each page', numberInput(settings.interval, (value) => { settings.interval = Number(value); })));
}

function buildScreenForm() {
  const current = screen();
  inspector.append(el('h2', 'side-title', 'This screen'));
  inspector.append(el('p', 'hint', 'This is the board the TV will show. Add pieces from the left. You can make more than one screen and let them rotate.'));
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
  inspector.append(el('p', 'note', 'Rotation only happens when "Rotate the screens" is on, and only if you have more than one screen.'));
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
    const asset = await storage.putAsset(file);
    takeover.backgroundAssetId = asset.id;
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

function currentTvUrl() {
  return new URL(tvPageUrl(tv()), location.href).href;
}

function paintTvBar() {
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
    button.addEventListener('pointerdown', (event) => startPaletteDrag(item.type, event));
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
  block.append(takeover);
  if (tv().takeover.enabled) block.append(el('p', 'note', 'The full-screen message is on for this TV. It shows after you save.'));
  palette.append(block);

  const sourceBlock = el('div', 'side-block');
  sourceBlock.append(el('h2', 'side-title', 'Where the TV looks'));
  const current = storage.getSource();
  [['auto', 'Automatic - this computer after you save, otherwise the published file'], ['local', 'This computer'], ['published', 'The published file on the website']].forEach(([value, label]) => {
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

async function save() {
  state = normalize(state);
  storage.saveLocal(state);
  savedJson = JSON.stringify(state);
  hasLocal = true;
  status.textContent = 'Saved. The TVs on this computer will update.';
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
    status.textContent = 'Imported and saved.';
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
  });
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

async function init() {
  let config = storage.loadLocal();
  if (!config) {
    try { config = await storage.loadPublished(); } catch { config = null; }
  }
  hasLocal = Boolean(storage.loadLocal());
  state = normalize(config);
  savedJson = JSON.stringify(state);
  bindChrome();
  paintPalette();
  paintChrome();
  buildInspector();
  await renderCanvas();
  markDirty();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.__ready = true;
}

init();
