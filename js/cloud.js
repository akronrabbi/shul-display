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
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
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

// The screens poll this one small row. updated_at follows the board.
// editing_at and refresh_at are written only by a signed-in editor.
export async function readWatch(token) {
  const response = await fetch(
    `${DATA_API}/board_watch?id=eq.${encodeURIComponent(BOARD_ID)}&select=updated_at,editing_at,refresh_at`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function markEditing(token, { refresh = false } = {}) {
  const stamp = new Date().toISOString();
  const body = { editing_at: stamp };
  if (refresh) body.refresh_at = stamp;
  const response = await fetch(`${DATA_API}/board_watch?id=eq.${encodeURIComponent(BOARD_ID)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return dataResult(response);
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

function authHeaders(token, prefer) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: prefer || 'return=representation',
  };
}

async function dataResult(response, { allowEmpty = false } = {}) {
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (response.status === 401) return { ok: false, reason: 'signed-out', rows: [] };
  if (response.status === 403) return { ok: false, reason: 'not-editor', rows: [] };
  if (!response.ok) {
    const message = body?.message || body?.error || 'The online board refused that.';
    if (/locked/i.test(String(message))) return { ok: false, reason: 'locked', rows: [] };
    return { ok: false, reason: 'error', message, rows: [] };
  }
  const rows = Array.isArray(body) ? body : [];
  if (!rows.length && !allowEmpty && response.status !== 204) return { ok: false, reason: 'not-editor', rows: [] };
  return { ok: true, rows };
}

export async function pushHistory(token, config) {
  const response = await fetch(`${DATA_API}/board_history`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ config }),
  });
  return dataResult(response);
}

export async function listHistory(token) {
  const response = await fetch(
    `${DATA_API}/board_history?select=id,saved_at,saved_by&order=saved_at.desc,id.desc&limit=30`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return dataResult(response, { allowEmpty: true });
}

export async function readHistory(token, id) {
  const response = await fetch(
    `${DATA_API}/board_history?id=eq.${encodeURIComponent(id)}&select=id,config,saved_at,saved_by`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return dataResult(response);
}

export async function listLayouts(token) {
  const response = await fetch(
    `${DATA_API}/layouts?select=id,name,locked,updated_at,updated_by&order=updated_at.desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return dataResult(response, { allowEmpty: true });
}

export async function readLayout(token, id) {
  const response = await fetch(
    `${DATA_API}/layouts?id=eq.${encodeURIComponent(id)}&select=id,name,locked,config,updated_at,updated_by`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return dataResult(response);
}

export async function writeLayout(token, layout) {
  const response = await fetch(`${DATA_API}/layouts?on_conflict=id`, {
    method: 'POST',
    headers: authHeaders(token, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(layout),
  });
  return dataResult(response);
}

export async function patchLayout(token, id, patch) {
  const response = await fetch(`${DATA_API}/layouts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  });
  return dataResult(response);
}

export async function removeLayout(token, id) {
  const response = await fetch(`${DATA_API}/layouts?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return dataResult(response);
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

// A television reports in when it is idle, about every 45 minutes, so the
// editor can say when it was last seen. The table is in schema/status.sql.
// The live page does not report in. If the table is not set up yet, the call
// fails quietly and the board keeps working.
export async function pingTv(token, tvId, info) {
  const response = await fetch(`${DATA_API}/rpc/tv_ping`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_tv: String(tvId || '').slice(0, 40), p_info: info || {} }),
  });
  return response.ok;
}

export async function readTvStatus(token) {
  const response = await fetch(
    `${DATA_API}/tv_status?select=tv_id,last_seen,info`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { ok: false, rows: [] };
  const rows = await response.json().catch(() => []);
  return { ok: true, rows: Array.isArray(rows) ? rows : [] };
}
