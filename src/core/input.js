import { normalize } from './math.js';

const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  action: ['Space'],
  secondary: ['ShiftLeft', 'ShiftRight'],
};

/**
 * Samples keyboard + pointer into a compact, serializable input command.
 *
 * A command is the *only* thing a client sends to the host, and it is also
 * what the client replays locally during prediction — so it must be small and
 * free of any local-only state.
 */
export class InputSampler {
  constructor(canvas, { bindings = DEFAULT_BINDINGS } = {}) {
    this.canvas = canvas;
    this.bindings = bindings;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, down: false };
    this._seq = 0;
    this._disposers = [];
    this._bind();
  }

  _bind() {
    const onKeyDown = (e) => {
      this.keys.add(e.code);
      if (Object.values(this.bindings).some((codes) => codes.includes(e.code))) e.preventDefault();
    };
    const onKeyUp = (e) => this.keys.delete(e.code);
    const onBlur = () => this.keys.clear();
    const onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
    };
    const onDown = (e) => {
      onMove(e);
      this.pointer.down = true;
    };
    const onUp = () => {
      this.pointer.down = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    this._disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => this.canvas.removeEventListener('pointermove', onMove),
      () => this.canvas.removeEventListener('pointerdown', onDown),
      () => window.removeEventListener('pointerup', onUp),
    );
  }

  pressed(action) {
    return (this.bindings[action] ?? []).some((code) => this.keys.has(code));
  }

  /**
   * @param {import('../render/camera.js').Camera} camera used to turn the
   *   screen-space pointer into a world-space aim angle.
   * @param {{x:number,y:number}} origin world position the aim is measured from.
   */
  sample(camera, origin) {
    const x = (this.pressed('right') ? 1 : 0) - (this.pressed('left') ? 1 : 0);
    const y = (this.pressed('down') ? 1 : 0) - (this.pressed('up') ? 1 : 0);
    const move = normalize(x, y);

    const world = camera ? camera.screenToWorld(this.pointer.x, this.pointer.y) : this.pointer;
    const aim = Math.atan2(world.y - origin.y, world.x - origin.x);

    this._seq += 1;
    return {
      seq: this._seq,
      // Rounded so identical intent produces byte-identical commands.
      mx: Math.round(move.x * 1000) / 1000,
      my: Math.round(move.y * 1000) / 1000,
      aim: Math.round(aim * 1000) / 1000,
      action: this.pointer.down || this.pressed('action'),
      secondary: this.pressed('secondary'),
    };
  }

  dispose() {
    for (const off of this._disposers) off();
    this._disposers = [];
  }
}
