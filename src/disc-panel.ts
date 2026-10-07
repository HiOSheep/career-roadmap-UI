/**
 * Everything about the disc's playback panel that is pure geometry: where it
 * sits, what it draws, and when it is worth showing. The mesh that renders it
 * and the DOM that makes it operable live in disc-panel-mesh.ts and
 * disc-controls.ts.
 *
 * One layout in design units drives both the canvas the model shows and the
 * transparent DOM hit areas on top of it, so a pressed button is always the
 * button you see.
 *
 * This module has no imports on purpose: it is checked directly by
 * scripts/check-disc-panel.mjs without a browser or a build step.
 */

/** Panel plane, coplanar with the disc's printed face in the case's local space. */
export const PANEL_Z = .12;
/** Panel size and centre, sized so the whole panel stays on the printed face. */
export const PANEL_WIDTH = 1.45;
export const PANEL_CENTRE = { x: .16, y: .9 };
/** The disc's printed face in the same local space. */
export const DISC_CENTRE = { x: .16, y: 1.78 };
export const DISC_RADIUS = 1.51;
/** Sample grid used to estimate how much of the panel is still in view. */
export const COLUMNS = 13, ROWS = 7;
/** Below this visible fraction the control stops accepting input. */
export const HIDE_BELOW = .45;
/** Higher bar to come back, so the control cannot flicker at the threshold. */
export const SHOW_ABOVE = .6;

export const DISC_PANEL = {
  // The transport row is the tallest thing in the panel, so the box is sized to
  // leave the title and the state a clear margin above and below it.
  design: { width: 420, height: 200 },
  /** Canvas pixels per design unit: crisp text without a huge texture. */
  pixelsPerUnit: 2.5,
  title: { x: 210, y: 38, size: 24 },
  state: { x: 210, y: 168, size: 17 },
  buttons: [
    { id: "previous", x: 108, y: 105, radius: 26 },
    { id: "toggle", x: 210, y: 105, radius: 33 },
    { id: "next", x: 312, y: 105, radius: 26 },
  ],
} as const;

/** Ink box of a text row, for the spacing the layout promises. */
export function textRowInk(row: { y: number; size: number }) {
  return { top: row.y - row.size / 2, bottom: row.y + row.size / 2 };
}

/** Ink box of the transport row, including the largest button. */
export function buttonRowInk() {
  const radius = Math.max(...DISC_PANEL.buttons.map((button) => button.radius));
  const y = DISC_PANEL.buttons[0].y;
  return { top: y - radius, bottom: y + radius };
}

export type PanelAction = (typeof DISC_PANEL.buttons)[number]["id"];

export interface PanelState {
  title: string;
  state: string;
  playing: boolean;
  disabled: boolean;
  hover: PanelAction | null;
  pressed: PanelAction | null;
  feedback?: { hover: number[]; press: number[]; playing: number };
  progress?: number;
  elapsed?: number;
  duration?: number;
  seeking?: boolean;
}

const FONT = '"MiSans","Noto Sans SC",system-ui,sans-serif';

/** Hit-area rectangle of every button, in design units. */
export function panelButtonRects() {
  return DISC_PANEL.buttons.map((button) => ({
    id: button.id,
    left: button.x - button.radius,
    top: button.y - button.radius,
    size: button.radius * 2,
  }));
}

/** World size of the panel on the disc plane. */
export function panelWorldSize() {
  const { design } = DISC_PANEL;
  return { width: PANEL_WIDTH, height: PANEL_WIDTH * design.height / design.width };
}

/** True while a panel point still lies on the disc's printed face. */
export function onDiscFace(u: number, v: number, width: number, height: number) {
  const x = PANEL_CENTRE.x + PANEL_WIDTH * (u - .5);
  const y = PANEL_CENTRE.y + (PANEL_WIDTH * height / Math.max(1, width)) * (.5 - v);
  return Math.hypot(x - DISC_CENTRE.x, y - DISC_CENTRE.y) <= DISC_RADIUS;
}

/**
 * Fraction of the panel's sample grid that survives, used only to decide when
 * the transparent hit areas stop taking presses. The mesh needs none of this:
 * the depth buffer already hides it behind the lid.
 */
export function visibleCoverage(
  visible: (u: number, v: number) => boolean,
  columns = COLUMNS,
  rows = ROWS,
) {
  let seen = 0, total = 0;
  for (let i = 0; i < columns; i++) {
    const u = columns === 1 ? .5 : i / (columns - 1);
    for (let r = 0; r < rows; r++) {
      total++;
      if (visible(u, (r + .5) / rows)) seen++;
    }
  }
  return total ? seen / total : 0;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

/** Transport glyphs as vectors: a font may not carry the media symbols. */
function drawGlyph(
  context: CanvasRenderingContext2D,
  id: PanelAction,
  x: number, y: number, radius: number, color: string, playing: boolean,
) {
  context.fillStyle = color;
  const bar = radius * .34, gap = radius * .2, tall = radius * 1.5;
  if (id === "previous" || id === "next") {
    // +1 points right ("next"), -1 points left ("previous"), with the bar on
    // the far side of the tip.
    const direction = id === "previous" ? -1 : 1;
    context.beginPath();
    context.moveTo(x - direction * radius * .9, y - radius);
    context.lineTo(x + direction * radius * .9, y);
    context.lineTo(x - direction * radius * .9, y + radius);
    context.closePath();
    context.fill();
    const barX = x + direction * (radius * .9 + gap + bar / 2);
    context.fillRect(barX - bar / 2, y - tall / 2, bar, tall);
    return;
  }
  if (playing) {
    context.fillRect(x - gap - bar / 2, y - tall / 2, bar, tall);
    context.fillRect(x + gap - bar / 2, y - tall / 2, bar, tall);
    return;
  }
  context.beginPath();
  context.moveTo(x - radius * .55, y - radius);
  context.lineTo(x + radius * .9, y);
  context.lineTo(x - radius * .55, y + radius);
  context.closePath();
  context.fill();
}

/** Paints the whole panel. Exported so the drawing can be checked without a GPU. */
export function paintDiscPanel(
  context: CanvasRenderingContext2D,
  state: PanelState,
  scale = DISC_PANEL.pixelsPerUnit,
) {
  const { width, height } = DISC_PANEL.design;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width * scale, height * scale);
  context.scale(scale, scale);
  context.globalAlpha = state.disabled ? .45 : 1;
  roundedRect(context, 3, 3, width - 6, height - 6, 32);
  context.fillStyle = "rgba(18,22,26,.86)";
  context.fill();
  context.lineWidth = 1.6;
  context.strokeStyle = "rgba(255,255,255,.14)";
  context.stroke();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(242,246,248,.94)";
  context.font = `500 ${DISC_PANEL.title.size}px ${FONT}`;
  context.fillText(state.title, DISC_PANEL.title.x, DISC_PANEL.title.y);
  context.fillStyle = "rgba(206,214,220,.72)";
  context.font = `400 ${DISC_PANEL.state.size}px ${FONT}`;
  context.fillText(state.state, DISC_PANEL.state.x, DISC_PANEL.state.y);
  const progress = Math.max(0, Math.min(1, state.progress ?? 0));
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  context.font = `400 12px ${FONT}`;
  context.textAlign = "left";
  context.fillText(formatTime(state.elapsed ?? 0), 30, 168);
  context.textAlign = "right";
  context.fillText(formatTime(state.duration ?? 0), 390, 168);
  context.textAlign = "center";
  roundedRect(context, 30, 187, 360, 3, 1.5);
  context.fillStyle = "rgba(255,255,255,.25)";
  context.fill();
  if (progress > 0) {
    roundedRect(context, 30, 187, 360 * progress, 3, 1.5);
    context.fillStyle = "rgba(255,255,255,.9)";
    context.fill();
  }
  context.beginPath();
  context.arc(30 + 360 * progress, 188.5, state.seeking ? 6 : 4, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  for (const [index, button] of DISC_PANEL.buttons.entries()) {
    const active = state.hover === button.id || state.pressed === button.id;
    const filled = button.id === "toggle" && state.playing;
    context.beginPath();
    const hover = state.feedback?.hover[index] ?? Number(active);
    const press = state.feedback?.press[index] ?? Number(state.pressed === button.id);
    const radius = button.radius * (1 + .09 * hover - .14 * press);
    context.arc(button.x, button.y, radius, 0, Math.PI * 2);
    context.fillStyle = filled
      ? "#ffffff"
      : active ? "rgba(255,255,255,.24)" : "rgba(255,255,255,.10)";
    const playMix = button.id === "toggle" ? (state.feedback?.playing ?? Number(state.playing)) : 0;
    if (state.feedback) context.fillStyle = `rgba(255,255,255,${Math.min(1, .1 + .14 * hover + .9 * playMix)})`;
    context.fill();
    if (state.feedback || !filled) {
      context.lineWidth = state.feedback ? 1.6 + .4 * hover : active ? 2 : 1.6;
      context.strokeStyle = state.feedback
        ? `rgba(255,255,255,${(.42 + .48 * hover) * (1 - playMix)})`
        : active ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.42)";
      context.stroke();
    }
    if (state.feedback && button.id === "toggle") {
      const baseAlpha = context.globalAlpha;
      const ink = Math.round(255 - 230 * playMix);
      const color = `rgb(${ink},${ink},${ink})`;
      context.globalAlpha = baseAlpha * (1 - playMix);
      drawGlyph(context, button.id, button.x, button.y, radius * .5, color, false);
      context.globalAlpha = baseAlpha * playMix;
      drawGlyph(context, button.id, button.x, button.y, radius * .5, color, true);
      context.globalAlpha = baseAlpha;
    } else drawGlyph(
      context, button.id, button.x, button.y, radius * .5,
      filled ? "#191c20" : "#ffffff", state.playing,
    );
  }
  context.restore();
}
