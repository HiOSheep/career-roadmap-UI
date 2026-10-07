/**
 * Ray tests for the surfaces that can hide the disc's panel: the printed lid
 * sheets. Kept free of three values so it can be checked without a browser; the
 * panel's own geometry lives in disc-panel.ts.
 */
import type * as THREE from "three";

/** A world-space parallelogram: the shape every printed lid is made of. */
export interface Surface {
  origin: readonly [number, number, number];
  edgeU: readonly [number, number, number];
  edgeV: readonly [number, number, number];
  normal: readonly [number, number, number];
  unitU: number;
  unitV: number;
}

/**
 * True when the ray from (x, y, z) towards (dx, dy, dz) meets this panel before
 * the panel point, which sits at t = 1 in this unnormalised parameterisation.
 * Anywhere outside the parallelogram, or behind the camera, does not occlude.
 */
export function surfaceHit(
  surface: Surface,
  x: number, y: number, z: number,
  dx: number, dy: number, dz: number,
  limit = 1,
) {
  const [nx, ny, nz] = surface.normal;
  const denominator = nx * dx + ny * dy + nz * dz;
  if (Math.abs(denominator) < 1e-9) return false;
  const [ox, oy, oz] = surface.origin;
  const distance = (nx * (ox - x) + ny * (oy - y) + nz * (oz - z)) / denominator;
  if (distance <= 1e-3 || distance >= limit - 1e-3) return false;
  const hx = x + dx * distance - ox, hy = y + dy * distance - oy, hz = z + dz * distance - oz;
  const [ux, uy, uz] = surface.edgeU;
  const [vx, vy, vz] = surface.edgeV;
  const along = (hx * ux + hy * uy + hz * uz) / surface.unitU;
  const across = (hx * vx + hy * vy + hz * vz) / surface.unitV;
  return along >= 0 && along <= 1 && across >= 0 && across <= 1;
}

const AXES = ["x", "y", "z"] as const;

/**
 * The printed lid panels — the album cover and the booklet — as world-space
 * parallelograms. They are the only surfaces that swing between the camera and
 * the disc, so testing them costs one cheap ray/parallelogram test per sample
 * instead of a triangle-level raycast over the whole case mesh, which cost
 * milliseconds per frame and made the detail view stutter.
 */
export function lidSurfaces(model: THREE.Object3D, into: Surface[] = []) {
  let used = 0;
  model.traverse((node) => {
    if (!node.userData.albumArtwork || node.userData.cdPart !== "lid") return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const geometry = mesh.geometry;
    // Bounding boxes are cached on the geometry; recomputing them every frame
    // was pure overhead.
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    // The printed surface is flat: its flattest axis is the sheet normal, and
    // the other two span the sheet.
    const [flat, u, v] = [...AXES].sort((left, right) => size(box, left) - size(box, right));
    const matrix = mesh.matrixWorld.elements;
    const corner = (a: boolean, b: boolean) => {
      const local = { x: 0, y: 0, z: 0 };
      local[flat] = (box.min[flat] + box.max[flat]) / 2;
      local[u] = a ? box.max[u] : box.min[u];
      local[v] = b ? box.max[v] : box.min[v];
      return [
        matrix[0] * local.x + matrix[4] * local.y + matrix[8] * local.z + matrix[12],
        matrix[1] * local.x + matrix[5] * local.y + matrix[9] * local.z + matrix[13],
        matrix[2] * local.x + matrix[6] * local.y + matrix[10] * local.z + matrix[14],
      ] as [number, number, number];
    };
    const p0 = corner(false, false), p1 = corner(true, false), p2 = corner(false, true);
    const edgeU: [number, number, number] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const edgeV: [number, number, number] = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const normal: [number, number, number] = [
      edgeU[1] * edgeV[2] - edgeU[2] * edgeV[1],
      edgeU[2] * edgeV[0] - edgeU[0] * edgeV[2],
      edgeU[0] * edgeV[1] - edgeU[1] * edgeV[0],
    ];
    const unitU = edgeU[0] ** 2 + edgeU[1] ** 2 + edgeU[2] ** 2;
    const unitV = edgeV[0] ** 2 + edgeV[1] ** 2 + edgeV[2] ** 2;
    if (unitU < 1e-12 || unitV < 1e-12) return;
    into[used++] = { origin: p0, edgeU, edgeV, normal, unitU, unitV };
  });
  into.length = used;
  return into;
}

function size(box: THREE.Box3, axis: "x" | "y" | "z") {
  return box.max[axis] - box.min[axis];
}
