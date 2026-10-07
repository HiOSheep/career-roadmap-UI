import assert from "node:assert/strict";
import {
  DISC_PANEL,
  buttonRowInk,
  onDiscFace,
  paintDiscPanel,
  panelButtonRects,
  panelWorldSize,
  textRowInk,
  visibleCoverage,
} from "../src/disc-panel.ts";

// --- the layout is shared by the painted panel and the DOM hit areas ---------
const rects = panelButtonRects();
assert.equal(rects.length, 3, "Three transport buttons");
assert.deepEqual(rects.map((rect) => rect.id), ["previous", "toggle", "next"]);
const { design } = DISC_PANEL;
for (const rect of rects) {
  assert.ok(rect.left >= 0 && rect.top >= 0, `${rect.id} starts inside the panel`);
  assert.ok(rect.left + rect.size <= design.width, `${rect.id} ends inside the panel width`);
  assert.ok(rect.top + rect.size <= design.height, `${rect.id} ends inside the panel height`);
}
for (let i = 1; i < rects.length; i++)
  assert.ok(rects[i].left >= rects[i - 1].left + rects[i - 1].size, "Hit areas never overlap");
const toggle = rects[1];
assert.ok(toggle.size > rects[0].size, "The transport toggle is the largest target");
// The hit areas are circles, matching the painted buttons.
assert.equal(rects[0].size, DISC_PANEL.buttons[0].radius * 2);

// --- the three rows are evenly spaced and never collide ----------------------
const titleInk = textRowInk(DISC_PANEL.title);
const stateInk = textRowInk(DISC_PANEL.state);
const transport = buttonRowInk();
assert.ok(titleInk.top >= 20, `The title clears the panel's top edge, got ${titleInk.top}`);
assert.ok(transport.top - titleInk.bottom >= 12, "The title clears the transport row");
assert.ok(stateInk.top - transport.bottom >= 12, "The state clears the transport row");
assert.ok(design.height - stateInk.bottom >= 20, `The state clears the bottom edge, got ${design.height - stateInk.bottom}`);
const gaps = [
  titleInk.top,
  transport.top - titleInk.bottom,
  stateInk.top - transport.bottom,
  design.height - stateInk.bottom,
];
assert.ok(
  Math.max(...gaps) - Math.min(...gaps) <= 8,
  `The rows are evenly spaced, got ${gaps.map((gap) => gap.toFixed(1)).join(", ")}`,
);
// The transport row is the tallest element, so it decides the box height.
assert.ok(transport.bottom - transport.top < design.height / 2, "The panel is not dominated by its buttons");

// --- the panel fits on the disc's printed face -------------------------------
const world = panelWorldSize();
assert.equal(world.width, 1.45);
assert.ok(Math.abs(world.height - 1.45 * design.height / design.width) < 1e-9);
for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [.5, .5]])
  assert.equal(
    onDiscFace(u, v, design.width, design.height),
    true,
    "Every corner of the panel stays on the disc, so nothing needs clipping",
  );

// --- the painter ------------------------------------------------------------
/** Enough of a 2D context to record what the panel draws. */
function recorder() {
  const calls = [];
  const context = {
    calls,
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "",
    textAlign: "", textBaseline: "", globalAlpha: 1,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    setTransform() {},
    clearRect() { calls.push(["clear"]); },
    scale() {},
    beginPath() { calls.push(["begin"]); },
    moveTo(x, y) { calls.push(["moveTo", x, y]); },
    lineTo(x, y) { calls.push(["lineTo", x, y]); },
    arcTo() {},
    closePath() {},
    arc(x, y, r) { calls.push(["arc", x, y, r]); },
    fill() { calls.push(["fill", context.fillStyle]); },
    stroke() { calls.push(["stroke", context.strokeStyle]); },
    fillRect(x, y, w, h) { calls.push(["fillRect", x, y, w, h, context.fillStyle]); },
    fillText(text) { calls.push(["fillText", text]); },
  };
  return context;
}
const count = (calls, name) => calls.filter((call) => call[0] === name).length;
/** The fill applied to each button circle, in draw order. */
const circleFills = (calls) =>
  calls
    .filter((call, index) => call[0] === "fill" && calls[index - 1]?.[0] === "arc" && calls[index - 1][3] > 10)
    .map((call) => call[1]);

const state = {
  title: "01 · 迷星叫", state: "播放中", playing: true,
  disabled: false, hover: null, pressed: null,
};
const playing = recorder();
paintDiscPanel(playing, state, 1);
const calls = playing.calls;
assert.equal(playing.globalAlpha, 1, "The painter restores the context alpha");
assert.ok(calls.some((call) => call[0] === "clear"), "The previous frame is cleared");
assert.equal(count(calls, "arc"), 4, "Transport circles and progress handle are drawn");
assert.equal(count(calls, "fillText"), 4, "Title, state and progress timestamps are drawn");
assert.deepEqual(
  calls.filter((call) => call[0] === "fillText").slice(0, 2).map((call) => call[1]),
  ["01 · 迷星叫", "播放中"],
);
// Playing: a filled white toggle with two pause bars, plus a bar per skip.
assert.equal(circleFills(calls)[1], "#ffffff", "The playing toggle is filled white");
assert.equal(count(calls, "fillRect"), 4, "Two pause bars plus two skip bars");
assert.equal(count(calls, "stroke"), 3, "The panel border plus the two skip outlines");

const paused = recorder();
paintDiscPanel(paused, { ...state, playing: false, state: "已暂停" }, 1);
assert.deepEqual(
  circleFills(paused.calls),
  ["rgba(255,255,255,.10)", "rgba(255,255,255,.10)", "rgba(255,255,255,.10)"],
  "A paused toggle is not filled",
);
assert.equal(count(paused.calls, "fillRect"), 2, "Only the skip bars remain");
assert.ok(count(paused.calls, "lineTo") >= 3, "The play triangle is drawn as vectors");

// Hover and press brighten the ring, so the state must reach the painter.
const hovered = recorder();
paintDiscPanel(hovered, { ...state, hover: "next" }, 1);
assert.equal(circleFills(hovered.calls)[2], "rgba(255,255,255,.24)", "The hovered button lifts");
const pressed = recorder();
paintDiscPanel(pressed, { ...state, pressed: "previous" }, 1);
assert.equal(circleFills(pressed.calls)[0], "rgba(255,255,255,.24)", "A press reads like a hover");

// A missing album greys the whole panel out instead of hiding the buttons.
const disabled = recorder();
paintDiscPanel(disabled, { ...state, disabled: true }, 1);
assert.equal(disabled.globalAlpha, .45, "A disabled panel is drawn translucent");

// Scale only changes resolution, never the layout.
const small = recorder();
paintDiscPanel(small, state, .5);
assert.deepEqual(
  small.calls.filter((call) => call[0] === "fillText").slice(0, 2).map((call) => call[1]),
  ["01 · 迷星叫", "播放中"],
  "The same text is drawn at any scale",
);
assert.equal(count(small.calls, "arc"), 4);

console.log(
  "Disc panel checks passed: shared layout for painting and hit areas, panel inside the disc face, transport glyphs, hover/press/disabled states and scale independence.",
);
