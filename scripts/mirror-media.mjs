// Copy Neon pictures the live board still points at into media/, named by
// their contents, and write promoted-board.json with those site addresses.
//
//   node scripts/mirror-media.mjs
//
// It does not change the online board and it does not commit anything.
// After it finishes: commit the new files in media/, push to main, then in
// the editor choose Import a file, pick promoted-board.json, and Save.
// Screens then load those pictures from this site instead of Neon.
//
// A new upload still goes to Neon first, so a picture can show before anyone
// runs this. Each device keeps that file after the first download. This step
// is only so the monthly Neon transfer stops including it.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonymousToken, readBoard } from '../js/cloud.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = join(root, 'media');
const outFile = join(root, 'promoted-board.json');
const host = 'br-winter-morning-beywmp3z.storage.c-9.us-east-2.aws.neon.tech';

function extension(url, type) {
  const fromUrl = (url.split('?')[0].split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromUrl && fromUrl.length <= 5) return fromUrl;
  if (type?.includes('png')) return 'png';
  if (type?.includes('webp')) return 'webp';
  if (type?.includes('gif')) return 'gif';
  if (type?.includes('pdf')) return 'pdf';
  if (type?.includes('jpeg') || type?.includes('jpg')) return 'jpg';
  return 'bin';
}

const token = await anonymousToken();
const row = await readBoard(token);
if (!row?.config) {
  console.error('The online board could not be read.');
  process.exit(1);
}

let text = JSON.stringify(row.config);
const urls = [...new Set(text.match(/https?:\/\/[^"\\\s]+/g) || [])].filter((url) => {
  try { return new URL(url).hostname === host; } catch { return false; }
});

await mkdir(mediaDir, { recursive: true });
let bytes = 0;
for (const url of urls) {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Skipped ${response.status} ${url}`);
    continue;
  }
  const buf = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const name = `${hash}.${extension(url, response.headers.get('content-type'))}`;
  await writeFile(join(mediaDir, name), buf);
  text = text.split(url).join(`media/${name}`);
  bytes += buf.length;
  console.log(`${name}  ${buf.length}  ${url.split('/').pop()}`);
}

await writeFile(outFile, JSON.stringify(JSON.parse(text), null, 2));
console.log(`Wrote ${urls.length} picture${urls.length === 1 ? '' : 's'} (${bytes} bytes) and ${outFile}`);
console.log('Next: commit media/, push, then Import promoted-board.json in the editor and Save.');
