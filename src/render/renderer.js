import { Camera } from './camera.js';
import { TILE } from '../game/world.js';

const DEFAULT_THEME = {
  background: '#0e1116',
  floor: '#171d26',
  floorAlt: '#141a23',
  wall: '#3b485c',
  wallEdge: '#52627a',
  grid: 'rgba(255,255,255,0.03)',
  text: '#e6edf3',
};

/**
 * Canvas 2D renderer for top-view scenes.
 *
 * Handles the device-pixel-ratio dance, the camera transform, tile culling and
 * a small sprite vocabulary; game-specific drawing goes in the game module's
 * `draw` hook, which receives this renderer.
 */
export class Renderer {
  constructor(canvas, { theme = {}, zoom = 1 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = { ...DEFAULT_THEME, ...theme };
    this.camera = new Camera({ width: canvas.clientWidth, height: canvas.clientHeight, zoom });
    this.dpr = 1;
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.resize(w, h);
  }

  beginFrame() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, this.camera.width, this.camera.height);
    ctx.save();
    this.camera.apply(ctx);
  }

  endFrame() {
    this.ctx.restore();
  }

  drawMap(map) {
    const { ctx, theme } = this;
    const ts = map.tileSize;
    const view = this.camera.viewBounds(ts);
    const x0 = Math.max(0, Math.floor(view.left / ts));
    const x1 = Math.min(map.width - 1, Math.floor(view.right / ts));
    const y0 = Math.max(0, Math.floor(view.top / ts));
    const y1 = Math.min(map.height - 1, Math.floor(view.bottom / ts));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const solid = map.at(tx, ty) === TILE.WALL;
        ctx.fillStyle = solid ? theme.wall : (tx + ty) % 2 === 0 ? theme.floor : theme.floorAlt;
        ctx.fillRect(tx * ts, ty * ts, ts, ts);
        if (solid) {
          ctx.strokeStyle = theme.wallEdge;
          ctx.lineWidth = 1;
          ctx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
        }
      }
    }
  }

  /** A circular actor with a facing indicator — the default top-view avatar. */
  drawActor(entity, { color = '#4ea1ff', radius = entity.r ?? 12, label = null, alpha = 1 } = {}) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(entity.x, entity.y);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.35, radius * 0.95, radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    if (typeof entity.angle === 'number') {
      ctx.rotate(entity.angle);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(radius * 0.4, -radius * 0.22, radius * 0.9, radius * 0.44);
      ctx.rotate(-entity.angle);
    }

    if (label) {
      ctx.fillStyle = this.theme.text;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, -radius - 22);
    }
    ctx.restore();
  }

  /** Horizontal bar above an entity — health, reload, capture progress. */
  drawBar(entity, ratio, { width = 28, height = 4, offsetY = -22, color = '#59d98a', back = 'rgba(0,0,0,0.5)' } = {}) {
    const { ctx } = this;
    const x = entity.x - width / 2;
    const y = entity.y + offsetY;
    ctx.fillStyle = back;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
  }

  drawCircle(x, y, radius, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Screen-space text; call after endFrame(). */
  drawHud(lines, { x = 12, y = 20, lineHeight = 16, color = null, font = '12px ui-monospace, monospace' } = {}) {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = color ?? this.theme.text;
    ctx.font = font;
    ctx.textAlign = 'left';
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
    ctx.restore();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}
