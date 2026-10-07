import "./pointer-cursor.css";

const cursor = document.createElement("div");
cursor.className = "pointer-cursor";
cursor.setAttribute("aria-hidden", "true");
cursor.innerHTML = '<span class="pointer-cursor-ring"></span><span class="pointer-cursor-dot"></span>';
document.body.append(cursor);
const ring = cursor.querySelector<HTMLElement>(".pointer-cursor-ring")!;
let x = 0, y = 0, frame = 0;
let ringX = 0, ringY = 0, lastTime = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let target: Element | null = null;
let pressed = false;
let bounce: Animation | undefined;

function hide() {
  bounce?.cancel();
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = 0;
  document.documentElement.classList.remove("custom-pointer");
  cursor.classList.remove("visible", "pressed");
  pressed = false;
}

function update(time: number) {
  frame = 0;
  const dt = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 1 / 60;
  lastTime = time;
  const reduced = reducedMotion.matches || Boolean(document.querySelector("#stage.reduce-motion"));
  const blend = reduced ? 1 : 1 - Math.exp(-dt / .075);
  ringX += (x - ringX) * blend;
  ringY += (y - ringY) * blend;
  const settled = Math.hypot(x - ringX, y - ringY) < .08;
  if (settled) { ringX = x; ringY = y; }
  cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  ring.style.transform = `translate3d(${ringX - x}px, ${ringY - y}px, 0) translate(-50%, -50%)`;
  feedback();
  if (!settled && cursor.classList.contains("visible")) frame = requestAnimationFrame(update);
  else lastTime = 0;
}

function feedback() {
  const native = Boolean(target?.closest('input, textarea, [contenteditable="true"], select'));
  const disabled = Boolean(target?.closest(':disabled, [aria-disabled="true"], [inert]'));
  const action = !disabled && Boolean(target?.closest('button, a[href], [role="button"], [role="tab"], summary'));
  const canvas = target?.closest("canvas") as HTMLCanvasElement | null;
  const drag = Boolean(canvas && (canvas.closest(".viewer-canvas") || /grab/.test(canvas.style.cursor)));
  const pick = Boolean(canvas?.style.cursor === "pointer");
  document.documentElement.classList.toggle("custom-pointer", !native);
  cursor.classList.toggle("visible", !native);
  cursor.classList.toggle("interactive", action || pick);
  cursor.classList.toggle("draggable", drag && !pick);
  cursor.classList.toggle("pressed", pressed);
}

document.addEventListener("pointermove", event => {
  if (event.pointerType !== "mouse") { hide(); return; }
  x = event.clientX; y = event.clientY;
  if (!cursor.classList.contains("visible")) { ringX = x; ringY = y; }
  target = event.target instanceof Element ? event.target : null;
  if (!frame) frame = requestAnimationFrame(update);
}, { passive: true });
document.addEventListener("pointerdown", event => {
  if (event.pointerType !== "mouse") { hide(); return; }
  pressed = true;
  bounce?.cancel();
  feedback();
}, { passive: true, capture: true });
document.addEventListener("pointerup", () => {
  const wasPressed = pressed;
  pressed = false;
  feedback();
  if (wasPressed && cursor.classList.contains("visible") && !reducedMotion.matches && !document.querySelector("#stage.reduce-motion")) {
    const size = cursor.classList.contains("interactive") ? 44 : cursor.classList.contains("draggable") ? 36 : 28;
    bounce = ring.animate([
      { width: `${size * .8}px`, height: `${size * .8}px` },
      { width: `${size * 1.06}px`, height: `${size * 1.06}px`, offset: .65 },
      { width: `${size}px`, height: `${size}px` },
    ], { duration: 260, easing: "ease-out" });
  }
}, { passive: true });
document.addEventListener("pointercancel", hide, { passive: true });
document.documentElement.addEventListener("pointerleave", hide, { passive: true });
window.addEventListener("blur", hide);
document.addEventListener("visibilitychange", () => { if (document.hidden) hide(); });
