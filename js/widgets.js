import { akronWallTimeToDate } from './calendar.js';
import { fixedSize, stylePart } from './type.js';
import { upcomingEvents, formatClockNumbers, eventDateParts, isCurrentEvent } from './events.js';
import { safeImageUrl, PHOTOS_HELP } from './images.js';
import { driveRefreshMs, explainDriveError, listDriveFolderImages } from './drive.js';
import { albumKey, albumPhotoUrl, cleanAlbumLink } from './albums.js';

// The photo list for a Google Photos album link, published with the site by
// the scheduled GitHub job. Null until the first check has run.
export async function readAlbumList(link) {
  const clean = cleanAlbumLink(link);
  if (!clean) return null;
  try {
    const url = new URL(`../albums/${albumKey(clean)}.json`, import.meta.url);
    url.searchParams.set('t', String(Math.floor(Date.now() / 60000)));
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export { PHOTOS_HELP };

export const WIDGET_TYPES = [
  {
    type: 'date',
    label: 'Date',
    blurb: 'The English date, the Hebrew date, and the parsha',
    size: { w: 36, h: 36 },
    portrait: { w: 88, h: 18 },
  },
  {
    type: 'shabbos',
    label: 'Shabbos times',
    blurb: 'Candle lighting and havdalah for Akron',
    size: { w: 36, h: 36 },
    portrait: { w: 88, h: 20 },
  },
  {
    type: 'logo',
    label: 'Logo',
    blurb: 'The shul mark, or a picture you choose',
    size: { w: 20, h: 36 },
    portrait: { w: 40, h: 14 },
  },
  {
    type: 'welcome',
    label: 'Welcome line',
    blurb: 'A line of text, still or moving',
    size: { w: 100, h: 14 },
    portrait: { w: 100, h: 8 },
  },
  {
    type: 'photos',
    label: 'Photos',
    blurb: 'A slow slideshow, or a Google Drive folder',
    size: { w: 40, h: 36 },
    portrait: { w: 88, h: 22 },
  },
  {
    type: 'pdf',
    label: 'PDF flyer',
    blurb: 'A flyer, fitted to the box',
    size: { w: 32, h: 44 },
    portrait: { w: 88, h: 28 },
  },
  {
    type: 'events',
    label: 'Events',
    blurb: 'A list you type. Past ones drop off the TV',
    size: { w: 58, h: 44 },
    portrait: { w: 88, h: 16 },
  },
  {
    type: 'text',
    label: 'Announcement',
    blurb: 'A heading and a note',
    size: { w: 36, h: 44 },
    portrait: { w: 88, h: 12 },
  },
  {
    type: 'zmanim',
    label: 'Zmanim',
    blurb: 'Daily times such as sunrise and Shema',
    size: { w: 28, h: 42 },
    portrait: { w: 88, h: 24 },
  },
];

const TONES = [
  ['ivory', 'Light card'],
  ['navy', 'Dark card'],
  ['burgundy', 'Accent'],
  ['clear', 'Plain'],
];

export function defaultSettings(type) {
  switch (type) {
    case 'date':
      return {
        tone: 'ivory',
        showClock: true,
        showEnglish: true,
        showHebrew: true,
        hebrewStyle: 'nikud',
        showTranslit: true,
        showParsha: true,
      };
    case 'shabbos':
      return {
        tone: 'navy',
        heading: 'Shabbos',
        showParsha: true,
        showHebrewParsha: true,
        candleLightingMins: 18,
        havdalahMode: 'degrees',
        havdalahDeg: 8.5,
        havdalahMins: 42,
      };
    case 'logo':
      return {
        tone: 'clear',
        url: 'assets/akron-shul-logo.png',
        assetId: null,
        showName: false,
        name: 'Anshe Sfard',
        subtitle: 'Revere Road',
      };
    case 'welcome':
      return {
        tone: 'band',
        text: 'Good Shabbos  -  Anshe Sfard - Revere Road Synagogue',
        mode: 'static',
      };
    case 'photos':
      return {
        tone: 'clear',
        images: [],
        interval: 8,
        crossfade: true,
        transition: 'fade',
        order: 'in-order',
        fit: 'cover',
        driveFolder: '',
        driveApiKey: '',
        albumLink: '',
      };
    case 'pdf':
      return { tone: 'ivory', assetId: null, url: '', interval: 12 };
    case 'events':
      return {
        tone: 'ivory',
        heading: 'Upcoming',
        events: [],
      };
    case 'text':
      return {
        tone: 'burgundy',
        eyebrow: 'The shul',
        title: 'Rabbi Moshe Sasonkin',
        body: '646 N Revere Road\nAkron, Ohio 44333\n330.867.7292',
      };
    case 'zmanim':
      return {
        tone: 'navy',
        heading: 'Zmanim',
        show: {
          sunrise: true,
          misheyakir: false,
          sofZmanShma: true,
          sofZmanTfilla: false,
          chatzot: false,
          minchaGedola: true,
          plag: false,
          sunset: true,
          tzeit: true,
        },
      };
    default:
      return { tone: 'ivory' };
  }
}

export function defaultTakeover() {
  return {
    enabled: false,
    template: 'classic',
    eyebrow: 'Anshe Sfard',
    title: 'Welcome to the Bat Mitzvah of Chaya Cohen',
    subtitle: 'Shabbat Parashat Vayetzei',
    details: 'Saturday, November 21, 2026',
    footer: 'Revere Road Synagogue  -  Akron',
    backgroundAssetId: null,
    backgroundUrl: '',
    kind: 'message',
    imageUrl: '',
    imageFit: 'contain',
    scheduleEnabled: false,
    start: '',
    end: '',
  };
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hebrewLine(className, text, type, part) {
  const node = h('div', `hebrew-line ${className}`);
  const bdi = document.createElement('bdi');
  bdi.lang = 'he';
  bdi.dir = 'rtl';
  bdi.textContent = text;
  node.append(bdi);
  stylePart(node, type, part);
  return node;
}

function piece(className, text, type, part) {
  const node = h('div', className, text);
  stylePart(node, type, part);
  return node;
}

function fitBox(el, box, options = {}) {
  if (!el || !box || box.clientHeight < 8) return;
  const line = options.line === true;
  el.style.whiteSpace = line ? 'nowrap' : 'normal';
  let lo = 11;
  let hi = Math.max(lo + 1, Math.min(box.clientHeight, options.max || box.clientHeight));
  let best = lo;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    const tooTall = el.scrollHeight > box.clientHeight + 1;
    const tooWide = line && el.scrollWidth > box.clientWidth + 1;
    if (!tooTall && !tooWide) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  el.style.fontSize = `${Math.floor(best)}px`;
}

// Sizes text in a box. Auto fit fills the box, and each part's Text size sets
// how big it is next to the others. Exact size makes 100% the size that fills
// the box with every part at 100%, then applies each part's size as set, so
// 150% really is half again as big (and may run past the box).
export function sizeText(el, box, type) {
  if (!el || !box) return;
  const exact = fixedSize(type);
  if (exact) el.classList.add('fit-measure');
  fitBox(el, box, sizeText.options.get(el) || {});
  if (exact) el.classList.remove('fit-measure');
  const own = Number(el.style.getPropertyValue('--t-scale')) || 1;
  const factor = exact ? own : Math.min(own, 1);
  if (factor !== 1) el.style.fontSize = `${Math.max(8, Math.floor(parseFloat(el.style.fontSize) * factor))}px`;
}
sizeText.options = new WeakMap();

function watchSize(el, box, bag, options, type) {
  sizeText.options.set(el, options || {});
  const run = () => sizeText(el, box, type);
  requestAnimationFrame(() => requestAnimationFrame(run));
  const observer = new ResizeObserver(run);
  observer.observe(box);
  bag.push(() => observer.disconnect());
}


async function resolveUrl(ctx, assetId, url) {
  if (assetId) {
    const local = await ctx.resolveAsset(assetId);
    if (local) return local;
  }
  return safeImageUrl(url);
}

function every(ms, fn, bag) {
  const id = setInterval(fn, ms);
  bag.push(() => clearInterval(id));
}

function mountDate(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque date-card');
  body.append(root);

  const paint = () => {
    const now = ctx.now();
    const he = ctx.calendar.hebrew(now);
    const shabbos = ctx.calendar.shabbos(now, ctx.shabbosSettings || {});
    root.replaceChildren();
    root.append(piece('eyebrow', settings.kicker || 'Today', settings.type, 'small'));
    if (settings.showClock !== false) {
      const clock = piece('clock js-clock', ctx.calendar.formatTime(now), settings.type, 'title');
      root.append(clock);
    }
    if (settings.showEnglish !== false) {
      root.append(piece('weekday', he.weekday, settings.type, 'title'));
      root.append(piece('civil', he.dateLine, settings.type, 'body'));
    }
    if (settings.showHebrew !== false) {
      root.append(h('div', 'rule'));
      const line = settings.hebrewStyle === 'plain' ? he.plain : he.hebrew;
      root.append(hebrewLine('date-he', line, settings.type, 'body'));
    }
    if (settings.showTranslit !== false) root.append(piece('translit', he.translit, settings.type, 'body'));
    if (settings.showParsha !== false && shabbos?.parsha) {
      root.append(piece('parsha-en', shabbos.parsha.en, settings.type, 'body'));
      if (shabbos.parsha.he) root.append(hebrewLine('parsha-he', shabbos.parsha.he, settings.type, 'body'));
    }
    const clock = root.querySelector('.js-clock');
    if (clock) clock.textContent = ctx.calendar.formatTime(ctx.now());
  };

  paint();
  every(1000, () => {
    const clock = root.querySelector('.js-clock');
    if (clock) clock.textContent = ctx.calendar.formatTime(ctx.now());
  }, bag);
  every(30000, paint, bag);
  return () => bag.forEach((fn) => fn());
}

function mountShabbos(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque shabbos-card');
  body.append(root);

  // Arrangement: how the parsha and the two times sit in the box.
  const arrange = shabbosArrangement(settings);
  root.dataset.times = arrange.times;
  root.dataset.order = arrange.order;
  root.dataset.vpos = arrange.vpos;
  root.dataset.align = arrange.align;
  if (arrange.gap != null) root.style.setProperty('--sh-gap', `${arrange.gap}cqh`);
  if (arrange.timesGap != null) root.style.setProperty('--sh-times-gap', `${arrange.timesGap}cqi`);

  const paint = () => {
    const info = ctx.calendar.shabbos(ctx.now(), settings);
    root.replaceChildren();
    if (settings.heading !== '') root.append(piece('eyebrow', settings.heading || 'Shabbos', settings.type, 'small'));
    const parsha = h('div', 'shabbos-parsha');
    if (settings.showParsha !== false && info?.parsha) {
      parsha.append(piece('parsha-en', info.parsha.en, settings.type, 'body'));
      if (settings.showHebrewParsha !== false && info.parsha.he) {
        parsha.append(hebrewLine('parsha-he', info.parsha.he, settings.type, 'body'));
      }
    }
    const times = h('div', `shabbos-times${arrange.divider ? ' divided' : ''}`);
    if (!info) {
      times.append(h('p', 'quiet', 'Times are not available right now.'));
    } else {
      const when = (text) => (arrange.showWhen ? text : '');
      times.append(timeBlock(settings.candleLabel || 'Candle lighting', info.candles.time, when(info.candles.when), settings.type));
      times.append(timeBlock(settings.havdalahLabel || 'Havdalah', info.havdalah.time, when(info.havdalah.when), settings.type));
    }
    const parts = arrange.order === 'times-first' ? [times, parsha] : [parsha, times];
    parts.forEach((part) => { if (part.childNodes.length) root.append(part); });
  };

  paint();
  every(30000, paint, bag);
  return () => bag.forEach((fn) => fn());
}

function timeBlock(label, time, when, type) {
  const block = h('div', 'time-block');
  block.append(piece('time-label', label, type, 'small'));
  block.append(piece('time-value', time, type, 'title'));
  if (when) block.append(piece('time-when', when, type, 'small'));
  return block;
}

const ARRANGE_DEFAULTS = {
  times: 'auto',
  order: 'parsha-first',
  vpos: 'spread',
  align: 'start',
  gap: null,
  timesGap: null,
  divider: false,
  showWhen: true,
};

export function shabbosArrangement(settings) {
  const raw = settings?.arrange || {};
  const pick = (key, allowed) => (allowed.includes(raw[key]) ? raw[key] : ARRANGE_DEFAULTS[key]);
  const num = (value, min, max) => (value === '' || value == null || !Number.isFinite(Number(value)) ? null : Math.min(max, Math.max(min, Number(value))));
  return {
    times: pick('times', ['auto', 'row', 'column']),
    order: pick('order', ['parsha-first', 'times-first']),
    vpos: pick('vpos', ['top', 'center', 'bottom', 'spread']),
    align: pick('align', ['start', 'center', 'end']),
    gap: num(raw.gap, 0, 20),
    timesGap: num(raw.timesGap, 0, 20),
    divider: Boolean(raw.divider),
    showWhen: raw.showWhen !== false,
  };
}

export const SHUL_LOGO = 'assets/akron-shul-logo.png';
const SHUL_LOGO_LIGHT = 'assets/akron-shul-logo-light.png';

export function isShulLogo(settings) {
  return !settings?.assetId && String(settings?.url || '').replace(/^\.\//, '') === SHUL_LOGO;
}

function isLightColor(color) {
  const m = String(color).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (!m) return false;
  const [r, g, b] = m.slice(1, 4).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

async function mountLogo(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'logo-card');
  const shul = isShulLogo(settings);
  const src = shul ? SHUL_LOGO : await resolveUrl(ctx, settings.assetId, settings.url);
  let img = null;
  if (src) {
    img = h('img', `logo-img${shul ? ' shul-mark' : ''}`);
    img.alt = settings.name || 'Anshe Sfard';
    img.src = src;
    root.append(img);
  }
  // The shul logo already says Anshe Sfard, so the name line would repeat it.
  const repeatsName = shul && /^\s*anshe\s+sfard\s*$/i.test(settings.name || '');
  if (settings.showName !== false && settings.name && !repeatsName) root.append(piece('logo-name', settings.name, settings.type, 'title'));
  if (settings.subtitle) root.append(piece('logo-sub', settings.subtitle, settings.type, 'small'));
  body.append(root);
  if (shul && img) {
    // Black logo on light backgrounds, white logo on dark ones. The text color
    // of the box says which, for every theme and card color.
    const choose = () => {
      const next = isLightColor(getComputedStyle(root).color) ? SHUL_LOGO_LIGHT : SHUL_LOGO;
      if (!img.src.endsWith(next)) img.src = next;
    };
    choose();
    every(2000, choose, bag);
  }
  return () => bag.forEach((fn) => fn());
}

function mountWelcome(body, widget) {
  const bag = [];
  const settings = widget.settings;
  const text = settings.text || '';
  const root = h('div', 'welcome');
  root.dir = 'auto';
  if (settings.mode === 'scroll') {
    const track = h('div', 'welcome-track');
    const seconds = Math.max(12, Math.round(text.length / 4));
    track.style.setProperty('--ticker-time', `${seconds}s`);
    track.append(chunk(text, settings.type));
    track.append(chunk(text, settings.type));
    root.append(track);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      track.style.animation = 'none';
    }
  } else {
    const box = h('div', 'welcome-still');
    const line = h('div', 'welcome-line', text);
    line.dir = 'auto';
    stylePart(line, settings.type, 'line');

    box.append(line);
    root.append(box);
    watchSize(line, box, bag, { line: true }, settings.type);
  }
  body.append(root);
  return () => bag.forEach((fn) => fn());
}

function chunk(text, type) {
  const node = h('span', 'welcome-chunk', text);
  node.dir = 'auto';
  stylePart(node, type, 'line');
  return node;
}

export function photoSource(settings) {
  if (!cleanAlbumLink(settings?.albumLink)) return 'added';
  return settings.source === 'album' || settings.source === 'added' ? settings.source : 'both';
}

async function collectPhotoUrls(settings, ctx) {
  const urls = [];
  const source = photoSource(settings);
  const useAdded = source !== 'album';
  const useAlbum = source !== 'added';
  for (const image of useAdded ? settings.images || [] : []) {
    const url = image.assetId ? await ctx.resolveAsset(image.assetId) : safeImageUrl(image.url);
    if (url) urls.push(url);
  }
  let albumNote = '';
  if (useAlbum && cleanAlbumLink(settings.albumLink)) {
    const album = await readAlbumList(settings.albumLink);
    if (album?.photos?.length) {
      for (const photo of album.photos) urls.push(albumPhotoUrl(photo.url));
    } else {
      albumNote = 'The Google Photos album will show here after its first check, within about 15 to 30 minutes of saving.';
    }
  }
  let driveError = null;
  if (useAdded && String(settings.driveFolder || '').trim()) {
    try {
      const listed = await listDriveFolderImages(settings.driveFolder, settings.driveApiKey);
      for (const image of listed) urls.push(image.url);
    } catch (error) {
      driveError = error;
    }
  }
  return { urls, driveError, albumNote };
}

export const PHOTO_TRANSITIONS = [
  ['fade', 'Soft fade'],
  ['zoom', 'Fade with a slow zoom'],
  ['slide', 'Slide across'],
  ['none', 'Cut, no movement'],
];

export function photoTransition(settings) {
  const value = settings?.transition;
  if (PHOTO_TRANSITIONS.some(([id]) => id === value)) return value;
  return settings?.crossfade === false ? 'none' : 'fade';
}

function preload(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    setTimeout(() => finish(true), 10000);
    img.src = url;
  });
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function mountPhotos(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const urls = [];
  const root = h('div', 'photos');
  const note = h('div', 'empty-note', 'Looking for photos...');
  const fit = settings.fit === 'contain' ? 'contain' : 'cover';
  const transition = photoTransition(settings);
  const seconds = Math.max(2, Number(settings.interval) || 8);
  root.dataset.transition = transition;
  root.style.setProperty('--slide-time', `${seconds + 2}s`);
  const a = h('img', 'photo');
  const b = h('img', 'photo');
  for (const img of [a, b]) {
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.style.objectFit = fit;
  }
  root.append(a, b, note);
  if (settings.caption) root.append(piece('caption', settings.caption, settings.type, 'small'));
  body.append(root);

  let index = 0;
  let front = a;
  let slideTimer = 0;
  let busy = false;
  let alive = true;
  bag.push(() => { alive = false; });

  const enter = (next, previous) => {
    next.classList.add('instant');
    next.classList.remove('on', 'leaving');
    void next.offsetWidth;
    next.classList.remove('instant');
    next.classList.add('on');
    if (previous && previous !== next) {
      previous.classList.remove('on');
      previous.classList.add('leaving');
    }
  };

  const step = async () => {
    if (busy || urls.length < 2) return;
    busy = true;
    try {
      for (let tries = 0; tries < urls.length; tries += 1) {
        index = (index + 1) % urls.length;
        // Wait for the next picture to arrive, so a fade never shows an empty box.
        if (await preload(urls[index])) break;
      }
      if (!alive) return;
      const next = front === a ? b : a;
      next.src = urls[index];
      try { await next.decode(); } catch { /* show it anyway */ }
      if (!alive) return;
      enter(next, front);
      front = next;
    } finally {
      busy = false;
    }
  };
  const ensureSlides = () => {
    if (slideTimer || urls.length < 2) return;
    slideTimer = setInterval(step, seconds * 1000);
    bag.push(() => clearInterval(slideTimer));
  };
  const show = () => {
    note.hidden = urls.length > 0;
    if (!urls.length) return;
    if (!a.getAttribute('src')) {
      a.src = urls[0];
      enter(a, null);
      front = a;
      index = 0;
    } else if (index >= urls.length) {
      index = 0;
    }
    ensureSlides();
  };
  const reload = async () => {
    const found = await collectPhotoUrls(settings, ctx);
    const list = settings.order === 'shuffle' ? shuffled(found.urls) : found.urls;
    urls.splice(0, urls.length, ...list);
    if (!urls.length) {
      note.hidden = false;
      if (found.albumNote) note.textContent = found.albumNote;
      else if (found.driveError) note.textContent = explainDriveError(found.driveError);
      else if (String(settings.driveFolder || '').trim()) note.textContent = 'That folder has no pictures yet.';
      else note.textContent = 'Add photos in the editor.';
    }
    show();
  };
  await reload();
  if (String(settings.driveFolder || '').trim() || cleanAlbumLink(settings.albumLink)) {
    every(driveRefreshMs(), () => { reload(); }, bag);
  }
  return () => bag.forEach((fn) => fn());
}

let pdfjsPromise;
function loadPdfjs() {
  if (!pdfjsPromise) {
    // PDF.js is stored with the site, so a flyer opens even when the network is down.
    pdfjsPromise = import(new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url).href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function mountPdf(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'pdf-view');
  body.append(root);
  let buffer = null;
  if (settings.assetId && ctx.assetBuffer) buffer = await ctx.assetBuffer(settings.assetId);
  if (!buffer && settings.url) {
    try {
      const response = await fetch(settings.url);
      if (response.ok) buffer = await response.arrayBuffer();
    } catch {
      buffer = null;
    }
  }
  if (!buffer) {
    root.append(h('div', 'empty-note', 'Add a PDF in the editor.'));
    return () => {};
  }

  const canvas = document.createElement('canvas');
  const label = h('div', 'pdf-page', '');
  root.append(canvas, label);
  if (settings.caption) root.append(piece('caption', settings.caption, settings.type, 'small'));
  let pdf;
  let pageNum = 1;
  let drawing = false;
  try {
    const pdfjs = await loadPdfjs();
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch {
    root.replaceChildren(h('div', 'empty-note', 'This PDF could not be opened.'));
    return () => {};
  }

  async function draw() {
    if (drawing || !pdf) return;
    drawing = true;
    try {
      const page = await pdf.getPage(pageNum);
      const unscaled = page.getViewport({ scale: 1 });
      const cssW = root.clientWidth || unscaled.width;
      const cssH = root.clientHeight || unscaled.height;
      const scale = Math.min(cssW / unscaled.width, cssH / unscaled.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(unscaled.width * scale)}px`;
      canvas.style.height = `${Math.floor(unscaled.height * scale)}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      label.textContent = pdf.numPages > 1 ? `${pageNum} / ${pdf.numPages}` : '';
    } finally {
      drawing = false;
    }
  }

  await draw();
  const observer = new ResizeObserver(() => { draw(); });
  observer.observe(root);
  bag.push(() => observer.disconnect());
  if (pdf.numPages > 1) {
    const ms = Math.max(3, Number(settings.interval) || 12) * 1000;
    every(ms, () => {
      canvas.classList.add('turning');
      setTimeout(async () => {
        pageNum = pageNum % pdf.numPages + 1;
        await draw();
        canvas.classList.remove('turning');
      }, 450);
    }, bag);
  }
  bag.push(() => pdf.destroy());
  return () => bag.forEach((fn) => fn());
}

function mountEvents(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque events-card');
  const eyebrow = piece('eyebrow', settings.heading || 'Upcoming', settings.type, 'small');
  const grow = h('div', 'grow');
  const list = h('div', 'event-list');
  grow.append(list);
  root.append(eyebrow, grow);
  body.append(root);

  const paint = () => {
    const items = upcomingEvents(settings.events, ctx.now());
    list.replaceChildren();
    if (!items.length) {
      list.append(h('p', 'quiet', 'Nothing coming up.'));
    } else {
      for (const event of items) {
        const parts = eventDateParts(event.date);
        const row = h('article', 'event-row');
        const when = h('div', 'event-when');
        when.append(piece('event-dow', parts.dow, settings.type, 'small'));
        when.append(piece('event-day', parts.day, settings.type, 'title'));
        when.append(piece('event-month', parts.month, settings.type, 'small'));
        const what = h('div', 'event-what');
        const title = piece('event-title', event.title, settings.type, 'title');
        title.dir = 'auto';
        what.append(title);
        const repeatLabel = event.repeat === 'weekly' ? `Every ${parts.dowLong}` : (event.repeat === 'biweekly' ? `Every other ${parts.dowLong}` : '');
        const metaBits = [formatClockNumbers(event.time), repeatLabel, event.location, event.note].filter(Boolean);
        if (metaBits.length) {
          const meta = piece('event-meta', metaBits.join('  -  '), settings.type, 'small');
          meta.dir = 'auto';
          what.append(meta);
        }
        row.append(when, what);
        list.append(row);
      }
    }
    sizeText.options.set(list, { max: 76 });
    sizeText(list, grow, settings.type);
  };

  paint();
  watchSize(list, grow, bag, { max: 76 }, settings.type);
  every(30000, paint, bag);
  return () => bag.forEach((fn) => fn());
}

function mountText(body, widget) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque text-card');
  if (settings.eyebrow) root.append(piece('eyebrow', settings.eyebrow, settings.type, 'small'));
  const grow = h('div', 'grow');
  const block = h('div', 'text-fit');
  if (settings.title) {
    const title = piece('text-title', settings.title, settings.type, 'title');
    title.dir = 'auto';
    block.append(title);
  }
  if (settings.body) {
    const copy = piece('text-body', '', settings.type, 'body');
    copy.dir = 'auto';
    const useParas = Boolean(settings.type?.parts?.body?.para);
    String(settings.body).split('\n').forEach((line, index) => {
      if (useParas) {
        copy.append(h('div', 'para-block', line));
        return;
      }
      if (index) copy.append(document.createElement('br'));
      copy.append(document.createTextNode(line));
    });
    block.append(copy);
  }
  grow.append(block);
  root.append(grow);
  body.append(root);
  watchSize(block, grow, bag, { max: 68 }, settings.type);
  return () => bag.forEach((fn) => fn());
}

function mountZmanim(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque zman-card');
  body.append(root);
  const paint = () => {
    const data = ctx.calendar.zmanim(ctx.now());
    root.replaceChildren();
    root.append(piece('eyebrow', settings.heading || 'Zmanim', settings.type, 'small'));
    if (data.afterSunset) root.append(piece('quiet zman-note', 'After sunset, these are tomorrow', settings.type, 'small'));
    root.append(hebrewLine('zman-he', 'זְמַנִּים', settings.type, 'small'));
    const grow = h('div', 'grow');
    const list = h('ul', 'zman-list');
    const show = settings.show || {};
    for (const item of data.items) {
      if (show[item.key] === false) continue;
      const row = h('li', 'zman-row');
      const label = h('span', 'zman-label', item.label);
      const time = h('span', 'zman-time', item.time);
      stylePart(label, settings.type, 'small');
      stylePart(time, settings.type, 'title');
      row.append(label, time);
      list.append(row);
    }
    grow.append(list);
    root.append(grow);
    sizeText.options.set(list, { max: 40 });
    sizeText(list, grow, settings.type);
  };
  paint();
  const observer = new ResizeObserver(() => paint());
  observer.observe(body);
  bag.push(() => observer.disconnect());
  every(30000, paint, bag);
  return () => bag.forEach((fn) => fn());
}

const MOUNTS = {
  date: mountDate,
  shabbos: mountShabbos,
  logo: mountLogo,
  welcome: mountWelcome,
  photos: mountPhotos,
  pdf: mountPdf,
  events: mountEvents,
  text: mountText,
  zmanim: mountZmanim,
};

export async function mountWidget(body, widget, ctx) {
  body.replaceChildren();
  const mount = MOUNTS[widget.type];
  if (!mount) {
    body.append(h('div', 'empty-note', 'Unknown piece'));
    return () => {};
  }
  try {
    return (await mount(body, widget, ctx)) || (() => {});
  } catch (error) {
    body.replaceChildren(h('div', 'empty-note', 'This piece could not be drawn.'));
    console.error(error);
    return () => {};
  }
}

function wallInstant(value) {
  if (!value) return null;
  const [date, time] = String(value).split('T');
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hour, minute] = (time || '00:00').split(':').map(Number);
  return akronWallTimeToDate(year, month, day, hour || 0, minute || 0);
}

export function takeoverActive(takeover, now, force) {
  if (force === '1' || force === 'on' || force === true) return true;
  if (force === '0' || force === 'off' || force === false) return false;
  if (!takeover || !takeover.enabled) return false;
  if (!takeover.scheduleEnabled) return true;
  const start = wallInstant(takeover.start);
  const end = wallInstant(takeover.end);
  const time = now.getTime();
  if (start && time < start.getTime()) return false;
  if (end && time > end.getTime()) return false;
  return true;
}

// A full-screen picture: one image over the whole TV. "Show the whole picture"
// puts a soft, blurred copy behind it so a flyer of any shape fills the screen.
function renderTakeoverImage(host, takeover) {
  const root = h('div', 'takeover takeover-image');
  const url = safeImageUrl(takeover.imageUrl);
  if (!url) {
    root.append(h('div', 'empty-note', 'Add a picture in the editor.'));
    host.append(root);
    return () => host.replaceChildren();
  }
  const fit = takeover.imageFit === 'cover' ? 'cover' : 'contain';
  root.dataset.fit = fit;
  if (fit === 'contain') {
    const back = h('div', 'takeover-image-back');
    back.style.backgroundImage = `url("${url.replace(/"/g, '')}")`;
    root.append(back);
  }
  const img = h('img', 'takeover-image-main');
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.src = url;
  img.style.objectFit = fit;
  root.append(img);
  host.append(root);
  return () => host.replaceChildren();
}

export async function renderTakeover(host, takeover, ctx) {
  host.replaceChildren();
  if (takeover.kind === 'image') return renderTakeoverImage(host, takeover);
  const template = takeover.template || 'classic';
  const root = h('div', `takeover takeover-${template}`);
  let background = '';
  if (takeover.backgroundAssetId) background = await ctx.resolveAsset(takeover.backgroundAssetId);
  if (!background) background = safeImageUrl(takeover.backgroundUrl);
  if (background) {
    root.style.backgroundImage = `url("${background.replace(/"/g, '')}")`;
    root.classList.add('has-photo');
  }
  const scrim = h('div', 'takeover-scrim');
  const copy = h('div', 'takeover-copy');
  if (takeover.eyebrow) copy.append(piece('eyebrow', takeover.eyebrow, takeover.type, 'small'));
  const titleBox = h('div', 'title-box');
  const title = piece('title-fit', takeover.title || '', takeover.type, 'title');
  title.dir = 'auto';
  titleBox.append(title);
  copy.append(titleBox);
  copy.append(h('div', 'rule'));
  if (takeover.subtitle) {
    const sub = piece('takeover-sub', takeover.subtitle, takeover.type, 'body');
    sub.dir = 'auto';
    copy.append(sub);
  }
  if (takeover.details) {
    const details = piece('takeover-details', takeover.details, takeover.type, 'small');
    details.dir = 'auto';
    copy.append(details);
  }
  if (takeover.footer) copy.append(piece('takeover-foot', takeover.footer, takeover.type, 'small'));
  root.append(scrim, copy);
  host.append(root);
  const bag = [];
  watchSize(title, titleBox, bag, {}, takeover.type);
  return () => {
    bag.forEach((fn) => fn());
    host.replaceChildren();
  };
}

export function toneChoices(type) {
  if (type === 'welcome') return [['band', 'Accent bar'], ['navy', 'Dark bar'], ['ivory', 'Light bar']];
  return TONES;
}

export { isCurrentEvent };
