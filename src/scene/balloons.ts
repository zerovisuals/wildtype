// Balloons: every few letters hold a balloon on a string.
// Style: glossy flat balloons with a darker same-hue line, a knot, a white highlight, thin ink strings.
// The strings are real rope (verlet), so balloons tug, swing and bump into each other and away from
// the pointer. A new balloon inflates at the knot as its string pays out.
// Click a balloon: pop, confetti. Click empty space: a loose balloon floats off.
// Backspace: the string comes untied and the balloon drifts up and away.
import type { Effect, Letter, World, EdgePt } from './engine';
import { TAU, chance, clamp, easeOutBack, noise, pickOf, rand } from './kit';

const COLS = [
  ['#ff5a5f', '#d63b42'],
  ['#3d7bf0', '#2a5bc4'],
  ['#ffcf3f', '#e0a91a'],
  ['#5ccf8f', '#38a56c'],
  ['#ff8db5', '#e0628f'],
  ['#b58cff', '#8f62e0'],
  ['#ff9f43', '#e07a1f'],
];
const STRING = '#2a2522';
const SEGS = 9;

type P = { x: number; y: number; px: number; py: number };
type Balloon = {
  home: Letter | null; // null once it is loose
  p: EdgePt | null;
  pts: P[];
  segLen: number;
  r: number;
  col: string[];
  born: number;
  phase: number;
  popped: number;
};
type Bit = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; c: string; w: number; h: number; life: number };

export class Balloons implements Effect {
  readonly name = 'Balloons';
  readonly hint = 'Click a balloon to pop it';
  private all: Balloon[] = [];
  private bits: Bit[] = [];
  private bursts: { x: number; y: number; t: number; r: number; c: string }[] = [];

  grow(L: Letter, w: World) {
    L.data = true;
    const tied = this.all.filter((b) => b.home && !b.home.dead).length;
    if (!L.glyph.up.length || (!chance(0.4) && tied > 0)) return;
    const p = pickOf(L.glyph.up);
    const a = w.at(L, p);
    const len = w.fontPx * rand(0.4, 0.7);
    this.all.push(this.make(L, p, a.x, a.y, len, w));
  }

  private make(home: Letter | null, p: EdgePt | null, x: number, y: number, len: number, w: World): Balloon {
    const pts: P[] = [];
    for (let i = 0; i <= SEGS; i++) pts.push({ x, y: y - i * 0.5, px: x, py: y - i * 0.5 });
    return { home, p, pts, segLen: len / SEGS, r: w.fontPx * rand(0.12, 0.17), col: pickOf(COLS), born: w.t, phase: rand(0, TAU), popped: 0 };
  }

  wither(L: Letter) {
    for (const b of this.all) if (b.home === L) b.home = null; // untied: it floats away
  }

  gone() {
    return true;
  }

  click(x: number, y: number, w: World) {
    // pop the balloon under the click, if there is one
    for (const b of this.all) {
      if (b.popped) continue;
      const h = b.pts[SEGS];
      if (Math.hypot(h.x - x, h.y - b.r * 0.15 - y) < b.r * 1.15) {
        this.pop(b, w);
        return;
      }
    }
    // otherwise let a loose one go from here
    const b = this.make(null, null, x, y + w.fontPx * 0.5, w.fontPx * 0.5, w);
    for (const q of b.pts) q.y -= w.fontPx * 0.5;
    this.all.push(b);
  }

  private pop(b: Balloon, w: World) {
    b.popped = w.t;
    const h = b.pts[SEGS];
    this.bursts.push({ x: h.x, y: h.y, t: w.t, r: b.r, c: b.col[1] });
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const v = rand(80, 320);
      this.bits.push({ x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, rot: rand(0, TAU), vr: rand(-10, 10), c: pickOf(COLS)[0], w: rand(3, 7), h: rand(5, 11), life: 1 });
    }
  }

  update(w: World) {
    const { t, dt, pointer: m, H } = w;
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of this.all) {
        if (b.popped) {
          // after a pop the string falls on its own
          for (const q of b.pts) this.verlet(q, 0, 900, h);
          this.constrain(b, false);
          continue;
        }
        const grow = clamp((t - b.born) / 0.7);
        const pts = b.pts;
        // the head floats; the rest of the string just hangs with a little drag
        for (let i = 1; i <= SEGS; i++) {
          const head = i === SEGS;
          let fx = noise(t * 0.25 + b.phase + i * 0.1) * 12;
          let fy = head ? -620 * grow : -40;
          if (head && m.active > 0.1) {
            const dx = pts[i].x - m.x;
            const dy = pts[i].y - m.y;
            const d = Math.hypot(dx, dy);
            const reach = b.r * 2.6;
            if (d < reach) {
              const k = (1 - d / reach) ** 2 * m.active;
              fx += (dx / (d || 1)) * 1600 * k + m.vx * 500 * k;
              fy += (dy / (d || 1)) * 1600 * k + m.vy * 500 * k;
            }
          }
          this.verlet(pts[i], fx, fy, h);
        }
        // the knot end stays tied to its letter; untied strings trail freely
        if (b.home && !b.home.dead && b.p) {
          const a = w.at(b.home, b.p);
          pts[0].x = pts[0].px = a.x;
          pts[0].y = pts[0].py = a.y;
        } else this.verlet(pts[0], 0, -300, h);
        this.constrain(b, true, grow);
      }
      // balloons bump each other instead of overlapping
      const live = this.all.filter((b) => !b.popped);
      for (let i = 0; i < live.length; i++)
        for (let j = i + 1; j < live.length; j++) {
          const A = live[i].pts[SEGS];
          const B = live[j].pts[SEGS];
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const d = Math.hypot(dx, dy) || 1;
          const min = live[i].r + live[j].r;
          if (d < min) {
            const push = (min - d) / 2;
            A.x -= (dx / d) * push;
            A.y -= (dy / d) * push;
            B.x += (dx / d) * push;
            B.y += (dy / d) * push;
          }
        }
    }
    this.all = this.all.filter((b) => (b.popped ? t - b.popped < 2.5 && b.pts[0].y < H + 50 : b.pts[SEGS].y > -200));
    for (const p of this.bits) {
      p.vy += 520 * dt;
      p.vx *= 0.985;
      p.vy = Math.min(p.vy, 260);
      p.x += p.vx * dt + Math.sin(t * 6 + p.rot) * 0.6;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt * 0.5;
    }
    this.bits = this.bits.filter((p) => p.life > 0 && p.y < H + 20);
    this.bursts = this.bursts.filter((b) => t - b.t < 0.22);
  }

  private verlet(q: P, fx: number, fy: number, h: number) {
    const vx = (q.x - q.px) * 0.9; // heavy air: they drift and settle instead of bouncing around
    const vy = (q.y - q.py) * 0.9;
    q.px = q.x;
    q.py = q.y;
    q.x += vx + fx * h * h;
    q.y += vy + fy * h * h;
  }

  private constrain(b: Balloon, pinned: boolean, grow = 1) {
    const len = b.segLen * (0.35 + 0.65 * grow); // the string pays out while it inflates
    for (let it = 0; it < 6; it++)
      for (let i = 0; i < SEGS; i++) {
        const a = b.pts[i];
        const c = b.pts[i + 1];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - len) / d;
        const first = i === 0 && pinned && !!b.home && !b.home.dead;
        if (first) {
          c.x -= dx * diff;
          c.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          c.x -= dx * diff * 0.5;
          c.y -= dy * diff * 0.5;
        }
      }
  }

  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    const { t } = w;
    // strings behind the type, balloons in front
    back.strokeStyle = STRING;
    back.lineWidth = 1.4;
    back.lineCap = 'round';
    for (const b of this.all) {
      back.beginPath();
      back.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i <= SEGS; i++) {
        const q = b.pts[i];
        const p = b.pts[i - 1];
        back.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      }
      back.stroke();
    }
    for (const b of this.all) {
      if (b.popped) continue;
      const h = b.pts[SEGS];
      const n = b.pts[SEGS - 1];
      const ang = Math.atan2(h.y - n.y, h.x - n.x) + Math.PI / 2;
      const grow = easeOutBack(clamp((t - b.born) / 0.7), 1.6);
      const r = b.r * grow;
      if (r < 1) continue;
      front.save();
      front.translate(h.x, h.y);
      front.rotate(ang);
      front.translate(0, -r * 0.95);
      front.fillStyle = b.col[0];
      front.strokeStyle = b.col[1];
      front.lineWidth = Math.max(1.5, r * 0.07);
      // body: a slightly pear-shaped balloon
      front.beginPath();
      front.moveTo(0, r * 1.02);
      front.bezierCurveTo(r * 1.15, r * 0.7, r * 1.05, -r * 1.1, 0, -r * 1.05);
      front.bezierCurveTo(-r * 1.05, -r * 1.1, -r * 1.15, r * 0.7, 0, r * 1.02);
      front.fill();
      front.stroke();
      // knot
      front.fillStyle = b.col[1];
      front.beginPath();
      front.moveTo(0, r * 0.98);
      front.lineTo(-r * 0.12, r * 1.18);
      front.lineTo(r * 0.12, r * 1.18);
      front.closePath();
      front.fill();
      // highlight
      front.fillStyle = 'rgba(255,255,255,0.75)';
      front.beginPath();
      front.ellipse(-r * 0.42, -r * 0.42, r * 0.13, r * 0.26, 0.5, 0, TAU);
      front.fill();
      front.restore();
    }
    for (const bu of this.bursts) {
      const u = (t - bu.t) / 0.22;
      front.strokeStyle = bu.c;
      front.lineWidth = 3;
      front.lineCap = 'round';
      front.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const r0 = bu.r * (0.6 + u * 0.6);
        const r1 = bu.r * (1.0 + u * 0.9);
        front.moveTo(bu.x + Math.cos(a) * r0, bu.y + Math.sin(a) * r0);
        front.lineTo(bu.x + Math.cos(a) * r1, bu.y + Math.sin(a) * r1);
      }
      front.stroke();
    }
    for (const p of this.bits) {
      front.save();
      front.translate(p.x, p.y);
      front.rotate(p.rot);
      front.scale(1, Math.cos(p.rot * 2)); // confetti flipping as it falls
      front.fillStyle = p.c;
      front.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      front.restore();
    }
  }

  reset() {
    this.all = [];
    this.bits = [];
    this.bursts = [];
  }
}
