import { makeRandom } from '../core/math.js';

export const TILE = { FLOOR: 0, WALL: 1 };

/** A top-view grid map with circle-vs-tile collision resolution. */
export class TileMap {
  constructor({ width, height, tileSize = 32, tiles = null }) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.tiles = tiles ? Uint8Array.from(tiles) : new Uint8Array(width * height);
  }

  get pixelWidth() {
    return this.width * this.tileSize;
  }

  get pixelHeight() {
    return this.height * this.tileSize;
  }

  at(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return TILE.WALL;
    return this.tiles[ty * this.width + tx];
  }

  set(tx, ty, value) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    this.tiles[ty * this.width + tx] = value;
  }

  solidAt(x, y) {
    return this.at(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize)) === TILE.WALL;
  }

  /** True when a circle of radius r at (x, y) overlaps any solid tile. */
  circleBlocked(x, y, r) {
    const ts = this.tileSize;
    const x0 = Math.floor((x - r) / ts);
    const x1 = Math.floor((x + r) / ts);
    const y0 = Math.floor((y - r) / ts);
    const y1 = Math.floor((y + r) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.at(tx, ty) !== TILE.WALL) continue;
        const nx = Math.max(tx * ts, Math.min(x, tx * ts + ts));
        const ny = Math.max(ty * ts, Math.min(y, ty * ts + ts));
        if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  /**
   * Move a circle by (dx, dy), sliding along walls.
   * Axes are resolved separately so a diagonal into a wall slides instead of
   * sticking. Deterministic: safe to run inside prediction replays.
   */
  moveCircle(x, y, r, dx, dy) {
    let nx = x;
    let ny = y;
    let hitX = false;
    let hitY = false;

    if (dx !== 0) {
      if (!this.circleBlocked(nx + dx, ny, r)) nx += dx;
      else hitX = true;
    }
    if (dy !== 0) {
      if (!this.circleBlocked(nx, ny + dy, r)) ny += dy;
      else hitY = true;
    }
    return { x: nx, y: ny, hitX, hitY };
  }

  /** First solid tile hit by a ray, or null. Used for hitscan and line of sight. */
  raycast(x, y, dirX, dirY, maxDist, stepSize = this.tileSize / 4) {
    const steps = Math.ceil(maxDist / stepSize);
    for (let i = 1; i <= steps; i++) {
      const d = i * stepSize;
      const px = x + dirX * d;
      const py = y + dirY * d;
      if (this.solidAt(px, py)) return { x: px, y: py, dist: d };
    }
    return null;
  }

  toJSON() {
    return { width: this.width, height: this.height, tileSize: this.tileSize, tiles: [...this.tiles] };
  }

  static fromJSON(json) {
    return new TileMap(json);
  }

  /** Rooms-and-noise arena generator; identical output for identical seeds. */
  static generate({ width = 40, height = 30, tileSize = 32, seed = 1, density = 0.16 } = {}) {
    const random = makeRandom(seed);
    const map = new TileMap({ width, height, tileSize });
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const border = tx === 0 || ty === 0 || tx === width - 1 || ty === height - 1;
        map.set(tx, ty, border || random() < density ? TILE.WALL : TILE.FLOOR);
      }
    }
    // Carve a connected cross so the arena is never split into islands.
    const midY = Math.floor(height / 2);
    const midX = Math.floor(width / 2);
    for (let tx = 1; tx < width - 1; tx++) map.set(tx, midY, TILE.FLOOR);
    for (let ty = 1; ty < height - 1; ty++) map.set(midX, ty, TILE.FLOOR);
    return map;
  }
}

/** Entity container shared by host and clients. */
export class World {
  constructor(map) {
    this.map = map;
    /** @type {Map<string, object>} */
    this.entities = new Map();
    this._nextId = 1;
  }

  nextId(prefix = 'e') {
    return `${prefix}${this._nextId++}`;
  }

  add(entity) {
    if (!entity.id) entity.id = this.nextId(entity.type ?? 'e');
    this.entities.set(entity.id, entity);
    return entity;
  }

  remove(id) {
    return this.entities.delete(id);
  }

  get(id) {
    return this.entities.get(id) ?? null;
  }

  /** All entities, optionally filtered by `type`. */
  all(type) {
    const list = [...this.entities.values()];
    return type ? list.filter((e) => e.type === type) : list;
  }

  /** The entity a given peer controls, if any. */
  playerOf(ownerId) {
    for (const e of this.entities.values()) {
      if (e.owner === ownerId) return e;
    }
    return null;
  }

  /** Entities within `radius` of (x, y), nearest first. */
  near(x, y, radius, type) {
    const r2 = radius * radius;
    return this.all(type)
      .map((e) => ({ e, d2: (e.x - x) ** 2 + (e.y - y) ** 2 }))
      .filter((h) => h.d2 <= r2)
      .sort((a, b) => a.d2 - b.d2)
      .map((h) => h.e);
  }

  /** Random free (non-solid) position, using a caller-supplied PRNG. */
  randomSpawn(random, radius = 12, attempts = 200) {
    const { pixelWidth, pixelHeight } = this.map;
    for (let i = 0; i < attempts; i++) {
      const x = radius + random() * (pixelWidth - radius * 2);
      const y = radius + random() * (pixelHeight - radius * 2);
      if (!this.map.circleBlocked(x, y, radius)) return { x, y };
    }
    return { x: pixelWidth / 2, y: pixelHeight / 2 };
  }
}
