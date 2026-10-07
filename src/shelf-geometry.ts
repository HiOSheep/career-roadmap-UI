import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Closed cases on the distant shelf do not need individual spring teeth. */
export function shelfGeometry(surface: string, part: string | undefined, full: THREE.BufferGeometry) {
  const pieces: THREE.BufferGeometry[] = [];
  const ring = (inner: number, outer: number, z: number, segments = 48) =>
    pieces.push(new THREE.RingGeometry(inner, outer, segments).translate(.16, 1.78, z));
  const box = (width: number, height: number, depth: number, x: number, y: number, z: number, faces?: number[]) => {
    const geometry = new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
    if (faces) {
      const indices = Array.from(geometry.index!.array);
      geometry.setIndex(faces.flatMap(face => indices.slice(face * 6, face * 6 + 6)));
      geometry.clearGroups();
    }
    pieces.push(geometry);
  };
  if (surface === "CD_Clear_Rim") {
    if (part === "back") {
      for (const y of [.055, 3.645]) box(4.2, .035, .13, 0, y, -.0475);
      for (const x of [-2.045, 2.045]) box(.035, 3.59, .13, x, 1.85, -.0475);
    } else if (part === "lid") {
      for (const y of [.055, 3.645]) box(3.79, .035, .18, .195, y, .1025);
      for (const x of [-1.66, 2.045]) box(.035, 3.59, x > 0 ? .18 : .035, x, 1.85, x > 0 ? .1025 : .175);
      // The booklet clips and hinge arms are subpixel at archive distance.
    } else if (part === "spine") {
      box(.035, 3.59, .285, -2.045, 1.85, .025);
      for (const y of [.055, 3.645]) box(.3625, .035, .18, -1.88125, y, .1025);
    } else return full;
  } else if (surface === "CD_Clear_Plastic") {
    // The rim already supplies the thin plate edges. Retain both broad faces
    // at their original depths without drawing the concealed narrow sides.
    if (part === "lid") box(3.674, 3.559, .025, .1925, 1.85, .183, [4, 5]);
    else if (part === "back") box(4.2, 3.7, .025, 0, 1.85, -.12, [4, 5]);
    else if (part === "spine") box(.3625, 3.625, .025, -1.88125, 1.85, .183, [4, 5]);
    else return full;
  } else if (surface === "CD_Disc_Silver" && part === "disc") {
    ring(.235, 1.55, .0835, 8);
    pieces.push(new THREE.RingGeometry(.235, 1.55, 8).rotateY(Math.PI).translate(.16, 1.78, .0465));
  } else if (surface === "CD_Disc_Hub" && part === "disc") {
    ring(.235, .39, .085, 8);
    ring(1.515, 1.55, .091, 8);
  } else if (surface === "CD_Graphite_Tray" && part === "tray") {
    pieces.push(new THREE.BoxGeometry(3.71, 3.5, .065).translate(.12, 1.83, -.045));
    // The closed tray needs its silhouette, not the hidden disc seat and hub.
  } else if (surface === "CD_Spine_Label" && part === "spine") {
    full.computeBoundingBox();
    const size = full.boundingBox!.getSize(new THREE.Vector3());
    const center = full.boundingBox!.getCenter(new THREE.Vector3());
    const axis = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
    box(size.x, size.y, size.z, center.x, center.y, center.z, [axis * 2, axis * 2 + 1]);
  } else return full;
  const merged = mergeGeometries(pieces)!;
  pieces.forEach(piece => piece.dispose());
  return merged;
}

/** All shelf parts use one instance transform buffer; batch matching surfaces. */
export function batchShelfMeshes(instances: THREE.InstancedMesh[], scene: THREE.Scene) {
  const groups = new Map<string, THREE.InstancedMesh[]>();
  for (const inst of instances) {
    const mat = inst.material as THREE.MeshPhysicalMaterial;
    const key = mat.map ? mat.uuid : `${mat.name}:${mat.customProgramCacheKey()}:${mat.side}:${mat.transparent}`;
    const group = groups.get(key) ?? [];
    group.push(inst); groups.set(key, group);
  }
  const result: THREE.InstancedMesh[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (group.length > 1) {
      const pieces = group.map(inst => {
        const copy = inst.geometry.clone();
        for (const [name, attribute] of Object.entries(copy.attributes))
          if (attribute instanceof THREE.InstancedBufferAttribute) copy.deleteAttribute(name);
        return copy;
      });
      const geometry = mergeGeometries(pieces)!;
      for (const [name, attribute] of Object.entries(first.geometry.attributes))
        if (attribute instanceof THREE.InstancedBufferAttribute) geometry.setAttribute(name, attribute);
      pieces.forEach(piece => piece.dispose());
      first.geometry = geometry;
      for (const inst of group.slice(1)) { scene.remove(inst); inst.dispose(); }
    }
    result.push(first);
  }
  return result;
}
