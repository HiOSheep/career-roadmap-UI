import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARCHIVE_COVER_DESATURATION,
  ARCHIVE_COVER_FILM,
  ARCHIVE_COVER_FILM_DARK,
  ARCHIVE_COVER_VEIL,
  ARCHIVE_COVER_WIPE,
  applyCoverVeil,
  coverVeilAt,
  coverVeilMix,
} from "../src/archive-veil.ts";
const data = JSON.parse(await readFile(new URL("../content/albums.json", import.meta.url), "utf8"));
const audio = JSON.parse(await readFile(new URL("../content/album-audio.json", import.meta.url), "utf8"));
assert.equal(data.months.length, 12, "The planner retains twelve empty monthly slots");
assert.equal(new Set(data.months.map(month => month.monthId)).size, 12);
assert.ok(data.months.every(month => month.albumId === null), "The blank template has no linked personal albums");
assert.deepEqual(data.albums, [], "The album catalog starts empty");
assert.deepEqual(audio.albums, {}, "The audio mapping starts empty");
console.log("Album template: twelve blank monthly slots; no personal covers, track lists or recordings.");
// The booklet is the lid's inside face: the cover belongs outside it. Nothing in
// this suite can see the mesh, so the guard reads the factory that builds it.
const artworkSource = await readFile(new URL("../src/album-artwork.ts", import.meta.url), "utf8");
const bookletFactory = artworkSource.slice(
  artworkSource.indexOf("export function albumBookletMesh"),
  artworkSource.indexOf("export function albumDiscMesh"),
);
assert.ok(bookletFactory.length > 0, "The booklet factory is where this check expects it");
assert.ok(!bookletFactory.includes("map:"), "The booklet's inside face carries no cover image");
assert.ok(bookletFactory.includes("BOOKLET_STOCK"), "It is plain stock instead");
assert.ok(
  artworkSource.slice(
    artworkSource.indexOf("export function albumArtworkMesh"),
    artworkSource.indexOf("export function albumBookletMesh"),
  ).includes("map: texture"),
  "The cover still sits on the outside of the lid",
);

// The frost installer chains the material's own hooks. Three's default
// `customProgramCacheKey` reads `this.onBeforeCompile`, so calling the previous
// key without a receiver threw on the first compiled frame and killed the render
// loop — with the array on screen and nothing to explain it.
const hooked = {
  onBeforeCompileCalled: 0,
  onBeforeCompile() { this.onBeforeCompileCalled++; },
  customProgramCacheKey() { return this.onBeforeCompile.toString(); },
};
const veil = { amount: { value: 1 }, color: { r: 1, g: 1, b: 1 } };
applyCoverVeil(hooked, veil);
assert.equal(typeof hooked.customProgramCacheKey, "function");
assert.doesNotThrow(
  () => hooked.customProgramCacheKey(),
  "The chained program cache key must be callable with the material as receiver",
);
assert.match(hooked.customProgramCacheKey(), /\|veil-v1$/, "The veil still marks its own program variant");
const shader = { uniforms: {}, fragmentShader: "void main() {\n#include <map_fragment>\n}" };
assert.doesNotThrow(() => hooked.onBeforeCompile(shader, {}), "The shader hook runs");
assert.equal(hooked.onBeforeCompileCalled, 1, "The material's own hook still runs first");
assert.equal(shader.uniforms.coverVeil, veil.amount, "The veil uniform reaches the shader");
assert.equal(shader.uniforms.coverVeilColor, veil.color);
assert.ok(shader.fragmentShader.startsWith("uniform float coverVeil;"), "The uniforms are declared");
assert.ok(shader.fragmentShader.includes("coverVeilColor"), "The film is mixed into the fragment colour");
assert.ok(shader.fragmentShader.includes("0.2126"), "The cover is muted through its luminance");
// A material that brought its own cache key keeps it, and gains the veil's.
const keyed = { customProgramCacheKey: () => "album-atlas-v1" };
applyCoverVeil(keyed, veil);
assert.equal(keyed.customProgramCacheKey(), "album-atlas-v1|veil-v1", "An existing key is preserved");

// The archive's covers are a backdrop: veiled enough to stop competing with the
// interface drawn over them, still present enough to read as albums.
assert.ok(
  ARCHIVE_COVER_VEIL > .2 && ARCHIVE_COVER_VEIL < .6,
  `Archive covers stay faint, got ${ARCHIVE_COVER_VEIL}`,
);
assert.equal(coverVeilMix().film, 1 - ARCHIVE_COVER_VEIL, "The film covers the rest of the cover");
assert.ok(coverVeilMix().film > ARCHIVE_COVER_VEIL, "The film, not the cover, dominates");
assert.ok(
  ARCHIVE_COVER_DESATURATION > .3 && ARCHIVE_COVER_DESATURATION < .9,
  `The frost mutes a cover rather than flattening it, got ${ARCHIVE_COVER_DESATURATION}`,
);

// The frost wipes off as a case is drawn out of the shelf and returns as it is
// filed back, so the array card is never a hard swap for the delivered model.
assert.equal(coverVeilAt(0), 1, "A shelved case is fully frosted");
assert.ok(coverVeilAt(ARCHIVE_COVER_WIPE * .5) > 0 && coverVeilAt(ARCHIVE_COVER_WIPE * .5) < 1, "Halfway out the frost is halfway gone");
assert.equal(coverVeilAt(ARCHIVE_COVER_WIPE), 0, "A drawn case is clean");
assert.equal(coverVeilAt(ARCHIVE_COVER_WIPE * 4), 0, "An inspected case stays clean");
assert.equal(coverVeilAt(-2), 1, "A case below the shelf stays frosted");
let previous = coverVeilAt(0);
for (let lift = 0; lift <= ARCHIVE_COVER_WIPE * 2; lift += ARCHIVE_COVER_WIPE / 40) {
  const current = coverVeilAt(lift);
  assert.ok(current <= previous + 1e-9, "The frost only ever wipes off as the case rises");
  previous = current;
}

// Dark mode lays a dark film instead of lighting the shelf up.
const luma = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16 & 255, value >> 8 & 255, value & 255]
    .map((channel) => channel / 255)
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
};
assert.match(ARCHIVE_COVER_FILM, /^#[0-9a-f]{6}$/i, "The light film is a flat paper tone");
assert.match(ARCHIVE_COVER_FILM_DARK, /^#[0-9a-f]{6}$/i, "The dark film is a flat tone too");
assert.ok(luma(ARCHIVE_COVER_FILM) > .8, "The light film is bright paper");
assert.ok(luma(ARCHIVE_COVER_FILM_DARK) < .3, "The dark film is dark");
console.log(
  `Archive veil: covers show at ${Math.round(ARCHIVE_COVER_VEIL * 100)}% under a ${Math.round(coverVeilMix().film * 100)}% ${ARCHIVE_COVER_FILM} film, mute ${ARCHIVE_COVER_DESATURATION}, wiping clean over ${ARCHIVE_COVER_WIPE} units; dark film ${ARCHIVE_COVER_FILM_DARK}.`,
);
