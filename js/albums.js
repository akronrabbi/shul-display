// Google Photos album links. Google no longer lets an app read an album, but a
// link-shared album is a public web page that lists its photos. A browser page
// cannot read that page (Google sends no CORS header), so a scheduled GitHub
// job (scripts/fetch-albums.mjs) reads it and publishes the photo list next to
// the site, as albums/<key>.json. The TV and the editor read that file.
// This is not an official Google feature, so the reader is kept small and
// forgiving, and the last good list is kept if a check fails.

const ALBUM_LINK = /^https:\/\/(photos\.app\.goo\.gl\/[A-Za-z0-9_-]+|photos\.google\.com\/(u\/\d+\/)?share\/[A-Za-z0-9_-]+(\?key=[A-Za-z0-9_-]+)?)/;

export function cleanAlbumLink(value) {
  const raw = String(value || '').trim();
  const match = raw.match(ALBUM_LINK);
  return match ? match[0] : '';
}

export function isAlbumLink(value) {
  return Boolean(cleanAlbumLink(value));
}

// A short, stable name for an album's file. The same in the browser and in Node.
export function albumKey(link) {
  const text = cleanAlbumLink(link);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// Photo addresses on a shared-album page look like
//   ["https://lh3.googleusercontent.com/pw/AP1Gcz...",4032,3024,...
// The owner's picture uses /a/ rather than /pw/, so it is left out.
export function parseAlbumPage(html) {
  const text = String(html || '');
  const found = new Map();
  const pattern = /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+)",(\d+),(\d+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const url = match[1];
    if (!found.has(url)) found.set(url, { url, w: Number(match[2]), h: Number(match[3]) });
  }
  const title = (text.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '';
  return { title: decodeEntities(title), photos: [...found.values()] };
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Sized for a TV. Google serves any size from the same address.
export function albumPhotoUrl(url, size = 2048) {
  return `${url}=w${size}-h${size}`;
}

// Every album link used anywhere on the board.
export function albumLinksInBoard(config) {
  const links = new Set();
  for (const tv of config?.tvs || []) {
    for (const screen of tv.screens || []) {
      for (const widget of screen.widgets || []) {
        const link = cleanAlbumLink(widget?.settings?.albumLink);
        if (widget?.type === 'photos' && link) links.add(link);
      }
    }
  }
  return [...links];
}
