import assert from "node:assert/strict";
import { detectFamily, confirmLabels, backLabels } from "../packages/gamepad-input/src/families.ts";
import { rumbleFor } from "../packages/gamepad-input/src/actions.ts";
import { nextFocusIndex, stepFocusIndex } from "../packages/gamepad-input/src/focus.ts";
import { GamepadRouter } from "../packages/gamepad-input/src/router.ts";

/** A pad snapshot in the shape the Gamepad API reports (standard mapping). */
function pad(index, id, { buttons = {}, axes = [0, 0, 0, 0], connected = true } = {}) {
  return {
    index,
    id,
    mapping: "standard",
    connected,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: false, value: 0, ...(buttons[i] ?? {}) })),
    axes,
  };
}
const held = (index, button) => pad(index, "Xbox Wireless Controller", { buttons: { [button]: { pressed: true, value: 1 } } });
const stick = (index, axes, id = "Xbox Wireless Controller") => pad(index, id, { axes });

// --- families -----------------------------------------------------------------
assert.equal(detectFamily("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"), "playstation");
assert.equal(detectFamily("Wireless Controller (Vendor: 054c Product: 09cc)"), "playstation");
assert.equal(detectFamily("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"), "xbox");
assert.equal(detectFamily("Microsoft X-Box One pad"), "xbox");
assert.equal(detectFamily("8BitDo Pro 2"), "standard");
assert.equal(confirmLabels.playstation, "×");
assert.equal(backLabels.playstation, "○");
assert.equal(confirmLabels.xbox, "A");

// --- idle ---------------------------------------------------------------------
{
  const router = new GamepadRouter();
  assert.deepEqual(router.update([null, null, null, null], 0), [], "No pads, no actions");
  assert.equal(router.active, null);
  const idle = router.update([pad(0, "Xbox Wireless Controller")], 16);
  assert.deepEqual(idle, [], "A plugged-in pad that is untouched sends nothing");
  assert.equal(router.active?.family, "xbox", "…but it is reported so settings can name it");
}

// --- D-pad: edge then auto-repeat --------------------------------------------
{
  const router = new GamepadRouter({ repeatDelayMs: 300, repeatIntervalMs: 100 });
  const right = held(0, 15);
  assert.deepEqual(router.update([right], 0), [{ type: "nav", direction: "right", repeat: false }]);
  assert.deepEqual(router.update([right], 120), [], "Held inside the delay window: silent");
  assert.deepEqual(router.update([right], 300), [{ type: "nav", direction: "right", repeat: true }]);
  assert.deepEqual(router.update([right], 340), [], "Not yet at the repeat interval");
  assert.deepEqual(router.update([right], 400), [{ type: "nav", direction: "right", repeat: true }]);
  // A late frame catches up once instead of firing a burst.
  assert.equal(router.update([right], 900).length, 1);
  assert.deepEqual(router.update([pad(0, "Xbox Wireless Controller")], 950), [], "Release stops the repeat");
}

// --- Left stick = the arrow keys, with a dead zone and hysteresis --------------
{
  const router = new GamepadRouter({ stickDeadzone: .35, repeatDelayMs: 300 });
  assert.deepEqual(router.update([stick(0, [0, -0.9, 0, 0])], 0), [{ type: "nav", direction: "up", repeat: false }]);
  assert.deepEqual(router.update([stick(0, [0, 0, 0, 0])], 40), [], "Centred: nothing");
  const soft = new GamepadRouter({ stickDeadzone: .35 });
  assert.deepEqual(soft.update([stick(0, [0.2, 0, 0, 0])], 0), [], "Inside the dead zone the stick is still");
  // Held slightly past the press threshold but above the release threshold: one press only.
  const hysteretic = new GamepadRouter({ stickDeadzone: .35 });
  assert.equal(hysteretic.update([stick(0, [0.5, 0, 0, 0])], 0).length, 1);
  assert.deepEqual(hysteretic.update([stick(0, [0.3, 0, 0, 0])], 20), [], "No chatter at the threshold");
  assert.equal(hysteretic.update([stick(0, [0.5, 0, 0, 0])], 900).length, 1, "Still held: only the repeat");
}

// --- Face buttons: edges, never held -----------------------------------------
{
  const router = new GamepadRouter();
  assert.deepEqual(router.update([held(0, 0)], 0), [{ type: "confirm" }]);
  assert.deepEqual(router.update([held(0, 0)], 100), [], "Holding A does not repeat");
  assert.deepEqual(router.update([pad(0, "Xbox Wireless Controller")], 200), []);
  assert.deepEqual(router.update([held(0, 0)], 300), [{ type: "confirm" }], "Re-press confirms again");
  assert.deepEqual(router.update([held(0, 1)], 400), [{ type: "back" }]);
  assert.deepEqual(router.update([held(0, 9)], 500), [{ type: "menu" }]);
}

// --- Right stick scrolls ------------------------------------------------------
{
  const router = new GamepadRouter({ scrollDeadzone: .18 });
  assert.deepEqual(router.update([stick(0, [0, 0, 0, 0])], 0), [], "Centred right stick does not scroll");
  const down = router.update([stick(0, [0, 0, 0, .8])], 16);
  assert.equal(down.length, 1);
  assert.equal(down[0].type, "scroll");
  assert.ok(down[0].y > 0 && down[0].y <= 1, "Pushed down scrolls forward");
  const right = router.update([stick(0, [0, 0, .8, 0])], 32);
  assert.ok(right[0].x > 0, "Pushed right scrolls right");
  const up = new GamepadRouter().update([stick(0, [0, 0, 0, -.8])], 0);
  assert.ok(up[0].y < 0, "Pushed up scrolls back");
}

// --- Hot swap -----------------------------------------------------------------
{
  const router = new GamepadRouter();
  const dualsense = held(0, 0);
  dualsense.id = "DualSense Wireless Controller (Vendor: 054c Product: 0ce6)";
  assert.deepEqual(router.update([dualsense], 0), [{ type: "confirm" }]);
  assert.equal(router.active.family, "playstation");
  const xbox = held(1, 1);
  assert.deepEqual(router.update([dualsense, xbox], 100), [{ type: "back" }], "The pad that was touched drives");
  assert.equal(router.active.index, 1);
  assert.equal(router.active.family, "xbox");
  assert.deepEqual(router.update([xbox], 200), [], "Unplugging the PS pad leaves the Xbox one driving");
  assert.equal(router.active.index, 1);
  assert.equal(router.update([], 300).length, 0);
  assert.equal(router.active, null, "Nothing connected: no active pad");
  // A swap mid-hold must not repeat the old pad's direction into the new one.
  const swapped = new GamepadRouter();
  swapped.update([stick(0, [0, -1, 0, 0])], 0);
  const second = stick(1, [0, -1, 0, 0]);
  assert.deepEqual(swapped.update([stick(0, [0, -1, 0, 0]), second], 16), [{ type: "nav", direction: "up", repeat: false }]);
}

// --- Haptics ------------------------------------------------------------------
{
  assert.equal(rumbleFor({ type: "scroll", x: 0, y: 1 }), null, "Scrolling stays silent");
  const first = rumbleFor({ type: "nav", direction: "left", repeat: false });
  const repeat = rumbleFor({ type: "nav", direction: "left", repeat: true });
  assert.ok(first.weak > repeat.weak, "The first step of a direction ticks harder than its repeats");
  for (const action of [{ type: "confirm" }, { type: "back" }, { type: "menu" }]) {
    const pattern = rumbleFor(action);
    assert.ok(pattern.duration > 0 && pattern.duration <= 80, `${action.type} is a short tap`);
    assert.ok(pattern.strong >= 0 && pattern.strong <= 1 && pattern.weak >= 0 && pattern.weak <= 1);
  }
  assert.ok(rumbleFor({ type: "confirm" }).strong > rumbleFor({ type: "back" }).strong, "Confirm lands harder than back");
}

// --- Shoulder buttons and the focus toggle -----------------------------------
{
  const router = new GamepadRouter();
  assert.deepEqual(router.update([held(0, 4)], 0), [{ type: "shoulder", direction: "prev" }]);
  assert.deepEqual(router.update([held(0, 4)], 100), [], "Holding LB does not step repeatedly");
  assert.deepEqual(router.update([held(0, 5)], 200), [{ type: "shoulder", direction: "next" }]);
  assert.deepEqual(router.update([held(0, 3)], 300), [{ type: "focus" }], "Y toggles the selection frame");
  assert.deepEqual(router.update([held(0, 3)], 400), [], "Holding Y does not re-toggle");
  assert.deepEqual(router.update([held(0, 2)], 500), [{ type: "toggle" }], "X plays or pauses");
  assert.deepEqual(router.update([held(0, 2)], 600), [], "Holding X does not toggle twice");
  assert.deepEqual(rumbleFor({ type: "focus" }).duration > 0, true);
  assert.deepEqual(rumbleFor({ type: "shoulder", direction: "next" }).duration > 0, true);
  assert.deepEqual(rumbleFor({ type: "toggle" }).duration > 0, true);
}

// --- Spatial focus navigation ------------------------------------------------
{
  const box = (left, top, width = 100, height = 30) => ({ left, top, right: left + width, bottom: top + height });
  // A 3x3 grid of controls, 100x30 each, 40px gaps.
  const grid = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) grid.push(box(column * 140, row * 70));
  const centre = 4;
  assert.equal(nextFocusIndex(grid, centre, "right"), 5, "Right lands on the control beside it");
  assert.equal(nextFocusIndex(grid, centre, "left"), 3);
  assert.equal(nextFocusIndex(grid, centre, "down"), 7, "Down lands on the control below");
  assert.equal(nextFocusIndex(grid, centre, "up"), 1);
  assert.equal(nextFocusIndex(grid, 8, "right"), null, "Nothing further right: the frame stays put");
  // Alignment beats raw distance: the same-row control is preferred over a closer
  // one that sits well below.
  const aligned = [box(0, 0), box(600, 10), box(200, 400)];
  assert.equal(nextFocusIndex(aligned, 0, "right"), 1, "A control in the travel band wins");
  // A narrow control stacked in a column, like the settings list.
  const column = [box(0, 0), box(0, 60), box(0, 120)];
  assert.equal(nextFocusIndex(column, 1, "down"), 2);
  assert.equal(nextFocusIndex(column, 1, "up"), 0);
  assert.equal(nextFocusIndex([box(0, 0)], 0, "down"), null, "A single control has nowhere to go");
  assert.equal(stepFocusIndex(4, 3, 1), 0, "Traversal wraps forward");
  assert.equal(stepFocusIndex(4, 0, -1), 3, "…and backward");
  assert.equal(stepFocusIndex(0, 0, 1), null, "No controls, no step");
}

console.log("Gamepad checks passed: PS/Xbox detection and labels, dead zones with hysteresis, D-pad and left-stick edges with auto-repeat, one-shot face buttons, LB/RB and Y edges, right-stick scrolling, hot swap between pads and to nothing, spatial focus navigation for the selection frame, and haptic patterns per action.");
