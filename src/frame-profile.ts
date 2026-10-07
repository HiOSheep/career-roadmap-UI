type Sample = { phase: string; time: number; interval: number; cpu: number; gpu: number | null };
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** Opt-in, actual presentation-frame measurements; absent from normal sessions. */
export class FrameProfile {
  private start = 0;
  private previous = 0;
  private cpuStart = 0;
  private phase = "opening";
  private samples: Sample[] = [];
  private pending: { query: WebGLQuery; sample: Sample }[] = [];
  private active: WebGLQuery | null = null;
  private sample: Sample | null = null;
  private gl?: WebGL2RenderingContext;
  private ext: TimerExtension | null = null;
  private action = -1;
  private output = document.createElement("pre");
  done = false;
  constructor(private navigate: (phase: string, index: number) => void) {
    this.output.id = "frame-profile";
    this.output.hidden = true;
    document.body.append(this.output);
  }
  begin(ms: number, gl: WebGL2RenderingContext) {
    if (this.done) return;
    this.cpuStart = performance.now();
    if (!this.start) {
      this.start = ms;
      this.gl = gl;
      this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    }
    const seconds = (ms - this.start) / 1000;
    this.phase = seconds < 28 ? "opening" : seconds < 32 ? "archive" : seconds < 40 ? "navigation" : seconds < 52 ? "detail" : "return";
    const action = seconds < 28 ? -1 : seconds < 32 ? 0 : seconds < 40 ? 1 + Math.floor((seconds - 32) * 2) : seconds < 52 ? 17 : 18;
    if (action !== this.action) { this.action = action; this.navigate(this.phase, action); }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!gl.getParameter(this.ext!.GPU_DISJOINT_EXT)) item.sample.gpu = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(item.query);
      this.pending.splice(i, 1);
    }
    if (seconds >= 60) { this.finish(); return; }
    this.sample = { phase: this.phase, time: seconds, interval: this.previous ? ms - this.previous : 0, cpu: 0, gpu: null };
    this.previous = ms;
    if (this.sample.interval > 0) this.samples.push(this.sample);
    if (this.ext && this.samples.length % 20 === 0 && this.pending.length < 8) {
      this.active = gl.createQuery();
      gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
    }
  }
  end() {
    if (this.done || !this.sample) return;
    this.sample.cpu = performance.now() - this.cpuStart;
    if (this.active) {
      this.gl!.endQuery(this.ext!.TIME_ELAPSED_EXT);
      this.pending.push({ query: this.active, sample: this.sample });
      this.active = null;
    }
  }
  private finish() {
    const summarize = (samples: Sample[]) => {
      const intervals = samples.map(s => s.interval).sort((a, b) => b - a);
      const tail = intervals.slice(0, Math.max(1, Math.ceil(intervals.length * .01)));
      const gpu = samples.flatMap(s => s.gpu === null ? [] : [s.gpu]);
      const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      return { frames: samples.length, fps: 1000 / mean(intervals), low1: 1000 / mean(tail), cpuMs: mean(samples.map(s => s.cpu)), gpuMs: gpu.length ? mean(gpu) : null, worstMs: intervals[0], over16ms: intervals.filter(v => v > 16.67).length };
    };
    const debug = this.gl!.getExtension("WEBGL_debug_renderer_info");
    this.output.textContent = JSON.stringify({ durationSeconds: 60, visibility: document.visibilityState, renderer: debug ? this.gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) : this.gl!.getParameter(this.gl!.RENDERER), viewport: [innerWidth, innerHeight, devicePixelRatio], buffer: [this.gl!.drawingBufferWidth, this.gl!.drawingBufferHeight], antialiasSamples: this.gl!.getParameter(this.gl!.SAMPLES), overall: summarize(this.samples), phases: Object.fromEntries(["opening", "archive", "navigation", "detail", "return"].map(phase => [phase, summarize(this.samples.filter(s => s.phase === phase))])), slowest: [...this.samples].sort((a,b)=>b.interval-a.interval).slice(0,20) }, null, 2);
    this.done = true;
    for (const item of this.pending) this.gl!.deleteQuery(item.query);
    this.pending = [];
  }
}
