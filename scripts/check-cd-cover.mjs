import assert from "node:assert/strict";
import * as THREE from "three";
import { albumArtworkMesh, albumDiscMesh } from "../src/album-artwork.ts";

const texture = new THREE.Texture();
const cover = albumArtworkMesh(texture);
cover.updateMatrixWorld(true);
const front = new THREE.Raycaster(new THREE.Vector3(.15, 1.85, 1), new THREE.Vector3(0, 0, -1));
const inside = new THREE.Raycaster(new THREE.Vector3(.15, 1.85, -1), new THREE.Vector3(0, 0, 1));
assert.ok(front.intersectObject(cover).length > 0, "The exterior album cover remains visible");
assert.equal(inside.intersectObject(cover).length, 0, "The cover does not show a mirrored image on the lid's inside");
const disc = albumDiscMesh(texture);
assert.equal(disc.material.map, texture, "The printed disc artwork is preserved");
assert.equal(disc.userData.cdPart, "disc");
cover.geometry.dispose(); cover.material.dispose();
disc.geometry.dispose(); disc.material.dispose(); texture.dispose();
console.log("CD artwork checks passed: exterior cover only, printed disc preserved.");
