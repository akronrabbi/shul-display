// Google Photos shared album links cannot be read from a static page. The
// editor uses Google's Photos Picker instead (js/gphotos.js).
// Uploads and direct image addresses work. Public Google Drive file links
// are rewritten to a lh3 image address, which a plain <img> can show.

const PHOTOS_ALBUM = /photos\.app\.goo\.gl|photos\.google\.com\/(?:share|album|u\/\d+\/album)/i;

export function siteMediaUrl(value) {
  return /^(?:\.\/)?media\/[a-f0-9]{16}\.[a-z0-9]+$/i.test(String(value || '').trim());
}

export function safeImageUrl(value) {
  if (!value) return '';
  const url = String(value).trim();
  if (url.startsWith('assets/') || url.startsWith('./assets/')) return url;
  if (siteMediaUrl(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return url;
  return '';
}

export function driveFileToImage(url) {
  const file = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  const open = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  const query = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const id = (file || open || query)?.[1];
  if (!id || !/drive\.google\.com/i.test(url)) return null;
  return `https://lh3.googleusercontent.com/d/${id}=w2400`;
}

export function classifyImageLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  if (PHOTOS_ALBUM.test(raw)) return { error: 'photos-album', raw };
  const drive = driveFileToImage(raw);
  if (drive) return { url: drive };
  const safe = safeImageUrl(raw);
  if (safe) return { url: safe };
  return { error: 'bad-url', raw };
}

export function classifyImageList(text) {
  const images = [];
  const errors = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const item = classifyImageLine(line);
    if (!item) continue;
    if (item.url) images.push({ url: item.url });
    else errors.push(item);
  }
  return { images, errors };
}

export const PHOTOS_HELP =
  'Show a Google Photos album that updates on its own, copy in photos from Google Photos, upload pictures, paste image addresses, or point this piece at a Google Drive folder.';
