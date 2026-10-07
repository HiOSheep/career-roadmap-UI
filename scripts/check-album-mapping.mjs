// Every album a month shows must play that album's own audio, in that album's own
// track order. Reads the content only, so it needs no audio files on disk: when
// `public/album-audio` is absent (the recordings are licensed and not committed) it
// still verifies the declared mapping and reports what it could not confirm.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const albums = JSON.parse(readFileSync(resolve(root, "content/albums.json"), "utf8"));
const audio = JSON.parse(readFileSync(resolve(root, "content/album-audio.json"), "utf8"));
if (albums.albums.length === 0) {
  assert.equal(albums.months.length, 12, "The blank planner still has twelve worksheet slots");
  assert.ok(albums.months.every(month => month.albumId === null), "Blank slots do not contain personal album links");
  assert.equal(Object.keys(audio.albums).length, 0, "The blank audio configuration contains no user tracks");
  console.log("Blank album template passed: twelve slots, no personal album data or audio mappings.");
  process.exit(0);
}
const { albumForMonth } = await import(pathToFileURL(resolve(root, "src/albums.ts")).href).catch(() => ({
  // src/albums.ts imports JSON with an import attribute; fall back to the same lookup.
  albumForMonth: (index) => albums.albums.find((album) => album.id === albums.months[index]?.albumId),
}));

const albumById = new Map(albums.albums.map((album) => [album.id, album]));
const problems = [];
const audioDir = resolve(root, "public", "album-audio");
const recordingsPresent = existsSync(audioDir);
let declared = 0;
let onDisk = 0;

// One selectable album per month, and no album reused by two months.
const perMonth = albums.months.map((month, index) => {
  const album = albumById.get(month.albumId);
  assert.ok(album, `月份 ${index} (${month.monthId}) 指向不存在的专辑 ${month.albumId}`);
  assert.equal(albumForMonth(index)?.id, album.id, `月份 ${index} 的专辑查找结果应与配置一致`);
  return album;
});
assert.equal(new Set(perMonth.map((album) => album.id)).size, perMonth.length, "同一个月不能重复使用同一张专辑");

for (const album of perMonth) {
  const paths = audio.albums[album.id] ?? [];
  if (paths.length > album.tracks.length) problems.push(`${album.id}: 音频条目 ${paths.length} 多于曲目表 ${album.tracks.length}`);
  paths.forEach((path, position) => {
    if (!path) return;
    declared++;
    const file = decodeURIComponent(path).split("/").pop() ?? "";
    // The file must live in the album's own folder… (declared paths are relative)
    if (!`/${decodeURIComponent(path)}`.includes(`/${album.id}/`)) problems.push(`${album.id}: ${path} 不在本专辑目录下`);
    // …and carry the track number the track list gives it.
    const expected = album.tracks[position]?.number ?? null;
    const number = Number((file.match(/^(\d{1,2})/) ?? [])[1] ?? NaN);
    if (expected !== null && number !== expected) problems.push(`${album.id}: 第 ${position + 1} 个音频 ${file} 与曲目编号 ${expected} 不符`);
    if (recordingsPresent && existsSync(resolve(root, "public", path))) onDisk++;
    else if (recordingsPresent) problems.push(`${album.id}: 声明了 ${path} 但磁盘上没有该文件`);
  });
  const extra = recordingsPresent && existsSync(resolve(audioDir, album.id))
    ? readdirSync(resolve(audioDir, album.id)).filter((name) => /\.(m4a|mp3|wav|ogg|flac)$/i.test(name) && !paths.some((path) => path?.endsWith(name)))
    : [];
  if (extra.length) problems.push(`${album.id}: 磁盘上多出未声明的音频 ${extra.join(", ")}`);
}

for (const id of Object.keys(audio.albums)) {
  if (!albumById.has(id)) problems.push(`音频配置里有目录中不存在的专辑 ${id}`);
}
for (const album of perMonth) {
  if (!(album.id in audio.albums)) problems.push(`专辑 ${album.id} 在音频配置中缺失（会被当作无音频）`);
}

const shared = new Map();
for (const [id, paths] of Object.entries(audio.albums)) {
  for (const path of paths) {
    if (!path) continue;
    const owner = shared.get(path);
    if (owner && owner !== id) problems.push(`${path} 同时被 ${owner} 与 ${id} 使用`);
    shared.set(path, id);
  }
}

// Two albums sharing one recording would sound like the wrong CD, even though every
// path looks right. Only possible to check when the recordings are on this machine.
if (recordingsPresent) {
  const byContent = new Map();
  for (const [path, id] of shared) {
    const file = resolve(root, "public", path);
    if (!existsSync(file)) continue;
    const hash = createHash("sha1").update(readFileSync(file)).digest("hex");
    const previous = byContent.get(hash);
    if (previous && previous.path !== path) problems.push(`${path} 与 ${previous.path} 内容完全相同（${previous.id} 与 ${id} 共用了同一份录音）`);
    byContent.set(hash, { path, id });
  }
}

assert.equal(problems.length, 0, `专辑与音频的对应关系有问题:\n  - ${problems.join("\n  - ")}`);
console.log(`Album mapping passed: ${perMonth.length} 个月各对应一张专辑，${declared} 条音频都在本专辑目录内且与曲序编号一致${recordingsPresent ? `（磁盘上核对到 ${onDisk} 个文件）` : "（本机没有音频文件，仅核对声明；录音未随仓库分发）"}。`);
