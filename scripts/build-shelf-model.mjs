import { readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { shelfGeometry } from "../src/shelf-geometry.ts";
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
const bytes = await readFile("public/assets/cd-jewel-case.glb");
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
asset.scene.updateMatrixWorld(true);
const shelf = new THREE.Group();
asset.scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  const surface = mesh.material.name;
  if (surface === "CD_Print" || surface === "CD_Index" || surface.startsWith("CD_Spectrum_")) return;
  const full = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const geometry = shelfGeometry(surface, mesh.userData.cdPart, full);
  const copy = new THREE.Mesh(geometry, mesh.material);
  copy.name = mesh.name;
  copy.userData = { ...mesh.userData, modelDetail: "shelf" };
  shelf.add(copy);
});
const exported = await new GLTFExporter().parseAsync(shelf, { binary: true });
await writeFile("public/assets/cd-jewel-case-shelf.glb", Buffer.from(exported));
console.log(`Shelf model: ${bytes.length} -> ${exported.byteLength} bytes; detailed asset remains separate.`);
