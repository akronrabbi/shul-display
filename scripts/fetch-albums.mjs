// Run by .github/workflows/pages.yml before each deploy and every 15 minutes.
// Reads the online board, finds Google Photos album links in Photos pieces,
// reads each shared album page, and writes albums/<key>.json for the site.
// If an album cannot be read, the last good list (from the live site) is kept.
// Prints changed=true|false to $GITHUB_OUTPUT so a scheduled run that found
// nothing new does not redeploy.

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { albumKey, albumLinksInBoard, parseAlbumPage } from '../js/albums.js';

const DATA_API = 'https://ep-holy-frost-be82ws2t.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1';
const AUTH_URL = 'https://ep-holy-frost-be82ws2t.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth';
const SITE = process.env.SITE_URL || 'https://akronrabbi.github.io/shul-display';
const OUT = new URL('../albums/', import.meta.url);
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function readBoard() {
  try {
    const pass = await (await fetch(`${AUTH_URL}/token/anonymous`)).json();
    const rows = await (await fetch(`${DATA_API}/boards?id=eq.main&select=config`, {
      headers: { Authorization: `Bearer ${pass.token}` },
    })).json();
    if (rows?.[0]?.config) return rows[0].config;
  } catch (error) {
    console.log('Online board could not be read:', error.message);
  }
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
}

async function live(path) {
  try {
    const response = await fetch(`${SITE}/${path}`, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function readAlbum(link) {
  const response = await fetch(link, { redirect: 'follow', headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!response.ok) throw new Error(`Google answered ${response.status}`);
  return parseAlbumPage(await response.text());
}

const board = await readBoard();
const links = albumLinksInBoard(board);
console.log(`Album links on the board: ${links.length}`);
await mkdir(OUT, { recursive: true });
const index = { checkedAt: new Date().toISOString(), albums: [] };
let changed = false;

for (const link of links) {
  const key = albumKey(link);
  const previous = await live(`albums/${key}.json`);
  let record;
  try {
    const album = await readAlbum(link);
    if (!album.photos.length) throw new Error('No photos were found on the album page. Is it shared by link?');
    record = { link, key, title: album.title, checkedAt: index.checkedAt, ok: true, photos: album.photos };
    console.log(`${key}: ${album.photos.length} photos (${album.title || 'untitled'})`);
  } catch (error) {
    console.log(`${key}: could not read (${error.message}). Keeping the last good list.`);
    record = { ...(previous || { link, key, title: '', photos: [] }), checkedAt: index.checkedAt, ok: false, error: error.message };
  }
  const before = JSON.stringify(previous?.photos || []) + (previous?.title || '') + String(previous?.ok);
  const after = JSON.stringify(record.photos) + record.title + String(record.ok);
  if (before !== after) changed = true;
  await writeFile(new URL(`${key}.json`, OUT), JSON.stringify(record));
  index.albums.push({ key, link, title: record.title, count: record.photos.length, ok: record.ok });
}

const previousIndex = await live('albums/index.json');
const keys = (list) => JSON.stringify((list || []).map((item) => item.key).sort());
if (keys(previousIndex?.albums) !== keys(index.albums)) changed = true;
await writeFile(new URL('index.json', OUT), JSON.stringify(index));
console.log(`changed=${changed}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
