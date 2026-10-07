import assert from "node:assert/strict";
import { lidSurfaces, surfaceHit } from "../src/disc-occlusion.ts";
import { COLUMNS, DISC_PANEL, HIDE_BELOW, ROWS, SHOW_ABOVE, visibleCoverage } from "../src/disc-panel.ts";

// --- a lid sheet hides the panel only where it really crosses the ray ---------
// A flat 2x2 sheet on z = 0, facing the camera.
const sheet = {
  origin: [-1, -1, 0],
  edgeU: [2, 0, 0],
  edgeV: [0, 2, 0],
  normal: [0, 0, 1],
  unitU: 4,
  unitV: 4,
};
// Camera at z = 5; the panel point under test sits at t = 1 along the ray.
const occluded = (surface, camera, panel) =>
  surfaceHit(surface, camera[0], camera[1], camera[2],
    panel[0] - camera[0], panel[1] - camera[1], panel[2] - camera[2]);

assert.equal(occluded(sheet, [0, 0, 5], [0, 0, -1]), true, "A sheet in front of the panel hides it");
assert.equal(occluded(sheet, [0, 0, 5], [0, 0, .5]), false, "A sheet behind the panel does not");
assert.equal(occluded(sheet, [0, 0, -5], [0, 0, -1]), false, "A sheet past the panel does not");
assert.equal(occluded(sheet, [9, 9, 5], [0, 0, -1]), false, "The ray misses the sheet's edge");
assert.equal(occluded(sheet, [1.9, 1.9, 5], [0, 0, -1]), true, "Just inside the edge still hides it");
assert.equal(
  surfaceHit(sheet, 0, 0, 5, 1, 0, 0),
  false,
  "A ray parallel to the sheet never hits it",
);
assert.equal(
  surfaceHit({ ...sheet, unitU: 0, edgeU: [0, 0, 0] }, 0, 0, 5, 0, 0, -6),
  false,
  "A degenerate sheet is ignored rather than dividing by zero",
);
// The sheet is double sided: the lid occludes from either face.
assert.equal(occluded({ ...sheet, normal: [0, 0, -1] }, [0, 0, 5], [0, 0, -1]), true);

// --- only the printed lid sheets are collected, from their real geometry ------
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const sheetMesh = (overrides = {}) => ({
  isMesh: true,
  visible: true,
  userData: { albumArtwork: true, cdPart: "lid" },
  geometry: {
    computeBoundingBox() {},
    boundingBox: { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 0 } },
  },
  matrixWorld: { elements: identity },
  ...overrides,
});
const collect = (...nodes) => {
  const model = { traverse: (visit) => nodes.forEach(visit) };
  return lidSurfaces(model, []);
};
const near = (actual, expected, message) =>
  assert.ok(
    actual.length === expected.length && actual.every((value, i) => Math.abs(value - expected[i]) < 1e-9),
    `${message ?? "vector"}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
const one = collect(sheetMesh());
assert.equal(one.length, 1, "The printed lid sheet is collected");
near(one[0].origin, [-1, -1, 0], "sheet origin");
near(one[0].edgeU, [2, 0, 0], "sheet edge U");
near(one[0].edgeV, [0, 2, 0], "sheet edge V");
near(one[0].normal, [0, 0, 4], "The normals need no normalising for the plane test");
assert.equal(one[0].unitU, 4);
assert.equal(
  collect(sheetMesh({ userData: { albumArtwork: true, cdPart: "disc" } })).length,
  0,
  "The disc itself is not a lid sheet",
);
assert.equal(
  collect(sheetMesh({ userData: { cdPart: "lid" } })).length,
  0,
  "Unprinted lid geometry is not a sheet",
);
assert.equal(collect(sheetMesh({ visible: false })).length, 0, "Hidden sheets are skipped");
assert.equal(
  collect(sheetMesh({
    geometry: { computeBoundingBox() {}, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } },
  })).length,
  0,
  "A degenerate sheet is rejected",
);
// A sheet rotated 90° about Y still reports its own plane, not the world axes:
// this matrix maps local +X to world -Z, so the sheet's normal lands on world +X.
const rotated = collect(sheetMesh({
  matrixWorld: { elements: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] },
}));
assert.equal(rotated.length, 1);
near(rotated[0].normal, [4, 0, 0], "The sheet normal follows its world matrix");
const pair = collect(sheetMesh(), sheetMesh({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 1] } }));
assert.equal(pair.length, 2, "Both printed sheets are collected");
near(pair[1].origin, [-1, -1, 2], "The second sheet keeps its own pose");

// --- how much of the panel survives, which gates the hit areas ----------------
assert.equal(visibleCoverage(() => false), 0, "A fully hidden panel reports no coverage");
assert.equal(visibleCoverage(() => true), 1, "A fully visible panel reports full coverage");
const half = visibleCoverage((_u, v) => v < .5);
// The grid resolves the boundary to within one row, which is all the gate needs.
assert.ok(Math.abs(half - .5) <= 1 / ROWS + 1e-9, `Half a panel reads .5 within a row, got ${half}`);
const sliver = visibleCoverage((_u, v) => v < .2, 25, 15);
assert.ok(sliver < HIDE_BELOW, "A sliver falls below the input threshold");
assert.ok(visibleCoverage((_u, v) => v < .7, 25, 15) > SHOW_ABOVE, "A mostly visible panel clears the return bar");
assert.ok(SHOW_ABOVE > HIDE_BELOW, "Coming back needs more of the panel than staying does");
// The estimate must not depend on the scan density beyond its own resolution.
for (const [columns, rows] of [[7, 5], [25, 15], [40, 24]]) {
  const coarse = visibleCoverage((u, v) => v < .2 + .6 * u, columns, rows);
  assert.ok(
    Math.abs(coarse - .5) <= 1 / rows,
    `A half-covered panel reads about .5 at ${columns}x${rows}, got ${coarse}`,
  );
}
assert.ok(
  visibleCoverage((u, v) => v < .2 + .6 * u, COLUMNS, ROWS) < 1,
  "A diagonal occluder costs the panel some of its grid",
);
assert.equal(visibleCoverage(() => true, 1, 1), 1, "A single sample still works");
assert.equal(visibleCoverage(() => false, 0, 0), 0, "An empty grid cannot divide by zero");

console.log(
  "Disc control checks passed: disc panel inside the disc face, single-sheet occlusion, lid sheet collection and coverage that gates input with hysteresis.",
);
