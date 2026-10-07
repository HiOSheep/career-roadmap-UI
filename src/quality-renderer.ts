import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { renderDimensions, pixelBudget, type RenderQuality } from "./render-quality";

export function applyTextureQuality(
  root: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  quality: RenderQuality,
) {
  const maximum = Math.min(
    quality.anisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !value.isRenderTargetTexture)
          textures.add(value);
      }
    }
  });
  for (const texture of textures) {
    const sampling = texture.userData.albumArtwork ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : maximum;
    if (texture.anisotropy === sampling) continue;
    texture.anisotropy = sampling;
    texture.needsUpdate = true;
  }
}

export function resizeQuality(
  renderer: THREE.WebGLRenderer,
  composer: EffectComposer,
  host: HTMLElement,
  quality: RenderQuality,
  superPerformance = false,
  postprocessing = true,
  moving = false,
) {
  const width = Math.max(1, host.clientWidth),
    height = Math.max(1, host.clientHeight);
  const onScreen = host.getBoundingClientRect();
  // The canvas is CSS-scaled by the stage transform, so its on-screen box — not
  // its layout box — is what the render resolution has to satisfy.
  const budget = !superPerformance && quality.resolution && quality.resolution !== "adaptive"
    ? Number.POSITIVE_INFINITY
    : pixelBudget(moving, superPerformance, postprocessing);
  const dimensions = renderDimensions(
    quality,
    width,
    height,
    onScreen.width / width,
    devicePixelRatio,
    renderer.capabilities.maxTextureSize,
    budget,
  );
  renderer.setPixelRatio(dimensions.ratio);
  renderer.setSize(width, height);
  // Coverage samples for the offscreen targets. Rendering only through SMAA left
  // faint or thin geometric edges — glass rims, plastic bevels — stepped, because
  // a post-process detector decides from luma thresholds and cannot add coverage
  // where a sub-pixel edge has no intermediate pixels to work from. The presets
  // spend what they were always meant to spend: `ultra` keeps 4x, `high` 2x, and
  // the direct path keeps the canvas's own MSAA.
  const samples = Math.min(quality.msaa, renderer.capabilities.maxSamples);
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples === samples) continue;
    target.samples = samples;
    target.dispose();
  }
  // Release large offscreen buffers when rendering directly to the antialiased canvas.
  composer.setPixelRatio(postprocessing ? dimensions.ratio : 1);
  composer.setSize(postprocessing ? width : 1, postprocessing ? height : 1);
  // The glass pass has its own resolution, and `transmission` is exactly that
  // control: 高/极高 ask for full resolution, 性能 asks for half and the
  // super-performance mode for a quarter. Capping every preset at half left the
  // top of the ladder rendering refracted case lids at half resolution, which
  // reads as a blocky staircase along their straight bevels. It follows the
  // motion state instead: full resolution once the picture settles, half while it
  // animates — measured on the detail view, that pass alone cost a quarter of the
  // frame rate while the opened, glass-heavy case was being moved.
  renderer.transmissionResolutionScale = moving
    ? quality.transmission * 0.5
    : quality.transmission;
  host.dataset.renderQuality = JSON.stringify({
    ...dimensions,
    antialias: quality.antialias,
    transmission: renderer.transmissionResolutionScale,
    postprocessing,
    offscreenSamples: postprocessing ? samples : 0,
    pixelBudget: budget,
    moving,
    anisotropy: Math.min(
      quality.anisotropy,
      renderer.capabilities.getMaxAnisotropy(),
    ),
    superPerformance,
  });
  return dimensions;
}

export function createViewerPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) {
  const composer = createAntialiasedComposer(renderer);
  const smaa = new SMAAPass();
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(smaa);
  composer.addPass(new OutputPass());
  return { composer, smaa };
}

/** Canvas antialiasing does not cover offscreen composer targets. */
export function createAntialiasedComposer(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  target.samples = Math.min(4, renderer.capabilities.maxSamples);
  return new EffectComposer(renderer, target);
}
