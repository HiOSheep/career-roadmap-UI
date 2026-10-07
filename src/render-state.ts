/** Exact state comparison. This never changes or snaps the animation state. */
export class RenderState {
  private values: (number | string | undefined)[] = [];
  private cursor = 0;
  private changed = true;
  begin() { this.cursor = 0; }
  add(...values: (number | string | undefined)[]) {
    for (const value of values) {
      if (this.values[this.cursor] !== value) this.changed = true;
      this.values[this.cursor++] = value;
    }
  }
  floats(...values: (number | undefined)[]) {
    // Match GPU float uniforms. IDs and monotonically increasing versions use
    // add() so a long-running session never loses counter precision.
    for (const value of values) {
      const next = value === undefined ? undefined : Math.fround(value);
      if (this.values[this.cursor] !== next) this.changed = true;
      this.values[this.cursor++] = next;
    }
  }
  end() {
    const changed = this.changed || this.values.length !== this.cursor;
    this.values.length = this.cursor;
    this.changed = false;
    return changed;
  }
  invalidate() { this.changed = true; }
}
