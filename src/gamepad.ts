import {
  attachGamepad,
  backLabels,
  confirmLabels,
  familyLabels,
  nextFocusIndex,
  type GamepadAction,
  type GamepadHandle,
  type GamepadStatus,
  type NavDirection,
} from "../packages/gamepad-input/src/index";
import { createFocusRing, focusCandidates, rectOf } from "./gamepad-focus";

export type GamepadBridgeOptions = {
  /** The terminal's preference; consulted every frame so toggling needs no restart. */
  isEnabled: () => boolean;
  isRumbleEnabled: () => boolean;
  /** Toast, so a pad appearing or leaving is visible. */
  notify: (message: string) => void;
  /** Before the terminal is entered the arrow keys are ignored, so confirm/back press the entry gate. */
  isStarted: () => boolean;
  /** Whatever scrolls right now: the open panel first, then the detail column, then the page. */
  scrollTarget: () => HTMLElement | null;
  /** Shoulder buttons and X: the album transport, which only exists in the detail view. */
  onTransport: (control: "prev" | "next" | "toggle") => void;
  /** Fired whenever the driving pad changes, so an open settings panel can show it. */
  onStatusChanged?: (status: GamepadStatus) => void;
  /** Fired when the selection frame appears or disappears, for tests and hints. */
  onFocusModeChanged?: (active: boolean) => void;
};

export type GamepadBridge = GamepadHandle & {
  /** Called when the enable/rumble preferences change, so the toast can explain it. */
  setEnabled: (enabled: boolean) => void;
  /** Whether the stick is currently walking the on-screen controls. */
  focusing: () => boolean;
};

const PANEL = "#modal-root .terminal-modal, #modal-root .career-modal, #modal-root .booklet-modal";

/**
 * The scroll surface the right stick drives. Panels scroll themselves, the detail
 * column scrolls itself, and outside those there is nothing to scroll — so the
 * lookup stays O(1) instead of walking the tree on every frame of stick travel.
 */
export function resolveScrollTarget(): HTMLElement | null {
  const modal = document.querySelector<HTMLElement>(PANEL);
  if (modal && modal.scrollHeight > modal.clientHeight + 1) return modal;
  const detail = document.querySelector<HTMLElement>(".detail-content");
  if (detail && !detail.closest("[inert]") && detail.scrollHeight > detail.clientHeight + 1) return detail;
  const panel = document.querySelector<HTMLElement>("#tab-panel");
  if (panel && panel.scrollHeight > panel.clientHeight + 1) return panel;
  // Inside a tall panel the scrolling box can be a child: only worth a scan when
  // the direct candidates have nothing to scroll.
  const nested = modal?.querySelector<HTMLElement>("*");
  if (modal && nested) {
    for (const node of modal.querySelectorAll<HTMLElement>("*")) {
      if (!/auto|scroll/.test(getComputedStyle(node).overflowY)) continue;
      if (node.scrollHeight > node.clientHeight + 1) return node;
    }
  }
  const page = document.scrollingElement as HTMLElement | null;
  return page && page.scrollHeight > page.clientHeight + 1 ? page : null;
}

/**
 * Wires the controller package to this terminal.
 *
 * Two kinds of navigation share the stick. Normally it *is* the arrow keys, which
 * is what the terminal's own selection understands. Pressing Y (△) — or opening
 * any panel — hands it to a visible selection frame instead, so every control in
 * the interface can be reached, activated and left again with no keyboard or
 * mouse: the frame moves with a spatial search, `A` clicks what it surrounds, and
 * `B` puts the stick back on the terminal's own selection.
 */
export function createGamepadBridge(options: GamepadBridgeOptions): GamepadBridge {
  const ring = createFocusRing();
  let lastFamily: string | null = null;
  let focusMode = false;
  let panelOpen = Boolean(document.querySelector(PANEL));
  // A pad appearing mid-session must not repeat the same toast every frame.
  let lastToast = "";
  const notifyOnce = (message: string) => {
    if (message === lastToast) return;
    lastToast = message;
    options.notify(message);
  };

  const controls = () => focusCandidates(document.querySelector<HTMLElement>(PANEL) ?? document.querySelector("#stage") ?? document.body);

  const showFocus = (index: number) => {
    const list = controls();
    if (!list.length) return;
    const target = list[Math.max(0, Math.min(list.length - 1, index))];
    target.focus({ preventScroll: false });
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    ring.show(target);
  };

  const enterFocus = (announce: boolean) => {
    const list = controls();
    if (!list.length) return;
    focusMode = true;
    const active = document.activeElement instanceof HTMLElement ? list.indexOf(document.activeElement) : -1;
    showFocus(active >= 0 ? active : 0);
    options.onFocusModeChanged?.(true);
    if (announce) options.notify("选中框模式：左摇杆 / 十字键 移动，A 确认，B 退出");
  };

  const exitFocus = (announce = false) => {
    if (!focusMode) return;
    focusMode = false;
    ring.hide();
    options.onFocusModeChanged?.(false);
    if (announce) options.notify("方向键回到档案选择");
  };

  const moveFocus = (direction: NavDirection) => {
    const list = controls();
    if (!list.length) return;
    const rects = list.map(rectOf);
    const focused = document.activeElement instanceof HTMLElement ? list.indexOf(document.activeElement) : -1;
    const current = focused >= 0 ? focused : 0;
    const next = nextFocusIndex(rects, current, direction);
    showFocus(next ?? current);
  };

  const activateFocused = () => {
    const focused = document.activeElement;
    // Deliberately lenient: the ring may have moved between frames as a panel
    // scrolled, and a click on whatever the ring surrounds is always the intent.
    if (!(focused instanceof HTMLElement) || focused === document.body || !focused.isConnected) return false;
    if (focused.closest("#gamepad-focus")) return false;
    focused.click();
    // The clicked control may have opened, closed or replaced a panel.
    requestAnimationFrame(() => {
      if (!document.querySelector(PANEL)) exitFocus();
      else showFocusIndex();
    });
    return true;
  };

  /**
   * The frame is a controller affordance, so it only exists while the pad is the
   * device in hand: the cursor gives way on a pad press, and the first mouse move
   * or key press takes both the cursor *and* the frame back.
   */
  const setInputMode = (mode: "gamepad" | "pointer") => {
    if (mode === "gamepad") document.documentElement.dataset.input = "gamepad";
    else delete document.documentElement.dataset.input;
  };
  const padInHand = () => document.documentElement.dataset.input === "gamepad";
  const onPointerMove = () => {
    setInputMode("pointer");
    exitFocus();
  };
  const onPointerDown = () => {
    setInputMode("pointer");
    exitFocus();
  };
  // Key events arriving from the browser itself mean a keyboard is in use; the
  // synthetic ones the pad dispatches are not trusted and are ignored.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.isTrusted) return;
    setInputMode("pointer");
    exitFocus();
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("keydown", onKeyDown, true);

  /** Re-anchor the frame after the DOM changes under it (a panel opening or a tab). */
  const showFocusIndex = () => {
    const list = controls();
    if (!list.length) return;
    const active = document.activeElement instanceof HTMLElement ? list.indexOf(document.activeElement) : -1;
    showFocus(active >= 0 ? active : 0);
  };

  const statusLine = (status: GamepadStatus) => {
    const label = status.family ? familyLabels[status.family] : "手柄";
    return `${label}已连接 · 左摇杆/十字键移动 · ${status.family ? confirmLabels[status.family] : "A"}确认 · ${status.family ? backLabels[status.family] : "B"}返回 · Y切换选中框 · 菜单键设置 · 右摇杆滚动`;
  };

  const handle = attachGamepad({
    enabled: () => options.isEnabled(),
    rumbleEnabled: () => options.isRumbleEnabled(),
    scrollTarget: () => options.scrollTarget(),
    // While the frame is up the arrows belong to it; otherwise they are the
    // terminal's own selection keys, exactly as before.
    onNavigate: (direction) => {
      if (!focusMode) return false;
      moveFocus(direction);
      return true;
    },
    onConfirm: () => (focusMode ? activateFocused() : false),
    onBack: () => {
      // Inside a panel B closes the panel; the frame leaves with it. Outside one it
      // is the frame itself that B dismisses, handing the stick back to the shelf.
      if (!focusMode || panelOpen) return false;
      exitFocus(true);
      return true;
    },
    onTransport: (control) => options.onTransport(control),
    onStatus: (status, reason) => {
      options.onStatusChanged?.(status);
      if (!options.isEnabled()) return;
      if (!status.connected) {
        if (lastFamily) notifyOnce("手柄已断开，键盘与触控仍然可用");
        lastFamily = null;
        exitFocus();
        return;
      }
      if (reason === "connected" || status.family !== lastFamily) notifyOnce(statusLine(status));
      lastFamily = status.family;
    },
    onAction: (action: GamepadAction) => {
      // Any accepted press means the pad is in hand: the mouse pointer steps aside
      // until it is moved again.
      setInputMode("gamepad");
      if (action.type === "focus") {
        // Y toggles the frame; inside a panel it just re-anchors it.
        if (focusMode && !panelOpen) exitFocus(true);
        else enterFocus(!panelOpen);
        return;
      }
      if (options.isStarted()) return;
      // Entry gate: the arrow keys are ignored until the terminal is entered, so
      // the face buttons press the gate's own buttons instead.
      if (action.type === "confirm") document.querySelector<HTMLButtonElement>(".entry-start")?.click();
      if (action.type === "back") document.querySelector<HTMLButtonElement>(".entry-silent")?.click();
    },
  });

  // A panel is how the terminal asks a question. When the pad is in hand the frame
  // appears with the panel and leaves when it does; opened by mouse or keyboard it
  // stays away, because then focus rings and the cursor already do that job.
  const syncPanel = () => {
    const open = Boolean(document.querySelector(PANEL));
    if (open === panelOpen) return;
    panelOpen = open;
    if (open) {
      // Wait a frame: the panel renders its controls, then the first one is framed.
      requestAnimationFrame(() => {
        if (!padInHand()) return;
        const first = document.querySelector<HTMLElement>(`${PANEL} [autofocus], ${PANEL} input, ${PANEL} button`);
        if (first && !document.activeElement?.closest(PANEL)) first.focus({ preventScroll: true });
        enterFocus(false);
      });
    } else exitFocus();
  };
  const observer = new MutationObserver(syncPanel);
  const modalRoot = document.querySelector("#modal-root");
  if (modalRoot) observer.observe(modalRoot, { childList: true, subtree: false });
  syncPanel();

  // Keep the frame glued to its control while panels scroll or the layout moves.
  let frame = 0;
  const follow = () => {
    frame = requestAnimationFrame(follow);
    if (focusMode) ring.follow();
  };
  frame = requestAnimationFrame(follow);

  return {
    ...handle,
    focusing: () => focusMode,
    stop: () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      setInputMode("pointer");
      ring.hide();
      handle.stop();
    },
    setEnabled: (enabled: boolean) => {
      lastToast = "";
      lastFamily = null;
      if (!enabled) exitFocus();
      options.notify(enabled ? "手柄支持已开启" : "手柄支持已关闭，键盘与触控仍然可用");
      handle.refresh();
    },
  };
}
