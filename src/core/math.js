export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest-path interpolation between two angles in radians. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function length(x, y) {
  return Math.hypot(x, y);
}

/** Scale (x, y) so its length is at most `max`. */
export function limit(x, y, max) {
  const len = Math.hypot(x, y);
  if (len <= max || len === 0) return { x, y };
  const s = max / len;
  return { x: x * s, y: y * s };
}

/** Normalize (x, y); returns the zero vector unchanged. */
export function normalize(x, y) {
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

/** Deterministic 32-bit PRNG (mulberry32) — same seed, same sequence on every peer. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
