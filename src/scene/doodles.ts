// Doodles: the margins of a notebook, drawn while you type.
// Style: ballpoint blue, red and green pen lines with a hand wobble, plus a yellow highlighter
// swipe behind some letters. Every mark is drawn in stroke by stroke like a real pen.
// Pointer: marks nudge away from it. Idle: stars twinkle, spirals turn, and now and then a mark
// gets re-inked. Click: a scribbled burst of sparkles. Backspace: the letter's doodles un-draw.
import type { Effect, Letter, World } from './engine';
import { Spring, TAU, chance, clamp, easeInOut, pickOf, rand } from './kit';

const PEN = ['#2747c9', '#e5484d', '#2f9e63', '#2747c9'];
const HIGHLIGHT = 'rgba(255, 221, 64, 0.55)';

type Pt = [number, number];
type Shape = { strokes: Pt[][]; total: number; lens: number[] };
type Kind = 'star' | 'sparkle' | 'heart' | 'spiral' | 'sun' | 'loops' | 'marks' | 'arrow' | 'underline' | 'highlight';
type Mark = {
  kind: Kind;
  shape: Shape;
  ax: number; // anchor in glyph px
  ay: number;
  ox: number; // offset in em
  oy: number;
  size: number; // em
  rot: number;
  color: string;
  width: number; // em
  start: number;
  dur: number;
  nudgeX: Spring;
  nudgeY: Spring;
  phase: number;
  back: boolean;
};
type Loose = { mark: Mark; x: number; y: number; born: number; life: number };

/** A little hand wobble so no two marks are identical. */
const j = (v: number, a = 0.04) => v + rand(-a, a);

function shapeOf(kind: Kind): Shape {
  const S: Pt[][] = [];
  switch (kind) {
    case 'star': {
      const s: Pt[] = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        s.push([j(Math.cos(a)), j(Math.sin(a))]);
      }
      S.push(s);
      break;
    }
    case 'sparkle': {
      const s: Pt[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * TAU;
        const r = 0.22 + 0.78 * Math.abs(Math.cos(a * 2)) ** 3;
        s.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      S.push(s);
      break;
    }
    case 'heart': {
      const s: Pt[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU;
        const x = 16 * Math.sin(a) ** 3;
        const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        s.push([j(x / 17, 0.02), j(-y / 17, 0.02)]);
      }
      S.push(s);
      break;
    }
    case 'spiral': {
      const s: Pt[] = [];
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * TAU * 2.4;
        const r = (i / 60) * 1;
        s.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      S.push(s);
      break;
    }
    case 'sun': {
      const c: Pt[] = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * TAU * 1.05;
        c.push([j(Math.cos(a) * 0.45, 0.02), j(Math.sin(a) * 0.45, 0.02)]);
      }
      S.push(c);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + rand(-0.1, 0.1);
        S.push([[Math.cos(a) * 0.65, Math.sin(a) * 0.65], [Math.cos(a) * j(0.95, 0.06), Math.sin(a) * j(0.95, 0.06)]]);
      }
      break;
    }
    case 'loops': {
      const s: Pt[] = [];
      for (let i = 0; i <= 70; i++) {
        const u = i / 70;
        const a = u * TAU * 3;
        s.push([-1 + u * 2 + Math.sin(a) * 0.28, -Math.cos(a) * 0.35]);
      }
      S.push(s);
      break;
    }
    case 'marks': {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 - 0.7 + i * 0.7;
        S.push([[Math.cos(a) * 0.3, Math.sin(a) * 0.3], [Math.cos(a) * j(1, 0.08), Math.sin(a) * j(1, 0.08)]]);
      }
      break;
    }
    case 'arrow': {
      const s: Pt[] = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        s.push([-1 + u * 1.9, -0.6 + Math.sin(u * Math.PI) * -0.35 + u * 0.6]);
      }
      S.push(s);
      S.push([[0.62, -0.1], [0.92, 0.02], [0.72, 0.28]]);
      break;
    }
    case 'underline': {
      // a straight pen line with a slight hand wobble: neighbouring letters' pieces join into one line
      const s: Pt[] = [];
      for (let i = 0; i <= 8; i++) s.push([-1 + (i / 8) * 2, j(0, 0.025)]);
      S.push(s);
      break;
    }
    case 'highlight': {
      S.push([[-1, j(0.05)], [1, j(-0.05)]]);
      break;
    }
  }
  const lens = S.map((s) => s.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0));
  return { strokes: S, lens, total: lens.reduce((a, b) => a + b, 0) };
}

export class Doodles implements Effect {
  readonly name = 'Doodles';
  readonly hint = 'Click to scribble some sparkle';
  private loose: Loose[] = [];
  private retrace = 0;
  // runs: an underline or highlight continues across the letters of one word in one colour
  private prev: { L: Letter; under: string | null; high: boolean } | null = null;

  grow(L: Letter, w: World) {
    const g = L.glyph;
    const marks: Mark[] = [];
    const t = w.t;
    const mk = (kind: Kind, ax: number, ay: number, ox: number, oy: number, size: number, extra: Partial<Mark> = {}): Mark => ({
      kind, shape: shapeOf(kind), ax, ay, ox, oy, size, rot: rand(-0.4, 0.4), color: pickOf(PEN), width: 0.011,
      start: t + rand(0.05, 0.3), dur: rand(0.45, 0.8), nudgeX: new Spring(70, 10), nudgeY: new Spring(70, 10), phase: rand(0, 100), back: false, ...extra,
    });
    const mid = g.width / 2;
    const half = g.width / g.size / 2;
    // same word as the previous letter? (it sits right after it on the same line)
    const p = this.prev;
    const sameWord = !!p && !p.L.dead && Math.abs(p.L.y - L.y) < 4 && L.x - (p.L.x + p.L.glyph.width * p.L.scale) < w.fontPx * 0.12;
    const high = sameWord ? p!.high && chance(0.85) : chance(0.18);
    const under = sameWord && p!.under ? (chance(0.9) ? p!.under : null) : chance(0.3) ? pickOf(['#2747c9', '#e5484d']) : null;
    // underline and highlight pieces overlap a hair so a word reads as one stroke
    if (high) marks.push(mk('highlight', mid, g.asc * 0.6, 0, 0, half + 0.03, { width: 0.3, color: HIGHLIGHT, back: true, rot: 0, dur: 0.22 }));
    if (under) marks.push(mk('underline', mid, g.asc + g.desc * 0.15, 0, 0, half + 0.02, { rot: 0, color: under, dur: 0.25 }));
    // the odd small mark, tucked right against the letter's shoulder
    if (chance(0.3)) {
      const kind = pickOf<Kind>(['star', 'sparkle', 'heart', 'spiral', 'marks', 'sparkle']);
      const side = chance(0.5) ? -1 : 1;
      marks.push(mk(kind, side > 0 ? g.width : 0, g.asc * 0.18, side * rand(0.02, 0.07), -rand(0.03, 0.08), rand(0.05, 0.075), { rot: kind === 'marks' ? side * 0.5 : rand(-0.5, 0.5) }));
    }
    this.prev = { L, under, high };
    L.data = marks;
  }

  wither() {}

  gone(L: Letter, w: World) {
    return w.t - L.diedAt > 0.25;
  }

  click(x: number, y: number, w: World) {
    const n = 5 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3);
      const d = w.fontPx * rand(0.18, 0.42);
      const kind = pickOf<Kind>(['sparkle', 'star', 'sparkle', 'marks']);
      const mark: Mark = {
        kind, shape: shapeOf(kind), ax: 0, ay: 0, ox: 0, oy: 0, size: rand(0.045, 0.08), rot: kind === 'marks' ? a + Math.PI / 2 : rand(0, TAU),
        color: pickOf(PEN), width: 0.01, start: w.t + i * 0.04, dur: 0.3, nudgeX: new Spring(), nudgeY: new Spring(), phase: rand(0, 100), back: false,
      };
      this.loose.push({ mark, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, born: w.t, life: 1.8 });
    }
  }

  update(w: World) {
    const { t, dt, pointer: m, fontPx: F } = w;
    // now and then someone goes over a mark again with the pen
    if (t > this.retrace) {
      this.retrace = t + rand(3, 6);
      const live = w.letters.filter((L) => !L.dead && Array.isArray(L.data) && L.data.length);
      if (live.length) {
        const mk = pickOf(pickOf(live).data as Mark[]);
        if (mk.kind !== 'highlight') {
          mk.start = t;
          mk.dur = 0.5;
        }
      }
    }
    for (const L of w.letters) {
      if (!Array.isArray(L.data)) continue;
      for (const mk of L.data as Mark[]) {
        const c = w.at(L, { x: mk.ax, y: mk.ay });
        const x = c.x + mk.ox * F;
        const y = c.y + mk.oy * F;
        const dx = x - m.x;
        const dy = y - m.y;
        const d = Math.hypot(dx, dy);
        const reach = F * 0.9;
        const k = d < reach ? (1 - d / reach) ** 2 * m.active : 0;
        mk.nudgeX.step((dx / (d || 1)) * k * F * 0.12, dt);
        mk.nudgeY.step((dy / (d || 1)) * k * F * 0.12, dt);
      }
    }
    this.loose = this.loose.filter((l) => t - l.born < l.life);
  }

  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    const { t, fontPx: F } = w;
    for (const L of w.letters) {
      if (!Array.isArray(L.data)) continue;
      // un-draw on delete: the pen runs backwards, fast
      const undo = L.dead ? 1 - clamp((t - L.diedAt) / 0.22) : 1;
      for (const mk of L.data as Mark[]) {
        const c = w.at(L, { x: mk.ax, y: mk.ay });
        const p = Math.min(easeInOut((t - mk.start) / mk.dur), undo);
        this.mark(mk.back ? back : front, mk, c.x + mk.ox * F + mk.nudgeX.v, c.y + mk.oy * F + mk.nudgeY.v, p, t, F);
      }
    }
    for (const l of this.loose) {
      const age = t - l.born;
      const p = age > l.life - 0.25 ? 1 - (age - (l.life - 0.25)) / 0.25 : easeInOut((t - l.mark.start) / l.mark.dur);
      this.mark(front, l.mark, l.x, l.y, p, t, F);
    }
  }

  private mark(ctx: CanvasRenderingContext2D, mk: Mark, x: number, y: number, p: number, t: number, F: number) {
    if (p <= 0) return;
    const twinkle = mk.kind === 'star' || mk.kind === 'sparkle' ? 1 + Math.sin(t * 3 + mk.phase) * 0.08 : 1;
    const spin = mk.kind === 'spiral' ? t * 0.6 : 0;
    const s = mk.size * F * twinkle;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(mk.rot + spin);
    ctx.strokeStyle = mk.color;
    ctx.lineWidth = mk.width * F;
    ctx.lineCap = mk.kind === 'highlight' ? 'butt' : 'round';
    ctx.lineJoin = 'round';
    let budget = p * mk.shape.total;
    mk.shape.strokes.forEach((st, si) => {
      if (budget <= 0) return;
      ctx.beginPath();
      ctx.moveTo(st[0][0] * s, st[0][1] * s);
      for (let i = 1; i < st.length; i++) {
        const seg = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
        if (budget >= seg) {
          ctx.lineTo(st[i][0] * s, st[i][1] * s);
          budget -= seg;
        } else {
          const u = budget / seg;
          ctx.lineTo((st[i - 1][0] + (st[i][0] - st[i - 1][0]) * u) * s, (st[i - 1][1] + (st[i][1] - st[i - 1][1]) * u) * s);
          budget = 0;
          break;
        }
      }
      ctx.stroke();
      void si;
    });
    ctx.restore();
  }

  reset() {
    this.loose = [];
    this.prev = null;
  }
}
