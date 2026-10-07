import * as THREE from "three";
import { damp } from "./motion";
import {
  DISC_PANEL,
  PANEL_CENTRE,
  PANEL_Z,
  paintDiscPanel,
  panelWorldSize,
  type PanelState,
} from "./disc-panel";

/**
 * The panel as a mesh in the scene. Being part of the model means the lid hides
 * it and the camera foreshortens it for free — a DOM overlay could only imitate
 * that with clipping, and the clipped silhouette was what looked wrong.
 */
export class DiscPanel {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private painted: PanelState | null = null;
  private appear = 0;
  private feedback = Array.from({ length: 7 }, () => ({ value: 0, velocity: 0 }));

  constructor(anisotropy = 4) {
    const { design, pixelsPerUnit } = DISC_PANEL;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(design.width * pixelsPerUnit);
    this.canvas.height = Math.round(design.height * pixelsPerUnit);
    this.context = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    const { width, height } = panelWorldSize();
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        // Sits on the disc like a printed decal: tested against the depth buffer
        // so the lid covers it, but it does not occlude the disc behind it.
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.mesh.name = "disc-panel";
    this.mesh.position.set(PANEL_CENTRE.x, PANEL_CENTRE.y, PANEL_Z);
    this.mesh.renderOrder = 3;
    this.mesh.userData.discPanel = true;
    // The panel must never answer the cell raycaster that drives hover and
    // selection in the archive.
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }

  /** Repaints only when something the panel shows actually changed. */
  paint(state: PanelState, dt = 1 / 60, reduced = false) {
    let animating = false;
    let changed = false;
    const actions = ["previous", "toggle", "next"];
    this.feedback.forEach((spring, index) => {
      const previous = spring.value;
      const target = index === 6 ? Number(state.playing) : Number((index < 3 ? state.hover : state.pressed) === actions[index % 3]);
      if (reduced) { spring.value = target; spring.velocity = 0; }
      else damp(spring, target, index < 3 ? 20 : 26, dt);
      if (Math.abs(spring.value - target) < .001 && Math.abs(spring.velocity) < .01) {
        spring.value = target; spring.velocity = 0;
      } else animating = true;
      changed ||= previous !== spring.value;
    });
    const last = this.painted;
    if (!animating && !changed && last &&
      last.title === state.title && last.state === state.state &&
      last.playing === state.playing && last.disabled === state.disabled &&
      last.progress === state.progress && last.elapsed === state.elapsed &&
      last.duration === state.duration && last.seeking === state.seeking &&
      last.hover === state.hover && last.pressed === state.pressed) return;
    this.painted = { ...state };
    paintDiscPanel(this.context, { ...state, feedback: {
      hover: this.feedback.slice(0, 3).map(s => s.value),
      press: this.feedback.slice(3, 6).map(s => s.value),
      playing: this.feedback[6].value,
    } });
    this.texture.needsUpdate = true;
  }

  /** Redraws after the webfont arrives, which changes how the text measures. */
  invalidate() { this.painted = null; }

  /** The entrance: the panel grows out of the disc instead of popping in. */
  setAppear(value: number, instant: boolean) {
    this.appear = instant ? 1 : value;
    this.mesh.scale.setScalar(.9 + .1 * this.appear);
    this.mesh.material.opacity = this.appear;
  }

  dispose() {
    this.texture.dispose();
    this.mesh.material.dispose();
    this.mesh.geometry.dispose();
    this.mesh.removeFromParent();
  }
}
