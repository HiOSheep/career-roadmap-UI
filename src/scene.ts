import * as THREE from "three";
import { loadAlbumArtwork, albumArtworkMesh, albumDiscMesh } from "./album-artwork";
import { shelfGeometry, batchShelfMeshes } from "./shelf-geometry";
import { ArchiveVisibility } from "./archive-visibility";
import { InstanceUpdates } from "./instance-updates";
import { RenderState } from "./render-state";
import { SharedDepthAO, SharedDepthBokeh } from "./shared-depth";
import { cloneReturningModel, disposeThreeTree } from "./three-resources";
import { ThemeWave } from "./theme-motion";
import { themeMaterial, themeEnvironment } from "./theme-material";
import { RhythmMotion, rhythmDisplacement, quietBands, type MusicBands, type RhythmStyle } from "./archive-play-motion";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CD_CASE_ASSET, CD_CASE_SHELF_ASSET, CD_CASE_ARRAY_TONES, CD_CASE_ASSEMBLY_ASSET, isCdCaseDecoration, setCdCaseOpen, DiscMotor } from "./cd-case";

/** The key light's direction never changes; only its shadow box follows the view. */
const SHADOW_DIRECTION = new THREE.Vector3(-6, 14, -5).normalize();
import { createArchiveLighting, type LightingLook } from "./archive-lighting";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { normalizeQuality, AdaptiveBudget, type RenderQuality } from "./render-quality";
import { applyTextureQuality, resizeQuality, createAntialiasedComposer } from "./quality-renderer";
import { CardAppearance } from "./appearance";
import { configureInternalOptics } from "./internal-optics";
import { DecryptionController } from "./decryption";
import { fileAtSlot, fileLocation, archiveColumns, columnFiles } from "./data";
import {
  cellKey,
  sameCell,
  selectionCell,
  fileAtCell,
  poolCell,
  LOOP_COLUMNS,
  LOOP_ROWS,
  COLUMN_SPACING,
  ROW_SPACING,
  type ArchiveCell,
  type ArchiveNavigation,
} from "./archive-loop";
import { labelMarkSvg } from "./brand";
import { archiveFraming } from "./viewport-layout";
import { ArchiveDrag, ArchivePlaneMomentum, type DragAxis, type DragProjection, type DragPosition } from "./archive-drag";
import { assetUrl as publicAsset } from "./asset-url";
import { fullMotion, reducedMotion, type MotionPreferences } from "./motion-preferences";
import {
  archiveWave,
  extraction,
  baselineSelectionWave,
  rippleEnvelope,
  settlingWave,
  damp,
  columnStrength,
  idleWave,
  cinematicField,
  cinematicClose,
  openingHandoff,
  INSPECTION_LIFT,
  returnStep,
  returningCaseStep,
} from "./motion";
import {
  ARCHIVE_COVER_FILM,
  ARCHIVE_COVER_FILM_DARK as COVER_FILM_DARK,
  applyCoverVeil,
  coverVeilAt,
  type CoverVeil,
} from "./archive-veil";

const ease = (t: number) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export class ArchiveScene {
  private readonly profileOpaque = new URLSearchParams(location.search).has("profile") && new URLSearchParams(location.search).get("probe") === "opaque";
  private inputEvents = new AbortController();
  private presence = 1;
  private presenceTarget = 1;
  setPresentationVisible(visible: boolean, immediate = false) {
    this.presenceTarget = Number(visible);
    if (immediate) this.presence = this.presenceTarget;
    if (!visible) this.cancelPointer();
  }
  get presentationHidden() { return this.presenceTarget === 0 && this.presence === 0; }
  private presentationDrop(cell: ArchiveCell) {
    const delay = .15 * (1 + Math.tanh((cell.row - this.selectedCell.row) * .1 + (cell.lane - this.selectedCell.lane) * .25));
    return 35 * Math.pow(THREE.MathUtils.clamp((1 - this.presence - delay) / .7, 0, 1), 2);
  }
  revealImmediately() { this.reveal = this.targetReveal; }
  dispose() {
    this.inputEvents.abort();
    this.cancelPointer();
    this.discControls?.dispose();
    disposeThreeTree(this.scene);
    for (const levels of this.detailLevels.values()) {
      levels.low.dispose();
      levels.high.dispose();
    }
    this.detailLevels.clear();
    this.appearance.disposeSources();
    this.artwork?.textures.forEach(texture => texture.dispose());
    this.artwork?.atlas.dispose();
    this.artwork = undefined;
    this.model.clear();
    this.outgoing = [];
    this.instances = [];
    this.assemblyTemplate?.then(disposeThreeTree).catch(() => {});
    this.assemblyTemplate = undefined;
    this.light.shadow.map?.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.loaded = false;
  }
  uiOnlyParallax = false;
  private theme = new ThemeWave();
  private subduedIndex = { value: 0 };
  private selectedIndexOnly = false;
  private superPerformance = false;
  setSuperPerformance(enabled: boolean) {
    if (this.superPerformance === enabled) return;
    this.superPerformance = enabled;
    for (const inst of this.instances) {
      const original = (inst.userData.fullMaterial ??= inst.material) as THREE.MeshPhysicalMaterial;
      if (enabled && !inst.userData.fastMaterial) {
        const fast = original.clone();
        fast.onBeforeCompile = original.onBeforeCompile;
        fast.customProgramCacheKey = original.customProgramCacheKey.bind(original);
        fast.transmission = 0;
        fast.clearcoat = 0;
        fast.roughness = Math.max(.45, original.roughness);
        inst.userData.fastMaterial = fast;
      }
      inst.material = enabled ? inst.userData.fastMaterial : original;
      inst.visible = !enabled || original.name.replace(/\.\d+$/, "") !== "Titanium_Fasteners";
    }
    this.resize();
  }
  setSelectedIndexAccent(onlySelected: boolean) { this.selectedIndexOnly = onlySelected; }
  private artwork?: Awaited<ReturnType<typeof loadAlbumArtwork>>;
  private coverAttribute?: THREE.InstancedBufferAttribute;
  /** One film colour for every cover, so the theme only has to drive it once. */
  private coverLight = new THREE.Color(ARCHIVE_COVER_FILM);
  private coverDark = new THREE.Color(COVER_FILM_DARK);
  private coverFilm = { value: new THREE.Color(ARCHIVE_COVER_FILM) };
  /** Cards in the shelf stay frosted; the delivered case wipes clean as it lifts. */
  private arrayVeil: CoverVeil = { amount: { value: 1 }, color: this.coverFilm };
  private coverVeil: CoverVeil = { amount: { value: 1 }, color: this.coverFilm };
  /** The delivered model's disc, turned while its album plays. */
  private discMesh?: THREE.Mesh;
  private discMotor = new DiscMotor();
  private coverUpdates?: InstanceUpdates;
  private themeAttribute?: THREE.InstancedBufferAttribute;
  get themeAmount() { return this.theme.background(performance.now() / 1000); }
  setTheme(dark: boolean, immediate = false) { this.theme.set(dark, performance.now() / 1000, this.selectedCell, immediate); }
  private playfield = { enabled: false, bands: quietBands(), strength: 1, flatten: 0, target: null as string | null, breathing: true };
  private flatMix = 0;
  private rhythm = new RhythmMotion();
  private rhythmStyle: RhythmStyle = "legacy";
  setRhythmStyle(style: RhythmStyle) { this.rhythmStyle = style; }
  private relayLifts = new Map<string, number>();
  private relayPoints = new Map<string, { cell: ArchiveCell; point: THREE.Vector3 }>();
  private relayActive = false;
  onRelayPick?: (key: string | null) => void;
  setPlayfield(enabled: boolean, bands: MusicBands, strength: number, flatten: number, target: string | null, breathing = true) {
    this.playfield = { enabled, bands, strength, flatten, target, breathing };
  }
  setRelayActive(active: boolean) {
    if (active === this.relayActive) return;
    this.cancelPointer(); this.setHover(null); this.relayActive = active;
    this.pointer.set(0, 0);
  }
  relayPulse(key: string) {
    const cell = this.relayPoints.get(key)?.cell;
    if (cell && !this.reduced) this.emitPulse(cell);
  }
  projectRelay(key: string) {
    const item = this.relayPoints.get(key);
    if (!item) return null;
    const point = item.point.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }
  relayCandidates() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.scene.updateMatrixWorld(true);
    return [...this.relayPoints.keys()].filter(key => {
      const p = this.projectRelay(key)!;
      const x = (p.x - rect.left) / rect.width, y = (p.y - rect.top) / rect.height;
      if (x < .18 || x > .82 || y < .32 || y > .76) return false;
      const hit = this.pickCell(p.x, p.y);
      return hit && cellKey(hit) === key;
    });
  }
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // The reference uses a long lens 72–140 units from the cassette. A 0.1 near
  // plane quantizes adjacent optical layers to the same depth (visible shimmer).
  // All visible foreground geometry is beyond 5; retain the framing and lens.
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 5, 300);
  private composer: EffectComposer;
  private ao: SharedDepthAO;
  private bokeh: BokehPass;
  private instances: THREE.InstancedMesh[] = [];
  private matrixUpdates?: InstanceUpdates;
  private themeUpdates?: InstanceUpdates;
  private renderState = new RenderState();
  private adaptiveBudget = new AdaptiveBudget();
  private renderedFrames = 0;
  private shadowState = new RenderState();
  private shadowUpdates = 0;
  private pendingShadowUpdate = false;
  private lastShadowTime = -Infinity;
  private reusedFrames = 0;
  private visibility = new ArchiveVisibility();
  private instanceCapacity = LOOP_COLUMNS * LOOP_ROWS;
  private openingActive = false;
  private lastOpeningShot = 0;
  private openingBlendStart = -Infinity;
  private openingCameraOffset = new THREE.Vector3();
  private openingAimOffset = new THREE.Vector3();
  private openingFov = 0;
  private drawnCells: ArchiveCell[] = [];
  private extraCoverage = false;
  setArchiveCoverage(extra: boolean) { this.extraCoverage = extra; }
  discControls?: import("./disc-controls").DiscControls;
  private model = new THREE.Group();
  private cdCase = false;
  private caseOpening = { value: 0, velocity: 0 };
  private appearance = new CardAppearance();
  private decryption = new DecryptionController();
  private cursor = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private dummy = new THREE.Object3D();
  private cells: ArchiveCell[] = [];
  private selectedCell: ArchiveCell = { lane: 2, row: 12 };
  private looping = false;
  private coordinateOrigin: ArchiveCell = { lane: 0, row: 0 };
  private lift = { value: 0, velocity: 0 };
  private rail = { value: 0, velocity: 0 };
  private shoulder = { value: 12, velocity: 0 };
  private laneFocus = { value: 2, velocity: 0 };
  private columnCamera = { value: 0, velocity: 0 };
  private returnY: number | null = null;
  private canInspect = false;
  private clearance = 0;
  private pulseGain = 1;
  private idleGain = 0;
  private lastInteraction = 0;
  private scanTime = 29.1;
  private scanBlend = 0;
  private cameraAim = new THREE.Vector3();
  /** 0 while a switched case creeps out of the shelf, 1 at full rise speed. */
  private riseGain = 1;
  private fullDetailPresentation = false;

  /** Share the document's once-per-run presentation choice with the model. */
  private documentRevealStarted = false;
  setDetailPresentation(full: boolean) {
    this.fullDetailPresentation = full;
    this.documentRevealStarted = false;
  }
  setDocumentRevealStarted(started: boolean) { this.documentRevealStarted = started; }
  private outgoing: {
    group: THREE.Group;
    slot: number;
    cell: ArchiveCell;
    lift: { value: number; velocity: number };
    returnY: number | null;
    clarity: number;
    opening: { value: number; velocity: number };
    veil: CoverVeil;
  }[] = [];
  private pulses: { row: number; lane: number; time: number }[] = [];
  private pendingPulse: ArchiveCell | null = null;
  private selectedSlot = fileLocation(0).slot;
  private detail = 0;
  private targetDetail = 0;
  private reveal = 0;
  private targetReveal = 0;
  private last = 0;
  private pointer = new THREE.Vector2();
  private dragging = false;
  private hoverCell: ArchiveCell | null = null;
  private hoverLifts = new Map<string, number>();
  private archiveDrag = new ArchiveDrag();
  private dragTrack: DragPosition | null = null;
  private navigatingDrag = false;
  private archiveMomentum: { motion: ArchivePlaneMomentum; time: number } | null = null;
  private holdingArchive = false;
  private cancelPointer = () => {};
  private rotation = 0;
  private targetRotation = 0;
  private light: THREE.DirectionalLight;
  private clock = 0;
  private loaded = false;
  private labelCanvas = document.createElement("canvas");
  private labelTexture?: THREE.CanvasTexture;
  private labelMark = new Image();
  private motion: MotionPreferences = fullMotion();
  private quality = normalizeQuality(undefined);
  private appliedQuality = "";
  private smaa = new SMAAPass();
  private aoKernelSize = 32;
  private displayHeight = 0;
  private layoutKind = "";
  onSelect?: (index: number, cell?: ArchiveCell) => void;
  onOpen?: () => void;
  onBooklet?: () => void;
  onHover?: (index: number | null) => void;
  onNavigate?: (axis: "row" | "lane", direction: number) => void;
  constructor(
    private container: HTMLElement,
    private readonly selectionPulse = baselineSelectionWave,
    private readonly deferSelectionPulse = false,
    private readonly lightingLook: LightingLook = "baseline",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.5) *
        Math.min(innerWidth / 1920, innerHeight / 1080),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    // All composer passes see the same geometry within one application frame.
    // Generate the shadow map in the beauty pass and reuse it in depth/normal passes.
    this.renderer.shadowMap.autoUpdate = false;
    // three r183 dropped PCFSoftShadowMap from the defines it puts in a shadow
    // program, so it silently fell back to hard-shadow sampling *and* rewrote
    // shadowMap.type to PCFShadowMap on the first shadow pass. That rewrite
    // invalidated every shadowed program's cache key, so the whole set had to
    // recompile in the middle of the opening. Pin the type three actually
    // renders with; the deprecation above makes PCFSoftShadowMap unreachable.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "三维职业路线图月份阵列，点击选择月份，左右拖动切换阶段，上下拖动或滚轮切换月份",
    );
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.renderState.invalidate(), { signal: this.inputEvents.signal });
    this.scene.background = new THREE.Color("#eae5e1");
    // The frame updates world matrices once after simulation; subsequent
    // beauty, normal, depth and transmission renders reuse those same matrices.
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.fog = new THREE.Fog("#eae5e1", 22, 47);
    this.light = createArchiveLighting(this.renderer, this.scene, lightingLook);
    this.light.castShadow = true;
    // The direction is fixed; the box around it follows the view (see
    // fitShadowCamera). A fixed 32x30 patch at the world origin left the shelf —
    // hundreds of units wide, and the delivered case sits on a far lattice cell —
    // outside the shadow map entirely, which is what flattened it.
    this.scene.add(this.light.target);
    Object.assign(this.light.shadow.camera, {
      left: -16,
      right: 16,
      top: 15,
      bottom: -15,
      near: 0.1,
      far: 45,
    });
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.normalBias = lightingLook === "refined" ? 0.018 : 0.035;
    this.light.shadow.bias = lightingLook === "refined" ? -0.00012 : -0.0003;
    this.light.shadow.radius = 4;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: "#d8c9b9", roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = "archive-floor";
    floor.position.y = -4.63;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.camera.position.set(-62.26, 35.98, 43.28);
    this.cameraAim.set(-0.5, 1.1, 0.4);
    this.camera.fov = 6.15;
    this.camera.lookAt(this.cameraAim);
    this.composer = createAntialiasedComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SharedDepthAO(
      this.scene,
      this.camera,
      container.clientWidth,
      container.clientHeight,
    );
    this.ao.kernelRadius = lightingLook === "refined" ? 0.44 : 0.38;
    this.ao.minDistance = 0.001;
    this.ao.maxDistance = 0.09;
    this.composer.addPass(this.ao);
    this.bokeh = new SharedDepthBokeh(this.scene, this.camera, {
      focus: 25,
      aperture: 0.0018,
      maxblur: 0.011,
    }, () => this.ao);
    this.composer.addPass(this.bokeh);
    this.smaa.enabled = false;
    this.composer.addPass(this.smaa);
    this.composer.addPass(new OutputPass());
    this.bindPointer();
  }
  private shelfAsset = false;
  private detailGeometry?: Promise<void>;
  private detailGeometryReady = false;
  private detailLevels = new Map<string, { low: THREE.BufferGeometry; high: THREE.BufferGeometry }>();
  private setGeometryLevel(group: THREE.Group, detailed: boolean) {
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const levels = this.detailLevels.get(`${child.userData.surface}:${child.userData.cdPart}`);
      if (levels) child.geometry = detailed ? levels.high : levels.low;
    }
  }
  async warmup() {
    await this.prepareDetailGeometry();
    // Upload artwork before the opening starts; retain the small bounded album set
    // so revisiting a month does not upload its image again during navigation.
    if (this.artwork) for (const texture of this.artwork.textures) {
      this.renderer.initTexture(texture);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    // Warm the exact states the opening's first frame asks for: the detailed case
    // geometry (the cinematic framing inspects it) and the shadow map, whose depth
    // programs only exist once that pass has run. Compiling them here keeps the
    // transition from the 2D opening to the array from stalling on first use.
    this.setGeometryLevel(this.model, true);
    this.appearance.apply(this.model, 1);
    this.renderer.shadowMap.needsUpdate = true;
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.setGeometryLevel(this.model, false);
    this.appearance.apply(this.model, 1, 0);
    this.appearance.setOpticalDetail(this.model, 0);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderState.invalidate();
  }
  async load(assetUrl = publicAsset(CD_CASE_SHELF_ASSET)) {
    this.shelfAsset = assetUrl.includes("cd-jewel-case-shelf");
    this.labelMark.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(labelMarkSvg)}`;
    await this.labelMark.decode();
    const gltf = await new GLTFLoader().loadAsync(
      assetUrl,
    );
    gltf.scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    this.cdCase = meshes.some(mesh => mesh.userData.modelKind === "cd-jewel-case");
    // Occlusion and depth of field read the opaque depth buffer while the case is
    // layered glass, so they can halo along its edges — which is why they used to
    // be switched off here. They follow the quality preset now: the array's
    // contact shadows are what give the packed shelf its weight, and both stay
    // one step from off in the quality settings. applyQuality() owns the state.
    const count = LOOP_COLUMNS * LOOP_ROWS;
    for (let index = 0; index < count; index++) {
      const cell = poolCell(index);
      this.cells.push(cell);
    }
    for (const mesh of meshes) {
      const geom = mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrixWorld)
        .scale(1, 1, 1);
      const source = mesh.material as THREE.MeshStandardMaterial;
      const name = source.name.replace(/\.\d+$/, "");
      const mat = this.cdCase && !(source instanceof THREE.MeshPhysicalMaterial)
        ? new THREE.MeshPhysicalMaterial({ name: source.name, color: source.color,
            metalness: source.metalness, roughness: source.roughness, side: source.side })
        : source.clone() as THREE.MeshPhysicalMaterial;
      mat.envMapIntensity = 0.6;
      if (name === "CD_Graphite_Tray") {
        mat.color.set("#edf5f6");
        mat.metalness = 0;
        mat.transmission = .8;
        mat.roughness = .16;
        mat.thickness = .035;
        mat.ior = 1.49;
        mat.attenuationColor.set("#e6f1f3");
        mat.attenuationDistance = 6;
      }
      if (name === "CD_Clear_Plastic") {
        mat.transmission = .86;
        mat.roughness = .075;
        mat.thickness = .025;
        mat.ior = 1.49;
        mat.attenuationColor.set("#d8ebef");
        mat.attenuationDistance = 6;
      }
      if (name === "CD_Clear_Rim") {
        mat.transmission = .45;
        mat.thickness = .055;
        mat.roughness = .18;
      }
      if (name === "Frosted_Polymer") {
        mat.color.set("#fffdfa");
        mat.transmission = 0.9;
        mat.thickness = 0.12;
        mat.roughness = 0.21;
        mat.ior = 1.46;
        mat.attenuationColor = new THREE.Color("#eee6df");
        mat.attenuationDistance = 2;
      }
      if (name === "Internal_Ceramic") {
        mat.color.set(this.lightingLook === "refined" ? "#c4baae" : "#c7beb6");
        mat.roughness = 0.6;
      }
      if (name === "Printed_Label") mat.color.set("#eae5dc");
      if (name === "Ivory_Edges") {
        mat.color.set("#f0e7df");
        mat.roughness = 0.31;
        mat.transmission = 0.65;
        mat.thickness = 0.04;
      }
      if (name === "Optical_Diffuser") {
        mat.color.set("#e2dad4");
        mat.transmission = 0;
        mat.roughness = 0.7;
      }
      if (name === "Subsurface_Optics") {
        mat.color.set(this.lightingLook === "refined" ? "#b9a796" : "#b9aba1");
        mat.roughness = 0.48;
        mat.metalness = 0.05;
      }
      if (name === "Optical_Edges") {
        // Internal refractive shoulders must be in the opaque capture: WebGL's
        // screen-space transmission cannot recursively sample another glass mesh.
        mat.transmission = 0;
        mat.color.set(this.lightingLook === "refined" ? "#d8c7b5" : "#d4c7be");
        mat.roughness = 0.26;
        mat.metalness = 0.08;
      }
      configureInternalOptics(name, mat);
      if (name === "Carbon_Ink") continue;
      // The gold index tab on the case's edge is moulding, not content.
      if (isCdCaseDecoration(name)) continue;
      const selectedMesh = new THREE.Mesh(geom, mat);
      Object.assign(selectedMesh.userData, mesh.userData);
      selectedMesh.userData.surface = name;
      selectedMesh.castShadow = name === "Optical_Diffuser" || name === "CD_Graphite_Tray" ||
        name === "CD_Clear_Rim" || name === "Ivory_Edges";
      selectedMesh.receiveShadow = name !== "CD_Clear_Rim" && name !== "CD_Clear_Plastic";
      this.model.add(selectedMesh);
      // Only the shell, edge and fasteners remain visible within tightly packed rows.
      // Keep sub-millimetre optical/typographic geometry on the extracted cassette.
      if ((this.cdCase && (mesh.userData.cdPart === "disc" || name === "CD_Print" || name.startsWith("CD_Spectrum_"))) || (!this.cdCase &&
        ![
          "Frosted_Polymer",
          "Ivory_Edges",
          "Titanium_Fasteners",
          "Index_Inlay",
          "Optical_Diffuser",
        ].includes(name))
      ) {
        this.appearance.register(name, mat);
        continue;
      }
      const arrayMat = this.cdCase
        ? new THREE.MeshLambertMaterial().copy(mat as unknown as THREE.MeshLambertMaterial) as unknown as THREE.MeshPhysicalMaterial
        : mat.clone();
      // Thin distant surfaces need both faces, but not two separate draw passes.
      arrayMat.forceSinglePass = true;
      if (this.cdCase) {
        arrayMat.transmission = 0;
        arrayMat.envMap = null;
        arrayMat.roughness = Math.max(.22, mat.roughness);
        // Reference tones: the shelf's surfaces sit a shade *below* the pale
        // background and stay warm, so every case separates from the atmosphere
        // and keeps a shaded side. Dead white (the model's own #f8fcfd) put the
        // objects brighter than the background and blew the highlights out.
        const tone = CD_CASE_ARRAY_TONES[name];
        if (tone) arrayMat.color.set(tone);
        if (name === "CD_Clear_Plastic") {
          // Closed distant lids have opaque paper behind them. Approximate the
          // glazing with a lit surface rather than blending many hidden sheets.
          arrayMat.transparent = false;
          arrayMat.opacity = 1;
          arrayMat.depthWrite = true;
        }
      }
      if (name === "Frosted_Polymer") {
        arrayMat.transmission = 0.78;
        if (this.lightingLook === "refined") {
          // Longer oblique paths pick up the warm body tint, while the thin
          // edges and the extracted clear cover retain a brighter response.
          arrayMat.thickness = 0.28;
          arrayMat.attenuationColor.set("#d4c7b4");
          arrayMat.attenuationDistance = 1.2;
        }
        arrayMat.transparent = false;
        // The shelf's own tone wins when it has one; the retired model keeps its
        // warm white.
        if (!CD_CASE_ARRAY_TONES[name]) arrayMat.color.set("#fff7ed");
        arrayMat.onBeforeCompile = (shader) => {
          shader.vertexShader =
            "varying float vPanelHeight;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvPanelHeight = position.y / 3.7;",
          );
          shader.fragmentShader =
            "varying float vPanelHeight;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.40, 0.30, 0.20), vec3(1.0, 0.98, 0.94), smoothstep(0.1, 1.0, vPanelHeight));",
          );
        };
        arrayMat.roughness = 0.28;
        arrayMat.clearcoat = 0.3;
        arrayMat.clearcoatRoughness = 0.25;
      }
      if (name === "Optical_Diffuser") arrayMat.color.set("#806447");
      if (name === "Ivory_Edges") {
        arrayMat.transmission = 0;
        arrayMat.color.set(
          this.lightingLook === "refined" ? "#dcc9b0" : "#fff5e9",
        );
        arrayMat.roughness = 0.38;
      }
      if (name === "Index_Inlay") {
        arrayMat.color.set("#e4d6c5");
        arrayMat.metalness = 0.05;
      }
      this.appearance.register(name, mat, arrayMat);
      this.themeAttribute ??= new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("archiveTheme", this.themeAttribute);
      themeMaterial(arrayMat, name, true, this.subduedIndex);
      if (this.cdCase && (name === "CD_Clear_Plastic" || name === "CD_Clear_Rim")) {
        const before = arrayMat.onBeforeCompile;
        arrayMat.onBeforeCompile = (shader, renderer) => {
          before(shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
            "outgoingLight += vec3(0.065) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);\n#include <opaque_fragment>");
        };
        const cache = arrayMat.customProgramCacheKey();
        arrayMat.customProgramCacheKey = () => `${cache}-shelf-glaze`;
        arrayMat.envMapIntensity = 0;
      }
      const arrayGeometry = this.cdCase && !this.shelfAsset ? shelfGeometry(name, mesh.userData.cdPart, geom) : geom;
      if (this.themeAttribute) arrayGeometry.setAttribute("archiveTheme", this.themeAttribute);
      const inst = new THREE.InstancedMesh(arrayGeometry, arrayMat, count);
      // All surfaces move rigidly together; share the transform buffer on the GPU.
      inst.instanceMatrix = this.instances[0]?.instanceMatrix ?? inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow = name === "Optical_Diffuser" || name === "CD_Graphite_Tray" ||
        name === "CD_Clear_Rim" || name === "Ivory_Edges";
      inst.receiveShadow = name !== "CD_Clear_Rim" && name !== "CD_Clear_Plastic";
      inst.frustumCulled = false;
      this.instances.push(inst);
      this.scene.add(inst);
    }
    this.labelCanvas.width = 1024;
    this.labelCanvas.height = 440;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelTexture.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.99, 0.46),
      new THREE.MeshBasicMaterial({
        map: this.labelTexture,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    label.position.set(-1.36, 3.04, 0.255);
    label.name = "legacy-archive-label";
    label.visible = !this.cdCase;
    label.userData.cdPart = "spine";
    this.model.add(label);
    if (this.cdCase) {
      this.artwork = await loadAlbumArtwork();
      // Oblique views of a 1280px cover need anisotropic filtering, and the
      // archive's atlas had none: the shelf's cards went soft at exactly the
      // angle the shelf is always seen from.
      const coverAnisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
      this.artwork.textures.forEach(texture => texture.anisotropy = coverAnisotropy);
      this.artwork.atlas.anisotropy = coverAnisotropy;
      this.model.add(albumArtworkMesh(this.artwork.textures[0]));
      this.discMesh = albumDiscMesh(this.artwork.textures[0]);
      this.model.add(this.discMesh);
      this.model.children.forEach(child => { if (child.userData.cdPart === "disc" && child.userData.surface === "CD_Print") child.visible = false; });
      const plane = albumArtworkMesh(this.artwork.atlas);
      const mat = plane.material;
      this.coverAttribute = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCapacity), 1).setUsage(THREE.DynamicDrawUsage);
      plane.geometry.setAttribute("archiveAlbum", this.coverAttribute);
      mat.onBeforeCompile = shader => {
        shader.vertexShader = "attribute float archiveAlbum;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = ((vMapUv * .992 + .004) + vec2(mod(archiveAlbum, 4.0), 2.0-floor(archiveAlbum/4.0))) / vec2(4.0,3.0);\n#endif");
      };
      mat.customProgramCacheKey = () => "album-atlas-v1";
      // The shelf's covers wear the frost permanently; only the delivered case
      // wipes clean, because only it is ever taken out of the array.
      applyCoverVeil(mat, this.arrayVeil);
      const inst = new THREE.InstancedMesh(plane.geometry, mat, this.instanceCapacity);
      inst.instanceMatrix = this.instances[0].instanceMatrix;
      inst.frustumCulled = false;
      this.instances.push(inst); this.scene.add(inst);
    }
    if (this.cdCase) this.instances = batchShelfMeshes(this.instances, this.scene);
    this.appearance.prepare(this.model);
    this.appearance.apply(this.model, 0);
    // Frost the delivered model's own printed surfaces after the appearance pass
    // has cloned their materials, so the uniform lands on the final instances.
    for (const child of this.model.children)
      if (child instanceof THREE.Mesh && child.userData.albumArtwork)
        applyCoverVeil(child.material as THREE.Material, this.coverVeil);
    this.drawLabel(0);
    this.scene.add(this.model);
    this.model.position.copy(this.cellPosition(poolCell(this.selectedSlot)));
    this.loaded = true;
    disposeThreeTree(gltf.scene);
  }

  private assemblyTemplate?: Promise<THREE.Group>;
  async createAssemblyModel() {
    this.assemblyTemplate ??= new GLTFLoader()
      .loadAsync(publicAsset(this.cdCase ? CD_CASE_ASSEMBLY_ASSET : "assets/archive-assembly.glb"))
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        return gltf.scene;
      })
      .catch((error) => {
        this.assemblyTemplate = undefined;
        throw error;
      });
    const template = await this.assemblyTemplate;
    const model = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const name = (object.material as THREE.Material).name.replace(
        /\.\d+$/,
        "",
      );
      // Same moulding rule as the shelf model: the edge carries no index tab.
      if (isCdCaseDecoration(name)) return;
      const mesh = new THREE.Mesh(
        object.geometry.clone().applyMatrix4(object.matrixWorld),
        object.material,
      );
      mesh.userData.surface = name;
      mesh.userData.assemblyPart = object.userData.assemblyPart;
      mesh.userData.cdPart = object.userData.cdPart;
      model.add(mesh);
      meshes.push(mesh);
    });
    this.appearance.prepare(model);
    this.appearance.apply(model, 1);
    this.appearance.setClarity(model, this.modelClarity());
    this.appearance.setTheme(model, this.themeAmount);
    const canvas = document.createElement("canvas");
    canvas.width = this.labelCanvas.width;
    canvas.height = this.labelCanvas.height;
    canvas.getContext("2d")!.drawImage(this.labelCanvas, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.99, 0.46),
      new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    label.position.set(-1.36, 3.04, 0.255);
    label.userData.assemblyPart = this.cdCase ? "spine" : "cover";
    label.userData.cdPart = "spine";
    label.name = "legacy-archive-label";
    label.visible = !this.cdCase;
    label.userData.themeAmount = themeMaterial(label.material, "Printed_Canvas");
    label.userData.themeAmount.value = this.themeAmount;
    model.add(label);
    meshes.push(label);
    if (this.artwork) {
      const art = albumArtworkMesh(this.artwork.textures[fileAtSlot(this.selectedSlot)]);
      model.add(art); meshes.push(art);
      const disc = albumDiscMesh(this.artwork.textures[fileAtSlot(this.selectedSlot)]);
      model.add(disc); meshes.push(disc);
      model.children.forEach(child => { if (child.userData.cdPart === "disc" && child.userData.surface === "CD_Print") child.visible = false; });
    }
    return {
      model,
      kind: this.cdCase ? "cd-jewel-case" as const : "archive" as const,
      setClarity: (value: number) => this.appearance.setClarity(model, value),
      dispose: () => {
        for (const mesh of meshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
        texture.dispose();
      },
    };
  }
  setMode(mode: "hidden" | "archive" | "detail") {
    if (mode === "detail" && this.shelfAsset) void this.loadDetailGeometry();
    this.cancelPointer();
    this.setHover(null);
    if (mode === "detail") this.decryption.enter(this.scanBlend > .9 && this.decryption.clarity > .999);
    else this.decryption.leave();
    if (mode === "hidden") this.decryption.select();
    if (mode !== "archive") this.pendingPulse = null;
    this.looping = mode !== "hidden";
    if (!this.looping) {
      const canonical = fileLocation(fileAtSlot(this.selectedSlot));
      this.selectedCell = { lane: canonical.lane, row: canonical.row };
      this.coordinateOrigin = { lane: 0, row: 0 };
      for (const old of this.outgoing) {
        this.scene.remove(old.group);
        this.appearance.dispose(old.group);
      }
      this.outgoing = [];
    }
    this.lastInteraction = this.clock;
    this.targetReveal = mode === "hidden" ? 0 : 1;
    this.targetDetail = mode === "detail" ? 1 : 0;
    this.dragging = false;
    if (mode !== "detail") {
      this.targetRotation = 0;
      if (this.rotation !== 0 || this.caseOpening.value > .001) this.returnY = this.model.position.y;
    } else this.returnY = null;
  }
  // Legacy review pages use the old whole-scene toggle.
  prepareDetailGeometry() {
    return this.shelfAsset ? this.loadDetailGeometry() : Promise.resolve();
  }
  private loadDetailGeometry() {
    this.detailGeometry ??= new GLTFLoader().loadAsync(publicAsset(CD_CASE_ASSET)).then(gltf => {
      if (!this.loaded) { disposeThreeTree(gltf.scene); return; }
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const surface = (object.material as THREE.Material).name.replace(/\.\d+$/, "");
        const selected = this.model.children.find(child => child.userData.surface === surface && child.userData.cdPart === object.userData.cdPart) as THREE.Mesh | undefined;
        if (selected) this.detailLevels.set(`${surface}:${object.userData.cdPart}`, {
          low: selected.geometry,
          high: object.geometry.clone().applyMatrix4(object.matrixWorld),
        });
      });
      disposeThreeTree(gltf.scene);
      this.detailGeometryReady = true;
      this.renderState.invalidate();
    }).catch(error => {
      this.detailGeometry = undefined;
      console.warn("Detailed CD geometry could not load; the shelf model remains usable.", error);
    });
    return this.detailGeometry;
  }
  setReduced(value: boolean) { this.setMotion(value ? reducedMotion() : fullMotion()); }
  setMotion(value: MotionPreferences) {
    if ((!value.pointerParallax || !value.dragMomentum) && (this.motion.pointerParallax || this.motion.dragMomentum)) this.cancelPointer();
    if (!value.dragMomentum) {
      this.archiveMomentum = null;
      this.columnCamera.velocity = 0;
      this.rail.velocity = 0;
    }
    if (!value.pointerParallax) this.pointer.set(0, 0);
    if (!value.selectionWave) this.pulses = [];
    if (!value.idleWave) this.idleGain = 0;
    this.motion = { ...value };
    if (!value.modelDecryption) {
      this.appearance.setClarity(this.model, this.modelClarity());
      for (const old of this.outgoing) {
        old.clarity = 0;
        this.appearance.setClarity(old.group, 0);
      }
    }
  }
  private get reduced() { return Object.values(this.motion).every(value => !value); }
  private modelClarity() {
    // Disabling the reveal animation preserves the material state of each mode.
    return this.motion.modelDecryption ? this.decryption.clarity : this.targetDetail;
  }
  setQuality(value: RenderQuality | boolean) {
    const quality =
      typeof value === "boolean"
        ? normalizeQuality(undefined, value)
        : normalizeQuality(value);
    const key = JSON.stringify(quality);
    if (this.appliedQuality === key) return;
    this.appliedQuality = key;
    this.quality = quality;
    if (quality.aoSamples && quality.aoSamples !== this.aoKernelSize) {
      const old = this.ao;
      this.ao = new SharedDepthAO(this.scene, this.camera, 1, 1, quality.aoSamples);
      this.ao.kernelRadius = old.kernelRadius;
      this.ao.minDistance = old.minDistance;
      this.ao.maxDistance = old.maxDistance;
      const index = this.composer.passes.indexOf(old);
      this.composer.removePass(old);
      this.composer.insertPass(this.ao, index);
      old.dispose();
      this.aoKernelSize = quality.aoSamples;
    }
    // Ambient occlusion and depth of field were gated off for the whole CD-case
    // build, which is what flattened the fog-bound array: the blocks lost their
    // contact shadows and the field lost its depth. The quality preset decides
    // them now, exactly as it does for every other surface.
    const inspectingCase = this.cdCase && this.detail >= .65;
    this.ao.enabled = !inspectingCase && quality.aoSamples > 0;
    this.bokeh.enabled = !inspectingCase && quality.depthOfField > 0;
    this.smaa.enabled = quality.antialias === "smaa";
    this.renderer.shadowMap.enabled = quality.shadows > 0;
    const size = Math.min(
      quality.shadows || 1024,
      this.renderer.capabilities.maxTextureSize,
    );
    if (this.light.shadow.mapSize.x !== size) {
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
      this.light.shadow.mapSize.set(size, size);
    }
    this.light.shadow.needsUpdate = true;
    applyTextureQuality(this.scene, this.renderer, quality);
    this.resize();
  }
  private cellPosition(cell: ArchiveCell) {
    return new THREE.Vector3(
      (cell.lane - 2) * COLUMN_SPACING,
      -4.6,
      (cell.row - 15.5) * ROW_SPACING,
    );
  }
  private rebaseCoordinates() {
    // Periodically reduce the logical coordinates while preserving every
    // relative position, spring velocity, ripple and idle phase.
    const shift = {
      lane:
        Math.abs(this.selectedCell.lane) > 2048
          ? Math.round((this.selectedCell.lane - 2) / archiveColumns.length) * archiveColumns.length
          : 0,
      row:
        Math.abs(this.selectedCell.row) > 2048
          ? Math.floor((this.selectedCell.row - 12) / columnFiles(0).length) * columnFiles(0).length
          : 0,
    };
    if (!shift.lane && !shift.row) return;
    this.setHover(null);
    this.hoverLifts.clear();
    this.selectedCell.lane -= shift.lane;
    this.selectedCell.row -= shift.row;
    this.coordinateOrigin.lane += shift.lane;
    this.coordinateOrigin.row += shift.row;
    this.laneFocus.value -= shift.lane;
    this.shoulder.value -= shift.row;
    this.columnCamera.value -= shift.lane * COLUMN_SPACING;
    this.rail.value += shift.row * ROW_SPACING;
    for (const old of this.outgoing) {
      old.cell.lane -= shift.lane;
      old.cell.row -= shift.row;
    }
    for (const pulse of this.pulses) {
      pulse.lane -= shift.lane;
      pulse.row -= shift.row;
    }
    if (this.pendingPulse) {
      this.pendingPulse.lane -= shift.lane;
      this.pendingPulse.row -= shift.row;
    }
  }
  select(index: number, navigation?: ArchiveNavigation) {
    if (!this.navigatingDrag) this.cancelPointer();
    this.setHover(null);
    this.lastInteraction = this.clock;
    // Already inspecting a case? Then this is a month switch inside that view,
    // and the camera should drift to the next one rather than swing across it.
    if (this.targetDetail || this.detail > .5) {
      // A rate step is felt as a snap: the case starts its rise from the slow
      // end and is brought up to speed over the next fraction of a second.
      this.riseGain = 0;
    }
    const next = fileLocation(index).slot;
    const canonical = fileLocation(index);
    const cell = this.looping
      ? selectionCell(index, this.selectedCell, navigation)
      : { lane: canonical.lane, row: canonical.row };
    const changed = !sameCell(cell, this.selectedCell);
    if (this.looping && changed && this.loaded && this.lift.value > 0.0001) {
      const group = cloneReturningModel(this.model);
      const label = group.getObjectByName("legacy-archive-label") as THREE.Mesh;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 440;
      canvas.getContext("2d")!.drawImage(this.labelCanvas, 0, 0);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      label.material = new THREE.MeshBasicMaterial({
        map,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      });
      // Clone carries the selected label material by reference. Replace it
      // before installing appearance shaders, so theme hooks are not appended
      // to the original label a second time on every selection.
      this.appearance.prepare(group);
      this.appearance.apply(group, ease(this.lift.value / 0.4));
      this.appearance.setClarity(group, this.modelClarity());
      // The appearance pass clones the printed materials, so the returning case
      // needs its own frost: it comes back as it is filed into the shelf.
      const veil: CoverVeil = { amount: { value: 0 }, color: this.coverFilm };
      for (const child of group.children)
        if (child instanceof THREE.Mesh && child.userData.albumArtwork)
          applyCoverVeil(child.material as THREE.Material, veil);
      this.scene.add(group);
      this.outgoing.push({
        group,
        slot: this.selectedSlot,
        cell: { ...this.selectedCell },
        lift: { ...this.lift },
        returnY: group.rotation.y !== 0 || this.caseOpening.value > .001 ? group.position.y : null,
        clarity: this.modelClarity(),
        opening: { ...this.caseOpening },
        veil,
      });
      this.lift.value = 0;
      this.lift.velocity = 0;
    }
    this.selectedSlot = next;
    this.selectedCell = cell;
    if (changed) {
      this.caseOpening = { value: 0, velocity: 0 };
      setCdCaseOpen(this.model, 0);
      this.decryption.select();
      this.rotation = 0;
      this.returnY = null;
    }
    const returning = this.outgoing.findIndex((o) => sameCell(o.cell, cell));
    if (returning >= 0) {
      const o = this.outgoing[returning];
      this.lift = { ...o.lift };
      this.rotation = o.group.rotation.y;
      this.returnY = o.returnY;
      this.decryption.select(o.clarity);
      this.caseOpening = { ...o.opening };
      setCdCaseOpen(this.model, this.caseOpening.value);
      this.scene.remove(o.group);
      this.appearance.dispose(o.group);
      this.outgoing.splice(returning, 1);
    }
    if (this.deferSelectionPulse) {
      this.pendingPulse = this.looping ? { ...cell } : null;
    } else this.emitPulse(cell);
    this.targetRotation = 0;
    const art = this.model.getObjectByName("album-artwork") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (art && this.artwork) art.material.map = this.artwork.textures[index];
    const booklet = this.model.getObjectByName("album-booklet") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (booklet && this.artwork) booklet.material.map = this.artwork.textures[index];
    const disc = this.model.getObjectByName("album-disc") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (disc && this.artwork) disc.material.map = this.artwork.textures[index];
    // Keep the bounded album texture set resident to avoid uploads on revisits.
    this.drawLabel(index);
  }
  private emitPulse(cell: ArchiveCell) {
    this.pulses.push({ ...cell, time: this.clock });
    this.pulses = this.pulses.slice(-6);
  }
  private drawLabel(index: number) {
    if (!this.labelTexture) return;
    const c = this.labelCanvas.getContext("2d")!;
    if (this.cdCase) {
      // Preserve the legacy label renderer for the retired model only.
      // New cases have no corporate sticker, numbering or old brand mark.
      c.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
      this.labelTexture.needsUpdate = true;
      return;
    }
    c.fillStyle = "#e6e2d9";
    c.fillRect(0, 0, 1024, 440);
    c.fillStyle = "#171713";
    c.fillRect(12, 12, 1000, 6);
    c.fillRect(12, 419, 1000, 3);
    c.font = "bold 81px MiSans";
    c.fillText("CAREER PLANNER", 22, 116);
    c.font = "32px MiSans";
    c.fillStyle = "#878476";
    c.fillText("CAREER WORKSHEET", 25, 174);
    c.fillStyle = "#171713";
    c.font = "bold 130px MiSans";
    c.fillText("MONTH " + String(index + 1).padStart(2, "0"), 22, 360);
    c.fillRect(782, 32, 221, 39);
    c.fillStyle = "#eee9de";
    c.font = "24px MiSans";
    c.fillText("R L / I S", 809, 61);
    c.fillStyle = "#171713";
    c.font = "bold 64px MiSans";
    c.fillText("INFO", 830, 143);
    c.drawImage(this.labelMark, 790, 242, 210, 98);
    this.labelTexture.needsUpdate = true;
  }
  private ensureInstanceCapacity(required: number) {
    if (required <= this.instanceCapacity) return;
    const capacity = Math.max(required, this.instanceCapacity * 2);
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(THREE.DynamicDrawUsage);
    matrix.array.set(this.instances[0].instanceMatrix.array);
    for (const inst of this.instances) {
      inst.dispose();
      inst.instanceMatrix = matrix;
    }
    const previousTheme = this.themeAttribute;
    this.themeAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    if (previousTheme) this.themeAttribute.array.set(previousTheme.array);
    for (const inst of this.instances) inst.geometry.setAttribute("archiveTheme", this.themeAttribute);
    if (this.coverAttribute) {
      const previous = this.coverAttribute;
      this.coverAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
      this.coverAttribute.array.set(previous.array);
      for (const inst of this.instances) if (inst.geometry.hasAttribute("archiveAlbum")) inst.geometry.setAttribute("archiveAlbum", this.coverAttribute);
      this.coverUpdates = new InstanceUpdates(this.coverAttribute);
    }
    this.matrixUpdates = new InstanceUpdates(matrix);
    this.themeUpdates = new InstanceUpdates(this.themeAttribute);
    this.instanceCapacity = capacity;
  }
  /**
   * Keeps the key light's direction and moves its shadow box onto the case the
   * camera is actually looking at, sized from the lens. Cast shadows between the
   * packed cases — and the dark they throw into the crevices — are what give the
   * shelf its weight, and they only exist where the box covers the geometry. The
   * lens is long (about 6 degrees), so the visible band is narrow and the box
   * stays small enough for crisp contact shadows.
   */
  private fitShadowCamera() {
    if (!this.renderer.shadowMap.enabled) return;
    const focus = this.cameraAim.clone();
    const distance = this.camera.position.distanceTo(focus);
    // The box has to cover the visible band in both axes, so the vertical field
    // of view is widened by the aspect before the margin is applied.
    const span = distance * Math.tan(this.camera.fov * Math.PI / 360);
    const extent = Math.ceil(Math.max(6, span * Math.max(1.9, this.camera.aspect * 1.15)) * 2) / 2;
    const lift = Math.max(40, extent * 3);
    const shadow = this.light.shadow;
    // Stabilize the projection in light-space texels. Subpixel camera motion
    // otherwise resamples every thin case edge into a different shadow pixel.
    const texel = 2 * extent / shadow.mapSize.x;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SHADOW_DIRECTION).normalize();
    const up = new THREE.Vector3().crossVectors(SHADOW_DIRECTION, right).normalize();
    for (const axis of [right, up]) {
      const coordinate = focus.dot(axis);
      focus.addScaledVector(axis, Math.round(coordinate / texel) * texel - coordinate);
    }
    this.light.target.position.copy(focus);
    this.light.target.updateMatrixWorld();
    this.light.position.copy(focus).addScaledVector(SHADOW_DIRECTION, lift);
    Object.assign(shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
      near: 0.1,
      // Casters above the visible band still belong to the shadow volume.
      far: lift + extent * 6,
    });
    shadow.camera.updateProjectionMatrix();
  }

  resize(invalidate = true) {
    if (invalidate) this.renderState.invalidate();
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    const kind = this.container.closest<HTMLElement>("[data-layout]")?.dataset.layout ?? "";
    const displayHeight = this.container.getBoundingClientRect().height;
    if (this.layoutKind === "cinematic" && kind !== "cinematic" && this.displayHeight > 0) {
      // Removing letterboxing starts from the same apparent model size. The
      // existing camera interpolation then carries it to the responsive anchor.
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * displayHeight / this.displayHeight,
      ));
    }
    this.displayHeight = displayHeight;
    this.layoutKind = kind;
    const dimensions = resizeQuality(
      this.renderer,
      this.composer,
      this.container,
      this.quality,
      this.superPerformance,
      !this.superPerformance && (this.ao.enabled || this.bokeh.enabled || this.smaa.enabled),
      this.adaptiveBudget.moving,
    );
    const aoScale = dimensions.width * dimensions.height > 3_000_000
      ? Math.min(.5, this.quality.aoResolution) : this.quality.aoResolution;
    this.ao.setSize(
      Math.max(1, Math.floor(this.ao.enabled ? dimensions.width * aoScale : 1)),
      Math.max(1, Math.floor(this.ao.enabled ? dimensions.height * aoScale : 1)),
    );
    this.ao.setSharing(this.ao.enabled && this.bokeh.enabled && aoScale === 1 && !this.superPerformance);
    this.container.dataset.renderQuality = JSON.stringify({
      ...JSON.parse(this.container.dataset.renderQuality!),
      aoSamples: this.ao.enabled ? this.aoKernelSize : 0,
      aoWidth: this.ao.width,
      aoHeight: this.ao.height,
      shadows: this.renderer.shadowMap.enabled
        ? this.light.shadow.mapSize.x
        : 0,
      depthOfField: this.bokeh.enabled ? this.quality.depthOfField : 0,
    });
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private canBrowse() {
    return (
      this.presenceTarget === 1 &&
      this.looping &&
      !this.targetDetail &&
      this.detail < 0.2 &&
      this.reveal >= 0.8 &&
      this.loaded &&
      !this.container.closest("[inert]")
    );
  }
  private setHover(cell: ArchiveCell | null) {
    if (
      (!cell && !this.hoverCell) ||
      (cell && this.hoverCell && sameCell(cell, this.hoverCell))
    )
      return;
    this.hoverCell = cell ? { ...cell } : null;
    this.onHover?.(cell ? fileAtCell(cell) : null);
  }
  private pickCell(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.cursor.set(
      ((x - r.left) / r.width) * 2 - 1,
      (-(y - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.cursor, this.camera);
    const hit = this.raycaster.intersectObjects(
      [this.instances[0], this.model, ...this.outgoing.map((o) => o.group)],
      true,
    )[0];
    if (!hit) return null;
    if (hit.instanceId !== undefined) return { ...this.drawnCells[hit.instanceId] };
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const copy = this.outgoing.find((o) => o.group === object);
      if (copy) return { ...copy.cell };
      object = object.parent;
    }
    return { ...this.selectedCell };
  }
  private trackCoordinate(axis: DragAxis, value: number) {
    return axis === "lane"
      ? value / COLUMN_SPACING + 2
      : (-value - 2.17) / ROW_SPACING + 15.5;
  }
  private dragProjection(): DragProjection {
    this.model.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const center = this.model.localToWorld(new THREE.Vector3(0, 1.85, 0));
    const rect = this.renderer.domElement.getBoundingClientRect();
    const project = (motion: THREE.Vector3) => {
      const from = center
        .clone()
        .addScaledVector(motion, -0.5)
        .project(this.camera);
      const to = center
        .clone()
        .addScaledVector(motion, 0.5)
        .project(this.camera);
      return {
        x: ((to.x - from.x) * rect.width) / 2,
        y: (-(to.y - from.y) * rect.height) / 2,
      };
    };
    // Positive navigation moves the array along -X for columns and -Z for rows.
    return {
      lane: project(new THREE.Vector3(-COLUMN_SPACING, 0, 0)),
      row: project(new THREE.Vector3(0, 0, -ROW_SPACING)),
    };
  }
  private trackPosition(axis: DragAxis, coordinate: number) {
    return axis === "lane"
      ? (coordinate - 2) * COLUMN_SPACING
      : -2.17 - (coordinate - 15.5) * ROW_SPACING;
  }
  private navigatePlane(coordinate: DragPosition) {
    const goal = { lane: Math.round(coordinate.lane), row: Math.round(coordinate.row) };
    if (sameCell(goal, this.selectedCell)) return;
    const from = { ...this.selectedCell };
    const steps = Math.min(64, Math.max(Math.abs(goal.lane - from.lane), Math.abs(goal.row - from.row)));
    this.navigatingDrag = true;
    try {
      // Select physical cells along the travelled segment in one update per cell.
      // Column memory is updated by onSelect, but never pulls a held plane away.
      for (let i = 1; i <= steps; i++) {
        const cell = {
          lane: Math.round(from.lane + (goal.lane - from.lane) * i / steps),
          row: Math.round(from.row + (goal.row - from.row) * i / steps),
        };
        if (!sameCell(cell, this.selectedCell)) this.onSelect?.(fileAtCell(cell), cell);
      }
    } finally {
      this.navigatingDrag = false;
    }
  }
  private stopMomentum() {
    if (this.archiveMomentum) {
      this.columnCamera.velocity = 0;
      this.rail.velocity = 0;
    }
    this.archiveMomentum = null;
  }
  private bindPointer() {
    const canvas = this.renderer.domElement;
    let activePointer: number | null = null;
    let previousX = 0,
      startX = 0,
      startY = 0,
      moved = false;
    let browse = false,
      cancelled = false;
    let startTrack = { lane: 0, row: 0 };
    let wheelTotal = 0,
      wheelTime = 0;
    const pointers = new Set<number>();
    const hover = (e: PointerEvent) => {
      if (
        e.pointerType !== "mouse" ||
        !this.canBrowse() ||
        this.archiveMomentum
      )
        return;
      const r = canvas.getBoundingClientRect();
      this.pointer.set(
        (e.clientX - r.left) / r.width - 0.5,
        (e.clientY - r.top) / r.height - 0.5,
      );
      const cell = this.pickCell(e.clientX, e.clientY);
      this.setHover(cell);
      canvas.style.cursor = cell ? "pointer" : "grab";
    };
    const reset = () => {
      const id = activePointer;
      activePointer = null;
      this.dragging = false;
      this.dragTrack = null;
      this.holdingArchive = false;
      browse = false;
      this.setHover(null);
      canvas.style.cursor = this.canBrowse() ? "grab" : "default";
      if (id !== null && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    };
    this.cancelPointer = () => {
      cancelled = true;
      this.stopMomentum();
      pointers.clear();
      wheelTotal = 0;
      reset();
    };
    const moveArchive = (e: PointerEvent) => {
      const pending = !this.archiveDrag.active;
      for (const sample of e.getCoalescedEvents?.() ?? []) {
        this.archiveDrag.move(sample.clientX, sample.clientY, sample.timeStamp);
      }
      this.archiveDrag.move(e.clientX, e.clientY, e.timeStamp);
      moved ||= this.archiveDrag.moved;
      if (!this.archiveDrag.active) return;
      if (pending) {
        startTrack = { lane: this.columnCamera.value, row: this.rail.value };
      }
      this.setHover(null);
      this.lastInteraction = this.clock;
      canvas.style.cursor = "grabbing";
      this.dragTrack = {
        lane: startTrack.lane + this.archiveDrag.value.lane * COLUMN_SPACING,
        row: startTrack.row - this.archiveDrag.value.row * ROW_SPACING,
      };
      this.columnCamera.value = this.dragTrack.lane;
      this.rail.value = this.dragTrack.row;
      this.columnCamera.velocity = this.rail.velocity = 0;
      this.navigatePlane({
        lane: this.trackCoordinate("lane", this.columnCamera.value),
        row: this.trackCoordinate("row", this.rail.value),
      });
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!this.canBrowse() && !this.canInspect) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        cancelled = true;
        reset();
        return;
      }
      activePointer = e.pointerId;
      cancelled = false;
      moved = this.archiveMomentum !== null;
      startX = previousX = e.clientX;
      startY = e.clientY;
      browse = this.canBrowse();
      this.stopMomentum();
      if (browse) {
        this.columnCamera.velocity = 0;
        this.rail.velocity = 0;
      }
      this.holdingArchive = browse;
      this.dragging = !browse && this.canInspect;
      startTrack = { lane: this.columnCamera.value, row: this.rail.value };
      this.archiveDrag.start(e.clientX, e.clientY, this.dragProjection(), e.timeStamp);
      this.setHover(null);
      canvas.setPointerCapture(e.pointerId);
      if (this.relayActive) { this.holdingArchive = false; this.dragging = false; }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointermove", (e) => {
      if (this.relayActive) {
        if (e.pointerId === activePointer) moved ||= Math.hypot(e.clientX - startX, e.clientY - startY) > 7;
        return;
      }
      if (activePointer !== null && e.pointerId !== activePointer) return;
      if (activePointer === null) {
        hover(e);
        return;
      }
      if (cancelled) return;
      moved ||= Math.hypot(e.clientX - startX, e.clientY - startY) > 7;
      if (browse) {
        if (!this.canBrowse()) {
          this.cancelPointer();
          return;
        }
        moveArchive(e);
        return;
      }
      if (this.dragging && this.canInspect) {
        this.targetRotation = THREE.MathUtils.clamp(
          this.targetRotation + (e.clientX - previousX) * 0.004,
          -0.8,
          0.8,
        );
        previousX = e.clientX;
      }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointerup", (e) => {
      pointers.delete(e.pointerId);
      if (e.pointerId !== activePointer) return;
      if (this.relayActive) {
        if (!cancelled && !moved) { const cell = this.pickCell(e.clientX, e.clientY); this.onRelayPick?.(cell ? cellKey(cell) : null); }
        reset(); return;
      }
      if (!cancelled && browse && this.canBrowse()) {
        moveArchive(e);
        if (this.archiveDrag.active) {
          if (this.motion.dragMomentum) {
            this.archiveMomentum = {
              time: performance.now() / 1000,
              motion: new ArchivePlaneMomentum(
                { lane: this.trackCoordinate("lane", this.columnCamera.value), row: this.trackCoordinate("row", this.rail.value) },
                this.archiveDrag.releaseVelocity(e.timeStamp, false),
              ),
            };
          }
        } else if (!moved) {
          const cell = this.pickCell(e.clientX, e.clientY);
          if (cell) {
            if (sameCell(cell, this.selectedCell)) this.onOpen?.();
            else this.onSelect?.(fileAtCell(cell), cell);
          }
        }
      }
      if (!cancelled && !browse && !moved && this.caseOpening.value > .9) {
        const rect = canvas.getBoundingClientRect();
        this.cursor.set((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1);
        this.raycaster.setFromCamera(this.cursor, this.camera);
        const booklet = this.model.getObjectByName("album-booklet");
        if (booklet && this.raycaster.intersectObject(booklet).length) this.onBooklet?.();
      }
      reset();
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointercancel", (e) => {
      pointers.delete(e.pointerId);
      if (e.pointerId === activePointer) {
        cancelled = true;
        reset();
      }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("lostpointercapture", (e) => {
      pointers.delete(e.pointerId);
      if (e.pointerId === activePointer) {
        cancelled = true;
        reset();
      }
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener("pointerleave", () => {
      this.pointer.set(0, 0);
      this.setHover(null);
    }, { signal: this.inputEvents.signal });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.relayActive) { e.preventDefault(); return; }
        if (
          !this.canBrowse() ||
          activePointer !== null ||
          e.ctrlKey ||
          Math.abs(e.deltaX) > Math.abs(e.deltaY)
        )
          return;
        e.preventDefault();
        if (this.archiveMomentum) this.stopMomentum();
        const now = performance.now();
        const delta = THREE.MathUtils.clamp(
          e.deltaY *
            (e.deltaMode === 1
              ? 40
              : e.deltaMode === 2
                ? canvas.clientHeight
                : 1),
          -300,
          300,
        );
        if (now - wheelTime > 180 || Math.sign(delta) !== Math.sign(wheelTotal))
          wheelTotal = 0;
        wheelTime = now;
        wheelTotal += delta;
        const steps = Math.min(3, Math.floor(Math.abs(wheelTotal) / 100));
        if (!steps) return;
        const direction = Math.sign(wheelTotal);
        wheelTotal -= direction * steps * 100;
        this.navigatingDrag = true;
        try {
          for (let i = 0; i < steps; i++) this.onNavigate?.("row", direction);
        } finally {
          this.navigatingDrag = false;
        }
      },
      { ...{ passive: false }, signal: this.inputEvents.signal },
    );
    window.addEventListener("blur", () => this.cancelPointer(), { signal: this.inputEvents.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.cancelPointer();
    }, { signal: this.inputEvents.signal });
    window.addEventListener("resize", () => this.cancelPointer(), { signal: this.inputEvents.signal });
    // After multi-touch cancels capture, a finger can finish outside the canvas.
    window.addEventListener("pointerup", (e) => pointers.delete(e.pointerId), { signal: this.inputEvents.signal });
    window.addEventListener("pointercancel", (e) =>
      pointers.delete(e.pointerId), { signal: this.inputEvents.signal }
    );
  }
  update(
    time: number,
    cinematic?: { reveal: number; lift: number; zoom: number; time: number },
  ) {
    const elapsed = Math.max(0, time - this.last || 0.016);
    const dt = Math.min(elapsed, 0.05);
    this.last = time;
    this.clock = time;
    if (!this.loaded) return;
    const step = !this.motion.surfaceTransitions ? 1 : Math.min(elapsed, .25) / 1.1;
    this.presence += Math.sign(this.presenceTarget - this.presence) * Math.min(step, Math.abs(this.presenceTarget - this.presence));
    this.renderer.domElement.style.opacity = String(THREE.MathUtils.clamp(this.presence / .16, 0, 1));
    this.theme.beginFrame();
    themeEnvironment(this.scene, this.renderer, this.themeAmount);
    const blend = 1 - Math.exp(-dt * (this.motion.selectionTransition ? 2.8 : 35));
    const detailBlend = 1 - Math.exp(-dt * (this.motion.detailTransition ? 2.8 : 35));
    this.reveal = cinematic
      ? cinematic.reveal
      : THREE.MathUtils.lerp(this.reveal, this.targetReveal, blend);
    // Lining up and closing the lid run together: they were strictly serial, so
    // a dragged case waited for the hinge before it even started turning back,
    // which is what made the retraction feel stalled.
    this.rotation = this.targetDetail
      ? THREE.MathUtils.lerp(this.rotation, this.targetRotation, detailBlend)
      : returnStep(this.rotation, dt, !this.motion.detailTransition);
    const shot = cinematic?.time ?? 29.1;
    if (cinematic) {
      this.openingActive = true;
      this.lastOpeningShot = cinematic.time;
    } else if (this.openingActive) {
      this.openingActive = false;
      this.openingBlendStart = time;
      this.openingCameraOffset.copy(this.camera.position).sub(this.model.position);
      this.openingAimOffset.copy(this.cameraAim).sub(this.model.position);
      this.openingFov = this.camera.fov;
    }
    const openingBlend = openingHandoff(time - this.openingBlendStart, !this.motion.detailTransition);
    if (cinematic) {
      this.scanTime = shot;
      this.scanBlend = 1;
    } else {
      this.scanTime += dt;
      this.scanBlend *= Math.exp(-dt * 3);
    }
    if (!this.canBrowse()) {
      this.setHover(null);
      if (this.holdingArchive || this.archiveMomentum) this.cancelPointer();
    }
    if (this.looping && !cinematic && openingBlend >= 1 && !this.holdingArchive && !this.archiveMomentum) this.rebaseCoordinates();
    const momentum = !cinematic ? this.archiveMomentum : null;
    if (momentum) {
      momentum.motion.step(Math.min(Math.max(time - momentum.time, 0), 0.25));
      momentum.time = time;
      this.navigatePlane(momentum.motion.value);
      this.lastInteraction = time;
    }
    const hoverKey = !cinematic && this.hoverCell ? cellKey(this.hoverCell) : null;
    if (hoverKey && !this.hoverLifts.has(hoverKey)) this.hoverLifts.set(hoverKey, 0);
    for (const [key, value] of this.hoverLifts) {
      const target = key === hoverKey ? 0.28 : 0;
      const next = cinematic ? 0 : !this.motion.selectionTransition ? target : THREE.MathUtils.lerp(value, target, 1 - Math.exp(-dt * 14));
      if (target === 0 && next < 0.0001) this.hoverLifts.delete(key);
      else this.hoverLifts.set(key, next);
    }
    const hoverLift = (cell: ArchiveCell) => this.hoverLifts.get(cellKey(cell)) ?? 0;
    const chosen = this.cellPosition(this.selectedCell);
    const selectedRow = this.selectedCell.row;
    const selectedLane = this.selectedCell.lane;
    damp(this.shoulder, selectedRow, this.motion.selectionTransition ? 5 : 35, dt);
    damp(this.laneFocus, selectedLane, this.motion.selectionTransition ? 4 : 35, dt);
    // A held or freely coasting plane owns both tracks; selection cannot pull it.
    if (!this.holdingArchive && !momentum) {
      damp(this.columnCamera, chosen.x, this.motion.selectionTransition ? 3.7 : 35, dt);
      damp(this.rail, cinematic ? 0 : -2.17 - chosen.z, this.motion.selectionTransition ? 3.7 : 35, dt);
    }
    if (momentum) {
      this.columnCamera.value = this.trackPosition("lane", momentum.motion.lane.value);
      this.rail.value = this.trackPosition("row", momentum.motion.row.value);
      this.columnCamera.velocity = momentum.motion.lane.velocity * COLUMN_SPACING;
      this.rail.velocity = -momentum.motion.row.velocity * ROW_SPACING;
      if (momentum.motion.phase === "idle") this.archiveMomentum = null;
    }
    if (this.dragTrack && !cinematic) {
      this.columnCamera.value = this.dragTrack.lane;
      this.rail.value = this.dragTrack.row;
      this.columnCamera.velocity = this.rail.velocity = 0;
    }
    if (cinematic) {
      this.rail.value = 0;
      this.rail.velocity = 0;
      this.lift.value = extraction(shot);
      this.lift.velocity = 0;
      this.shoulder.value = selectedRow;
      this.laneFocus.value = selectedLane;
      this.laneFocus.velocity = 0;
      this.columnCamera.value = chosen.x;
      this.columnCamera.velocity = 0;
    }
    // Keep the illuminated set near the origin. Lateral navigation is a track
    // movement of the whole array, just like the existing front/back rail.
    const trackX = cinematic ? 0 : this.columnCamera.value * openingBlend;
    this.pulses = this.pulses.filter((p) => time - p.time < 3.2);
    const aligningCopy = this.outgoing.some((o) => o.returnY !== null);
    const idle =
      !cinematic &&
      this.motion.idleWave &&
      this.targetReveal > 0 &&
      !this.targetDetail &&
      this.detail < 0.01 &&
      this.returnY === null &&
      !aligningCopy &&
      time - this.lastInteraction > 2.5;
    this.idleGain = cinematic
      ? 0
      : THREE.MathUtils.lerp(
          this.idleGain,
          idle ? (this.playfield.enabled ? (this.playfield.breathing && !this.relayActive ? 1 - this.playfield.bands.activity : 0) : 1) : 0,
          1 - Math.exp(-dt * (idle ? 0.8 : 4)),
        );
    this.pulseGain = THREE.MathUtils.lerp(
      this.pulseGain,
      this.targetDetail || this.returnY !== null || aligningCopy ? 0 : 1,
      1 - Math.exp(-dt * 8),
    );
    const play = this.playfield;
    const activePlay = !cinematic && !this.targetDetail && play.enabled;
    const rhythm = this.rhythm.update(activePlay && !this.reduced ? play.bands : quietBands(), time, dt, this.rhythmStyle);
    this.flatMix += ((activePlay ? play.flatten : 0) - this.flatMix) * (this.reduced ? 1 : 1 - Math.exp(-dt * 4));
    this.subduedIndex.value = Math.max(Number(this.selectedIndexOnly), this.flatMix);
    const indexDim = (lift: number) => this.selectedIndexOnly
      ? 1 - ease(lift / .4) * (1 - this.flatMix)
      : this.flatMix;
    const gameTarget = activePlay ? play.target : null;
    if (gameTarget && !this.relayLifts.has(gameTarget)) this.relayLifts.set(gameTarget, 0);
    for (const [key, height] of this.relayLifts) {
      const next = height + ((key === gameTarget ? .95 : 0) - height) * (this.reduced ? 1 : 1 - Math.exp(-dt * 8));
      if (next < .001 && key !== gameTarget) this.relayLifts.delete(key); else this.relayLifts.set(key, next);
    }
    const spectrumPoint = new THREE.Vector3();
    const screenX = (row: number, lane: number) => {
      spectrumPoint.set((lane - 2) * COLUMN_SPACING - trackX, -4.6, (row - 15.5) * ROW_SPACING + this.rail.value).project(this.camera);
      return (spectrumPoint.x + 1) / 2;
    };
    const field = (row: number, lane: number) => {
      if (cinematic)
        return cinematicField(
          row,
          lane,
          shot,
          this.shoulder.value,
          this.laneFocus.value,
        );
      const height =
        archiveWave(
          row + this.coordinateOrigin.row,
          lane + this.coordinateOrigin.lane,
          this.scanTime,
        ) *
          this.scanBlend;
      const breathing = idleWave(
          row + this.coordinateOrigin.row,
          lane + this.coordinateOrigin.lane,
          time,
        ) *
          this.idleGain;
      let pulseHeight = 0;
      if (!cinematic && this.motion.selectionWave) {
        let ripple = 0;
        for (const p of this.pulses) {
          const distance = Math.hypot(row - p.row, (lane - p.lane) * 2.2);
          const age = time - p.time;
          ripple +=
            this.selectionPulse(distance, age) *
            (this.deferSelectionPulse ? rippleEnvelope(distance, age) : 1);
        }
        pulseHeight = THREE.MathUtils.clamp(ripple, -0.6, 0.6) * this.pulseGain;
      }
      const distance = row - this.shoulder.value;
      const interactiveHeight = (
        (height +
        settlingWave(distance, 26.56) *
          columnStrength(lane, this.laneFocus.value)) * (1 - this.flatMix) + breathing + pulseHeight +
        (activePlay && !this.reduced ? rhythmDisplacement(row, lane, time, play.bands, play.strength, rhythm, screenX(row, lane)) : 0) +
        (this.relayLifts.get(cellKey({ row, lane })) ?? 0)
      );
      return openingBlend < 1
        ? THREE.MathUtils.lerp(cinematicField(row, lane, this.lastOpeningShot, this.shoulder.value, this.laneFocus.value), interactiveHeight, openingBlend)
        : interactiveHeight;
    };
    const selectedBase = chosen.y + field(selectedRow, selectedLane);
    // Only the lid and the alignment are in the way: a lid swings about three
    // units clear of its case, and a case that is still turned toward the camera
    // sticks out past its slot. So the arrival waits for the fold *and* for the
    // neighbour to face back into the shelf — waiting only for the lid let the
    // rising case cut through a case that had been dragged to an angle.
    const neighbourClearing = this.outgoing.some(
      (o) =>
        o.cell.lane === selectedLane &&
        Math.abs(o.cell.row - selectedRow) < 5 &&
        (o.opening.value > .02 || Math.abs(o.group.rotation.y) > .04),
    );
    if (!cinematic) {
      // 0 while a switched case creeps clear of its neighbour's lid, 1 at full
      // rise speed. Ramped rather than switched, and reset on every switch.
      this.riseGain = THREE.MathUtils.lerp(
        this.riseGain,
        neighbourClearing ? 0 : 1,
        1 - Math.exp(-dt * 7),
      );
      if (this.returnY !== null && (this.rotation !== 0 || this.caseOpening.value > .001)) {
        this.lift.value = this.returnY - selectedBase;
        this.lift.velocity = 0;
      } else {
        this.returnY = null;
        const liftTarget = this.targetDetail
          ? INSPECTION_LIFT
          : neighbourClearing
            ? 0
            : 0.4 * this.targetReveal * (1 - this.flatMix);
        damp(
          this.lift,
          liftTarget,
          !this.motion.detailTransition
            ? 35
            : this.deferSelectionPulse &&
                !this.targetDetail &&
                this.lift.value < 0.4
              ? 7.6
              : this.targetDetail
                // While the neighbour's lid is still folding the case creeps
                // rather than waiting, and the rate is brought up smoothly
                // instead of stepped: a step in the damping rate is felt as a
                // small but fast lurch right where the move should be ending.
                ? 1.4 + ((this.fullDetailPresentation ? 4.2 : 6.5) - 1.4) * this.riseGain
                : 4.2,
          dt,
        );
        // A damped spring only ever approaches its target, so the last per cent
        // crawled for about a second after the move looked finished. Arriving is
        // an arrival: below a pixel's worth of travel it is simply stopped.
        if (
          Math.abs(this.lift.value - liftTarget) < .01 &&
          Math.abs(this.lift.velocity) < .08
        ) {
          this.lift.value = liftTarget;
          this.lift.velocity = 0;
        }
      }
    }
    // The frost wipes off as the case is drawn out of the shelf and returns as
    // it is filed back, so a card never hard-swaps for the delivered model. The
    // film follows the theme, so dark mode lays a dark film instead of a paper
    // one and the shelf does not light up.
    // The frost tracks the shelf-to-inspection journey, not the lift itself: a
    // month switch dips the case back toward the shelf, and frosting the cover
    // again on every switch read as a stutter. `detail` only moves on entry and
    // exit, so the cover wipes clean once and stays clean while it is inspected.
    this.coverVeil.amount.value = coverVeilAt(INSPECTION_LIFT * this.detail);
    this.coverFilm.value.copy(this.coverLight).lerp(this.coverDark, this.themeAmount);
    // The disc turns while its album plays and holds its angle when audio stops.
    const discAngle = this.discMotor.step(this.discControls?.playing ?? false, dt, !this.motion.detailTransition);
    if (this.discMesh) this.discMesh.rotation.z = discAngle;
    const cameraTarget = this.targetDetail
      ? ease((this.lift.value - 0.8) / 2.4)
      : this.returnY !== null
        ? this.detail
        : ease((this.lift.value - 0.4) / (INSPECTION_LIFT - 0.4));
    this.detail = cinematic
      ? cinematic.zoom
      : THREE.MathUtils.lerp(this.detail, cameraTarget, detailBlend);
    const detail = this.detail;
    this.setGeometryLevel(this.model, Boolean(cinematic) || detail > .12 || this.caseOpening.value > .001);
    // Keep the physical decryption timeline alive even when its model visuals
    // are disabled; the document mask uses the same timeline independently.
    this.decryption.update(dt, detail > .78 && this.lift.value > 3.3, false,
      cinematic ? shot + 5 : undefined);
    const opticalDetail = this.profileOpaque ? 0 : cinematic ? 1 : ease((detail - .01) / .44);
    this.appearance.apply(this.model, ease(this.lift.value / 0.4), this.cdCase ? opticalDetail : 1);
    this.appearance.setClarity(this.model, this.modelClarity());
    if (this.cdCase) this.appearance.setOpticalDetail(this.model, opticalDetail);
    if (this.cdCase) {
      // The hinge moves only after the case clears its neighbours. Reverse
      // from the current angle, then keep its elevation until fully closed.
      // The target ramps with the last of the rise instead of stepping at a
      // threshold: a step makes the spring accelerate hardest on its first frame,
      // which read as a jolt in the final centimetres of the move.
      const arrival = THREE.MathUtils.clamp((this.lift.value - 3.55) / .45, 0, 1);
      const open = this.targetDetail && (!this.fullDetailPresentation || this.documentRevealStarted)
        ? arrival * ease((detail - .75) / .15)
        : 0;
      if (this.motion.detailTransition) damp(this.caseOpening, open, this.fullDetailPresentation ? 8 : 11, dt);
      else this.caseOpening = { value: open, velocity: 0 };
      if (Math.abs(this.caseOpening.value - open) < .001 && Math.abs(this.caseOpening.velocity) < .01)
        this.caseOpening = { value: open, velocity: 0 };
      setCdCaseOpen(this.model, this.caseOpening.value);
    }
    // Reference 26.92–27.76: the array travels horizontally into a white field.
    const entry = cinematic ? ease((shot - 21.9) / 0.86) : this.reveal;
    const entranceTime = THREE.MathUtils.clamp((shot - 21.92) / 0.75, 0, 1);
    const entryZ = cinematic
      ? -23 * (1 - entranceTime) ** 2
      : -28 * (1 - entry);
    for (let i = this.outgoing.length - 1; i >= 0; i--) {
      const o = this.outgoing[i];
      this.setGeometryLevel(o.group, detail > .12 || o.opening.value > .001);
      const p = this.cellPosition(o.cell);
      const baseY = p.y + field(o.cell.row, o.cell.lane);
      // The lid folds faster than it opens: it has to be shut before its case
      // starts lowering, or it sweeps through the one arriving beside it.
      // Match the active case's return: straighten while the lid folds, keeping
      // the case elevated until both finish. Serialising these two motions made
      // a rotated month switch pause for an entire lid-close before turning.
      o.group.rotation.y = returningCaseStep(o.opening, o.group.rotation.y, dt, !this.motion.detailTransition);
      setCdCaseOpen(o.group, o.opening.value);
      if (o.returnY !== null) {
        o.lift.value = o.returnY - baseY;
        o.lift.velocity = 0;
        if (o.group.rotation.y === 0 && !o.opening.value) o.returnY = null;
      } else damp(o.lift, 0, this.motion.detailTransition ? 6 : 35, dt);
      o.group.position.set(
        p.x - trackX,
        baseY + o.lift.value + hoverLift(o.cell) - this.presentationDrop(o.cell),
        p.z + entryZ + this.rail.value,
      );
      const quality = ease(o.lift.value / 0.4);
      this.appearance.apply(o.group, quality, this.cdCase ? opticalDetail : 1);
      this.appearance.setTheme(o.group, this.theme.sample(o.cell, time), indexDim(o.lift.value));
      o.clarity = this.motion.modelDecryption ? o.clarity * Math.exp(-dt * 9) : 0;
      this.appearance.setClarity(o.group, o.clarity);
      if (this.cdCase) this.appearance.setOpticalDetail(o.group, opticalDetail);
      // Frost follows the case's own height, so a returning copy is crisp while
      // it flies and frosted by the time it reaches the shelf.
      o.veil.amount.value = coverVeilAt(o.lift.value);
      const { row, lane } = o.cell;
      o.group.rotation.x =
        (field(row + 0.5, lane) - field(row - 0.5, lane)) *
        0.024 *
        (1 - detail) *
        (1 - quality);
      if (o.lift.value < 0.0001 && Math.abs(o.group.rotation.y) < 0.0001) {
        this.scene.remove(o.group);
        this.appearance.dispose(o.group);
        this.outgoing.splice(i, 1);
      }
    }
    if (
      this.pendingPulse &&
      !cinematic &&
      !this.targetDetail &&
      this.targetReveal
    ) {
      const selectedY = selectedBase + this.lift.value;
      const oldCardsLower = this.outgoing.every(
        (old) =>
          old.cell.lane !== selectedLane ||
          Math.abs(old.cell.row - selectedRow) > 4 ||
          old.group.position.y + 0.015 < selectedY,
      );
      // The new file causes the wave: finish most of its rise and let nearby
      // outgoing files get below it before starting the outward pulse.
      if (this.lift.value >= 0.35 && this.returnY === null && oldCardsLower) {
        if (this.motion.selectionWave) this.emitPulse(this.pendingPulse);
        this.pendingPulse = null;
      }
    }
    this.appearance.setTheme(this.model, this.theme.sample(this.selectedCell, time), indexDim(this.lift.value));
    this.model.position.set(
      chosen.x - trackX,
      chosen.y + field(selectedRow, selectedLane) + this.lift.value + hoverLift(this.selectedCell) - this.presentationDrop(this.selectedCell),
      chosen.z + entryZ + this.rail.value,
    );
    // Extraction only changes elevation. Reframing belongs to the camera.
    this.model.rotation.set(
      (field(selectedRow + 0.5, selectedLane) -
        field(selectedRow - 0.5, selectedLane)) *
        0.024 *
        (1 - detail) *
        (1 - ease(this.lift.value / 0.4)),
      cinematic ? 0 : this.rotation,
      0,
    );
    // Measured from frame 787: X edge (382,-204), adjacent row (78,38).
    // The label vertical edge constrains height; the file base is occluded.
    // Do not calibrate field of view from the visible fragment of a file.
    const orbit = ease((shot - 22.6) / 1.6);
    const settle = ease((shot - 24.25) / 2.25);
    const yaw = THREE.MathUtils.degToRad(89 - 22 * orbit - 8 * settle);
    const elevation = THREE.MathUtils.degToRad(
      3 + 40 * ease((shot - 21.96) / 0.22) - 8 * orbit - 16 * settle,
    );
    const span = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(10.8, 10.3, orbit),
      7.33,
      settle,
    );
    const responsiveOpening = Boolean(cinematic) && this.container.closest<HTMLElement>("[data-layout]")?.dataset.layout === "opening";
    const openingAspect = responsiveOpening ? this.container.clientWidth / this.container.clientHeight / (16 / 9) : 1;
    const openingSpan = (value: number) => value / Math.min(1, openingAspect);
    const distance = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(28 + 7 * orbit, 140, settle),
      72,
      detail,
    );
    const arrayAim = new THREE.Vector3(
      -1.091,
      THREE.MathUtils.lerp(-2.55 + 0.4 * orbit, -0.045, settle),
      THREE.MathUtils.lerp(2.48, 0.481, settle),
    );
    const cameraAim = arrayAim.clone();
    const viewDirection = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    );
    if (cinematic) {
      const earlyTurn = ease((shot - 27.3) / 1.3);
      const finalTurn = ease(cinematicClose(shot, 28.6));
      const shotYaw =
        yaw - THREE.MathUtils.degToRad(9 * earlyTurn + 32 * finalTurn);
      const shotElevation =
        elevation - THREE.MathUtils.degToRad(1.5 * earlyTurn + 3.7 * finalTurn);
      viewDirection.set(
        -Math.sin(shotYaw) * Math.cos(shotElevation),
        Math.sin(shotElevation),
        Math.cos(shotYaw) * Math.cos(shotElevation),
      );
    } else {
      viewDirection
        .lerp(new THREE.Vector3(-0.277, 0.238, 0.931), detail)
        .normalize();
    }
    if (cinematic) {
      const pan = ease((shot - 25.4) / 0.95);
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
        .normalize();
      cameraAim.addScaledVector(
        right,
        -2.05 * (1 - pan) * ease((shot - 24.2) / 0.8),
      );
    }
    if (cinematic && shot >= 25.05 && shot <= 27.3) {
      // Frames 760–785: the camera carries the same physical column from the
      // right into the selected position while the neighboring crests subside.
      const pan = ease((shot - 25.4) / 1.05);
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
        .normalize();
      const up = new THREE.Vector3()
        .crossVectors(viewDirection, right)
        .normalize();
      const pixelScale = 1080 / openingSpan(span);
      const anchorAim = this.model.position
        .clone()
        .add(new THREE.Vector3(-2.5, 3.7, 0));
      anchorAim.addScaledVector(
        right,
        -(THREE.MathUtils.lerp(840, 518, pan) - 960) * openingAspect / pixelScale,
      );
      anchorAim.addScaledVector(
        up,
        -(540 - THREE.MathUtils.lerp(340, 288, pan)) / pixelScale,
      );
      cameraAim.lerp(anchorAim, ease((shot - 25.05) / 0.35));
    }
    if (cinematic && shot > 27.3) {
      const close = ease(cinematicClose(shot, 27.3));
      const extractionCamera = ease((shot - 27.3) / 1.25);
      const screenX = THREE.MathUtils.lerp(
        518 - 98 * extractionCamera,
        618,
        close,
      );
      const screenY = THREE.MathUtils.lerp(
        296 + 34 * extractionCamera,
        287,
        close,
      );
      const pixelScale = 1080 / openingSpan(THREE.MathUtils.lerp(span, 5.9, detail));
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
        .normalize();
      const up = new THREE.Vector3()
        .crossVectors(viewDirection, right)
        .normalize();
      const anchorAim = this.model.position
        .clone()
        .add(new THREE.Vector3(-2.5, 3.7, 0));
      anchorAim.addScaledVector(right, -(screenX - 960) * openingAspect / pixelScale);
      anchorAim.addScaledVector(up, -(540 - screenY) / pixelScale);
      cameraAim.lerp(anchorAim, ease((shot - 27.3) / 0.5));
    }
    const framing = archiveFraming(this.container.clientWidth, this.container.clientHeight, span, detail,
      this.container.closest<HTMLElement>("[data-layout]")?.dataset.layout === "compact");
    if (!cinematic) {
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
        .normalize();
      const up = new THREE.Vector3()
        .crossVectors(viewDirection, right)
        .normalize();
      const width = this.container.clientWidth, height = this.container.clientHeight;
      const pixelScale = height / framing.span;
      if (framing.portrait) {
        // Keep the preview camera independent of the live lift, wave and rail.
        // Following model.position here would visually cancel those motions.
        const previewAim = new THREE.Vector3(0, -4.6 + settlingWave(0, 26.56) + 0.4 + 1.85, -2.17);
        previewAim.addScaledVector(up, (framing.previewY - 0.5) * height / pixelScale);
        cameraAim.copy(previewAim);
      }
      const detailAim = this.model.position
        .clone()
        .add(new THREE.Vector3(0, 1.85, 0));
      detailAim.addScaledVector(right, (0.5 - framing.detailX) * width / pixelScale);
      detailAim.addScaledVector(up, (framing.detailY - 0.5) * height / pixelScale);
      cameraAim.lerp(detailAim, detail);
    }
    const cameraPosition = cameraAim
      .clone()
      .addScaledVector(viewDirection, distance);
    if (!cinematic && this.motion.pointerParallax && !this.uiOnlyParallax) {
      cameraPosition.x += this.pointer.x * 0.12;
      cameraPosition.y -= this.pointer.y * 0.12;
    }
    const cameraTransition = this.targetDetail || this.detail > 0.01
      ? this.motion.detailTransition
      : this.motion.selectionTransition;
    // Interpolate one subject-relative shot during handoff. Independently
    // damping aim and position while the subject moves makes the lens chase it.
    const openingCamera = !cinematic && openingBlend < 1;
    if (openingCamera) {
      cameraPosition.lerp(this.model.position.clone().add(this.openingCameraOffset), 1 - openingBlend);
      cameraAim.lerp(this.model.position.clone().add(this.openingAimOffset), 1 - openingBlend);
    }
    const cameraBlend = cinematic || openingCamera ? 1 : cameraTransition ? 1 - Math.exp(-dt * 5) : 1;
    this.camera.position.lerp(cameraPosition, cameraBlend);
    this.cameraAim.lerp(cameraAim, cameraBlend);
    this.camera.lookAt(this.cameraAim);
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      THREE.MathUtils.radToDeg(
        2 * Math.atan((cinematic ? openingSpan(THREE.MathUtils.lerp(span, 5.9, detail)) : framing.span) / (2 * distance)),
      ),
      cameraBlend,
    );
    if (openingCamera) this.camera.fov = THREE.MathUtils.lerp(this.openingFov, this.camera.fov, openingBlend);
    const fog = this.scene.fog as THREE.Fog;
    // The camera position is damped after its target distance changes. Anchor
    // fog to the rendered camera, or entry puts the array behind the far plane
    // until the camera catches up (a brief white wash that exit never showed).
    const renderedDistance = this.camera.position.distanceTo(this.cameraAim);
    const fogTheme = this.themeAmount;
    // In the detail view the fog starts *behind* the subject instead of one unit
    // in front of it: the case was sitting inside the fog ramp, which is exactly
    // what put a pale film over it. The shelf behind still hazes, so the depth
    // cue survives.
    fog.near = renderedDistance + THREE.MathUtils.lerp(5 - 4 * fogTheme, 4, detail);
    fog.far = renderedDistance + THREE.MathUtils.lerp(25 - 9 * fogTheme, 12, detail);

    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Build and compact the instance set only after the actual damped camera
    // is final for this frame. Picking uses the same packed index-to-cell map.
    // The CD framing can see beyond the legacy five-by-32 pool, including the
    // foreground during opening. Keep its coverage tied to the rendered camera.
    const fixed = !cinematic && !this.looping && !responsiveOpening;
    this.cells = fixed ? Array.from({ length: 160 }, (_, i) => poolCell(i))
      : this.visibility.update(this.camera, fog.far, trackX, entryZ + this.rail.value, this.extraCoverage);
    const hidden = new Set(this.outgoing.map(o => cellKey(o.cell)));
    hidden.add(cellKey(this.selectedCell));
    this.drawnCells = [];
    this.relayPoints.clear();
    this.matrixUpdates ??= new InstanceUpdates(this.instances[0].instanceMatrix);
    if (this.themeAttribute) this.themeUpdates ??= new InstanceUpdates(this.themeAttribute);
    if (this.coverAttribute) this.coverUpdates ??= new InstanceUpdates(this.coverAttribute);
    for (const cell of this.cells) {
      const { row, lane } = cell;
      if (hidden.has(cellKey(cell))) continue;
      const x = (lane - 2) * COLUMN_SPACING - trackX;
      const y = -4.6 + field(row, lane) + hoverLift(cell) - this.presentationDrop(cell);
      const z = (row - 15.5) * ROW_SPACING + entryZ + this.rail.value;
      if (!fixed && !this.visibility.intersects(x, y, z)) continue;
      const i = this.drawnCells.length;
      this.ensureInstanceCapacity(i + 1);
      this.drawnCells.push(cell);
      this.themeUpdates?.scalar(i, this.theme.sample(cell, time));
      this.coverUpdates?.scalar(i, fileAtCell(cell));
      const slope = field(row + .5, lane) - field(row - .5, lane);
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(slope * .024 * (1 - detail), 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      if (play.enabled) this.relayPoints.set(cellKey(cell), { cell: { ...cell }, point: new THREE.Vector3(0, 3.5, 0).applyMatrix4(this.dummy.matrix) });
      this.matrixUpdates!.set(i * 16, this.dummy.matrix.elements);
    }
    const countChanged = this.instances[0].count !== this.drawnCells.length;
    const matricesChanged = this.matrixUpdates!.commit();
    for (const inst of this.instances) {
      inst.count = this.drawnCells.length;
    }
    // Picking uses only the first instanced surface. The other batches disable
    // renderer culling and do not need an O(n) bound recomputation each frame.
    if (matricesChanged || countChanged || !this.instances[0].boundingSphere) this.instances[0].computeBoundingSphere();
    this.themeUpdates?.commit();
    this.coverUpdates?.commit();
    let neighborTop = -Infinity;
    const lane = selectedLane,
      row = selectedRow;
    for (let r = row - 5; r <= row + 5; r++) {
      if (r !== row)
        neighborTop = Math.max(neighborTop, -4.6 + field(r, lane) + 3.76);
    }
    for (const o of this.outgoing) {
      if (o.cell.lane === lane && Math.abs(o.cell.row - row) <= 5) {
        neighborTop = Math.max(neighborTop, o.group.position.y + 3.76);
      }
    }
    this.clearance = this.model.position.y - neighborTop;
    this.canInspect =
      !cinematic &&
      Boolean(this.targetDetail) &&
      detail > 0.9 &&
      this.pulseGain < 0.01 &&
      this.clearance > 0.3;
    this.container.dataset.inspection =
      this.returnY !== null
        ? "aligning"
        : this.canInspect
          ? "ready"
          : this.targetDetail
            ? "lifting"
            : "preview";
    const focalPoint = this.model.position
      .clone()
      .add(new THREE.Vector3(0, 2, 0))
      .applyMatrix4(this.camera.matrixWorldInverse);
    const bokehUniforms = this.bokeh.uniforms as Record<
      string,
      { value: number }
    >;
    bokehUniforms.focus.value = -focalPoint.z;
    bokehUniforms.aperture.value =
      (THREE.MathUtils.lerp(0.0003, 0.0008, detail) *
        this.quality.depthOfField) /
      100;
    const shelfEffectStrength = this.cdCase ? 1 - ease(detail / .65) : 1;
    this.ao.strength.value = shelfEffectStrength;
    bokehUniforms.aperture.value *= shelfEffectStrength;
    this.discControls?.update(this.model, this.camera, !!this.targetDetail && this.caseOpening.value > .95 && this.canInspect, this.caseOpening.value);
    // These effects describe the shelf, not the inspected transparent case.
    // A depth-only blur cannot separate its overlapping lid, disc and controls.
    const inspectingCase = shelfEffectStrength === 0;
    const effectsChanged = this.ao.enabled !== (!inspectingCase && this.quality.aoSamples > 0) ||
      this.bokeh.enabled !== (!inspectingCase && this.quality.depthOfField > 0);
    this.ao.enabled = !inspectingCase && this.quality.aoSamples > 0;
    this.bokeh.enabled = !inspectingCase && this.quality.depthOfField > 0;
    if (effectsChanged) this.resize(false);
    this.renderer.info.reset();
    // Keep all simulation and picking current. Reuse the composited canvas only
    // when its actual inputs are identical, including late textures and materials.
    const state = this.renderState;
    this.scene.updateMatrixWorld();
    // A changed instance buffer already proves the image changed. Avoid a
    // material/matrix snapshot on those busy frames; capture when it settles.
    let changed = true;
    if (matricesChanged || cinematic) {
      state.invalidate();
    } else {
      state.begin();
      state.floats(...this.camera.projectionMatrix.elements, ...this.camera.matrixWorldInverse.elements,
        ...this.camera.position.toArray(),
        fog.near, fog.far, this.themeAmount, this.subduedIndex.value,
        bokehUniforms.focus.value, bokehUniforms.aperture.value);
      this.scene.traverse(object => {
        state.add(object.id, Number(object.visible));
        if (!(object instanceof THREE.Mesh)) return;
        object.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, object.matrixWorld);
        object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
        state.floats(...object.modelViewMatrix.elements, ...object.normalMatrix.elements, ...object.matrixWorld.elements);
        const mat = object.material as THREE.MeshPhysicalMaterial;
        // Three increments material.version for its own double-sided transmission
        // passes. Track application-controlled inputs, not that render-side counter.
        state.add(object.geometry.id, mat.uuid, mat.map?.uuid, mat.map?.version ?? 0);
        state.floats(
          mat.opacity, mat.roughness, mat.metalness, mat.transmission, mat.thickness,
          mat.attenuationDistance, mat.clearcoat, mat.clearcoatRoughness,
          mat.color.r, mat.color.g, mat.color.b,
          mat.attenuationColor?.r ?? 0, mat.attenuationColor?.g ?? 0, mat.attenuationColor?.b ?? 0);
        for (const name of ['appearance', 'glassClarity', 'themeAmount', 'subduedIndex'])
          state.floats(object.userData[name]?.value ?? 0);
        if (object instanceof THREE.InstancedMesh)
          state.add(object.count, object.instanceMatrix.version, this.themeAttribute?.version ?? 0, this.coverAttribute?.version ?? 0);
      });
      if (!state.end()) {
        changed = false;
        this.reusedFrames++;
      }
    }
    // The animated frames, not the settled image, decide the sustained cost:
    // drop to the motion ceiling while the picture keeps changing and spend the
    // sharper pass once it has been stable for a while. A switch resizes the
    // canvas, so this frame must draw again at the new resolution. The motion
    // state is tracked for every resolution choice: an explicit resolution pins
    // the buffer size, but the passes that scale with it — the glass pass today —
    // still want to know whether the picture is moving.
    if (this.adaptiveBudget.update(changed)) this.resize(false);
    else if (!changed) return;
    this.renderedFrames++;
    // Disc rotation and playback text do not move shadow casters. Reuse the
    // existing map until caster transforms or the shadow framing actually change.
    if (this.renderer.shadowMap.enabled) {
      const shadows = this.shadowState;
      shadows.begin();
      shadows.floats(...this.camera.position.toArray(), ...this.cameraAim.toArray(), this.camera.fov, this.camera.aspect);
      shadows.add(this.light.shadow.mapSize.x, this.light.shadow.map?.texture.id, this.quality.shadows);
      this.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
        shadows.add(object.id, Number(object.visible));
        shadows.floats(...object.matrixWorld.elements);
        if (object instanceof THREE.InstancedMesh) shadows.add(object.count, object.instanceMatrix.version);
      });
      this.pendingShadowUpdate = shadows.end() || this.pendingShadowUpdate;
      // The slow idle wave does not need a full shadow pass on every display
      // frame. Navigation and extraction retain immediate shadow updates.
      if (this.pendingShadowUpdate && (!idle || time - this.lastShadowTime >= 1 / 20)) {
        this.fitShadowCamera();
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowUpdates++;
        this.lastShadowTime = time;
        this.pendingShadowUpdate = false;
      }
    }
    if (this.superPerformance || (!this.ao.enabled && !this.bokeh.enabled && !this.smaa.enabled)) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
  projectCard(x: number, y: number) {
    this.model.updateMatrixWorld(true);
    const p = this.model
      .localToWorld(new THREE.Vector3(x, y, 0.255))
      .project(this.camera);
    return [(p.x + 1) * this.container.clientWidth / 2, (1 - p.y) * this.container.clientHeight / 2];
  }
  get decryptionFrame() { return this.decryption.frame; }
  finishDecryption() { this.decryption.finish(); }
  get detailVisibility() {
    // The album only reads once its jewel case is actually open: the panel frame
    // arrives with the mode change, the content arrives with the hinge.
    // On the first visit the covered document appears before the lid opens;
    // otherwise waiting for visibility and waiting for reveal would deadlock.
    const open = this.cdCase && !this.fullDetailPresentation ? ease(this.caseOpening.value) : 1;
    return ease((this.detail - 0.25) / 0.55) * open;
  }
  getStats() {
    this.model.updateMatrixWorld(true);
    const project = (x: number, y: number, z: number) => {
      const p = this.model
        .localToWorld(new THREE.Vector3(x, y, z))
        .project(this.camera);
      return [Math.round((p.x + 1) * this.container.clientWidth / 2), Math.round((1 - p.y) * this.container.clientHeight / 2)];
    };
    return {
      decryption: { ...this.decryption.frame, clarity: this.decryption.clarity, modelClarity: this.modelClarity() },
      modelKind: this.cdCase ? "cd-jewel-case" : "archive",
      shelfModel: this.shelfAsset,
      detailGeometryLoaded: !this.shelfAsset || this.detailGeometryReady,
      archiveLabelVisible: !this.cdCase,
      discArtwork: !!this.model.getObjectByName("album-disc"),
      caseOpening: this.caseOpening.value,
      returningCaseOpenings: this.outgoing.map(o => ({ opening: o.opening.value, y: o.group.position.y })),
      topLeft: project(-2.5, 3.7, 0),
      topRight: project(2.5, 3.7, 0),
      labelTopLeft: project(-1.855, 3.27, 0.255),
      labelBottomLeft: project(-1.855, 2.81, 0.255),
      modelPosition: this.model.position
        .toArray()
        .map((v) => Math.round(v * 10000) / 10000),
      cameraPosition: this.camera.position
        .toArray()
        .map((v) => Math.round(v * 10000) / 10000),
      fieldOfView: this.camera.fov,
      loaded: this.loaded,
      drawCalls: this.renderer.info.render.calls,
      renderedFrames: this.renderedFrames,
      shadowUpdates: this.shadowUpdates,
      reusedFrames: this.reusedFrames,
      superPerformance: this.superPerformance,
      renderMoving: this.adaptiveBudget.moving,
      discControls: this.discControls?.stats ?? null,
      presentation: this.presence,
      triangles: this.renderer.info.render.triangles,
      archiveCount: this.drawnCells.length,
      archiveCandidates: this.cells.length,
      archiveCulled: this.cells.length - this.drawnCells.length,
      archiveCapacity: this.instanceCapacity,
      archiveCoverage: this.extraCoverage ? "extra" : "standard",
      returningFiles: this.outgoing.length,
      selectionPhase: this.pendingPulse
        ? "lifting"
        : this.pulses.length
          ? "wave"
          : "settled",
      pendingPulse: this.pendingPulse ? { ...this.pendingPulse } : null,
      pulses: this.pulses.map((pulse) => ({ ...pulse })),
      referenceTime: Math.round((this.scanTime + 5) * 100) / 100,
      selectedSlot: this.selectedSlot,
      selectedLane: Math.floor(this.selectedSlot / 32),
      selectedCell: { ...this.selectedCell },
      hoverCell: this.hoverCell ? { ...this.hoverCell } : null,
      hoverLifts: Object.fromEntries(this.hoverLifts),
      dragTrack: this.dragTrack ? { ...this.dragTrack } : null,
      archiveMomentum: this.archiveMomentum ? {
        phase: this.archiveMomentum.motion.phase,
        value: this.archiveMomentum.motion.value,
        velocity: this.archiveMomentum.motion.velocity,
      } : null,
      holdingArchive: this.holdingArchive,
      dragProjection: this.dragProjection(),
      dragMapping: this.archiveDrag.active ? "free" : null,
      coordinateOrigin: { ...this.coordinateOrigin },
      poolBounds: {
        minLane: Math.min(...this.cells.map((c) => c.lane)),
        maxLane: Math.max(...this.cells.map((c) => c.lane)),
        minRow: Math.min(...this.cells.map((c) => c.row)),
        maxRow: Math.max(...this.cells.map((c) => c.row)),
      },
      laneFocus: this.laneFocus.value,
      columnCamera: this.columnCamera.value,
      rotation: this.rotation,
      clearance: this.clearance,
      canInspect: this.canInspect,
      returnPhase: this.returnY !== null ? "aligning" : "lowering",
      extraction: Math.round(this.lift.value * 1000) / 1000,
      appearance: Math.round(ease(this.lift.value / 0.4) * 1000) / 1000,
      cameraDetail: Math.round(this.detail * 1000) / 1000,
      idleGain: this.idleGain,
      flatten: this.flatMix,
      spectrumActivity: this.playfield.bands.activity,
      selectedIndexDim: this.model.children.find(child => child.userData.surface === "Index_Inlay")?.userData.subduedIndex?.value,
      returningIndexDims: this.outgoing.map(o => ({ cell: o.cell, dim: o.group.children.find(child => child.userData.surface === "Index_Inlay")?.userData.subduedIndex?.value })),
      artworkResolution: this.artwork?.textures.map(texture => ({width:texture.image.width,height:texture.image.height})),
      artworkAtlasResolution: this.artwork ? {width:this.artwork.atlas.image.width,height:this.artwork.atlas.image.height} : null,
      cameraDistance: this.camera.position.distanceTo(this.cameraAim),
      antialiasSamples: this.composer.renderTarget1.samples,
      screenSpaceAO: this.ao.enabled,
      depthOfField: this.bokeh.enabled,
      cameraNear: this.camera.near,
      cameraFar: this.camera.far,
      fogNear: (this.scene.fog as THREE.Fog).near,
      fogFar: (this.scene.fog as THREE.Fog).far,
      returningAppearance: this.outgoing.map((o) => ({
        slot: o.slot,
        clarity: o.group.children.find(child => child.userData.surface === "Frosted_Polymer")?.userData.glassClarity?.value,
        cell: { ...o.cell },
        lift: o.lift.value,
        quality: ease(o.lift.value / 0.4),
        rotation: o.group.rotation.y,
        worldY: o.group.position.y,
        phase: o.returnY !== null ? "aligning" : "lowering",
      })),
      rail: Math.round(this.rail.value * 1000) / 1000,
    };
  }
}
