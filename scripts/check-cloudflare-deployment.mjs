import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = new URL(process.argv[2]);
if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1') throw Error('Use HTTPS for remote verification.');
const latest = JSON.parse(await readFile('release/cloudflare/latest.json', 'utf8'));
const directory = resolve(latest.directory);
const expected = JSON.parse(await readFile(resolve(directory, 'release-build.json'), 'utf8'));
const response = await fetch(new URL('release-build.json', base), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error(`Manifest HTTP ${response.status}`);
const actual = await response.json();
if (actual.version !== expected.version || JSON.stringify(actual.files) !== JSON.stringify(expected.files))
  throw Error(`Release mismatch: expected ${expected.version}, got ${actual.version}`);
let next = 0;
let checked = 0;
const files = [...expected.files, 'release-build.json', 'fonts/novecento/RhineLabNovecento.css'];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < files.length) {
    const path = files[next++];
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.equals(await readFile(resolve(directory, path)))) throw Error(`${path}: content mismatch`);
    const cache = response.headers.get('cache-control') ?? '';
    if (/^assets\/cd-jewel-case(-(assembly|shelf))?\.[a-f0-9]{16}\.glb$/.test(path) && !cache.includes('immutable'))
      throw Error(`${path}: missing immutable cache policy`);
    if (path === 'index.html' && !cache.includes('no-store'))
      throw Error(`${path}: HTML entry must not be stored by intermediary caches`);
    checked++;
  }
}));
const missing = await fetch(new URL('missing-cloudflare-verification.woff2', base), { signal: AbortSignal.timeout(30000) });
if (missing.status !== 404) throw Error(`Missing file returns ${missing.status}, expected 404`);
console.log(JSON.stringify({ url: base.href, version: actual.version, verifiedFiles: checked, allBytesMatch: true, missingFileStatus: missing.status }, null, 2));
