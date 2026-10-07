import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CD_CASE_HINGE, CD_CASE_OPEN_ANGLE, CD_CASE_DECORATION, DISC_SPIN_RATE, discSpin, setCdCaseOpen } from "../src/cd-case.ts";

async function load(name) {
  const bytes = await readFile(new URL(`../public/assets/${name}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  gltf.scene.updateMatrixWorld(true);
  const model = new THREE.Group();
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    const mesh = new THREE.Mesh(object.geometry.clone().applyMatrix4(object.matrixWorld), object.material);
    Object.assign(mesh.userData, object.userData);
    model.add(mesh);
  });
  return model;
}

const [model, assembly] = await Promise.all([load("cd-jewel-case"), load("cd-jewel-case-assembly")]);
const bounds = new THREE.Box3().setFromObject(model);
assert.ok(Math.abs(bounds.max.y - 3.7) < .02 && Math.abs(bounds.min.y) < .02);
assert.ok(bounds.max.x - bounds.min.x < 4.3 && bounds.max.z - bounds.min.z < .5);
assert.deepEqual(new Set(model.children.map(mesh => mesh.userData.cdPart)), new Set(["lid", "spine", "disc", "tray", "back"]));
assert.equal(model.children.length, assembly.children.length);
const components = model.children.flatMap(mesh => mesh.userData.components ?? []);
const frameParts = components.filter(component => /^(back_.*rim|lid_.*edge)/.test(component.name));
assert.ok(frameParts.length >= 8, "All frame walls carry their construction gauge");
for (const component of frameParts) assert.ok(Math.abs(component.wall - .035) < 1e-8, `${component.name} has a consistent thin wall`);
for (const part of ["lid", "back"]) {
  const glazing = model.children.find(mesh => mesh.userData.cdPart === part && mesh.material.name === "CD_Clear_Plastic");
  const size = new THREE.Box3().setFromObject(glazing).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - .025) < 1e-6, `${part} glazing has the same thin gauge`);
}
const lidRim = model.children.find(mesh => mesh.userData.cdPart === "lid" && mesh.material.name === "CD_Clear_Rim");
const lidBounds = new THREE.Box3().setFromObject(lidRim);
assert.ok(lidBounds.min.z < .014 && lidBounds.max.z > .19, "Three lid walls extend down to the base seam");
const movingComponents = lidRim.userData.components.map(component => component.name);
for (const edge of ["lid_top_bottom_edge", "lid_right_edge"])
  assert.ok(movingComponents.some(name => name.startsWith(edge)), `${edge} opens with the lid`);
assert.ok(!components.some(component => component.name.startsWith("hinge_mount")), "External hinge mounting blocks are removed");
const frontGlass = model.children.find(mesh => mesh.userData.cdPart === "lid" && mesh.material.name === "CD_Clear_Plastic");
const spineGlass = model.children.find(mesh => mesh.userData.cdPart === "spine" && mesh.material.name === "CD_Clear_Plastic");
assert.ok(Math.abs(new THREE.Box3().setFromObject(frontGlass).max.z - new THREE.Box3().setFromObject(spineGlass).max.z) < 1e-6, "Spine glazing and lid front are flush");
assert.ok(new THREE.Box3().setFromObject(lidRim).getSize(new THREE.Vector3()).z < .20, "The thin lid carries three enclosing walls within the case depth");
assert.ok(components.some(component => component.name.startsWith("hinge_pin")), "The hinge has an actual pivot pin");
assert.ok(!components.some(component => component.name.startsWith("hinge_knuckle")), "Overlapping box hinges are removed");
assert.equal(components.filter(component => component.name.startsWith("hub_spring_petal")).length, 8, "The hub has eight tapered spring petals");
assert.ok(!components.some(component => component.name.startsWith("hub_retaining_finger")), "Square hub pegs are removed");
assert.ok(components.some(component => component.name.startsWith("spine_glazing")), "The spine label has a transparent cover plate");
assert.ok(components.some(component => component.name.startsWith("tray_disc_seat")), "The clear tray has a moulded circular disc seat");
const trayMaterial = model.children.find(mesh => mesh.material.name === "CD_Graphite_Tray").material;
assert.ok(trayMaterial.transmission >= .75 && trayMaterial.color.r > .8, "The tray is clear pale plastic instead of a dark slab");
const fixed = model.children.filter(mesh => mesh.userData.cdPart !== "lid");
const lid = model.children.filter(mesh => mesh.userData.cdPart === "lid");
assert.ok(lid.length && fixed.length);
const disc = model.children.find(mesh => mesh.material.name === "CD_Disc_Silver");
assert.ok(disc, "A physical compact disc replaces the optical block");
const discPosition = disc.geometry.attributes.position;
let minRadius = Infinity;
for (let i = 0; i < discPosition.count; i++) {
  minRadius = Math.min(minRadius, Math.hypot(discPosition.getX(i)-.16, discPosition.getY(i)-1.78));
}
assert.ok(minRadius >= .234, "The disc centre hole is actual geometry");
for (const progress of [0, .5, 1, .3, 1, 0]) {
  setCdCaseOpen(model, progress);
  model.updateMatrixWorld(true);
  for (const mesh of lid) {
    assert.ok(Math.abs(mesh.rotation.y - CD_CASE_OPEN_ANGLE * progress) < 1e-9);
    assert.ok(CD_CASE_HINGE.clone().applyMatrix4(mesh.matrix).distanceTo(CD_CASE_HINGE) < 1e-8, "The hinge remains fixed through reversals");
  }
  for (const mesh of fixed) assert.ok(mesh.matrix.equals(new THREE.Matrix4()), "The tray, disc and back stay together");
}
assert.ok(bounds.equals(new THREE.Box3().setFromObject(model)), "Closing returns to the exact shelf silhouette");

// The disc turns with its album and holds its angle the moment audio stops.
assert.ok(DISC_SPIN_RATE > 0, "The disc has a spin rate");
// Clockwise seen from the front: a positive rotation about +Z is anticlockwise,
// so the angle must decrease.
const stepped = discSpin(1, true, (1 / DISC_SPIN_RATE) * 0.1);
assert.ok(Math.abs(stepped - 0.9) < 1e-9, `A tenth of a turn moves the angle clockwise, got ${stepped}`);
assert.ok(stepped < 1, "The disc does not turn anticlockwise");
const rateStep = discSpin(3, true, 1 / 60);
assert.ok(Math.abs(rateStep - (3 - DISC_SPIN_RATE / 60)) < 1e-9, "A frame advances by its duration, clockwise");
// Slower than the first pass: one turn must take at least 15 s.
assert.ok(Math.PI * 2 / DISC_SPIN_RATE >= 15, `A turn stays slow, got ${(Math.PI * 2 / DISC_SPIN_RATE).toFixed(1)} s`);
assert.ok(Math.PI * 2 / DISC_SPIN_RATE <= 40, "A turn is still fast enough to read as motion");
assert.equal(discSpin(1, false, 5), 1, "A paused disc does not move at all");
assert.equal(discSpin(1, true, 0), 1, "A zero-length frame does not move it either");
assert.equal(discSpin(1, true, -1), 1, "A negative frame cannot run it backwards");
// The angle stays inside one turn, so a long album cannot lose precision — and
// clockwise travel wraps through zero into positive territory.
let angle = 0.0001;
for (let frame = 0; frame < 60 * 900; frame++) {
  angle = discSpin(angle, true, 1 / 60);
  assert.ok(angle >= 0 && angle < Math.PI * 2, `The angle stays bounded, got ${angle}`);
}
assert.ok(Number.isFinite(angle) && angle > 0, "Fifteen minutes of audio keeps it turning");
// The gold index tab is moulding on the case's edge, so it is dropped rather
// than recoloured. Guard the list against ever naming something structural.
const assemblyForDecoration = await load("cd-jewel-case-assembly");
const parts = [];
assemblyForDecoration.traverse((object) => {
  if (!object.isMesh) return;
  const name = (Array.isArray(object.material) ? object.material[0] : object.material).name.replace(/\.\d+$/, "");
  parts.push({ name, box: new THREE.Box3().setFromObject(object) });
});
for (const decorated of CD_CASE_DECORATION) {
  const present = parts.filter((part) => part.name === decorated);
  for (const part of present) {
    const size = part.box.getSize(new THREE.Vector3());
    const centre = part.box.getCenter(new THREE.Vector3());
    assert.ok(
      Math.max(size.x, size.y, size.z) < .6,
      `${decorated} must stay small moulding, got ${size.toArray().map((v) => v.toFixed(2)).join(" x ")}`,
    );
    assert.ok(Math.abs(centre.x) > 1.4, `${decorated} must sit on the case's edge, got x ${centre.x.toFixed(2)}`);
  }
}
assert.ok(CD_CASE_DECORATION.has("CD_Index"), "The gold index tab is the part being removed");
for (const structural of ["CD_Graphite_Tray", "CD_Clear_Rim", "CD_Spine_Label", "CD_Clear_Plastic", "CD_Print"])
  assert.ok(!CD_CASE_DECORATION.has(structural), `${structural} must never be treated as decoration`);
assert.ok(
  parts.some((part) => part.name === "CD_Spine_Label"),
  "The plain white spine label stays on the case",
);

console.log(`CD geometry and hinge checks passed: ${model.children.length} meshes; true centre hole; fixed hinge; repeated reversals; unchanged tray/disc; disc turns at ${DISC_SPIN_RATE.toFixed(3)} rad/s and holds when paused; edge moulding (${[...CD_CASE_DECORATION].join(", ")}) dropped.`);
