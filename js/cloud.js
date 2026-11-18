// Browser-safe Neon endpoints. No secrets live here.

export const DATA_API = 'https://ep-holy-frost-be82ws2t.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1';
export const AUTH_URL = 'https://ep-holy-frost-be82ws2t.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth';
export const MEDIA_FN = 'https://br-winter-morning-beywmp3z-media.compute.c-9.us-east-2.aws.neon.tech';
export const BOARD_ID = 'main';

let anonToken = '';
let anonExpires = 0;

export function boardHasLayout(config) {
  if (!config || typeof config !== 'object') return false;
  const screensOf = (screens) => (screens || []).some((screen) => (screen.widgets || []).length);
  if (Array.isArray(config.tvs)) return config.tvs.some((tv) => screensOf(tv.screens));
  return screensOf(config.screens);
}

export function jwtExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload));
    return Number(json.exp) * 1000;
  } catch {
    return 0;
  }
}

export async function anonymousToken() {
  if (anonToken && Date.now() < anonExpires - 120000) return anonToken;
  const response = await fetch(`${AUTH_URL}/token/anonymous`, { credentials: 'include' });
  if (!response.ok) throw new Error('The television could not get a reading pass.');
  const body = await response.json();
  if (!body.token) throw new Error('The television could not get a reading pass.');
  anonToken = body.token;
  anonExpires = jwtExpiry(anonToken) || (Date.now() + 50 * 60 * 1000);
  return anonToken;
}

export async function readBoard(token, { stampOnly = false } = {}) {
  const select = stampOnly ? 'updated_at' : 'config,updated_at';
  const response = await fetch(
    `${DATA_API}/boards?id=eq.${encodeURIComponent(BOARD_ID)}&select=${select}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('The online board could not be read.');
  const rows = await response.json();
  return rows[0] || null;
}

export async function writeBoard(token, config) {
  const response = await fetch(`${DATA_API}/boards?on_conflict=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ id: BOARD_ID, config }),
  });
  if (response.status === 401) return { ok: false, reason: 'signed-out' };
  if (response.status === 403) return { ok: false, reason: 'not-editor' };
  let rows = [];
  try { rows = await response.json(); } catch { rows = []; }
  if (!response.ok) return { ok: false, reason: 'error', message: rows.message || 'The online board refused the save.' };
  if (!Array.isArray(rows) || !rows.length) return { ok: false, reason: 'not-editor' };
  return { ok: true, updated_at: rows[0].updated_at, updated_by: rows[0].updated_by };
}

export async function uploadMedia(token, file) {
  const response = await fetch(`${MEDIA_FN}/presign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name || 'file',
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('Sign in with an editor address before you upload.');
  if (!response.ok) throw new Error(body.error || 'The file could not be prepared for upload.');
  const put = await fetch(body.uploadUrl, { method: 'PUT', headers: body.headers, body: file });
  if (!put.ok) throw new Error('The file did not finish uploading.');
  return { url: body.publicUrl, key: body.key };
}
