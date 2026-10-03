// Small shared toolkit for the scene effects: easing, noise, colour, springs, randomness.

export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pickOf = <T>(list: readonly T[]) => list[(Math.random() * list.length) | 0];
export const chance = (p: number) => Math.random() < p;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeOutBack = (t: number, s = 1.7) => {
  const x = clamp(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeIn = (t: number) => clamp(t) ** 2;

/** Smooth 1D value noise in [-1, 1]. */
const perm = Array.from({ length: 512 }, () => Math.random());
export function noise(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(perm[i & 511], perm[(i + 1) & 511], u) * 2 - 1;
}

/** Hex colour mix: mixColor('#ff0000', '#0000ff', 0.5). */
export function mixColor(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(lerp(ch(pa, s), ch(pb, s), clamp(t)));
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

/** Critically-damped-ish spring for one value: smooth, a touch of overshoot, never jittery. */
export class Spring {
  v = 0;
  vel = 0;
  constructor(public k = 70, public damp = 11) {}
  step(target: number, dt: number) {
    const a = this.k * (target - this.v) - this.damp * this.vel;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
}

/** Point on a quadratic bezier and its tangent angle. */
export function quad(p0x: number, p0y: number, cx: number, cy: number, p1x: number, p1y: number, t: number) {
  const mt = 1 - t;
  const x = mt * mt * p0x + 2 * mt * t * cx + t * t * p1x;
  const y = mt * mt * p0y + 2 * mt * t * cy + t * t * p1y;
  const dx = 2 * mt * (cx - p0x) + 2 * t * (p1x - cx);
  const dy = 2 * mt * (cy - p0y) + 2 * t * (p1y - cy);
  return { x, y, a: Math.atan2(dy, dx) };
}

/**
 * How much a thing standing at (x, y) should lean away from the pointer, in radians.
 * Strongest close in, nothing beyond `reach`; the sign pushes it away from the cursor side.
 */
export function leanFromPointer(x: number, y: number, mx: number, my: number, active: number, reach: number, strength = 0.9) {
  if (active <= 0) return 0;
  const dx = x - mx;
  const dy = y - my;
  const d = Math.hypot(dx, dy);
  if (d > reach) return 0;
  const f = (1 - d / reach) ** 2;
  return Math.sign(dx || 1) * f * strength * active;
}
