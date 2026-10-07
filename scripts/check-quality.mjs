import assert from "node:assert/strict";
import {
  AdaptiveBudget,
  normalizeQuality,
  pixelBudget,
  pixelBudgets,
  qualityPresets,
  matchingPreset,
  renderDimensions,
} from "../src/render-quality.ts";

assert.deepEqual(normalizeQuality(null), { ...qualityPresets.original, resolution: "native" });
const legacy = normalizeQuality(undefined, false);
assert.equal(legacy.pixelRatio, 1);
assert.equal(legacy.aoSamples, 0);
assert.equal(legacy.depthOfField, 0);
assert.equal(legacy.shadows, 2048, "Migration preserves old low-mode shadows");
assert.equal(legacy.transmission, 1, "Migration preserves old low-mode glass");
for (const bad of [
  null,
  false,
  "ultra",
  [],
  {
    scale: NaN,
    pixelRatio: 99,
    antialias: "injected",
    shadows: -1,
    aoSamples: Infinity,
  },
]) {
  assert.deepEqual(normalizeQuality(bad), { ...qualityPresets.original, resolution: "native" });
}
assert.equal(normalizeQuality({ scale: 99999 }).scale, 200);
assert.equal(normalizeQuality({ scale: -1 }).scale, 50);
assert.equal(normalizeQuality({ depthOfField: 99999 }).depthOfField, 150);
for (const [name, quality] of Object.entries(qualityPresets)) {
  assert.equal(matchingPreset(normalizeQuality(quality)), name);
  const reloaded = normalizeQuality(JSON.parse(JSON.stringify(quality)));
  assert.deepEqual(reloaded, { ...quality, resolution: "native" });
}
assert.equal(matchingPreset({ ...qualityPresets.ultra, scale: 145 }), "ultra", "Resolution does not change the effects preset");
for (const mode of ["native", "720p", "1080p", "1440p", "2160p", "adaptive"]) {
  const quality = normalizeQuality({ ...qualityPresets.performance, resolution: mode });
  assert.equal(quality.resolution, mode, "Resolution survives storage normalization");
  assert.equal(matchingPreset(quality), "performance", "Resolution is independent of effects");
  const dimensions = renderDimensions(quality, 1920, 1080, 1, 2, 16384, Infinity);
  assert.equal(dimensions.height, mode === "native" ? 2160 : mode === "adaptive" ? 1728 : Number.parseInt(mode));
}
for (const width of [640, 1920, 3840, 7680]) {
  for (const dpr of [1, 1.5, 2, 3]) {
    for (const max of [2048, 4096, 16384]) {
      const dimensions = renderDimensions(
        normalizeQuality({ scale: 200, pixelRatio: 3 }),
        1920,
        1080,
        width / 1920,
        dpr,
        max,
      );
      assert.ok(dimensions.width * dimensions.height <= 8_294_400);
      assert.ok(dimensions.width <= max && dimensions.height <= max);
      assert.ok(dimensions.ratio > 0);
    }
  }
}
// `pixelRatio` is a supersampling target rather than a cap on the display
// density: the direct path runs with MSAA off, so a settled frame gets its
// antialiasing from rendering above the panel's own pixels.
const native = renderDimensions(qualityPresets.original, 1920, 1080, 1, 1, 16384);
assert.equal(native.ratio, 2, "A 1x display supersamples to the preset's 2x");
assert.equal(native.width, 3840, "A settled 1080p frame is 4x the pixels of its CSS size");
const ultra = renderDimensions(qualityPresets.ultra, 1920, 1080, 1, 1, 16384);
assert.ok(ultra.width * ultra.height <= pixelBudgets.ceiling + 5000, "The ceiling still bounds it");
assert.ok(ultra.ratio >= native.ratio, "The sharper preset never renders below the softer one");
assert.equal(
  renderDimensions(qualityPresets.ultra, 1920, 1080, 2, 2, 16384).limited,
  true,
);
// A limited frame names its ceiling, so the settings line can explain itself.
assert.equal(
  renderDimensions(qualityPresets.ultra, 1920, 1080, 1, 1, 16384).limit,
  "budget",
  "The buffer ceiling is named as the limiter",
);
assert.equal(native.limit, "none", "A frame inside the ceiling reports no limiter");
assert.equal(
  renderDimensions(qualityPresets.ultra, 1920, 1080, 2, 2, 2048).limit,
  "texture",
  "A device texture limit is named instead",
);
// Animated frames pay for the sharper settled frame.
assert.ok(
  pixelBudgets.motion < 2_073_600,
  "Animating frames stay below the former flat cap",
);
assert.ok(
  pixelBudgets.ceiling > 2_073_600,
  "Settled frames are sharper than the former flat cap",
);
// The composer's colour, depth and blur targets all scale with the canvas, so a
// frame that runs through it keeps the lower settled ceiling; the direct path
// may spend the whole one. Animating frames are on the motion budget either way.
assert.equal(pixelBudget(false, false, false), pixelBudgets.ceiling);
assert.equal(pixelBudget(true, false, false), pixelBudgets.motion);
assert.equal(pixelBudget(false, false, true), pixelBudgets.postprocessed);
assert.equal(pixelBudget(true, false, true), pixelBudgets.motion);
assert.equal(pixelBudget(false, true, true), pixelBudgets.superPerformance);

// A settled frame spends the whole ceiling unless the preset antialiases with
// its own canvas-sized buffers; what varies is how far the preset supersamples
// inside it.
const hidpi1080 = 1920 * 1080 * 2 * 2;
assert.equal(pixelBudget(false, false, false), pixelBudgets.ceiling);
assert.equal(pixelBudget(true, false, false), pixelBudgets.motion);
// Occlusion and depth of field run through the composer, so that combination
// keeps its lower settled ceiling: it must never allocate an 8 MP blur frame.
const occluded = { ...qualityPresets.original, aoSamples: 32, depthOfField: 100 };
assert.equal(pixelBudget(false, false, true), pixelBudgets.postprocessed);
assert.equal(pixelBudget(true, false, true), pixelBudgets.motion);
assert.equal(pixelBudget(false, false, false), pixelBudgets.ceiling, "Without the composer the ceiling is available");
assert.ok(pixelBudgets.postprocessed < pixelBudgets.ceiling / 3, "The composer ceiling stays well below the buffer ceiling");
assert.ok(occluded.aoSamples > 0 && occluded.depthOfField > 0, "The preset under test really does ask for both passes");

// A 2x display already sits at the ceiling, so its settled frame is at native
// density, and the animating budget still bounds a moving one.
const settledHidpi = renderDimensions(
  qualityPresets.original,
  1920,
  1080,
  1,
  2,
  16384,
  pixelBudget(false, false, false),
);
assert.equal(settledHidpi.ratio, 2, "A 2x display renders at its native density");
assert.equal(settledHidpi.width, 3840);
assert.equal(settledHidpi.limited, false);
const motionHidpi = renderDimensions(
  qualityPresets.original,
  1920,
  1080,
  1,
  2,
  16384,
  pixelBudget(true, false, false),
);
assert.ok(motionHidpi.width * motionHidpi.height <= pixelBudgets.motion);

// The performance preset stays deliberately cheap, but a dense display is no
// longer capped to the CSS size because of it.
const cheapNative = renderDimensions(
  qualityPresets.performance,
  1920,
  1080,
  1,
  1,
  16384,
  pixelBudget(false, false, false),
);
const cheapHidpi = renderDimensions(
  qualityPresets.performance,
  1920,
  1080,
  1,
  2,
  16384,
  pixelBudget(false, false, false),
);
assert.equal(cheapNative.ratio, .8, "The performance preset keeps its own 80% scale");
assert.equal(cheapHidpi.ratio, 1.6, "On a 2x display the same preset still reaches its density");
assert.ok(cheapHidpi.width > cheapNative.width, "Dense displays are no longer flattened to the CSS size");

// A lower pixel ratio gives up supersampling, never the display's own density.
const capped = renderDimensions(
  { ...qualityPresets.original, pixelRatio: 1 },
  1280,
  720,
  1,
  2,
  16384,
  pixelBudget(false, false, false),
);
assert.equal(capped.ratio, 2, "A lower pixel ratio still renders at the display density");
const denseUltra = renderDimensions(
  qualityPresets.ultra,
  1280,
  720,
  1,
  2,
  16384,
  pixelBudget(false, false, false),
);
assert.ok(denseUltra.ratio > capped.ratio, "A higher pixel ratio supersamples above it");

// A 4K panel is already at the ceiling before any supersampling.
const settledUhd = renderDimensions(
  qualityPresets.original,
  3840,
  2160,
  1,
  1,
  16384,
  pixelBudget(false, false, false),
);
assert.deepEqual([settledUhd.width, settledUhd.height], [3840, 2160]);
assert.equal(settledUhd.ratio, 1, "A 4K panel is at the ceiling already");
const motionUhd = renderDimensions(
  qualityPresets.original,
  3840,
  2160,
  1,
  1,
  16384,
  pixelBudgets.motion,
);
assert.ok(motionUhd.width * motionUhd.height <= pixelBudgets.motion);

// Hysteresis: one changed frame never resizes, a short pause never sharpens.
const blip = new AdaptiveBudget();
assert.equal(blip.update(true), false);
for (let i = 0; i < 240; i++) assert.equal(blip.update(false), false);
assert.equal(blip.moving, false);
const run = new AdaptiveBudget();
assert.equal(run.update(true), false);
assert.equal(run.update(true), true);
assert.equal(run.moving, true);
for (let i = 0; i < AdaptiveBudget.settleAfter - 1; i++)
  assert.equal(run.update(false), false);
assert.equal(run.update(false), true);
assert.equal(run.moving, false);
assert.equal(run.update(false), false);
// Sweeping the pointer across the shelf must not churn the canvas: the motion
// ceiling is entered once and held for the whole sweep.
const sweep = new AdaptiveBudget();
let switches = 0;
for (let cycle = 0; cycle < 8; cycle++) {
  for (let i = 0; i < 6; i++) if (sweep.update(true)) switches++;
  for (let i = 0; i < 30; i++) if (sweep.update(false)) switches++;
}
assert.equal(switches, 1, "A continuous sweep resizes once");
assert.equal(sweep.moving, true);
// A burst separated by a real pause costs exactly one drop and one recovery.
const bursts = new AdaptiveBudget();
let burstSwitches = 0;
for (let cycle = 0; cycle < 3; cycle++) {
  for (let i = 0; i < 4; i++) if (bursts.update(true)) burstSwitches++;
  for (let i = 0; i < AdaptiveBudget.settleAfter + 5; i++)
    if (bursts.update(false)) burstSwitches++;
}
assert.equal(burstSwitches, 6, "Each separated burst resizes twice");

console.log(
  "Quality checks passed: migration, invalid storage, presets, supersampling, 48 device-limit combinations, adaptive ceilings and switch hysteresis.",
);
