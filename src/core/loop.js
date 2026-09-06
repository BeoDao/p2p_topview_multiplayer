/**
 * Fixed-timestep loop with a render callback.
 *
 * `onTick(dt, tick)` runs at exactly `tickRate` Hz so simulation is
 * frame-rate independent (and reproducible when replaying inputs).
 * `onRender(alpha, frameDt)` runs once per animation frame; `alpha` is the
 * fraction of a tick elapsed, for smoothing the presentation.
 */
export class GameLoop {
  constructor({ tickRate = 30, maxCatchUpTicks = 5, onTick, onRender }) {
    this.tickRate = tickRate;
    this.step = 1 / tickRate;
    this.maxCatchUpTicks = maxCatchUpTicks;
    this.onTick = onTick ?? (() => {});
    this.onRender = onRender ?? (() => {});
    this.tick = 0;
    this.running = false;
    this._accumulator = 0;
    this._last = 0;
    this._raf = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._accumulator = 0;
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _frame(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._frame);

    const frameDt = Math.min((now - this._last) / 1000, 0.25);
    this._last = now;
    this._accumulator += frameDt;

    let ticks = 0;
    while (this._accumulator >= this.step && ticks < this.maxCatchUpTicks) {
      this._accumulator -= this.step;
      this.tick += 1;
      ticks += 1;
      this.onTick(this.step, this.tick);
    }
    // If we fell far behind (tab was backgrounded), drop the backlog rather
    // than spiral: better a jump than a spiral of death.
    if (this._accumulator > this.step * this.maxCatchUpTicks) this._accumulator = 0;

    this.onRender(this._accumulator / this.step, frameDt);
  }
}
