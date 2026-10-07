import { detectFamily, type GamepadFamily } from "./families.ts";
import { rumbleFor, type GamepadAction, type NavDirection } from "./actions.ts";
import { GamepadRouter, type PadLike } from "./router.ts";

export type GamepadStatus = {
  connected: boolean;
  family: GamepadFamily | null;
  id: string | null;
  index: number | null;
};

export type AttachOptions = {
  /** Consulted every frame; returning false parks the controller without losing the pad. */
  enabled?: () => boolean;
  /** Consulted per pulse; returning false keeps the pad silent. */
  rumbleEnabled?: () => boolean;
  /** Whatever scrolls in the current view: the open panel, the detail column, the page. */
  scrollTarget?: () => HTMLElement | null;
  /** Where synthetic key events land. Defaults to the focused element, else `<body>`. */
  keyTarget?: () => EventTarget;
  /** Fired when the driving pad appears, disappears or is swapped. */
  onStatus?: (status: GamepadStatus, reason: "connected" | "disconnected" | "swapped") => void;
  /** Every accepted action, after it has been delivered. */
  onAction?: (action: GamepadAction) => void;
  /**
   * Directional input. Return true to keep it: the host is driving its own focus
   * ring, and the arrow keys would otherwise move the terminal's own selection.
   */
  onNavigate?: (direction: NavDirection, repeat: boolean) => boolean;
  /** Confirm. Return true when the host handled it (activating its focus ring). */
  onConfirm?: () => boolean;
  /** Back. Return true when the host handled it (leaving its focus ring). */
  onBack?: () => boolean;
  /** LB / RB and X / □: the host's media transport, which only exists in some views. */
  onTransport?: (control: "prev" | "next" | "toggle") => void;
  /** Pixels per frame at full stick deflection. */
  scrollSpeed?: number;
};

export type GamepadHandle = {
  /** Current pad, for status text and settings. */
  status(): GamepadStatus;
  /** Re-read the pad list now (after a toggle, or a browser event). */
  refresh(): void;
  stop(): void;
};

/** Chromium's actuator API, plus the older Firefox `hapticActuators` shape. */
type HapticPad = Gamepad & {
  vibrationActuator?: { playEffect?(type: string, params: Record<string, number>): Promise<unknown> };
  hapticActuators?: { pulse?(intensity: number, duration: number): Promise<unknown> }[];
};

const NAV_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;

/**
 * Drives the terminal from a controller.
 *
 * Navigation is delivered as the arrow keys the terminal already understands,
 * confirm/back as Enter/Escape, and the menu button as a click on the settings
 * control — so every existing shortcut, focus rule and sound stays the single
 * source of truth instead of being duplicated here. The right stick scrolls
 * programmatically: synthetic wheel events are not trusted and never scroll.
 */
export function attachGamepad(options: AttachOptions = {}): GamepadHandle {
  const router = new GamepadRouter();
  const scrollSpeed = options.scrollSpeed ?? 26;
  let frame = 0;
  let status: GamepadStatus = { connected: false, family: null, id: null, index: null };
  let stopped = false;

  const pads = (): (PadLike | null)[] => {
    const list = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    return Array.from(list ?? []);
  };

  const setStatus = (next: GamepadStatus, reason: "connected" | "disconnected" | "swapped") => {
    const changed = next.index !== status.index || next.id !== status.id;
    status = next;
    if (changed) options.onStatus?.(status, reason);
  };

  const syncStatus = (reason: "connected" | "disconnected" | "swapped") => {
    const active = router.active;
    if (!active) {
      setStatus({ connected: false, family: null, id: null, index: null }, status.connected ? "disconnected" : reason);
      return;
    }
    setStatus({ connected: true, family: active.family, id: active.id, index: active.index }, reason);
  };

  const press = (key: string) => {
    // Dispatch on an *element*: the terminal reads `event.target.dataset`, and a
    // Document has none — which used to abort its handler before the arrow keys.
    // The focused element keeps focus rules (and typing fields) intact.
    const target = options.keyTarget?.()
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : document.body);
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  };

  const pulse = (action: GamepadAction) => {
    if (options.rumbleEnabled && !options.rumbleEnabled()) return;
    const pattern = rumbleFor(action);
    if (!pattern) return;
    const pad = status.index === null ? null : (navigator.getGamepads?.()[status.index] as HapticPad | null);
    if (!pad) return;
    const actuator = pad.vibrationActuator;
    if (actuator?.playEffect) {
      void Promise.resolve(actuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: pattern.duration,
        weakMagnitude: pattern.weak,
        strongMagnitude: pattern.strong,
      })).catch(() => { /* Haptics are a bonus; a refused effect must not break input. */ });
      return;
    }
    const legacy = pad.hapticActuators?.[0];
    if (legacy?.pulse) void Promise.resolve(legacy.pulse(Math.max(pattern.weak, pattern.strong), pattern.duration)).catch(() => {});
  };

  /** An open panel, so confirm can activate its controls instead of the terminal shortcuts. */
  const openPanel = () =>
    document.querySelector<HTMLElement>('#modal-root .terminal-modal, #modal-root .career-modal, #modal-root .booklet-modal');

  const confirm = () => {
    const focused = document.activeElement;
    const panel = openPanel();
    if (panel && focused instanceof HTMLElement) {
      // In a panel, A activates the focused control — what Enter does for a
      // keyboard user — and falls through to Enter for text fields and selects.
      const control = focused.closest<HTMLElement>('button, a[href], summary, [role="button"], [data-action]');
      if (control && panel.contains(control)) {
        control.click();
        return;
      }
    }
    // The terminal's Enter shortcut only reads the file while focus is neutral:
    // body, the detail column, or one of its own step controls. A pad has no focus
    // ring of its own, so a button left behind by an earlier panel (the settings
    // button, a result row) would silently swallow the press — step back to
    // neutral, exactly as if the keyboard user had never tabbed there.
    if (!panel && focused instanceof HTMLElement && focused !== document.body) {
      const action = (focused as HTMLElement).dataset?.action;
      const neutral = focused.id === "detail-content"
        || (focused as HTMLElement).dataset?.select !== undefined
        || action === "prev" || action === "next" || action === "column-prev" || action === "column-next";
      if (!neutral) focused.blur();
    }
    press("Enter");
  };

  const deliver = (action: GamepadAction) => {
    switch (action.type) {
      case "nav":
        if (!options.onNavigate?.(action.direction, action.repeat)) press(NAV_KEYS[action.direction]);
        break;
      case "confirm":
        if (!options.onConfirm?.()) confirm();
        break;
      case "back":
        if (!options.onBack?.()) press("Escape");
        break;
      case "shoulder":
        options.onTransport?.(action.direction);
        break;
      case "toggle":
        options.onTransport?.("toggle");
        break;
      case "menu": {
        const target = document.querySelector<HTMLElement>('[data-action="settings"]');
        target?.click();
        break;
      }
      case "scroll": {
        const target = options.scrollTarget?.() ?? null;
        if (!target) break;
        target.scrollTop += action.y * scrollSpeed;
        target.scrollLeft += action.x * scrollSpeed;
        break;
      }
    }
    pulse(action);
    options.onAction?.(action);
  };

  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (options.enabled && !options.enabled()) {
      if (status.connected) setStatus({ connected: false, family: null, id: null, index: null }, "disconnected");
      return;
    }
    const actions = router.update(pads(), now);
    const active = router.active;
    // Compare against the status the host was last told about, not the previous
    // frame: a swap that happens between two frames would otherwise look unchanged
    // in both reads. Identity matters because a replacement pad usually reuses
    // index 0, and the family — and the labels in the hints — must follow the pad
    // that is actually in hand.
    if (!active) {
      if (status.connected) setStatus({ connected: false, family: null, id: null, index: null }, "disconnected");
    } else if (active.index !== status.index || active.id !== status.id) {
      syncStatus(status.connected ? "swapped" : "connected");
    }
    for (const action of actions) deliver(action);
  };

  const onConnected = () => syncStatus("connected");
  const onDisconnected = () => syncStatus("disconnected");
  window.addEventListener("gamepadconnected", onConnected);
  window.addEventListener("gamepaddisconnected", onDisconnected);
  frame = requestAnimationFrame(tick);

  return {
    status: () => ({ ...status }),
    refresh: () => {
      // A frame is enough: the poll re-reads the pad list every tick.
      if (stopped) return;
      const actions = router.update(pads(), performance.now());
      syncStatus("connected");
      for (const action of actions) deliver(action);
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", onConnected);
      window.removeEventListener("gamepaddisconnected", onDisconnected);
    },
  };
}

/** Reads the family of whatever is connected right now, without attaching. */
export function currentFamily(): GamepadFamily | null {
  const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  const pad = Array.from(pads ?? []).find((entry): entry is Gamepad => Boolean(entry));
  return pad ? detectFamily(pad.id) : null;
}
