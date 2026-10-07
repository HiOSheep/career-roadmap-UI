import * as THREE from "three";
import { AlbumPlayer } from "./album-player";
import { albumForMonth } from "./albums";
import { DiscPanel } from "./disc-panel-mesh";
import {
  COLUMNS,
  DISC_PANEL,
  HIDE_BELOW,
  PANEL_CENTRE,
  PANEL_WIDTH,
  PANEL_Z,
  ROWS,
  SHOW_ABOVE,
  onDiscFace,
  panelButtonRects,
  visibleCoverage,
  type PanelAction,
  type PanelState,
} from "./disc-panel";
import { lidSurfaces, surfaceHit, type Surface } from "./disc-occlusion";

const STATUS_TEXT: Record<string, string> = {
  playing: "播放中",
  paused: "已暂停",
  loading: "正在载入…",
  "waiting-for-audio": "暂未提供音频",
  "audio-unavailable": "音频无法播放",
};
/** Entrance of the panel mesh, in seconds. */
const APPEAR = .26;

/**
 * The disc's playback controls. The panel itself is a mesh in the scene
 * (`DiscPanel`), so the lid hides it and the camera foreshortens it correctly.
 * What stays in the DOM is a transparent hit area per button, aligned to the
 * same layout, plus the labels assistive technology needs.
 */
export class DiscControls {
  readonly root = document.createElement("div");
  private label: HTMLElement;
  private state: HTMLElement;
  private seek = document.createElement("input");
  private seekPreview: number | null = null;
  private panel = new DiscPanel(4);
  private hover: PanelAction | null = null;
  private pressed: PanelAction | null = null;
  private pressUntil = 0;
  private appear = 0;
  private appearing = false;
  private lastTime = 0;
  private interactive = true;
  private stale = true;
  private lastCamera = new THREE.Vector3(NaN, NaN, NaN);
  private lastMatrix = new Float64Array(16);
  private lastMotion: number | string = NaN;
  private lastWidth = 0;
  private lastHeight = 0;
  private coverage = 1;
  private surfaces: Surface[] = [];
  private probe = new THREE.Vector3();
  private direction = new THREE.Vector3();

  constructor(parent: HTMLElement, private player: AlbumPlayer) {
    this.root.className = "disc-controls";
    this.root.hidden = true;
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "CD 歌曲播放控制");
    const { design } = DISC_PANEL;
    for (const rect of panelButtonRects()) {
      const button = document.createElement("button");
      button.dataset.disc = rect.id;
      button.type = "button";
      // The hit areas sit exactly where the painted buttons are, so the two can
      // never drift apart.
      button.style.left = `${rect.left / design.width * 100}%`;
      button.style.top = `${rect.top / design.height * 100}%`;
      button.style.width = `${rect.size / design.width * 100}%`;
      button.style.height = `${rect.size / design.height * 100}%`;
      button.setAttribute("aria-label", rect.id === "previous" ? "上一首" : rect.id === "next" ? "下一首" : "播放");
      button.addEventListener("pointerenter", () => { this.hover = rect.id; });
      button.addEventListener("pointerleave", () => {
        if (this.hover === rect.id) this.hover = null;
        if (this.pressed === rect.id) this.pressed = null;
      });
      button.addEventListener("pointerdown", event => {
        event.stopPropagation();
        this.pressed = rect.id;
      });
      button.addEventListener("pointerup", () => { this.pressed = null; });
      button.addEventListener("pointercancel", () => { this.pressed = null; });
      button.addEventListener("focus", () => { this.hover = rect.id; });
      button.addEventListener("blur", () => { this.hover = null; this.pressed = null; });
      button.addEventListener("click", event => {
        event.stopPropagation();
        this.pressed = rect.id;
        this.pressUntil = performance.now() + 120;
        if (rect.id === "previous") this.player.step(-1);
        if (rect.id === "next") this.player.step(1);
        if (rect.id === "toggle") this.player.toggle();
      });
      this.root.append(button);
    }
    this.seek.type = "range";
    this.seek.className = "disc-seek";
    this.seek.min = "0"; this.seek.max = "1000"; this.seek.step = "1";
    this.seek.value = "0";
    this.seek.setAttribute("aria-label", "歌曲播放进度");
    this.seek.addEventListener("pointerdown", event => event.stopPropagation());
    this.seek.addEventListener("input", () => { this.seekPreview = Number(this.seek.value) / 1000; });
    this.seek.addEventListener("change", () => {
      this.player.seek(Number(this.seek.value) / 1000 * this.player.getStats().duration);
      this.seekPreview = null;
    });
    this.seek.addEventListener("pointercancel", () => { this.seekPreview = null; });
    this.seek.addEventListener("click", event => event.stopPropagation());
    this.root.append(this.seek);
    // The visible title and state live on the mesh; these carry them to
    // assistive technology without drawing anything.
    const meta = document.createElement("div");
    meta.className = "disc-meta";
    meta.innerHTML = `<span class="disc-track-title"></span><span class="disc-play-state" role="status"></span>`;
    this.label = meta.querySelector(".disc-track-title")!;
    this.state = meta.querySelector(".disc-play-state")!;
    this.root.append(meta);
    parent.append(this.root);
  }

  get mesh() { return this.panel.mesh; }

  /** Whether audio is playing, so the scene can turn the disc with it. */
  get playing() { return this.player.getStats().status === "playing"; }

  /** Review snapshot: whether the panel takes input and how much is in view. */
  get stats() {
    return {
      interactive: this.interactive,
      coverage: this.coverage,
      appear: Number(this.appear.toFixed(2)),
      hover: this.hover,
    };
  }

  private viewChanged(
    model: THREE.Group,
    camera: THREE.Camera,
    width: number,
    height: number,
    motionKey: number | string,
  ) {
    const elements = model.matrixWorld.elements;
    let changed = this.stale || motionKey !== this.lastMotion ||
      width !== this.lastWidth || height !== this.lastHeight ||
      !this.lastCamera.equals(camera.position);
    for (let i = 0; i < 16 && !changed; i++) changed = elements[i] !== this.lastMatrix[i];
    if (!changed) return false;
    this.stale = false;
    this.lastMotion = motionKey;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastCamera.copy(camera.position);
    for (let i = 0; i < 16; i++) this.lastMatrix[i] = elements[i];
    return true;
  }

  /**
   * Measures how much of the panel a lid sheet still leaves on screen. The mesh
   * needs none of this — the depth buffer already hides it — but the transparent
   * hit areas must stop accepting presses while the buttons are behind the lid.
   */
  private sampleCoverage(
    model: THREE.Group,
    camera: THREE.Camera,
    width: number,
    height: number,
    motionKey: number | string,
  ) {
    if (!this.viewChanged(model, camera, width, height, motionKey)) return;
    lidSurfaces(model, this.surfaces);
    const aspect = PANEL_WIDTH * height / Math.max(1, width);
    const origin = camera.position;
    const visible = (u: number, v: number) => {
      if (!onDiscFace(u, v, width, height)) return false;
      this.probe
        .set(PANEL_CENTRE.x + PANEL_WIDTH * (u - .5), PANEL_CENTRE.y + aspect * (.5 - v), PANEL_Z)
        .applyMatrix4(model.matrixWorld);
      this.direction.subVectors(this.probe, origin);
      for (const surface of this.surfaces)
        if (surfaceHit(surface, origin.x, origin.y, origin.z, this.direction.x, this.direction.y, this.direction.z))
          return false;
      return true;
    };
    // Hysteresis: a higher bar to come back than to stop, so the hit areas
    // cannot flicker on and off at the threshold.
    const coverage = visibleCoverage(visible, COLUMNS, ROWS);
    this.coverage = coverage;
    this.interactive = coverage >= (this.interactive ? HIDE_BELOW : SHOW_ABOVE);
    if (this.root.inert !== !this.interactive) {
      this.root.inert = !this.interactive;
      this.root.setAttribute("aria-hidden", String(!this.interactive));
    }
  }

  update(model?: THREE.Group, camera?: THREE.Camera, visible = false, motionKey: number | string = 0) {
    if (!visible || !model || !camera) {
      if (!this.root.hidden) this.root.hidden = true;
      if (this.panel.mesh.visible) this.panel.mesh.visible = false;
      this.appearing = false;
      this.appear = 0;
      this.hover = null;
      this.pressed = null;
      this.pressUntil = 0;
      this.seekPreview = null;
      this.stale = true;
      return;
    }
    model.updateWorldMatrix(true, true);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
    const facing = camera.position.clone().sub(model.localToWorld(new THREE.Vector3(PANEL_CENTRE.x, 1.78, .1))).dot(normal);
    if (facing <= 0) {
      if (!this.root.hidden) this.root.hidden = true;
      this.panel.mesh.visible = false;
      this.appearing = false;
      this.stale = true;
      return;
    }
    // The panel lives in the model, so it inherits every pose the case takes.
    if (this.panel.mesh.parent !== model) {
      this.panel.mesh.removeFromParent();
      model.add(this.panel.mesh);
    }
    this.panel.mesh.visible = true;
    if (this.root.hidden) {
      this.root.hidden = false;
      const reduced = document.querySelector("#stage")?.classList.contains("reduce-motion") ?? false;
      this.appearing = !reduced;
      this.appear = reduced ? 1 : 0;
      this.lastTime = 0;
    }
    const now = performance.now();
    if (this.pressUntil && now >= this.pressUntil) {
      this.pressed = null;
      this.pressUntil = 0;
    }
    const frameDt = this.lastTime ? Math.min(.05, (now - this.lastTime) / 1000) : 1 / 60;
    if (this.appearing) {
      const dt = this.lastTime ? Math.min(.1, (now - this.lastTime) / 1000) : 0;
      this.appear = Math.min(1, this.appear + dt / APPEAR);
      if (this.appear >= 1) this.appearing = false;
    }
    this.lastTime = now;
    this.panel.setAppear(this.appear, !this.appearing);
    const width = this.root.offsetWidth, height = this.root.offsetHeight;
    const parent = this.root.parentElement!;
    const plane = new THREE.Matrix4().set(
      PANEL_WIDTH / width, 0, 0, PANEL_CENTRE.x - PANEL_WIDTH / 2,
      0, -PANEL_WIDTH / width, 0, PANEL_CENTRE.y + height * (PANEL_WIDTH / 2) / width,
      0, 0, 1, PANEL_Z,
      0, 0, 0, 1,
    );
    const clip = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(model.matrixWorld).multiply(plane).elements;
    const screen = new Array<number>(16).fill(0);
    for (let column = 0; column < 4; column++) {
      const i = column * 4;
      screen[i] = parent.clientWidth * .5 * (clip[i] + clip[i + 3]);
      screen[i + 1] = parent.clientHeight * .5 * (clip[i + 3] - clip[i + 1]);
      screen[i + 3] = clip[i + 3];
    }
    screen[10] = 1;
    // The transform only changes while the model moves; skipping the identical
    // write keeps the idle frame free of style invalidation.
    const transform = `matrix3d(${screen.join(",")})`;
    if (this.root.style.transform !== transform) this.root.style.transform = transform;
    const stats = this.player.getStats();
    const album = albumForMonth(stats.month);
    const title = album
      ? `${String(stats.track).padStart(2, "0")} · ${album.tracks[stats.track - 1]?.title ?? ""}`
      : "专辑待提供";
    const state: PanelState = {
      title,
      state: STATUS_TEXT[stats.status] ?? "暂未提供音频",
      playing: stats.status === "playing",
      disabled: !album,
      hover: this.hover,
      pressed: this.pressed,
      progress: Math.round((this.seekPreview ?? (stats.duration > 0 ? stats.currentTime / stats.duration : 0)) * 500) / 500,
      elapsed: Math.floor(this.seekPreview !== null ? this.seekPreview * stats.duration : stats.currentTime),
      duration: Math.floor(stats.duration),
      seeking: this.seekPreview !== null,
    };
    this.seek.disabled = stats.duration <= 0;
    if (this.seekPreview === null) {
      const value = String(Math.round((state.progress ?? 0) * 1000));
      if (this.seek.value !== value) this.seek.value = value;
    }
    this.seek.setAttribute("aria-valuetext", `${state.elapsed} 秒 / ${state.duration} 秒`);
    this.panel.paint(state, frameDt, document.querySelector("#stage")?.classList.contains("reduce-motion") ?? false);
    if (this.label.textContent !== title) this.label.textContent = title;
    if (this.state.textContent !== state.state) this.state.textContent = state.state;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("button")) {
      const toggle = button.dataset.disc === "toggle";
      if (toggle) {
        const label = state.playing ? "暂停" : "播放";
        const pressed = String(state.playing);
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
        if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
      }
      if (button.disabled !== state.disabled) button.disabled = state.disabled;
    }
    this.sampleCoverage(model, camera, width, height, motionKey);
  }

  /** Redraws after the webfont arrives, which changes how the text measures. */
  refreshFont() { this.panel.invalidate(); }

  dispose() {
    this.panel.dispose();
    this.root.remove();
  }
}
