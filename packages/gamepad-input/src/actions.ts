/**
 * The vocabulary the router speaks. It is deliberately tiny and free of DOM
 * types so the same engine can be unit tested in Node and driven from any host
 * (this terminal maps it onto arrow keys, Enter/Escape and element scrolling).
 */
export type NavDirection = "up" | "down" | "left" | "right";

export type GamepadAction =
  /** One step of navigation; `repeat` marks everything after the first press. */
  | { type: "nav"; direction: NavDirection; repeat: boolean }
  /** Confirm (A / ×): read the selected file, activate the focused control. */
  | { type: "confirm" }
  /** Back (B / ○): leave the detail view, close the open panel. */
  | { type: "back" }
  /** Menu (Start / Options): open the terminal settings. */
  | { type: "menu" }
  /** Y / △: hand the stick over to the on-screen controls (the visible focus ring). */
  | { type: "focus" }
  /** LB / RB: step a list — the album transport in this terminal. */
  | { type: "shoulder"; direction: "prev" | "next" }
  /** X / □: play or pause the album. */
  | { type: "toggle" }
  /** Right stick, normalised -1..1; the host turns it into a scroll step. */
  | { type: "scroll"; x: number; y: number };

export type RumblePattern = {
  duration: number;
  /** Low-frequency motor, 0..1. */
  strong: number;
  /** High-frequency motor, 0..1. */
  weak: number;
};

/**
 * Haptics per action. Kept short and quiet: a tick per step so the shelf feels
 * mechanical, a firmer tap for confirm and a lighter one for back. Scrolling
 * stays silent — the right stick moves constantly and would buzz nonstop.
 */
export function rumbleFor(action: GamepadAction): RumblePattern | null {
  switch (action.type) {
    case "nav":
      return action.repeat
        ? { duration: 16, strong: 0, weak: .12 }
        : { duration: 26, strong: .05, weak: .24 };
    case "confirm":
      return { duration: 55, strong: .35, weak: .18 };
    case "back":
      return { duration: 30, strong: .18, weak: .1 };
    case "menu":
      return { duration: 40, strong: .2, weak: .2 };
    case "focus":
      return { duration: 34, strong: .16, weak: .18 };
    case "shoulder":
      return { duration: 22, strong: .08, weak: .14 };
    case "toggle":
      return { duration: 28, strong: .22, weak: .14 };
    default:
      return null;
  }
}
