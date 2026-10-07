/** Rendering controls are independent of lighting, materials and animation. */
export type RenderQuality = {
  resolution?: "native" | "adaptive" | "720p" | "1080p" | "1440p" | "2160p";
  scale: number;
  pixelRatio: number;
  antialias: "off" | "smaa";
  /**
   * Coverage samples for the offscreen composer targets. SMAA is a post-process
   * edge detector that works from luma thresholds, so it leaves faint or thin
   * geometric edges stepped; the presets that ask for the sharpest picture keep
   * real coverage samples and use SMAA only for what those cannot resolve.
   */
  msaa: number;
  shadows: number;
  aoSamples: number;
  aoResolution: number;
  depthOfField: number;
  transmission: number;
  anisotropy: number;
};

export const qualityPresets = {
  performance: {
    scale: 80,
    pixelRatio: 1,
    antialias: "off",
    msaa: 4,
    shadows: 1024,
    aoSamples: 0,
    aoResolution: 0.5,
    depthOfField: 0,
    transmission: 0.5,
    anisotropy: 4,
  },
  original: {
    scale: 100,
    pixelRatio: 2,
    antialias: "off",
    msaa: 4,
    shadows: 2048,
    aoSamples: 32,
    aoResolution: 1,
    depthOfField: 100,
    transmission: 1,
    anisotropy: 16,
  },
  high: {
    scale: 125,
    pixelRatio: 2,
    antialias: "smaa",
    msaa: 2,
    shadows: 4096,
    aoSamples: 32,
    aoResolution: 1,
    depthOfField: 100,
    transmission: 1,
    anisotropy: 16,
  },
  ultra: {
    scale: 150,
    pixelRatio: 3,
    antialias: "smaa",
    msaa: 4,
    shadows: 4096,
    aoSamples: 64,
    aoResolution: 1,
    depthOfField: 100,
    transmission: 1,
    anisotropy: 16,
  },
} as const satisfies Record<string, RenderQuality>;
export type QualityPreset = keyof typeof qualityPresets;
export const presetLabels: Record<QualityPreset, string> = {
  performance: "性能",
  original: "原始",
  high: "高",
  ultra: "极高",
};

const member = <T>(value: unknown, choices: readonly T[], fallback: T): T =>
  choices.includes(value as T) ? (value as T) : fallback;
const range = (
  value: unknown,
  min: number,
  max: number,
  step: number,
  fallback: number,
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value / step) * step))
    : fallback;

export function normalizeQuality(
  value: unknown,
  legacyHigh = true,
): RenderQuality {
  const base = qualityPresets.original;
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  // Older low quality retained full resolution, shadows and transmission.
  const fallback = legacyHigh
    ? base
    : { ...base, pixelRatio: 1, aoSamples: 0, depthOfField: 0 };
  return {
    resolution: member(v.resolution, ["native", "adaptive", "720p", "1080p", "1440p", "2160p"] as const, "native"),
    scale: range(v.scale, 50, 200, 5, fallback.scale),
    pixelRatio: member(v.pixelRatio, [1, 1.5, 2, 3], fallback.pixelRatio),
    antialias: member(
      v.antialias,
      ["off", "smaa"] as const,
      fallback.antialias,
    ),
    msaa: member(v.msaa, [0, 2, 4], fallback.msaa),
    shadows: member(v.shadows, [0, 1024, 2048, 4096], fallback.shadows),
    aoSamples: member(v.aoSamples, [0, 16, 32, 64], fallback.aoSamples),
    aoResolution: member(v.aoResolution, [0.5, 0.75, 1], fallback.aoResolution),
    depthOfField: range(v.depthOfField, 0, 150, 5, fallback.depthOfField),
    transmission: member(
      v.transmission,
      [0.25, 0.5, 0.75, 1],
      fallback.transmission,
    ),
    anisotropy: member(v.anisotropy, [1, 2, 4, 8, 16], fallback.anisotropy),
  };
}

export function matchingPreset(
  quality: RenderQuality,
): QualityPreset | "custom" {
  return (
    (Object.keys(qualityPresets) as QualityPreset[]).find((key) =>
      // `msaa` joins the resolution fields: settings stored before it existed
      // take the fallback, and naming the preset matters more than that field.
      Object.entries(qualityPresets[key]).filter(([field]) => field !== "scale" && field !== "pixelRatio" && field !== "msaa").every(
        ([field, value]) => quality[field as keyof RenderQuality] === value,
      ),
    ) ?? "custom"
  );
}

/** The lowest-cost preset: it overrides the chosen quality while it is enabled. */
export const superPerformanceQuality: RenderQuality = {
  scale: 60, pixelRatio: 1, antialias: "off", msaa: 0, shadows: 0, aoSamples: 0,
  aoResolution: .5, depthOfField: 0, transmission: .25, anisotropy: 2,
};

/**
 * Full-resolution buffer ceilings. A still frame is only drawn once, so the
 * animated frames — not the settled image — decide the sustained GPU cost.
 */
export const pixelBudgets = {
  /**
   * A settled frame may supersample beyond the display's own density and stops
   * here: the antialiased canvas, its MSAA resolve and the transmission pass all
   * scale with the buffer, so very large panels stay bounded.
   */
  ceiling: 8_294_400,
  /**
   * Settled ceiling while the passes run through the offscreen composer. The
   * antialiasing passes allocate canvas-sized buffers of their own on top of the
   * scene targets, so those presets keep a lower ceiling; without them the
   * composer only pays for the occlusion and depth-of-field targets.
   */
  postprocessed: 2_073_600,
  /**
   * Frames that are actually animating. Kept close to a 1080p-class display's own
   * pixel count on purpose: the disc turns for as long as an album plays, so the
   * picture never settles while audio runs, and a low ceiling here left the whole
   * model upscaled and soft for the entire track. 1.66 MP is 0.8x of the composer
   * ceiling, which is only a 1.12x upscale on a 1080p panel.
   */
  motion: 1_658_880,
  /** Super performance keeps its own ceiling and never sharpens. */
  superPerformance: 921_600,
} as const;

/**
 * Animating frames stay on their density-independent budget, which is what
 * bounds the sustained cost. A settled frame may spend the whole buffer ceiling —
 * how far it actually supersamples is the preset's `pixelRatio` — unless it runs
 * through the offscreen composer, whose colour, depth and blur targets all scale
 * with the canvas. Spending the ceiling there means allocating and filling an
 * 8 MP occlusion-and-bokeh frame the moment the picture settles, which stalls the
 * page, so the composer keeps the lower ceiling.
 */
export function pixelBudget(
  moving: boolean,
  superPerformance = false,
  postprocessing = true,
) {
  if (superPerformance) return pixelBudgets.superPerformance;
  if (moving) return pixelBudgets.motion;
  return postprocessing ? pixelBudgets.postprocessed : pixelBudgets.ceiling;
}

/**
 * Picks between the motion and settled ceilings from the render loop's own
 * change signal. The counters add hysteresis: one changed frame never resizes
 * the canvas, and a brief pause never spends the sharp pass.
 */
export class AdaptiveBudget {
  /** Consecutive changed frames before the cheaper ceiling is applied. */
  static readonly motionAfter = 2;
  /**
   * Consecutive reused frames before the sharp pass is spent. Deliberately long:
   * the resize reallocates the canvas and its targets, so if it lands right as a
   * transition settles it reads as a hitch in that animation rather than as the
   * picture sharpening. Two seconds of stillness puts it well past the arrival.
   */
  static readonly settleAfter = 110;
  moving = false;
  private changedRun = 0;
  private idleRun = 0;
  /** Passing `changed` reports whether this frame differs from the drawn one. */
  update(changed: boolean) {
    if (changed) {
      this.idleRun = 0;
      this.changedRun++;
      if (!this.moving && this.changedRun >= AdaptiveBudget.motionAfter) {
        this.moving = true;
        return true;
      }
    } else {
      this.changedRun = 0;
      this.idleRun++;
      if (this.moving && this.idleRun >= AdaptiveBudget.settleAfter) {
        this.moving = false;
        return true;
      }
    }
    return false;
  }
}

export function renderDimensions(
  quality: RenderQuality,
  width: number,
  height: number,
  stageScale: number,
  deviceRatio: number,
  maxTextureSize: number,
  pixelBudget: number = pixelBudgets.ceiling,
) {
  // `pixelRatio` is a supersampling target, not a cap on the display density:
  // the direct path runs with MSAA off, so a settled frame's antialiasing comes
  // from rendering above the panel's own pixels. The device ratio stays the
  // floor, so a cheap preset on a dense display is still never upscaled.
  const requested = quality.resolution === "native"
    ? deviceRatio * stageScale
    : quality.resolution && quality.resolution !== "adaptive"
      ? Number.parseInt(quality.resolution) / Math.max(1, height)
      : (Math.max(deviceRatio, quality.pixelRatio) * stageScale * quality.scale) / 100;
  // Bound all full-resolution postprocessing targets to 8.3 MP and device limits.
  const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, width * height));
  const textureRatio = maxTextureSize / Math.max(1, width, height);
  const ratio = Math.min(requested, budgetRatio, textureRatio);
  return {
    ratio,
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    limited: ratio < requested - 0.0001,
    // Which ceiling bound the request, so the settings line can name it instead
    // of leaving a lower-than-expected resolution unexplained.
    limit: ratio >= requested - 0.0001
      ? "none" as const
      : budgetRatio <= textureRatio ? "budget" as const : "texture" as const,
  };
}
