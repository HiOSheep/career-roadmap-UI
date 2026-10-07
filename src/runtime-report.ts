const STALL_MS = 3000;
const STALL_POLL_MS = 1000;
const MAX_FAILURES = 5;

/**
 * A silent freeze is the worst failure mode a review build can have: the last
 * frame stays on screen and nothing says why. This surfaces anything the render
 * loop throws, anything the page reports as unhandled, and any stall of the
 * animation loop, in the interface itself and in the document dataset.
 */
export class RuntimeReport {
  private banner: HTMLElement;
  private output: HTMLElement;
  private lastTick = 0;
  private reported = "";
  failures = 0;

  constructor(private mount: HTMLElement = document.body) {
    this.banner = document.createElement("div");
    this.banner.id = "runtime-report";
    this.banner.hidden = true;
    this.banner.setAttribute("role", "alert");
    const heading = document.createElement("strong");
    heading.textContent = "运行期问题 / RUNTIME";
    this.output = document.createElement("p");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制信息";
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(this.output.textContent ?? "").catch(() => {});
    });
    this.banner.append(heading, this.output, copy);
    this.mount.append(this.banner);
    window.addEventListener("error", (event) => this.fail(event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => this.fail(event.reason));
    setInterval(() => this.watchStall(), STALL_POLL_MS);
  }

  /** Called once per animation frame, before any work. */
  tick() {
    this.lastTick = performance.now();
  }

  /** Records a failure and shows it. Returns whether the loop may continue. */
  fail(error: unknown) {
    this.failures++;
    const detail = error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ""}`.trim()
      : String(error);
    this.show(`渲染循环第 ${this.failures} 次出错\n${detail}`);
    return this.failures < MAX_FAILURES;
  }

  private watchStall() {
    if (!this.lastTick || document.visibilityState !== "visible") return;
    const idle = performance.now() - this.lastTick;
    // Only report the edge of a stall: while it lasts, the message stands.
    if (idle > STALL_MS && idle < STALL_MS + STALL_POLL_MS * 2)
      this.show(`渲染循环停止响应：约 ${Math.round(idle / 1000)} 秒没有新帧`);
  }

  private show(message: string) {
    this.reported = message;
    this.output.textContent = message;
    this.banner.hidden = false;
    document.documentElement.dataset.runtimeError = message.split("\n")[0];
  }

  snapshot() {
    return { failures: this.failures, lastError: this.reported };
  }
}
