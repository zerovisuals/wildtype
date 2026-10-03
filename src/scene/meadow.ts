// Meadow: wildflowers grow out of the real letter shapes.
// Style: flat gouache shapes with a single fine line accent each, a warm field palette.
// Stems leave the tops and sides of strokes, lean away from the pointer, sway in a soft wind.
// Buds open while you wait, and the field keeps filling in if you leave it alone.
// Click: bees come out and visit the flowers. Backspace: that letter's plants wilt and drop petals.
import type { Effect, Letter, World, EdgePt } from './engine';
import { contourRun } from './glyph';
import { Spring, TAU, chance, clamp, easeIn, easeOutBack, easeOutCubic, leanFromPointer, mixColor, noise, pickOf, quad, rand } from './kit';

const C = {
  stem: ['#2f6b47', '#3c7d50', '#4a8a4f'],
  leaf: ['#5ea66a', '#7dbb6c', '#3f8a55'],
  vein: '#c7e7b4',
  dry: '#b9a079',
  poppy: '#ff5a36',
  poppyDark: '#d83a1f',
  daisy: '#fffaf0',
  daisyLine: '#e7d7b9',
  yolk: '#ffbe2e',
  corn: '#3d63e0',
  cornLight: '#8fb0ff',
  cosmos: '#ff8db5',
  cosmosLine: '#ffd3e2',
  butter: '#ffd23f',
  ink: '#2a1e1a',
  grass: ['#6aad62', '#4f9a5a', '#86c072'],
};

type Species = 'poppy' | 'daisy' | 'corn' | 'cosmos' | 'butter';
const SPECIES: Species[] = ['poppy', 'daisy', 'corn', 'cosmos', 'butter'];

type Leaf = { t: number; side: number; size: number };
type Twig = { t: number; side: number; len: number; species: Species; head: number; rot: number };
type Vine = {
  pts: EdgePt[];
  start: number;
  dur: number;
  phase: number;
  amp: number; // weave depth, em
  width: number;
  color: string;
  leaves: { i: number; side: number; size: number }[];
  curl: number; // tendril direction at the tip
};
type Stem = {
  p: EdgePt;
  base: number; // resting angle
  len: number; // in em
  curl: number;
  width: number;
  color: string;
  leaves: Leaf[];
  twigs: Twig[];
  species: Species;
  head: number; // head radius in em
  rot: number;
  bud: boolean; // blooms later
  openAt: number;
  start: number;
  dur: number;
  sway: Spring;
  phase: number;
  side: number; // which way it wilts
  shed: boolean;
};
type Tuft = { p: EdgePt; blades: { h: number; a: number; c: string }[]; start: number; phase: number };
type Data = { stems: Stem[]; tufts: Tuft[]; vines: Vine[]; lastSprout: number };

type Petal = { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number; c: string; life: number };
type Bee = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; visits: number; dwell: number; phase: number; leaving: boolean; ex: number; ey: number };

/** Pick an edge point and a resting angle: mostly up, following the stroke's own direction. */
function sprout(L: Letter): { p: EdgePt; base: number } | null {
  const pool = L.glyph.up.length && chance(0.75) ? L.glyph.up : L.glyph.edges.filter((e) => e.ny < 0.2);
  if (!pool.length) return null;
  const p = pickOf(pool);
  const ax = p.nx * 0.55;
  const ay = p.ny * 0.45 - 0.9;
  return { p, base: Math.atan2(ay, ax) + rand(-0.18, 0.18) };
}

function makeStem(L: Letter, t: number, delay: number, speed: number, bud = chance(0.3), cushion = false): Stem | null {
  const s = sprout(L);
  if (!s) return null;
  const len = cushion ? rand(0.08, 0.2) : rand(0.3, 0.85);
  const species = cushion ? pickOf<Species>(['poppy', 'cosmos', 'daisy', 'poppy']) : pickOf(SPECIES);
  return {
    p: s.p,
    base: s.base,
    len,
    curl: rand(-0.25, 0.25),
    width: rand(0.013, 0.02),
    color: pickOf(C.stem),
    leaves: cushion ? [] : Array.from({ length: 1 + ((Math.random() * 3) | 0) }, () => ({ t: rand(0.2, 0.7), side: chance(0.5) ? 1 : -1, size: rand(0.09, 0.17) })),
    twigs: !cushion && len > 0.5 && chance(0.55)
      ? Array.from({ length: chance(0.4) ? 2 : 1 }, (_, i) => ({ t: rand(0.45, 0.75), side: i ? -1 : chance(0.5) ? 1 : -1, len: rand(0.18, 0.32), species: chance(0.6) ? species : pickOf(SPECIES), head: rand(0.06, 0.09), rot: rand(0, TAU) }))
      : [],
    species,
    head: cushion ? rand(0.15, 0.22) : rand(0.09, 0.15) * (len > 0.6 ? 1.15 : 1),
    rot: rand(0, TAU),
    bud: cushion ? false : bud,
    openAt: t + delay + rand(2.5, 7),
    start: t + delay,
    dur: rand(0.7, 1.1) * speed * (cushion ? 0.6 : 1),
    sway: new Spring(55, 9),
    phase: rand(0, 100),
    side: chance(0.5) ? 1 : -1,
    shed: false,
  };
}

/** A vine that creeps along the letter's own outline, weaving over and under the stroke. */
function makeVine(L: Letter, t: number, speed: number): Vine | null {
  const run = contourRun(L.glyph, Math.round(rand(55, 110)));
  if (run.length < 14) return null;
  const pts = run.filter((_, i) => i % 2 === 0);
  const leaves: Vine['leaves'] = [];
  for (let i = 5; i < pts.length - 2; i += 4 + ((Math.random() * 4) | 0)) leaves.push({ i, side: leaves.length % 2 ? 1 : -1, size: rand(0.06, 0.1) });
  return {
    pts,
    start: t + rand(0.1, 0.35),
    dur: rand(1.4, 2.2) * speed,
    phase: rand(0, TAU),
    amp: rand(0.025, 0.04),
    width: rand(0.009, 0.013),
    color: pickOf(['#2f6b47', '#3c7d50']),
    leaves,
    curl: chance(0.5) ? 1 : -1,
  };
}

export class Meadow implements Effect {
  readonly name = 'Meadow';
  readonly hint = 'Click to send out the bees';
  private petals: Petal[] = [];
  private bees: Bee[] = [];
  private pollen: Petal[] = [];

  grow(L: Letter, w: World, speed: number) {
    const d: Data = { stems: [], tufts: [], vines: [], lastSprout: w.t };
    const n = 1 + (chance(0.55) ? 1 : 0) + (chance(0.2) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const s = makeStem(L, w.t, i * 0.22, speed);
      if (s) d.stems.push(s);
    }
    if (chance(0.45)) {
      const c = makeStem(L, w.t, 0.1, speed, false, true);
      if (c) d.stems.push(c);
    }
    if (chance(0.6)) {
      const v = makeVine(L, w.t, speed);
      if (v) d.vines.push(v);
    }
    // grass at the foot of some letters
    const feet = L.glyph.down.filter((e) => e.y > L.glyph.asc * 0.85);
    if (feet.length && chance(0.55)) {
      d.tufts.push({
        p: pickOf(feet),
        blades: Array.from({ length: 4 + ((Math.random() * 4) | 0) }, () => ({ h: rand(0.07, 0.17), a: rand(-0.5, 0.5), c: pickOf(C.grass) })),
        start: w.t + 0.15,
        phase: rand(0, 100),
      });
    }
    L.data = d;
  }

  wither(L: Letter) {
    void L;
  }

  gone(L: Letter, w: World) {
    return w.t - L.diedAt > 0.3;
  }

  click(x: number, y: number, w: World) {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const v = rand(30, 120);
      this.pollen.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, r: 0, vr: 0, s: rand(1.5, 3.2), c: chance(0.5) ? C.yolk : C.butter, life: 1 });
    }
    const n = chance(0.4) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const b: Bee = { x, y, vx: rand(-60, 60), vy: rand(-140, -60), tx: x, ty: y, visits: 0, dwell: 0, phase: rand(0, TAU), leaving: false, ex: 0, ey: 0 };
      this.target(b, w);
      this.bees.push(b);
    }
  }

  /** Send a bee to a flower that is open now, or off the page once it has done its rounds. */
  private target(b: Bee, w: World) {
    const heads: { x: number; y: number }[] = [];
    for (const L of w.letters) {
      if (L.dead || !L.data) continue;
      for (const s of (L.data as Data).stems) if (!s.bud || w.t > s.openAt) heads.push(this.tip(L, s, w));
    }
    if (b.visits >= 3 || !heads.length) {
      b.leaving = true;
      const side = chance(0.5) ? -1 : 1;
      b.ex = side < 0 ? -80 : w.W + 80;
      b.ey = rand(-60, w.H * 0.5);
      b.tx = b.ex;
      b.ty = b.ey;
      return;
    }
    const h = pickOf(heads);
    b.tx = h.x;
    b.ty = h.y - w.fontPx * 0.05;
  }

  /** Where a stem's tip is right now (without growth), for bees to land on. */
  private tip(L: Letter, s: Stem, w: World) {
    const b = w.at(L, s.p);
    const a = s.base + s.sway.v;
    return { x: b.x + Math.cos(a) * s.len * w.fontPx, y: b.y + Math.sin(a) * s.len * w.fontPx };
  }

  update(w: World) {
    const { dt, t, pointer: m } = w;
    // the field keeps filling in while you are away: every few seconds a letter gets one more stem
    for (const L of w.letters) {
      if (L.dead || !L.data) continue;
      const d = L.data as Data;
      if (t - d.lastSprout > rand(5, 9) && d.stems.length < 4 && chance(0.02)) {
        const s = makeStem(L, t, 0, 1.3, true);
        if (s) d.stems.push(s);
        d.lastSprout = t;
      }
      for (const s of d.stems) {
        const b = w.at(L, s.p);
        const mid = { x: b.x + Math.cos(s.base) * s.len * w.fontPx * 0.5, y: b.y + Math.sin(s.base) * s.len * w.fontPx * 0.5 };
        const lean = leanFromPointer(mid.x, mid.y, m.x, m.y, m.active, w.fontPx * 1.3, 0.85);
        // a quick swipe adds a gust in the direction of travel
        const gust = clamp(m.vx * 0.12, -0.5, 0.5) * m.active * (Math.hypot(mid.x - m.x, mid.y - m.y) < w.fontPx * 2 ? 1 : 0);
        s.sway.step(lean + gust, dt);
      }
    }
    for (const p of this.petals) {
      p.vy += 140 * dt;
      p.vx += Math.sin(t * 3 + p.r) * 30 * dt;
      p.vx *= 0.98;
      p.vy = Math.min(p.vy, 90);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      p.life -= dt * 0.7;
    }
    this.petals = this.petals.filter((p) => p.life > 0 && p.y < w.H + 40);
    for (const p of this.pollen) {
      p.vy += 60 * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.8;
    }
    this.pollen = this.pollen.filter((p) => p.life > 0);
    for (const b of this.bees) {
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const d = Math.hypot(dx, dy);
      if (!b.leaving && d < 10) {
        b.dwell += dt;
        b.vx *= 0.85;
        b.vy *= 0.85;
        if (b.dwell > rand(0.5, 0.9)) {
          b.dwell = 0;
          b.visits++;
          this.target(b, w);
        }
      } else {
        const want = Math.min(d * 2.2, 260);
        b.vx += ((dx / (d || 1)) * want - b.vx) * Math.min(1, dt * 3);
        b.vy += ((dy / (d || 1)) * want - b.vy) * Math.min(1, dt * 3);
      }
      b.phase += dt;
      b.x += b.vx * dt + Math.cos(b.phase * 9) * 0.6;
      b.y += b.vy * dt + Math.sin(b.phase * 13) * 0.8;
    }
    this.bees = this.bees.filter((b) => !(b.leaving && (b.x < -60 || b.x > w.W + 60 || b.y < -50)));
  }

  /** 1 while alive; on delete, everything retracts into the letter in ~0.25 s (no fade, no overlap). */
  private keep(L: Letter, w: World) {
    return L.dead ? 1 - easeIn(clamp((w.t - L.diedAt) / 0.25)) : 1;
  }

  private headColor(sp: Species) {
    return sp === 'poppy' ? C.poppy : sp === 'daisy' ? C.daisy : sp === 'corn' ? C.corn : sp === 'cosmos' ? C.cosmos : C.butter;
  }

  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    const { t, fontPx: F } = w;
    for (const L of w.letters) {
      if (!L.data) continue;
      const d = L.data as Data;
      const wilt = 0;
      const fade = 1;
      for (const v of d.vines) this.drawVine(back, front, L, v, w, wilt, fade);
      for (const tf of d.tufts) this.drawTuft(front, L, tf, w, wilt, fade);
      for (const s of d.stems) this.drawStem(back, front, L, s, w, wilt, fade, F);
    }
    for (const p of this.petals) {
      front.save();
      front.globalAlpha = clamp(p.life * 1.4);
      front.translate(p.x, p.y);
      front.rotate(p.r);
      front.fillStyle = p.c;
      front.beginPath();
      front.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU);
      front.fill();
      front.restore();
    }
    for (const p of this.pollen) {
      front.globalAlpha = clamp(p.life);
      front.fillStyle = p.c;
      front.beginPath();
      front.arc(p.x, p.y, p.s, 0, TAU);
      front.fill();
    }
    front.globalAlpha = 1;
    for (const b of this.bees) this.drawBee(front, b, F, t);
  }

  private drawTuft(ctx: CanvasRenderingContext2D, L: Letter, tf: Tuft, w: World, wilt: number, fade: number) {
    const g = easeOutCubic((w.t - tf.start) / 0.6) * this.keep(L, w);
    if (g <= 0) return;
    const b = w.at(L, tf.p);
    const F = w.fontPx;
    const lean = leanFromPointer(b.x, b.y, w.pointer.x, w.pointer.y, w.pointer.active, F, 0.5);
    ctx.globalAlpha = fade;
    for (const bl of tf.blades) {
      const a = -Math.PI / 2 + bl.a + Math.sin(w.t * 1.6 + tf.phase + bl.a * 3) * 0.08 + lean + wilt * 1.1 * Math.sign(bl.a || 1);
      const h = bl.h * F * g;
      const tx = b.x + Math.cos(a) * h;
      const ty = b.y + Math.sin(a) * h;
      const wdt = F * 0.012;
      ctx.fillStyle = wilt > 0 ? mixColor(bl.c, C.dry, wilt) : bl.c;
      ctx.beginPath();
      ctx.moveTo(b.x - wdt, b.y);
      ctx.quadraticCurveTo(b.x + Math.cos(a) * h * 0.5 - wdt, b.y + Math.sin(a) * h * 0.5, tx, ty);
      ctx.quadraticCurveTo(b.x + Math.cos(a) * h * 0.5 + wdt, b.y + Math.sin(a) * h * 0.5, b.x + wdt, b.y);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawStem(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, L: Letter, s: Stem, w: World, wilt: number, fade: number, F: number) {
    const g = easeOutCubic((w.t - s.start) / s.dur) * this.keep(L, w);
    if (g <= 0) return;
    const b = w.at(L, s.p);
    const wind = noise(w.t * 0.35 + b.x * 0.004) * 0.09 + Math.sin(w.t * 1.25 + s.phase) * 0.035;
    const droop = wilt * 1.35 * s.side;
    const a = s.base + wind + s.sway.v + droop;
    const len = s.len * F * g * (1 - wilt * 0.2);
    const tx = b.x + Math.cos(a) * len;
    const ty = b.y + Math.sin(a) * len;
    const ca = s.base + (a - s.base) * 0.35;
    const perp = ca + Math.PI / 2;
    const cx = b.x + Math.cos(ca) * len * 0.55 + Math.cos(perp) * s.curl * len;
    const cy = b.y + Math.sin(ca) * len * 0.55 + Math.sin(perp) * s.curl * len;
    const stemCol = wilt > 0 ? mixColor(s.color, C.dry, wilt) : s.color;

    back.globalAlpha = fade;
    back.strokeStyle = stemCol;
    back.lineWidth = s.width * F;
    back.lineCap = 'round';
    back.beginPath();
    back.moveTo(b.x, b.y);
    back.quadraticCurveTo(cx, cy, tx, ty);
    back.stroke();

    for (const lf of s.leaves) {
      const lg = clamp((g - lf.t) / 0.3);
      if (lg <= 0) continue;
      const q = quad(b.x, b.y, cx, cy, tx, ty, lf.t / Math.max(g, 0.01) > 1 ? 1 : lf.t / Math.max(g, 0.01));
      const la = q.a + lf.side * (0.9 + wilt * 0.6) + Math.sin(w.t * 2 + s.phase + lf.t * 5) * 0.05;
      this.leaf(back, q.x, q.y, la, lf.size * F * easeOutBack(lg, 1.4), wilt > 0 ? mixColor('#5ea66a', C.dry, wilt) : C.leaf[(lf.t * 10) % 3 | 0]);
    }
    for (const tw of s.twigs) {
      const tg = clamp((g - tw.t) / 0.35);
      if (tg <= 0) continue;
      const q = quad(b.x, b.y, cx, cy, tx, ty, Math.min(tw.t / Math.max(g, 0.01), 1));
      const ta = q.a + tw.side * (0.75 + wilt * 0.5) + Math.sin(w.t * 1.7 + s.phase + tw.t * 7) * 0.06;
      const tl = tw.len * s.len * F * easeOutCubic(tg);
      const ex = q.x + Math.cos(ta) * tl;
      const ey = q.y + Math.sin(ta) * tl;
      back.lineWidth = s.width * F * 0.75;
      back.beginPath();
      back.moveTo(q.x, q.y);
      back.quadraticCurveTo(q.x + Math.cos(ta - tw.side * 0.3) * tl * 0.6, q.y + Math.sin(ta - tw.side * 0.3) * tl * 0.6, ex, ey);
      back.stroke();
      const hg = clamp((tg - 0.6) / 0.4);
      if (hg > 0) {
        front.globalAlpha = fade;
        front.save();
        front.translate(ex, ey);
        front.rotate(ta + Math.PI / 2);
        const tr = tw.head * F * easeOutBack(hg, 1.6) * (1 - easeIn(wilt));
        if (tr > 0.5) this.flower(front, tr, { ...s, species: tw.species, rot: tw.rot }, w.t, 1);
        front.restore();
      }
    }
    back.globalAlpha = 1;

    // the head opens once the stem is nearly up; buds wait for their moment
    const headG = clamp((g - 0.8) / 0.2);
    if (headG <= 0) return;
    const open = s.bud ? clamp((w.t - s.openAt) / 0.9) : 1;
    const R = s.head * F * easeOutBack(headG, 1.6) * (1 - easeIn(wilt));
    if (R < 0.5) return;
    front.globalAlpha = fade;
    front.save();
    front.translate(tx, ty);
    front.rotate(a + Math.PI / 2 + s.rot * 0.15);
    if (open < 1) this.bud(front, R, s.species, open);
    if (open > 0) this.flower(front, R * (0.55 + 0.45 * easeOutBack(open, 1.4)), s, w.t, open);
    front.restore();
    front.globalAlpha = 1;
  }

  /**
   * The vine follows the outline and is offset by a sine along its length: where the offset dips
   * into the letter it is drawn on the front canvas (over the stroke), where it rises out it goes on
   * the back one (behind it). That alternation is what reads as weaving.
   */
  private drawVine(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, L: Letter, v: Vine, w: World, wilt: number, fade: number) {
    const g = easeOutCubic((w.t - v.start) / v.dur) * this.keep(L, w);
    if (g <= 0) return;
    const F = w.fontPx;
    const n = Math.max(2, Math.floor(v.pts.length * g));
    const P: { x: number; y: number; over: boolean; nx: number; ny: number }[] = [];
    for (let i = 0; i < n; i++) {
      const e = v.pts[i];
      const b = w.at(L, e);
      const wave = Math.sin(i * 0.42 + v.phase + w.t * 0.6);
      const off = wave * v.amp * F;
      P.push({ x: b.x + e.nx * off, y: b.y + e.ny * off, over: wave < 0, nx: e.nx, ny: e.ny });
    }
    const col = wilt > 0 ? mixColor(v.color, C.dry, wilt) : v.color;
    for (const ctx of [back, front]) {
      ctx.globalAlpha = fade;
      ctx.strokeStyle = col;
      ctx.lineWidth = v.width * F;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    for (let i = 1; i < P.length; i++) {
      const ctx = P[i].over ? front : back;
      ctx.beginPath();
      ctx.moveTo(P[i - 1].x, P[i - 1].y);
      ctx.lineTo(P[i].x, P[i].y);
      ctx.stroke();
    }
    for (const lf of v.leaves) {
      if (lf.i >= P.length) continue;
      const q = P[lf.i];
      const a = Math.atan2(q.ny, q.nx) + lf.side * 0.55 + Math.sin(w.t * 1.8 + lf.i) * 0.08 + wilt * 0.9;
      const lg = clamp((n - lf.i) / 6);
      this.leaf(q.over ? front : back, q.x, q.y, a, lf.size * F * easeOutBack(lg, 1.5), wilt > 0 ? mixColor('#5ea66a', C.dry, wilt) : C.leaf[lf.i % 3]);
    }
    // a curling tendril at the growing tip
    if (g > 0.35) {
      const tip = P[P.length - 1];
      const prev = P[Math.max(0, P.length - 4)];
      let a = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      const ctx = tip.over ? front : back;
      ctx.lineWidth = v.width * F * 0.7;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      let x = tip.x;
      let y = tip.y;
      const R = F * 0.05 * clamp((g - 0.35) / 0.4);
      for (let k = 0; k < 26; k++) {
        a += v.curl * 0.32;
        const r = R * (1 - k / 30);
        x += Math.cos(a) * r * 0.32;
        y += Math.sin(a) * r * 0.32;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    back.globalAlpha = 1;
    front.globalAlpha = 1;
  }

  private leaf(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, l: number, col: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(l * 0.5, -l * 0.42, l, 0);
    ctx.quadraticCurveTo(l * 0.5, l * 0.42, 0, 0);
    ctx.fill();
    ctx.strokeStyle = C.vein;
    ctx.lineWidth = Math.max(0.8, l * 0.04);
    ctx.beginPath();
    ctx.moveTo(l * 0.1, 0);
    ctx.lineTo(l * 0.85, 0);
    ctx.stroke();
    ctx.restore();
  }

  private bud(ctx: CanvasRenderingContext2D, R: number, sp: Species, open: number) {
    ctx.save();
    ctx.globalAlpha *= 1 - open;
    ctx.fillStyle = '#4a8a4f';
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.2, R * 0.38, R * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.headColor(sp);
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.55, R * 0.2, R * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private flower(ctx: CanvasRenderingContext2D, R: number, s: Stem, t: number, open: number) {
    const breathe = 1 + Math.sin(t * 1.4 + s.phase) * 0.025;
    ctx.save();
    ctx.globalAlpha *= clamp(open * 1.4);
    ctx.rotate(s.rot);
    ctx.scale(breathe, breathe);
    switch (s.species) {
      case 'poppy': {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.3;
          ctx.fillStyle = i % 2 ? C.poppy : C.poppyDark;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.62, R * 0.52, a, 0, TAU);
          ctx.fill();
        }
        ctx.strokeStyle = '#ff8a6b';
        ctx.lineWidth = R * 0.05;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
          ctx.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8);
          ctx.stroke();
        }
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.22, 0, TAU);
        ctx.fill();
        ctx.fillStyle = C.yolk;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, R * 0.045, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'daisy': {
        const n = 13;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          ctx.fillStyle = C.daisy;
          ctx.strokeStyle = C.daisyLine;
          ctx.lineWidth = Math.max(0.8, R * 0.035);
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.42, R * 0.13, a, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = C.yolk;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.26, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e89b16';
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.arc(Math.cos(i * 2.4) * R * 0.13 * Math.sqrt(i / 7), Math.sin(i * 2.4) * R * 0.13 * Math.sqrt(i / 7), R * 0.035, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'corn': {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          ctx.fillStyle = i % 2 ? C.corn : '#5b7ff0';
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.22) * R * 0.25, Math.sin(a - 0.22) * R * 0.25);
          ctx.lineTo(Math.cos(a - 0.12) * R, Math.sin(a - 0.12) * R);
          ctx.lineTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82);
          ctx.lineTo(Math.cos(a + 0.12) * R, Math.sin(a + 0.12) * R);
          ctx.lineTo(Math.cos(a + 0.22) * R * 0.25, Math.sin(a + 0.22) * R * 0.25);
          ctx.fill();
        }
        ctx.fillStyle = '#2a2f6b';
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.22, 0, TAU);
        ctx.fill();
        ctx.fillStyle = C.cornLight;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12, R * 0.04, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'cosmos': {
        const n = 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          ctx.save();
          ctx.rotate(a);
          ctx.fillStyle = C.cosmos;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(R * 0.55, -R * 0.38, R * 0.95, -R * 0.12);
          ctx.lineTo(R, 0);
          ctx.lineTo(R * 0.95, R * 0.12);
          ctx.quadraticCurveTo(R * 0.55, R * 0.38, 0, 0);
          ctx.fill();
          ctx.strokeStyle = C.cosmosLine;
          ctx.lineWidth = Math.max(0.8, R * 0.035);
          ctx.beginPath();
          ctx.moveTo(R * 0.3, 0);
          ctx.lineTo(R * 0.8, 0);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = '#ffcf4a';
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.17, 0, TAU);
        ctx.fill();
        break;
      }
      default: {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          ctx.fillStyle = C.butter;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.4, 0, TAU);
          ctx.fill();
        }
        ctx.strokeStyle = '#f0a91a';
        ctx.lineWidth = Math.max(0.8, R * 0.04);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.22, a + 2.2, a + 4.1);
          ctx.stroke();
        }
        ctx.fillStyle = '#7a9a2c';
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.16, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawBee(ctx: CanvasRenderingContext2D, b: Bee, F: number, t: number) {
    const s = F * 0.075;
    const face = b.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(face, 1);
    ctx.rotate(clamp(b.vy / 400, -0.4, 0.4));
    const flap = Math.abs(Math.sin(t * 38 + b.phase));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(42,30,26,0.35)';
    ctx.lineWidth = 1;
    for (const off of [-0.15, 0.25]) {
      ctx.beginPath();
      ctx.ellipse(-s * off, -s * 0.55, s * 0.32, s * 0.5 * (0.35 + flap * 0.65), -0.5 + off, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.7, s * 0.48, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.ink;
    for (const x of [-0.18, 0.18]) ctx.fillRect(x * s * 2 - s * 0.1, -s, s * 0.2, s * 2);
    ctx.restore();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(s * 0.62, -s * 0.05, s * 0.28, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * 0.7, -s * 0.12, s * 0.07, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  reset() {
    this.petals = [];
    this.bees = [];
    this.pollen = [];
  }
}
