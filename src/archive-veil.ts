/**
 * The frosted film the archive's album covers wear. It lives in the cover
 * material — mixed in the fragment shader — rather than baked into the atlas, so
 * its strength can wipe off as a case is drawn out of the shelf and its colour
 * can follow the theme. A baked film could do neither, and a translucent
 * material would have to be depth-sorted across dozens of overlapping cards.
 *
 * This module has no imports on purpose, so scripts/check-albums.mjs can assert
 * these values directly.
 */

/** Fraction of a cover that still shows through the film when fully frosted. */
export const ARCHIVE_COVER_VEIL = .42;
/** The film laid over a frosted cover: the interface's own paper tone... */
export const ARCHIVE_COVER_FILM = "#f3f0e7";
/** ...and its dark-mode counterpart, so a dark interface does not light up. */
export const ARCHIVE_COVER_FILM_DARK = "#2f352a";
/** How much colour the frost drains: frosting mutes a cover, it does not dim it. */
export const ARCHIVE_COVER_DESATURATION = .55;
/** How far a case lifts before its cover is completely clean. */
export const ARCHIVE_COVER_WIPE = 1.1;

/** Mix weight for the shader, derived so the veil stays the single knob. */
export function coverVeilMix() {
  return { film: Math.min(1, Math.max(0, 1 - ARCHIVE_COVER_VEIL)) };
}

/** Frost strength of a cover whose case has lifted `lift` units out of the shelf. */
export function coverVeilAt(lift: number) {
  const t = Math.min(1, Math.max(0, lift / ARCHIVE_COVER_WIPE));
  return 1 - t * t * (3 - 2 * t);
}

/** A cover's frost: one pair of uniforms, shared by the surfaces that fade together. */
export interface CoverVeil {
  amount: { value: number };
  color: { value: { r: number; g: number; b: number } };
}

/** The slice of a material the veil needs; type-only, so no runtime import. */
interface VeiledMaterial {
  onBeforeCompile?: (shader: ThreeShader, renderer: ThreeRenderer) => void;
  customProgramCacheKey?: () => string;
  needsUpdate?: boolean;
}
type ThreeShader = import("three").WebGLProgramParametersWithUniforms;
type ThreeRenderer = import("three").WebGLRenderer;

/**
 * Frosts a cover material in the fragment shader: the cover is muted, then laid
 * under a film. Mixing in the shader is what lets the frost wipe off as a case
 * is drawn out of the shelf and lets dark mode lay a dark film instead of a
 * paper one, neither of which a baked atlas could do.
 *
 * Both hooks it chains are called with the material as their receiver: three's
 * own `customProgramCacheKey` reads `this.onBeforeCompile`, and calling it
 * unbound throws the first time the material is compiled.
 */
export function applyCoverVeil<T extends VeiledMaterial>(material: T, veil: CoverVeil) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const { film } = coverVeilMix();
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.coverVeil = veil.amount;
    shader.uniforms.coverVeilColor = veil.color;
    shader.fragmentShader =
      "uniform float coverVeil;\nuniform vec3 coverVeilColor;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
if (coverVeil > 0.0) {
  float coverLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(coverLuma), coverVeil * ${ARCHIVE_COVER_DESATURATION.toFixed(3)});
  diffuseColor.rgb = mix(diffuseColor.rgb, coverVeilColor, coverVeil * ${film.toFixed(3)});
}`,
    );
  };
  material.customProgramCacheKey = () =>
    previousKey ? `${previousKey.call(material)}|veil-v1` : "cover|veil-v1";
  if ("needsUpdate" in material) material.needsUpdate = true;
  return veil;
}
