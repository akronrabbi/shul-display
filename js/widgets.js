import { akronWallTimeToDate } from './calendar.js';
import { upcomingEvents, formatClockNumbers, eventDateParts, isCurrentEvent } from './events.js';
import { safeImageUrl, PHOTOS_HELP } from './images.js';
import { driveRefreshMs, explainDriveError, listDriveFolderImages } from './drive.js';

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
  ['ivory', 'Ivory'],
  ['navy', 'Navy'],
  ['burgundy', 'Burgundy'],
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
        showName: true,
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
        fit: 'cover',
        driveFolder: '',
        driveApiKey: '',
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

function hebrewLine(className, text) {
  const node = h('div', `hebrew-line ${className}`);
  const bdi = document.createElement('bdi');
  bdi.lang = 'he';
  bdi.dir = 'rtl';
  bdi.textContent = text;
  node.append(bdi);
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

function watchFit(el, box, bag, options) {
  const run = () => fitBox(el, box, options);
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
    root.append(h('div', 'eyebrow', 'Today'));
    if (settings.showClock !== false) {
      const clock = h('div', 'clock js-clock', ctx.calendar.formatTime(now));
      root.append(clock);
    }
    if (settings.showEnglish !== false) {
      root.append(h('div', 'weekday', he.weekday));
      root.append(h('div', 'civil', he.dateLine));
    }
    if (settings.showHebrew !== false) {
      root.append(h('div', 'rule'));
      const line = settings.hebrewStyle === 'plain' ? he.plain : he.hebrew;
      root.append(hebrewLine('date-he', line));
    }
    if (settings.showTranslit !== false) root.append(h('div', 'translit', he.translit));
    if (settings.showParsha !== false && shabbos?.parsha) {
      root.append(h('div', 'parsha-en', shabbos.parsha.en));
      if (shabbos.parsha.he) root.append(hebrewLine('parsha-he', shabbos.parsha.he));
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

  const paint = () => {
    const info = ctx.calendar.shabbos(ctx.now(), settings);
    root.replaceChildren();
    root.append(h('div', 'eyebrow', settings.heading || 'Shabbos'));
    if (settings.showParsha !== false && info?.parsha) {
      root.append(h('div', 'parsha-en', info.parsha.en));
      if (settings.showHebrewParsha !== false && info.parsha.he) {
        root.append(hebrewLine('parsha-he', info.parsha.he));
      }
    }
    const times = h('div', 'shabbos-times');
    if (!info) {
      times.append(h('p', 'quiet', 'Times are not available right now.'));
    } else {
      times.append(timeBlock('Candle lighting', info.candles.time, info.candles.when));
      times.append(timeBlock('Havdalah', info.havdalah.time, info.havdalah.when));
    }
    root.append(times);
  };

  paint();
  every(30000, paint, bag);
  return () => bag.forEach((fn) => fn());
}

function timeBlock(label, time, when) {
  const block = h('div', 'time-block');
  block.append(h('div', 'time-label', label));
  block.append(h('div', 'time-value', time));
  block.append(h('div', 'time-when', when));
  return block;
}

async function mountLogo(body, widget, ctx) {
  const settings = widget.settings;
  const root = h('div', 'logo-card');
  const src = await resolveUrl(ctx, settings.assetId, settings.url);
  if (src) {
    const img = h('img', 'logo-img');
    img.alt = settings.name || 'Logo';
    img.src = src;
    root.append(img);
  }
  if (settings.showName !== false && settings.name) root.append(h('div', 'logo-name', settings.name));
  if (settings.subtitle) root.append(h('div', 'logo-sub', settings.subtitle));
  body.append(root);
  return () => {};
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
    track.append(chunk(text));
    track.append(chunk(text));
    root.append(track);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      track.style.animation = 'none';
    }
  } else {
    const box = h('div', 'welcome-still');
    const line = h('div', 'welcome-line', text);
    line.dir = 'auto';
    box.append(line);
    root.append(box);
    watchFit(line, box, bag, { line: true });
  }
  body.append(root);
  return () => bag.forEach((fn) => fn());
}

function chunk(text) {
  const node = h('span', 'welcome-chunk', text);
  node.dir = 'auto';
  return node;
}

async function collectPhotoUrls(settings, ctx) {
  const urls = [];
  for (const image of settings.images || []) {
    const url = image.assetId ? await ctx.resolveAsset(image.assetId) : safeImageUrl(image.url);
    if (url) urls.push(url);
  }
  let driveError = null;
  if (String(settings.driveFolder || '').trim()) {
    try {
      const listed = await listDriveFolderImages(settings.driveFolder, settings.driveApiKey);
      for (const image of listed) urls.push(image.url);
    } catch (error) {
      driveError = error;
    }
  }
  return { urls, driveError };
}

async function mountPhotos(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const urls = [];
  const root = h('div', 'photos');
  const note = h('div', 'empty-note', 'Looking for photos...');
  const fit = settings.fit === 'contain' ? 'contain' : 'cover';
  const a = h('img', 'photo');
  const b = h('img', 'photo');
  a.alt = '';
  b.alt = '';
  a.referrerPolicy = 'no-referrer';
  b.referrerPolicy = 'no-referrer';
  a.style.objectFit = fit;
  b.style.objectFit = fit;
  root.append(a, b, note);
  body.append(root);

  let index = 0;
  let front = a;
  let slideTimer = 0;
  const fade = settings.crossfade !== false;
  const step = () => {
    if (urls.length < 2) return;
    index = (index + 1) % urls.length;
    const next = front === a ? b : a;
    next.src = urls[index];
    if (fade) {
      next.classList.add('on');
      front.classList.remove('on');
    } else {
      a.classList.toggle('on', next === a);
      b.classList.toggle('on', next === b);
    }
    front = next;
  };
  const ensureSlides = () => {
    if (slideTimer || urls.length < 2) return;
    const ms = Math.max(2, Number(settings.interval) || 8) * 1000;
    slideTimer = setInterval(step, ms);
    bag.push(() => clearInterval(slideTimer));
  };
  const show = () => {
    note.hidden = urls.length > 0;
    if (!urls.length) return;
    if (!a.getAttribute('src')) {
      a.src = urls[0];
      a.classList.add('on');
      front = a;
      index = 0;
    } else if (index >= urls.length) {
      index = 0;
    }
    ensureSlides();
  };
  const reload = async () => {
    const found = await collectPhotoUrls(settings, ctx);
    urls.splice(0, urls.length, ...found.urls);
    if (!urls.length) {
      note.hidden = false;
      if (found.driveError) note.textContent = explainDriveError(found.driveError);
      else if (String(settings.driveFolder || '').trim()) note.textContent = 'That folder has no pictures yet.';
      else note.textContent = 'Add photos in the editor.';
    }
    show();
  };
  await reload();
  if (String(settings.driveFolder || '').trim()) {
    every(driveRefreshMs(), () => { reload(); }, bag);
  }
  return () => bag.forEach((fn) => fn());
}

let pdfjsPromise;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
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
      pageNum = pageNum % pdf.numPages + 1;
      draw();
    }, bag);
  }
  bag.push(() => pdf.destroy());
  return () => bag.forEach((fn) => fn());
}

function mountEvents(body, widget, ctx) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque events-card');
  const eyebrow = h('div', 'eyebrow', settings.heading || 'Upcoming');
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
        when.append(h('div', 'event-dow', parts.dow));
        when.append(h('div', 'event-day', parts.day));
        when.append(h('div', 'event-month', parts.month));
        const what = h('div', 'event-what');
        const title = h('div', 'event-title', event.title);
        title.dir = 'auto';
        what.append(title);
        const metaBits = [formatClockNumbers(event.time), event.location, event.note].filter(Boolean);
        if (metaBits.length) {
          const meta = h('div', 'event-meta', metaBits.join('  -  '));
          meta.dir = 'auto';
          what.append(meta);
        }
        row.append(when, what);
        list.append(row);
      }
    }
    fitBox(list, grow, { max: 76 });
  };

  paint();
  watchFit(list, grow, bag, { max: 76 });
  every(30000, paint, bag);
  return () => bag.forEach((fn) => fn());
}

function mountText(body, widget) {
  const bag = [];
  const settings = widget.settings;
  const root = h('div', 'plaque text-card');
  if (settings.eyebrow) root.append(h('div', 'eyebrow', settings.eyebrow));
  const grow = h('div', 'grow');
  const block = h('div', 'text-fit');
  if (settings.title) {
    const title = h('div', 'text-title', settings.title);
    title.dir = 'auto';
    block.append(title);
  }
  if (settings.body) {
    const copy = h('div', 'text-body');
    copy.dir = 'auto';
    String(settings.body).split('\n').forEach((line, index) => {
      if (index) copy.append(document.createElement('br'));
      copy.append(document.createTextNode(line));
    });
    block.append(copy);
  }
  grow.append(block);
  root.append(grow);
  body.append(root);
  watchFit(block, grow, bag, { max: 68 });
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
    root.append(h('div', 'eyebrow', settings.heading || 'Zmanim'));
    if (data.afterSunset) root.append(h('div', 'quiet zman-note', 'After sunset, these are tomorrow'));
    root.append(hebrewLine('zman-he', 'זְמַנִּים'));
    const grow = h('div', 'grow');
    const list = h('ul', 'zman-list');
    const show = settings.show || {};
    for (const item of data.items) {
      if (show[item.key] === false) continue;
      const row = h('li', 'zman-row');
      row.append(h('span', 'zman-label', item.label));
      row.append(h('span', 'zman-time', item.time));
      list.append(row);
    }
    grow.append(list);
    root.append(grow);
    fitBox(list, grow, { max: 40 });
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

export async function renderTakeover(host, takeover, ctx) {
  host.replaceChildren();
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
  if (takeover.eyebrow) copy.append(h('div', 'eyebrow', takeover.eyebrow));
  const titleBox = h('div', 'title-box');
  const title = h('div', 'title-fit', takeover.title || '');
  title.dir = 'auto';
  titleBox.append(title);
  copy.append(titleBox);
  copy.append(h('div', 'rule'));
  if (takeover.subtitle) {
    const sub = h('div', 'takeover-sub', takeover.subtitle);
    sub.dir = 'auto';
    copy.append(sub);
  }
  if (takeover.details) {
    const details = h('div', 'takeover-details', takeover.details);
    details.dir = 'auto';
    copy.append(details);
  }
  if (takeover.footer) copy.append(h('div', 'takeover-foot', takeover.footer));
  root.append(scrim, copy);
  host.append(root);
  const bag = [];
  watchFit(title, titleBox, bag);
  return () => {
    bag.forEach((fn) => fn());
    host.replaceChildren();
  };
}

export function toneChoices(type) {
  if (type === 'welcome') return [['band', 'Burgundy band'], ['navy', 'Navy band'], ['ivory', 'Ivory band']];
  return TONES;
}

export { isCurrentEvent };
