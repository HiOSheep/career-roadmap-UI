import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { shelfGeometry, batchShelfMeshes } from "../src/shelf-geometry.ts";
const bytes = await readFile(new URL("../public/assets/cd-jewel-case.glb", import.meta.url));
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
asset.scene.updateMatrixWorld(true);
let fullTriangles = 0, shelfTriangles = 0, replacements = 0;
asset.scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  const full = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const count = full.index.count;
  const simplified = shelfGeometry(mesh.material.name, mesh.userData.cdPart, full);
  assert.equal(full.index.count, count, "Detailed model geometry stays intact");
  if (simplified !== full) {
    replacements++;
    assert.ok(simplified.index.count < count / 4, "Distant geometry drops by at least 75 percent");
    const bounds = new THREE.Box3().setFromBufferAttribute(simplified.attributes.position);
    assert.ok(bounds.min.y >= -.000001 && bounds.max.y <= 3.700001, "Proxy stays within the case silhouette");
  }
  if (mesh.material.name !== "CD_Print" && !mesh.material.name.startsWith("CD_Spectrum_") && mesh.material.name !== "CD_Index") {
    fullTriangles += count / 3;
    shelfTriangles += simplified.index.count / 3;
  }
});
assert.equal(replacements, 10);
assert.ok(shelfTriangles <= 224, "Closed archive case stays within the distant geometry budget");
assert.ok(shelfTriangles < fullTriangles / 2, "Overall shelf geometry drops by at least half");
const scene = new THREE.Scene();
const material = new THREE.MeshPhysicalMaterial({ name: "same-surface" });
const left = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 3);
const right = new THREE.InstancedMesh(new THREE.BoxGeometry().translate(2, 0, 0), material.clone(), 3);
right.instanceMatrix = left.instanceMatrix;
const theme = new THREE.InstancedBufferAttribute(new Float32Array(3), 1);
left.geometry.setAttribute("archiveTheme", theme);
right.geometry.setAttribute("archiveTheme", theme);
const original = left.geometry;
scene.add(left, right);
const batched = batchShelfMeshes([left, right], scene);
assert.equal(batched.length, 1, "Matching shelf surfaces share one draw");
assert.equal(batched[0].geometry.index.count, original.index.count * 2, "Batching preserves all silhouettes");
assert.equal(batched[0].geometry.getAttribute("archiveTheme"), theme, "Per-instance theme transitions remain shared");
assert.equal(batched[0].count, 3);
assert.equal(scene.children.length, 1);
console.log(`Shelf geometry checks passed: ${fullTriangles} -> ${shelfTriangles} triangles per closed case (${Math.round(100*(1-shelfTriangles/fullTriangles))}% reduction), full detail retained.`);
