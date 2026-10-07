import * as THREE from "three";

export const CD_CASE_ASSET = "assets/cd-jewel-case.glb";
export const CD_CASE_SHELF_ASSET = "assets/cd-jewel-case-shelf.glb";
export const CD_CASE_ASSEMBLY_ASSET = "assets/cd-jewel-case-assembly.glb";
export const CD_CASE_HINGE = new THREE.Vector3(-1.78, 0, 0.14);
export const CD_CASE_OPEN_ANGLE = THREE.MathUtils.degToRad(-108);

/**
 * Moulded decoration the case does not need: the gold index tab that sits on
 * its edge (and its printed siblings in the retired model). They are dropped
 * rather than recoloured, so the case's edge stays a plain white spine.
 */
export const CD_CASE_DECORATION = new Set(["CD_Index", "Index_Inlay", "Printed_Label"]);

export function isCdCaseDecoration(surface: string | undefined) {
  return surface !== undefined && CD_CASE_DECORATION.has(surface);
}

/**
 * Surface tones for the shelf, measured from the reference frame: its case faces
 * sit around #dac9bb..#e3d6c6 under a neutral background of #eeeae7, so the
 * objects read as warm mid-tones lit by a bright room rather than as the
 * brightest thing on screen. Parts not listed keep the model's own material.
 */
export const CD_CASE_ARRAY_TONES: Record<string, string> = {
  CD_Clear_Plastic: "#e9dccb",
  CD_Clear_Rim: "#e2d3c0",
  CD_Spine_Label: "#e6dbca",
  Frosted_Polymer: "#ecdfcd",
  CD_Disc_Silver: "#ded3c4",
  CD_Disc_Hub: "#b6ab9c",
};

const TURN = Math.PI * 2;
/** One turn per 18 s — slow enough to read as a record, not a spinning disc. */
export const DISC_SPIN_RATE = TURN / 18;

/** Keeps the angle inside one turn, including for clockwise (negative) travel. */
const wrap = (angle: number) => ((angle % TURN) + TURN) % TURN;

/**
 * The disc turns while its album plays and holds its angle the moment it stops,
 * so pausing the audio stops the record too. It turns clockwise as the disc is
 * seen from the front, which is a negative rotation about its own axis, and the
 * angle is kept inside one turn.
 */
export function discSpin(angle: number, playing: boolean, dt: number) {
  if (!playing || !(dt > 0)) return wrap(angle);
  return wrap(angle - DISC_SPIN_RATE * dt);
}

/** Integrates acceleration and coast-down exactly, independent of frame rate. */
export class DiscMotor {
  angle = 0;
  speed = 0;
  step(playing: boolean, dt: number, reduced = false) {
    if (!(dt > 0)) return this.angle;
    const target = playing ? DISC_SPIN_RATE : 0;
    if (reduced) {
      this.speed = target;
      this.angle = wrap(this.angle - target * dt);
      return this.angle;
    }
    const rate = playing ? 4 : 3;
    const decay = Math.exp(-rate * dt);
    const travel = target * dt + (this.speed - target) * (1 - decay) / rate;
    this.speed = target + (this.speed - target) * decay;
    this.angle = wrap(this.angle - travel);
    if (!playing && this.speed < .0001) this.speed = 0;
    return this.angle;
  }
}

/** Vertices are baked in the closed pose, so a hinge transform is absolute.
 * Reapplying it cannot accumulate drift; cloned returning cases use it too. */
export function setCdCaseOpen(model: THREE.Group, progress: number) {
  const angle = CD_CASE_OPEN_ANGLE * THREE.MathUtils.clamp(progress, 0, 1);
  const rotation = new THREE.Matrix4().makeRotationY(angle);
  const offset = CD_CASE_HINGE.clone().sub(CD_CASE_HINGE.clone().applyMatrix4(rotation));
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.userData.cdPart !== "lid") return;
    child.rotation.set(0, angle, 0);
    child.position.copy(offset);
  });
}
