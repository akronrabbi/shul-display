// Google Photos, through Google's Photos Picker.
//
// Google no longer lets a website read a shared album from its link (that ended
// on 31 March 2025). What still works is the Picker: the editor signs in to
// Google, Google opens its own Photos window, and the person picks pictures, or
// opens an album and selects all of it. The editor then copies those pictures
// into this board's media storage, so the television never needs Google again.
//
// This needs a Google OAuth client ID (not a secret) with the Photos Picker API
// turned on. The steps are shown in the Photos piece in the editor.

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const API = 'https://photospicker.googleapis.com/v1';
const GIS = 'https://accounts.google.com/gsi/client';

let gisPromise = null;
let accessToken = '';
let tokenExpires = 0;

function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisPromise = null;
        reject(new Error('Google sign-in could not be loaded. Check the connection.'));
      };
      document.head.append(script);
    });
  }
  return gisPromise;
}

export function photosConnected() {
  return Boolean(accessToken) && Date.now() < tokenExpires - 60000;
}

// Must run from a click, because Google opens a sign-in window.
export async function connectPhotos(clientId) {
  const id = String(clientId || '').trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) {
    throw new Error('Paste the Google client ID first. It ends in .apps.googleusercontent.com.');
  }
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (response) => {
        if (response?.error || !response?.access_token) {
          reject(new Error(explain(response?.error_description || response?.error || 'Google did not allow access.')));
          return;
        }
        accessToken = response.access_token;
        tokenExpires = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        resolve(true);
      },
      error_callback: (error) => {
        reject(new Error(error?.type === 'popup_closed' ? 'The Google window was closed before you finished.' : explain(error?.message || 'Google sign-in did not finish.')));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

function explain(message) {
  const text = String(message || '');
  if (/origin|redirect_uri|invalid_client/i.test(text)) {
    return 'Google refused this website for that client ID. Add https://akronrabbi.github.io under Authorized JavaScript origins.';
  }
  if (/access_denied/i.test(text)) return 'Access was not allowed. If the app is in testing, add your Google address as a test user.';
  if (/has not been used|disabled|SERVICE_DISABLED/i.test(text)) return 'Turn on the Google Photos Picker API in the Google Cloud project, then try again.';
  return text;
}

async function call(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return {};
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(explain(body?.error?.message || `Google Photos answered ${response.status}.`));
  return body;
}

function seconds(duration, fallback) {
  const n = Number.parseFloat(String(duration || '').replace('s', ''));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Opens Google's picker and resolves with the picked photos. The window is
// opened first, inside the click, so the browser does not block it.
export async function pickPhotos({ onStatus = () => {} } = {}) {
  if (!photosConnected()) throw new Error('Connect Google Photos first.');
  const popup = window.open('', 'google-photos-picker', 'width=1100,height=800');
  let session;
  try {
    session = await call('/sessions', { method: 'POST', body: '{}' });
  } catch (error) {
    if (popup) popup.close();
    throw error;
  }
  const url = `${session.pickerUri}/autoclose`;
  if (popup) popup.location.href = url;
  else window.open(url, '_blank');
  onStatus('Choose photos in the Google window. To use an album, open it there and select its pictures. Press Done when finished.');
  const interval = seconds(session.pollingConfig?.pollInterval, 3) * 1000;
  const limit = Date.now() + seconds(session.pollingConfig?.timeoutIn, 1800) * 1000;
  let ready = false;
  while (Date.now() < limit) {
    await wait(interval);
    const state = await call(`/sessions/${encodeURIComponent(session.id)}`);
    if (state.mediaItemsSet) {
      ready = true;
      break;
    }
    if (popup && popup.closed && !state.mediaItemsSet) {
      // Give Google a moment to record the choice after the window closes.
      await wait(1500);
      const again = await call(`/sessions/${encodeURIComponent(session.id)}`);
      if (again.mediaItemsSet) ready = true;
      break;
    }
  }
  if (!ready) {
    call(`/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' }).catch(() => {});
    throw new Error('No photos were chosen.');
  }
  const items = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ sessionId: session.id, pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await call(`/mediaItems?${query}`);
    for (const item of page.mediaItems || []) {
      const file = item.mediaFile || {};
      if (item.type && item.type !== 'PHOTO') continue;
      if (!file.baseUrl) continue;
      items.push({ id: item.id, baseUrl: file.baseUrl, mimeType: file.mimeType || 'image/jpeg', filename: file.filename || 'photo.jpg' });
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return { sessionId: session.id, items };
}

// Download one picked photo at TV size. Google needs the same sign-in for this.
export async function downloadPhoto(item) {
  const response = await fetch(`${item.baseUrl}=w2400-h2400`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('A photo could not be downloaded from Google.');
  const blob = await response.blob();
  const name = item.filename.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([blob], name, { type: blob.type || item.mimeType || 'image/jpeg' });
}

export async function endPickSession(sessionId) {
  if (!sessionId) return;
  try {
    await call(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  } catch { /* the session expires on its own */ }
}
