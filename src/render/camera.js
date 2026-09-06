import { clamp, lerp } from '../core/math.js';

/** Top-view camera: follows a target, clamps to map bounds, converts spaces. */
export class Camera {
  constructor({ width, height, zoom = 1, smoothing = 0.15, bounds = null } = {}) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.zoom = zoom;
    this.smoothing = smoothing;
    this.bounds = bounds; // { width, height } in world pixels
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** @param {boolean} snap skip smoothing (respawn, first frame, teleport). */
  follow(target, snap = false) {
    if (!target) return;
    const t = snap ? 1 : this.smoothing;
    this.x = lerp(this.x, target.x, t);
    this.y = lerp(this.y, target.y, t);
    this._clamp();
  }

  _clamp() {
    if (!this.bounds) return;
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    this.x = this.bounds.width <= halfW * 2 ? this.bounds.width / 2 : clamp(this.x, halfW, this.bounds.width - halfW);
    this.y = this.bounds.height <= halfH * 2 ? this.bounds.height / 2 : clamp(this.y, halfH, this.bounds.height - halfH);
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.width / 2,
      y: (y - this.y) * this.zoom + this.height / 2,
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.width / 2) / this.zoom + this.x,
      y: (y - this.height / 2) / this.zoom + this.y,
    };
  }

  /** World-space rectangle currently visible, with a margin for culling. */
  viewBounds(margin = 64) {
    const halfW = this.width / (2 * this.zoom) + margin;
    const halfH = this.height / (2 * this.zoom) + margin;
    return { left: this.x - halfW, right: this.x + halfW, top: this.y - halfH, bottom: this.y + halfH };
  }

  /** Apply the camera transform to a 2D context (caller wraps in save/restore). */
  apply(ctx) {
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
