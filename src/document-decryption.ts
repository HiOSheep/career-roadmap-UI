import type { DecryptionFrame } from "./decryption";

type Cover = { window: HTMLElement; ink: HTMLElement; order: number };

/** The first presentation is timed with the archive's own decryption: the text
 *  stays covered until the case starts clearing, then uncovers in a cascade. */
const FULL_REVEAL = .95;
const FULL_STAGGER = .22;
/** Later presentations keep the redaction and the uncovering, but skip the wait
 *  for the physical decryption and the long cascade. */
const QUICK_REVEAL = .5;
const QUICK_STAGGER = .06;
const QUICK_HOLD = .15;
/** The panel is treated as on screen once it is this visible. */
const VISIBLE_AT = .05;

/** Decorative redaction, driven by the physical archive's reveal cue. */
export class DocumentDecryption {
  private root: HTMLElement | null = null;
  private covers: Cover[] = [];
  private started: number | null = null;
  private enteredAt: number | null = null;
  private visibleSince: number | null = null;
  private progress = 0;
  /** The full pass is a first-impression effect, spent once per program run. */
  private shown = false;
  private full = false;

  /**
   * Prepares an entry into the detail view. The first presentation after the
   * program starts plays the whole reveal; later ones still show the redacted
   * text and then uncover it, with the middle skipped. Returns which pass ran,
   * for logging and tests.
   */
  enter(root: HTMLElement, motion: boolean, hasScene: boolean): "full" | "quick" | "expanded" {
    // Neither reduced motion nor a missing scene can drive the covers, so the
    // text is shown at once and the full pass stays unspent for later.
    if (!motion || !hasScene) {
      this.full = false;
      this.reset(root, true);
      return "expanded";
    }
    this.full = !this.shown;
    if (this.full) this.shown = true;
    this.reset(root, false);
    return this.full ? "full" : "quick";
  }

  reset(root: HTMLElement, clear: boolean) {
    this.remove();
    this.root = root;
    this.started = null;
    this.enteredAt = null;
    this.visibleSince = null;
    this.progress = clear ? 1 : 0;
    this.refresh();
  }

  refresh() {
    this.remove();
    if (!this.root || this.progress === 1) return;
    // Measure text fragments, including wrapped lines, without splitting or
    // replacing the actual text. Stage scaling cancels out in local coordinates.
    const targets = this.root.querySelectorAll<HTMLElement>(
      "h2, .detail-title-cn, .roadmap-primary, .metadata dd, .tab-panel p, .research-notes li, .log-row",
    );
    targets.forEach((target) => {
      target.classList.add("document-redacted");
      const bounds = target.getBoundingClientRect();
      const scale = bounds.width / target.offsetWidth;
      if (!scale || !Number.isFinite(scale)) return;
      const lines: { x: number; y: number; right: number; bottom: number }[] = [];
      if (target.matches('.roadmap-primary')) {
        lines.push({ x: 0, y: 0, right: target.clientWidth, bottom: target.clientHeight });
      }
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while (!target.matches('.roadmap-primary') && (node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const x = (rect.left - bounds.left) / scale;
          const y = (rect.top - bounds.top) / scale;
          const right = (rect.right - bounds.left) / scale;
          const bottom = (rect.bottom - bounds.top) / scale;
          const line = lines.find((entry) => Math.abs(entry.y - y) < 6);
          if (line) {
            line.x = Math.min(line.x, x);
            line.y = Math.min(line.y, y);
            line.right = Math.max(line.right, right);
            line.bottom = Math.max(line.bottom, bottom);
          } else lines.push({ x, y, right, bottom });
        }
      }
      for (const line of lines) {
        const window = document.createElement("span");
        window.className = "document-redaction-window";
        window.setAttribute("aria-hidden", "true");
        const left = Math.max(0, line.x - 1);
        const right = Math.min(target.clientWidth, line.right + 1);
        window.style.cssText = `left:${left}px;top:${line.y - 1}px;width:${right - left}px;height:${line.bottom - line.y + 2}px`;
        const ink = document.createElement("span");
        ink.className = "document-redaction-ink";
        window.append(ink);
        target.append(window);
        this.covers.push({ window, ink, order: this.covers.length });
      }
    });
    this.paint();
  }

  get revealStarted() { return this.started !== null || this.progress === 1; }

  update(now: number, frame: DecryptionFrame, reduced: boolean, visibility = 1) {
    if (!this.root || this.progress === 1) return;
    if (reduced) this.progress = 1;
    else {
      if (this.enteredAt === null) this.enteredAt = now;
      // The panel fades in with the case lid, so the covers must not run their
      // clock while it is still invisible: the whole reveal would play behind an
      // empty panel and the text would simply appear. The hold is measured from
      // the moment the document is actually on screen.
      if (visibility > VISIBLE_AT && this.visibleSince === null) this.visibleSince = now;
      const holdFrom = this.visibleSince ?? this.enteredAt;
      const ready = this.visibleSince !== null &&
        (this.full ? frame.clarity > 0 : now - holdFrom >= QUICK_HOLD);
      if (this.started === null && ready) this.started = now;
      if (this.started !== null)
        this.progress = Math.min(
          1,
          Math.max(0, (now - this.started) / (this.full ? FULL_REVEAL : QUICK_REVEAL)),
        );
    }
    if (this.progress === 1) this.remove();
    else if (this.started !== null) this.paint();
  }

  private paint() {
    const stagger = this.full ? FULL_STAGGER : QUICK_STAGGER;
    const count = Math.max(1, this.covers.length - 1);
    for (const cover of this.covers) {
      const delay = (cover.order / count) * stagger;
      const t = Math.min(1, Math.max(0, (this.progress - delay) / (1 - stagger)));
      // Brief acceleration, decisive departure, long deceleration; no bounce.
      const eased = t < 0.2
        ? 0.4 * (t / 0.2) ** 2
        : 1 - 0.6 * ((1 - t) / 0.8) ** (16 / 3);
      cover.ink.style.transform = `translateX(${eased * 101}%)`;
    }
  }

  private remove() {
    for (const cover of this.covers) cover.window.remove();
    this.covers = [];
  }
}
