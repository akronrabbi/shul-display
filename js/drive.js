// Listing a Drive folder from a static page needs a Drive API key.
// The folder page itself is not readable from the browser (Google sends no
// CORS header). files.list is, once a key is present. Picture bytes then load
// from lh3, which works for a folder shared as "anyone with the link".

const REFRESH_MS = 10 * 60 * 1000;
const PAGE_CAP = 4;

export function driveRefreshMs() {
  return REFRESH_MS;
}

export function parseDriveFolderId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const folder = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folder) return folder[1];
  const query = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (query && /drive\.google\.com/i.test(raw)) return query[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return '';
}

export function driveImageUrl(id) {
  return `https://lh3.googleusercontent.com/d/${id}=w2000`;
}

export function explainDriveError(error) {
  const message = String(error && error.message ? error.message : error || '');
  if (/API key not valid/i.test(message)) {
    return 'Google says that key is not valid. Check the key, and that the Google Drive API is turned on.';
  }
  if (/referer|referrer/i.test(message)) {
    return 'Google blocked the key on this website. Add https://akronrabbi.github.io/* under the key\'s website list.';
  }
  if (/File not found|notFound/i.test(message)) {
    return 'Google cannot see that folder. Share it as Anyone with the link, and paste the folder link rather than one file.';
  }
  if (/Permission denied|forbidden|ACCESS_DENIED/i.test(message)) {
    return 'Google refused the request. Check the key, and share the folder as Anyone with the link.';
  }
  return message || 'The folder could not be read.';
}

export async function listDriveFolderImages(folderId, apiKey) {
  const id = parseDriveFolderId(folderId);
  const key = String(apiKey || '').trim();
  if (!id) throw new Error('That does not look like a Google Drive folder link.');
  if (!key) throw new Error('Paste the Google API key for this folder.');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('That folder link is not one this page can use.');

  const images = [];
  let pageToken = '';
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${id}' in parents and trashed = false and mimeType contains 'image/'`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType)');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('key', key);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    let response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error('The folder could not be reached. Check the connection.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || 'The folder could not be read.');
    }
    for (const file of data.files || []) {
      if (!file.id || !String(file.mimeType || '').startsWith('image/')) continue;
      images.push({ id: file.id, name: file.name || 'Photo', url: driveImageUrl(file.id) });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  images.sort((a, b) => a.name.localeCompare(b.name));
  return images;
}
