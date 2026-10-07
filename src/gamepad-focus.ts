import type { Rect } from "../packages/gamepad-input/src/index";
import "./gamepad-focus.css";

/** What the ring can land on: real controls, never the ring itself. */
export const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "summary",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type FocusRing = {
  /** Draws the frame around a control and follows it while the page moves. */
  show(target: HTMLElement): void;
  hide(): void;
  visible(): boolean;
  /** Called once per animation frame: keeps the frame glued to a scrolling panel. */
  follow(): void;
};

/**
 * The visible selection frame for controller navigation. It is decoration only —
 * `aria-hidden` and click-through — while the *real* DOM focus moves underneath,
 * so activation, screen readers and the terminal's own focus styles keep working.
 */
export function createFocusRing(): FocusRing {
  const ring = document.createElement("div");
  ring.id = "gamepad-focus";
  ring.className = "gamepad-focus";
  ring.setAttribute("aria-hidden", "true");
  ring.dataset.visible = "false";
  ring.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.append(ring);
  let target: HTMLElement | null = null;

  const place = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    // A control that is off-screen (collapsed panel, hidden tab) must not leave
    // the frame floating at 0,0.
    if (rect.width < 1 && rect.height < 1) {
      ring.dataset.visible = "false";
      return;
    }
    const pad = 5;
    ring.style.translate = `${Math.round(rect.left - pad)}px ${Math.round(rect.top - pad)}px`;
    ring.style.width = `${Math.round(rect.width + pad * 2)}px`;
    ring.style.height = `${Math.round(rect.height + pad * 2)}px`;
    ring.dataset.visible = "true";
  };

  return {
    show(element) {
      target = element;
      place(element);
    },
    hide() {
      target = null;
      ring.dataset.visible = "false";
    },
    visible: () => ring.dataset.visible === "true",
    follow() {
      if (target && target.isConnected) place(target);
      else if (target) this.hide();
    },
  };
}

/**
 * Controls the ring may visit: visible, enabled, not inside an inert subtree and
 * not inside the ring itself. When a panel is open only its controls take part,
 * which is what makes a controller able to finish a dialog on its own.
 */
export function focusCandidates(root: ParentNode): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((node) => {
    if (node.closest("#gamepad-focus, [inert], [hidden], .gamepad-ignore")) return false;
    if (node.tabIndex < 0) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    // `visibility: hidden` still reports a box; computed style is the reliable test.
    return getComputedStyle(node).visibility !== "hidden";
  });
}

export function rectOf(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}
