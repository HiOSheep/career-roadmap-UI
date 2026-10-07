import assert from "node:assert/strict";
import * as THREE from "three";
import { CardAppearance } from "../src/appearance.ts";
import { cloneReturningModel } from "../src/three-resources.ts";
const appearance = new CardAppearance();
const group = new THREE.Group();
// Switching months must not let a returning copy mutate or release the live
// player's resources, including when it switches again before returning.
const panelTexture = new THREE.Texture();
const panelMaterial = new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true, opacity: .6 });
const panel = new THREE.Mesh(new THREE.PlaneGeometry(), panelMaterial);
panel.name = "disc-panel";
panel.userData.discPanel = true;
group.add(panel);
let panelDisposed = 0;
panelTexture.addEventListener("dispose", () => panelDisposed++);
panelMaterial.addEventListener("dispose", () => panelDisposed++);
appearance.prepare(group);
appearance.apply(group, 0);
assert.equal(panel.material, panelMaterial, "Controls retain their own material");
assert.equal(panelMaterial.opacity, .6, "Case appearance cannot hide playback UI");
for (let i = 0; i < 12; i++) {
  const copy = cloneReturningModel(group);
  assert.equal(copy.getObjectByName("disc-panel"), undefined, "Returning case excludes the playback panel");
  appearance.prepare(copy);
  appearance.apply(copy, 0);
  appearance.dispose(copy);
}
assert.equal(panel.parent, group, "The live panel stays attached");
assert.equal(panelMaterial.opacity, .6, "Repeated returns do not fade the live panel");
assert.equal(panelDisposed, 0, "Repeated returns do not release the live panel's texture or material");
const panelOnly = new THREE.Group();
panelOnly.add(panel);
appearance.dispose(panelOnly);
assert.equal(panelDisposed, 0, "Model cleanup leaves playback resources to their owner");
console.log("Playback panel lifecycle: repeated month switches preserve opacity, ownership and GPU resources.");
