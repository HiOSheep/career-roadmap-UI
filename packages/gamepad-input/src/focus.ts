/**
 * Spatial focus navigation. Given the box of the focused control and the boxes of
 * its candidates, pick the one a stick press should land on. The geometry is the
 * whole algorithm, so it is a pure function and unit tested in Node.
 */
export type Rect = { left: number; top: number; right: number; bottom: number };
export type FocusDirection = "up" | "down" | "left" | "right";

const centre = (rect: Rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });

/** How much of two boxes share the axis perpendicular to the travel. */
function overlap(a: Rect, b: Rect, axis: "x" | "y") {
  const [from, to] = axis === "x" ? [Math.max(a.left, b.left), Math.min(a.right, b.right)]
    : [Math.max(a.top, b.top), Math.min(a.bottom, b.bottom)];
  return Math.max(0, to - from);
}

/**
 * The nearest candidate in `direction`, preferring controls that actually line up
 * with the current one: a control straight above wins over one that is closer but
 * off to the side. Candidates that do not lie in that direction are ignored, so
 * holding a direction never bounces between neighbours.
 */
export function nextFocusIndex(rects: readonly Rect[], current: number, direction: FocusDirection): number | null {
  if (rects.length < 2) return null;
  const from = rects[current] ?? rects[0];
  const origin = centre(from);
  let best: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < rects.length; index++) {
    if (index === current) continue;
    const rect = rects[index];
    const point = centre(rect);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const primary = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    if (primary <= 1) continue;
    const aligned = direction === "left" || direction === "right" ? overlap(from, rect, "y") : overlap(from, rect, "x");
    // Overlapping the travel band is worth a lot; the perpendicular offset then
    // breaks ties between controls at the same distance.
    const perpendicular = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + perpendicular * (aligned > 0 ? 0.6 : 2.4) - (aligned > 0 ? Math.min(28, aligned) * .5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** Wraps a step (for panel traversal with `Tab`-like behaviour). */
export function stepFocusIndex(count: number, current: number, step: number) {
  if (count <= 0) return null;
  return ((current + step) % count + count) % count;
}
