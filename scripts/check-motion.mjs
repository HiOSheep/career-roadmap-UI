import assert from "node:assert/strict";
import {
  CINEMATIC_HANDOFF,
  openingHandoff,
  archiveWave,
  cinematicClose,
  extraction,
  selectionWave,
  baselineSelectionWave,
  rippleEnvelope,
  settlingWave,
  damp,
  returningCaseStep,
  idleWave,
} from "../src/motion.ts";
import { DECRYPTION_END } from "../src/decryption.ts";
import { selectionWave as historicalWave } from "../reference/baseline-motion.ts";

assert.equal(openingHandoff(0), 0, "The first interactive frame retains the opening coordinate frame");
assert.equal(openingHandoff(.9), 1, "Navigation takes over after the handoff");
assert.equal(openingHandoff(0, true), 1, "Reduced motion switches without a prolonged transition");
for (const fps of [30, 60, 120]) {
  let previous = 0;
  for (let frame = 0; frame <= Math.ceil(.9 * fps); frame++) {
    const blend = openingHandoff(frame / fps);
    const track = -10.4 * blend;
    assert.ok(Math.abs(track - previous) < .8, "The selected case cannot jump a whole column at the seam");
    assert.ok(blend >= 0 && blend <= 1);
    previous = track;
  }
}

// The opening film hands over to the first album's detail view. Its closing
// camera curves are pinned to that instant: a curve that settles earlier leaves
// a frozen beat before entry, and one that runs later keeps moving after the
// interactive camera has already taken over.
for (const start of [27.3, 28.6]) {
  assert.equal(cinematicClose(start, start), 0, "A closing curve starts from rest");
  assert.equal(cinematicClose(start - 2, start), 0, "It never moves before its start");
  assert.ok(
    cinematicClose(CINEMATIC_HANDOFF - 0.5, start) < 1,
    "The film is still closing in half a second before entry",
  );
  assert.equal(cinematicClose(CINEMATIC_HANDOFF, start), 1, "It finishes exactly at the hand-off");
  assert.equal(cinematicClose(CINEMATIC_HANDOFF + 3, start), 1, "And never overshoots");
  let previous = 0;
  for (let frame = 0; frame <= Math.round(CINEMATIC_HANDOFF * 25); frame++) {
    const value = cinematicClose(frame / 25, start);
    assert.ok(value >= previous, "A closing curve never reverses");
    previous = value;
  }
}
// The film's decryption runs on the reference video's original timeline (five
// seconds ahead of app time). Entry before it completes would restart the
// reveal and re-frost the case on the first detail frame.
assert.ok(
  DECRYPTION_END - 5 < CINEMATIC_HANDOFF,
  "Entry must follow the film's decryption",
);
assert.ok(
  CINEMATIC_HANDOFF - (DECRYPTION_END - 5) < 1,
  "Entry must not wait a visible beat after the film's decryption",
);

// The selected production motion is the original signed wave, including troughs.
let baselineTrough = false;
for (let frame = -1; frame <= 200; frame++) {
  for (let distance = 0; distance <= 32; distance += 0.5) {
    const restored = baselineSelectionWave(distance, frame / 60);
    assert.equal(restored, historicalWave(distance, frame / 60));
    baselineTrough ||= restored < -0.01;
  }
}
assert.ok(baselineTrough, "The original negative trough is restored");

let idleRange = 0;
for (let lane = 0; lane < 5; lane++) {
  for (let row = 0; row < 32; row++) {
    for (let frame = 0; frame < 60 * 13; frame++) {
      const a = idleWave(row, lane, frame / 60);
      const b = idleWave(row, lane, (frame + 1) / 60);
      idleRange = Math.max(idleRange, Math.abs(a));
      assert.ok(
        Math.abs(a) < 3.7 * 0.03,
        "Idle lift stays below 3% of card height",
      );
      assert.ok(
        Math.abs(b - a) * (1080 / 7.33) < 0.21,
        "Idle motion remains subpixel per frame",
      );
    }
  }
}
assert.ok(idleRange > 0.075, "Idle field remains perceptible without input");

const peak = (t) =>
  Array.from({ length: 32 }, (_, row) => archiveWave(row, 2, t)).reduce(
    (best, y, row, values) => (y > values[best] ? row : best),
    0,
  );
assert.ok(peak(23.3) > peak(22.7) + 6, "First crest must travel across rows");
assert.ok(peak(24.8) < peak(24.2) - 8, "Second crest must return across rows");
let maxFrameDelta = 0;
for (let frame = 550; frame < 800; frame++) {
  for (let row = 0; row < 32; row++)
    for (let lane = 0; lane < 5; lane++) {
      const a = archiveWave(row, lane, frame / 25);
      const b = archiveWave(row, lane, (frame + 1) / 25);
      assert.ok(Number.isFinite(a));
      maxFrameDelta = Math.max(maxFrameDelta, Math.abs(b - a));
    }
}
assert.ok(maxFrameDelta < 0.7, "25 fps samples must not teleport");
assert.ok(
  Math.abs(extraction(26.6) - extraction(27.2)) < 0.01,
  "Pause between extraction phases",
);
assert.ok(extraction(29) > 3 && extraction(25.1) === 0);
assert.ok(
  Math.abs(settlingWave(2, 26.1) - settlingWave(2, 26.5)) > 0.01,
  "Neighbors keep moving during the first extraction hold",
);
assert.ok(selectionWave(8, 1) > 0.1, "Click ripple reaches neighboring rows");
for (let frame = 0; frame <= 200; frame++) {
  for (let distance = 0; distance <= 32; distance += 0.5) {
    const y = selectionWave(distance, frame / 60);
    const age = frame / 60;
    const ramp = Math.max(0, Math.min(1, age / 0.2));
    const original =
      0.8 *
      ramp ** 3 *
      (10 + ramp * (-15 + 6 * ramp)) *
      Math.exp(-age * 1.15) *
      Math.cos((distance - age * 8) * 0.58) *
      Math.exp(-0.5 * ((distance - age * 8) / 3.4) ** 2);
    assert.ok(
      y >= 0 && y <= 0.8,
      "Selection pulse cannot create a negative trough",
    );
    if (age <= 3.2 && original > 0)
      assert.ok(
        Math.abs(y - original) < 1e-12,
        "Positive crests retain the baseline amplitude and timing",
      );
  }
}
const ripple = (distance, age) =>
  selectionWave(distance, age) * rippleEnvelope(distance, age);
for (let frame = 0; frame <= 200; frame++) {
  assert.equal(
    ripple(0, frame / 60),
    0,
    "The selected source cannot bounce on its own ripple",
  );
}
for (const distance of [3, 5, 8, 12]) {
  const crestTime = distance / 8;
  assert.equal(
    ripple(distance, crestTime),
    selectionWave(distance, crestTime),
    "The outward crest keeps its strength away from the source",
  );
  const edge = (distance - Math.PI / (2 * 0.58)) / 8;
  const epsilon = 1e-5;
  const velocity =
    (ripple(distance, edge + epsilon) - ripple(distance, edge - epsilon)) /
    (2 * epsilon);
  assert.ok(
    Math.abs(velocity) < 0.001,
    "Ripple edges approach rest without a velocity snap",
  );
}
const coarse = { value: 5, velocity: -2 },
  fine = { ...coarse };
for (let i = 0; i < 30; i++) damp(coarse, -3, 4, 1 / 30);
for (let i = 0; i < 120; i++) damp(fine, -3, 4, 1 / 120);
assert.ok(
  Math.abs(coarse.value - fine.value) < 1e-9,
  "Spring must be frame-rate independent",
);
const before = coarse.value;
damp(coarse, 6, 4, 1 / 120);
assert.ok(
  Math.abs(coarse.value - before) < 0.05,
  "Retargeting must preserve position continuity",
);
// A rotated, open case must start both return motions immediately, and complete
// without adding a second alignment wait after its lid has folded.
for (const fps of [30, 60, 120]) {
  for (const initialAngle of [-Math.PI / 2, Math.PI / 6, Math.PI / 2]) {
    const opening = { value: 1, velocity: 0 };
    let angle = returningCaseStep(opening, initialAngle, 1 / fps);
    assert.ok(opening.value < 1 && opening.value > 0, "Lid starts folding");
    assert.ok(Math.abs(angle) < Math.abs(initialAngle), "Alignment starts while the lid is still open");
    for (let i = 1; i < fps; i++) angle = returningCaseStep(opening, angle, 1 / fps);
    assert.equal(opening.value, 0, "Lid settles within one second");
    assert.equal(angle, 0, "Rotation settles within the same second");
  }
}
console.log(
  JSON.stringify(
    {
      forwardPeaks: [peak(22.7), peak(23.3)],
      returnPeaks: [peak(24.2), peak(24.8)],
      maxFrameDelta,
      checks: "passed",
    },
    null,
    2,
  ),
);
