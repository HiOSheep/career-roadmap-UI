import { detectFamily, type GamepadFamily } from "./families.ts";
import type { GamepadAction, NavDirection } from "./actions.ts";

/** The slice of the Gamepad API the router needs; keeps it fakeable in tests. */
export type PadLike = {
  index: number;
  id: string;
  mapping?: string;
  connected?: boolean;
  /** Read-only, matching the Gamepad API's own `readonly GamepadButton[]`. */
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
};

export type RouterOptions = {
  /** How far the stick must travel before it counts as a direction press. */
  stickDeadzone?: number;
  /** Held directions wait this long before they start repeating. */
  repeatDelayMs?: number;
  /** Then repeat this often, matching a keyboard's own auto-repeat feel. */
  repeatIntervalMs?: number;
  /** The right stick ignores smaller deflections entirely. */
  scrollDeadzone?: number;
};

export type ActivePad = { index: number; id: string; family: GamepadFamily };

const STANDARD_MAPPING = {
  confirm: 0,
  back: 1,
  /** X / □: play-pause. */
  toggle: 2,
  /** Y / △: hands the stick to the on-screen focus ring. */
  focus: 3,
  /** LB / RB: prev/next in a list. */
  shoulderPrev: 4,
  shoulderNext: 5,
  menu: 9,
  dpad: { up: 12, down: 13, left: 14, right: 15 } as const,
  leftStick: { x: 0, y: 1 },
  rightStick: { x: 2, y: 3 },
};

const DIRECTIONS = ["up", "down", "left", "right"] as const;

/**
 * Turns pad snapshots into actions. Nothing here touches the DOM or the clock:
 * `update(pads, now)` is a pure step, so hot swap, dead zones and auto-repeat are
 * deterministic and unit testable.
 *
 * Hot swap is "the pad you just touched wins": a pad takes over on a *new* button
 * press or when its stick first crosses the dead zone, so putting one pad down
 * while another is still held does not fight over the UI, and unplugging the
 * active pad hands the terminal to whatever is still connected.
 */
export class GamepadRouter {
  private readonly stickDeadzone: number;
  private readonly releaseDeadzone: number;
  private readonly repeatDelayMs: number;
  private readonly repeatIntervalMs: number;
  private readonly scrollDeadzone: number;
  private activeIndex: number | null = null;
  private activePad: ActivePad | null = null;
  /** Pads that reported input last frame, so "just crossed the dead zone" is visible. */
  private driving = new Set<number>();
  private held = new Map<NavDirection, { next: number; down: boolean }>();
  private scroll = { x: 0, y: 0 };
  /** Buttons down at the end of the previous frame, for press edges. */
  private wasPressed = new Set<string>();

  constructor(options: RouterOptions = {}) {
    this.stickDeadzone = options.stickDeadzone ?? .35;
    // A slightly smaller release threshold stops a stick resting on the edge from
    // chattering between press and release every frame.
    this.releaseDeadzone = this.stickDeadzone * .72;
    this.repeatDelayMs = options.repeatDelayMs ?? 320;
    this.repeatIntervalMs = options.repeatIntervalMs ?? 110;
    this.scrollDeadzone = options.scrollDeadzone ?? .18;
  }

  /** The pad that is currently driving the UI, for status text and haptics. */
  get active(): ActivePad | null {
    return this.activePad;
  }

  update(pads: readonly (PadLike | null | undefined)[], now: number): GamepadAction[] {
    const connected = pads.filter((pad): pad is PadLike => Boolean(pad && pad.connected !== false && pad.buttons));
    const downNow = new Set<string>();
    for (const pad of connected) {
      pad.buttons.forEach((button, index) => {
        if (button?.pressed) downNow.add(`${pad.index}:${index}`);
      });
    }
    const driving = connected.filter((pad) => this.isDriving(pad));
    // Adoption order: the pad with a fresh press, else one whose stick just came
    // into range, else keep (or fall back to) what is connected.
    const touched = driving.filter((pad) => this.hasNewPress(pad) || !this.driving.has(pad.index));
    if (touched.length) this.adopt(touched[touched.length - 1]);
    else if (this.activeIndex === null && connected.length) this.adopt(connected[0]);
    else if (this.activeIndex !== null) {
      const same = connected.find((pad) => pad.index === this.activeIndex);
      if (same) this.adopt(same);
      else this.adopt(connected[0] ?? null);
    }

    this.driving = new Set(driving.map((pad) => pad.index));

    const pad = this.activeIndex === null ? null : connected.find((entry) => entry.index === this.activeIndex) ?? null;
    if (!pad) {
      this.held.clear();
      this.scroll = { x: 0, y: 0 };
      return [];
    }

    const actions: GamepadAction[] = [];
    for (const [action, button] of [["confirm", STANDARD_MAPPING.confirm], ["back", STANDARD_MAPPING.back], ["focus", STANDARD_MAPPING.focus], ["menu", STANDARD_MAPPING.menu]] as const) {
      if (downNow.has(`${pad.index}:${button}`) && !this.wasPressed.has(`${pad.index}:${button}`))
        actions.push({ type: action } as GamepadAction);
    }
    for (const [direction, button] of [["prev", STANDARD_MAPPING.shoulderPrev], ["next", STANDARD_MAPPING.shoulderNext]] as const) {
      if (downNow.has(`${pad.index}:${button}`) && !this.wasPressed.has(`${pad.index}:${button}`))
        actions.push({ type: "shoulder", direction });
    }
    if (downNow.has(`${pad.index}:${STANDARD_MAPPING.toggle}`) && !this.wasPressed.has(`${pad.index}:${STANDARD_MAPPING.toggle}`))
      actions.push({ type: "toggle" });

    const down: Record<NavDirection, boolean> = {
      up: this.directionDown(pad, "up"),
      down: this.directionDown(pad, "down"),
      left: this.directionDown(pad, "left"),
      right: this.directionDown(pad, "right"),
    };
    for (const direction of DIRECTIONS) {
      const state = this.held.get(direction);
      if (!down[direction]) {
        this.held.delete(direction);
        continue;
      }
      if (!state?.down) {
        this.held.set(direction, { down: true, next: now + this.repeatDelayMs });
        actions.push({ type: "nav", direction, repeat: false });
        continue;
      }
      // Catch up one step rather than firing a burst when frames were late.
      if (now >= state.next) {
        state.next = now + this.repeatIntervalMs;
        actions.push({ type: "nav", direction, repeat: true });
      }
    }

    const x = this.axis(pad.axes[STANDARD_MAPPING.rightStick.x] ?? 0, this.scroll.x);
    const y = this.axis(pad.axes[STANDARD_MAPPING.rightStick.y] ?? 0, this.scroll.y);
    this.scroll = { x, y };
    if (x || y) actions.push({ type: "scroll", x, y });

    this.wasPressed = downNow;
    return actions;
  }

  private hasNewPress(pad: PadLike) {
    return pad.buttons.some((button, index) => button?.pressed && !this.wasPressed.has(`${pad.index}:${index}`));
  }

  private adopt(pad: PadLike | null) {
    if (pad === null) {
      this.activeIndex = null;
      this.activePad = null;
      this.held.clear();
      return;
    }
    if (this.activeIndex !== pad.index) {
      // Handing over mid-hold: the new pad starts its own repeat cycle and must
      // not inherit the previous pad's held direction.
      this.held.clear();
      this.scroll = { x: 0, y: 0 };
    }
    this.activeIndex = pad.index;
    this.activePad = { index: pad.index, id: pad.id, family: detectFamily(pad.id) };
  }

  private isDriving(pad: PadLike) {
    return pad.buttons.some((button) => button?.pressed) || pad.axes.some((axis) => Math.abs(axis ?? 0) > this.stickDeadzone);
  }

  private directionDown(pad: PadLike, direction: NavDirection) {
    const button = pad.buttons[STANDARD_MAPPING.dpad[direction]]?.pressed;
    const axis = direction === "up" ? -(pad.axes[STANDARD_MAPPING.leftStick.y] ?? 0)
      : direction === "down" ? pad.axes[STANDARD_MAPPING.leftStick.y] ?? 0
        : direction === "left" ? -(pad.axes[STANDARD_MAPPING.leftStick.x] ?? 0)
          : pad.axes[STANDARD_MAPPING.leftStick.x] ?? 0;
    const threshold = this.held.get(direction)?.down ? this.releaseDeadzone : this.stickDeadzone;
    return Boolean(button) || axis > threshold;
  }

  private axis(value: number, previous: number) {
    const threshold = previous !== 0 ? this.scrollDeadzone * .7 : this.scrollDeadzone;
    if (Math.abs(value) <= threshold) return 0;
    // Rescale past the dead zone so the first pixel of movement responds.
    const sign = Math.sign(value);
    return sign * Math.min(1, (Math.abs(value) - threshold) / (1 - threshold));
  }
}
