import { lerp, lerpAngle } from '../core/math.js';

/**
 * Buffers authoritative snapshots and renders remote entities slightly in the
 * past (`delay` ms), interpolating between the two snapshots that straddle the
 * render time. This trades a fixed sliver of latency for motion with no jitter
 * and no extrapolation artifacts.
 */
export class SnapshotBuffer {
  constructor({ delay = 100, maxSnapshots = 32, interpolate = ['x', 'y'], angles = ['angle'] } = {}) {
    this.delay = delay;
    this.maxSnapshots = maxSnapshots;
    this.interpolate = interpolate;
    this.angles = angles;
    /** @type {{tick:number, ts:number, ents:object[], localTs:number}[]} */
    this.snapshots = [];
  }

  push(snapshot) {
    const entry = { ...snapshot, localTs: performance.now() };
    // Snapshots ride an unreliable channel, so they can arrive out of order.
    const last = this.snapshots[this.snapshots.length - 1];
    if (last && snapshot.tick <= last.tick) return;
    this.snapshots.push(entry);
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  get latest() {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  /**
   * @param {string[]} [exclude] entity ids to skip (the locally predicted player).
   * @returns {object[]} entity states at the current render time.
   */
  sample(exclude = []) {
    if (this.snapshots.length === 0) return [];
    const renderTime = performance.now() - this.delay;

    let older = null;
    let newer = null;
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].localTs <= renderTime) {
        older = this.snapshots[i];
        newer = this.snapshots[i + 1] ?? null;
        break;
      }
    }
    // Render time is before everything we have (just joined) or after
    // everything (starved by packet loss): fall back to the nearest snapshot.
    if (!older) return this._entities(this.snapshots[0], exclude);
    if (!newer) return this._entities(older, exclude);

    const span = newer.localTs - older.localTs;
    const t = span > 0 ? (renderTime - older.localTs) / span : 0;
    const newerById = new Map(newer.ents.map((e) => [e.id, e]));

    const out = [];
    for (const a of older.ents) {
      if (exclude.includes(a.id)) continue;
      const b = newerById.get(a.id);
      if (!b) continue; // despawned between snapshots — drop it now
      const blended = { ...b };
      for (const key of this.interpolate) {
        if (typeof a[key] === 'number' && typeof b[key] === 'number') blended[key] = lerp(a[key], b[key], t);
      }
      for (const key of this.angles) {
        if (typeof a[key] === 'number' && typeof b[key] === 'number') blended[key] = lerpAngle(a[key], b[key], t);
      }
      out.push(blended);
    }
    // Entities that appeared in the newer snapshot only: show them immediately.
    for (const b of newer.ents) {
      if (exclude.includes(b.id)) continue;
      if (!older.ents.some((a) => a.id === b.id)) out.push({ ...b });
    }
    return out;
  }

  _entities(snapshot, exclude) {
    return snapshot.ents.filter((e) => !exclude.includes(e.id)).map((e) => ({ ...e }));
  }

  clear() {
    this.snapshots.length = 0;
  }
}
