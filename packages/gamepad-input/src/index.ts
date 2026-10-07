/**
 * Controller input for the career roadmap terminal.
 *
 * - PS and Xbox pads share the W3C standard mapping; the family only changes the
 *   labels and which haptics the pad answers to.
 * - Hot swap: the last pad that reports input drives the UI, and unplugging it
 *   hands over to whatever is still connected.
 * - Left stick and D-pad navigate, confirm/back/menu are the face and menu
 *   buttons, the right stick scrolls.
 *
 * `GamepadRouter` is DOM-free and deterministic (`update(pads, now)`), so the
 * behaviour is unit tested in `scripts/check-gamepad.mjs`; `attachGamepad` is the
 * browser side that turns those actions into key events, scrolling and haptics.
 */
export { detectFamily, familyLabels, confirmLabels, backLabels, menuLabels, type GamepadFamily } from "./families.ts";
export { rumbleFor, type GamepadAction, type NavDirection, type RumblePattern } from "./actions.ts";
export { nextFocusIndex, stepFocusIndex, type FocusDirection, type Rect } from "./focus.ts";
export { GamepadRouter, type ActivePad, type PadLike, type RouterOptions } from "./router.ts";
export { attachGamepad, currentFamily, type AttachOptions, type GamepadHandle, type GamepadStatus } from "./browser.ts";
