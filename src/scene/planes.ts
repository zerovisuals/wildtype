// Planes: folded paper planes perch on the letters and take little trips.
// Style: white paper with an ink outline and a crease, a dotted pencil trail behind each flight.
// There are always a couple in the air: they take off, loop lazily (the odd loop-the-loop), land again,
// and new ones glide in from the edge of the page.
// Pointer: a gust that pushes flying planes off course. Click: a sheet of paper folds itself into a plane
// right there and launches with a whoosh.
// Backspace: planes parked on that letter take off.
import type { Effect, Letter, World, EdgePt } from './engine';
import { TAU, chance, clamp, easeOutBack, noise, pickOf, rand } from './kit';

const INK = '#2a2522';
const PAPER = ['#ffffff', '#fff6e0', '#e9f1ff', '#ffeaf1'];

type Plane = {
  L: Letter | null; // perched on, or null while flying
  p: EdgePt | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  size: number;
  paper: string;
  state: 'perch' | 'fly' | 'fold';
  foldAt: number;
  loop: number; // >0 while doing a loop-the-loop (radians left to turn)
  loopDir: number; // fixed when the loop starts, so it never flips halfway round
  launched: number;
  nextFlight: number;
  flightEnd: number;
  target: { L: Letter; p: EdgePt } | null;
  trail: { x: number; y: number }[];
  phase: number;
  born: number;
};

export class Planes implements Effect {
  readonly name = 'Planes';
  readonly hint = 'Click to launch a plane';
  private planes: Plane[] = [];
  private nextArrival = 0;

  grow(L: Letter, w: World) {
    L.data = true;
    const parked = this.planes.filter((p) => p.state === 'perch').length;
    if (!L.glyph.up.length || (!chance(0.55) && parked > 0)) return;
    const p = pickOf(L.glyph.up);
    const s = w.at(L, p);
    this.planes.push(this.make(s.x, s.y, w, L, p));
  }

  private make(x: number, y: number, w: World, L: Letter | null, p: EdgePt | null): Plane {
    return {
      L, p, x, y, vx: 0, vy: 0, heading: chance(0.5) ? 0 : Math.PI, size: w.fontPx * rand(0.15, 0.2), paper: pickOf(PAPER),
      state: L ? 'perch' : 'fly', nextFlight: w.t + rand(2, 5), flightEnd: 0, target: null, trail: [], phase: rand(0, 100), born: w.t,
      foldAt: 0, loop: 0, loopDir: 1, launched: 0,
    };
  }

  wither(L: Letter, w: World) {
    for (const p of this.planes) if (p.L === L) this.takeOff(p, w);
  }

  gone() {
    return true;
  }

  click(x: number, y: number, w: World) {
    const p = this.make(x, y, w, null, null);
    p.state = 'fold';
    p.foldAt = w.t;
    p.heading = x < w.W / 2 ? -0.5 : Math.PI + 0.5;
    this.planes.push(p);
  }

  /** Off it goes: up and away from where it was folded, with a whoosh. */
  private launch(p: Plane, w: World) {
    p.state = 'fly';
    const a = p.heading;
    p.vx = Math.cos(a) * w.fontPx * 3.2;
    p.vy = Math.sin(a) * w.fontPx * 3.2;
    p.flightEnd = w.t + rand(3, 5);
    p.launched = w.t;
  }

  private takeOff(p: Plane, w: World) {
    p.state = 'fly';
    p.L = null;
    p.p = null;
    const dir = Math.cos(p.heading) >= 0 ? 1 : -1;
    p.vx = dir * w.fontPx * rand(1.8, 2.6);
    p.vy = -w.fontPx * rand(1.2, 2);
    p.flightEnd = w.t + rand(3, 6);
    p.trail = [];
    p.launched = w.t;
    if (chance(0.3)) {
      p.loop = TAU; // show off
      p.loopDir = Math.cos(p.heading) >= 0 ? -1 : 1;
    }
  }

  update(w: World) {
    const { t, dt, pointer: m, fontPx: F, W, H } = w;
    const live = w.letters.filter((L) => !L.dead && L.glyph.up.length);
    // never a dead sky: if fewer than two are flying, one glides in from the side
    const flying = this.planes.filter((p) => p.state === 'fly').length;
    if (live.length && flying < 2 && t > this.nextArrival) {
      this.nextArrival = t + rand(1.5, 3.5);
      const fromLeft = chance(0.5);
      const np = this.make(fromLeft ? -30 : W + 30, rand(H * 0.15, H * 0.5), w, null, null);
      np.vx = (fromLeft ? 1 : -1) * F * 2.2;
      np.vy = rand(-0.3, 0.3) * F;
      np.flightEnd = t + rand(2, 4);
      this.planes.push(np);
    }
    for (const p of this.planes) {
      if (p.state === 'fold') {
        if (t - p.foldAt > 0.55) this.launch(p, w);
        continue;
      }
      if (p.state === 'perch') {
        if (!p.L || p.L.dead) {
          this.takeOff(p, w);
          continue;
        }
        const s = w.at(p.L, p.p!);
        p.x = s.x;
        p.y = s.y;
        if (t > p.nextFlight) this.takeOff(p, w);
        continue;
      }
      // flying: a lazy loop, steered by a slow wander and then towards a landing spot
      const speed = Math.hypot(p.vx, p.vy) || 1;
      let turn = noise(t * 0.5 + p.phase) * 2.4;
      if (p.loop > 0) {
        // a loop-the-loop: a fast, steady turn for one full circle
        const step = 5.5 * dt;
        turn = 5.5 * p.loopDir;
        p.loop -= step;
      }
      if (t > p.flightEnd && live.length && p.loop <= 0) {
        if (!p.target) {
          const L = pickOf(live);
          p.target = { L, p: pickOf(L.glyph.up) };
        }
        if (p.target.L.dead) p.target = null;
      }
      if (p.target) {
        const s = w.at(p.target.L, p.target.p);
        const want = Math.atan2(s.y - p.y, s.x - p.x);
        let diff = want - Math.atan2(p.vy, p.vx);
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        turn = diff * 4;
        if (Math.hypot(s.x - p.x, s.y - p.y) < F * 0.08) {
          p.state = 'perch';
          p.L = p.target.L;
          p.p = p.target.p;
          p.target = null;
          p.heading = Math.cos(Math.atan2(p.vy, p.vx)) >= 0 ? 0 : Math.PI;
          p.nextFlight = t + rand(4, 9);
          continue;
        }
      }
      // keep inside the page
      if (p.x < F * 0.5) turn += 1.5 * Math.sign(-p.vy || 1) * -1;
      if (p.x > W - F * 0.5) turn += 1.5 * Math.sign(p.vy || 1) * -1;
      if (p.y < F * 0.5 && p.vy < 0) turn += p.vx > 0 ? 2 : -2;
      if (p.y > H - F * 0.5 && p.vy > 0) turn += p.vx > 0 ? -2 : 2;
      const a = Math.atan2(p.vy, p.vx) + turn * dt;
      const sp = speed + (F * 2.2 - speed) * dt;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      // the pointer is a gust
      if (m.active > 0.2) {
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < F * 1.2) {
          const k = (1 - d / (F * 1.2)) ** 2 * m.active;
          p.vx += (dx / (d || 1)) * F * 14 * k * dt + m.vx * 600 * k * dt;
          p.vy += (dy / (d || 1)) * F * 14 * k * dt + m.vy * 600 * k * dt;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.heading = Math.atan2(p.vy, p.vx);
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 70) p.trail.shift();
    }
    // loose planes that never find a perch eventually glide off the page
    this.planes = this.planes.filter((p) => p.x > -200 && p.x < W + 200 && p.y > -200 && p.y < H + 200);
    if (this.planes.length > 14) this.planes.splice(0, this.planes.length - 14);
  }

  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    // dotted pencil trails behind the type
    back.fillStyle = 'rgba(42,37,34,0.45)';
    for (const p of this.planes) {
      for (let i = 0; i < p.trail.length; i += 3) {
        const q = p.trail[i];
        back.beginPath();
        back.arc(q.x, q.y, 1.3 * (i / p.trail.length) + 0.4, 0, TAU);
        back.fill();
      }
    }
    for (const p of this.planes) {
      if (p.state === 'fold') {
        this.folding(front, p, clamp((w.t - p.foldAt) / 0.55));
        continue;
      }
      const k = p.state === 'fly' && p.launched && w.t - p.launched < 0.3 ? 1 : easeOutBack(clamp((w.t - p.born) / 0.4), 1.8);
      this.plane(front, p, k, w.t);
      // whoosh lines for a moment after take-off
      const wt = w.t - p.launched;
      if (p.launched && wt < 0.35 && p.state === 'fly') {
        front.save();
        front.translate(p.x, p.y);
        front.rotate(p.heading);
        front.strokeStyle = `rgba(42,37,34,${0.6 * (1 - wt / 0.35)})`;
        front.lineWidth = 1.5;
        front.lineCap = 'round';
        for (const o of [-0.3, 0, 0.3]) {
          front.beginPath();
          front.moveTo(-p.size * (0.8 + wt * 2), o * p.size);
          front.lineTo(-p.size * (1.5 + wt * 2), o * p.size);
          front.stroke();
        }
        front.restore();
      }
    }
  }

  /** A square sheet folding itself into a plane: corners pull in, then the wings drop. */
  private folding(ctx: CanvasRenderingContext2D, p: Plane, u: number) {
    const s = p.size;
    const sheet: [number, number][] = [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]];
    const plane: [number, number][] = [[-0.5, -0.36], [0.6, 0], [-0.5, 0.34], [-0.36, 0.02]];
    const e = u < 0.5 ? (u / 0.5) ** 2 / 2 : 1 - ((1 - u) / 0.5) ** 2 / 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.heading * e + (1 - e) * 0.3);
    ctx.scale(1, 1 - Math.sin(u * Math.PI) * 0.35); // the paper flexes as it folds
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    sheet.forEach(([x, y], i) => {
      const [px, py] = plane[i];
      const X = (x + (px - x) * e) * s;
      const Y = (y + (py - y) * e) * s;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // the fold line appearing across the sheet
    ctx.beginPath();
    ctx.moveTo(-0.55 * s * (1 - e) + 0.55 * s * e, -0.55 * s * (1 - e));
    ctx.lineTo(-0.36 * s * e + 0.55 * s * (1 - e), 0.55 * s * (1 - e) + 0.02 * s * e);
    ctx.stroke();
    ctx.restore();
  }

  private plane(ctx: CanvasRenderingContext2D, p: Plane, k: number, t: number) {
    const s = p.size * k;
    if (s < 1) return;
    const perched = p.state === 'perch';
    ctx.save();
    ctx.translate(p.x, p.y);
    if (perched) {
      // parked: sitting on the stroke, nose resting slightly down, a little wobble
      ctx.translate(0, -s * 0.18);
      ctx.scale(Math.cos(p.heading) >= 0 ? 1 : -1, 1);
      ctx.rotate(0.08 + Math.sin(t * 2 + p.phase) * 0.03);
    } else {
      ctx.rotate(p.heading);
      // bank as it turns
      ctx.scale(1, 0.75 + 0.25 * Math.cos(t * 3 + p.phase));
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.strokeStyle = INK;
    // far wing (darker), body, near wing
    ctx.fillStyle = '#d9d2c4';
    ctx.beginPath();
    ctx.moveTo(s * 0.6, 0);
    ctx.lineTo(-s * 0.5, -s * 0.36);
    ctx.lineTo(-s * 0.3, -s * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.paper;
    ctx.beginPath();
    ctx.moveTo(s * 0.6, 0);
    ctx.lineTo(-s * 0.5, s * 0.34);
    ctx.lineTo(-s * 0.36, s * 0.02);
    ctx.lineTo(-s * 0.5, -s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // the crease
    ctx.beginPath();
    ctx.moveTo(s * 0.55, 0);
    ctx.lineTo(-s * 0.36, s * 0.02);
    ctx.stroke();
    ctx.restore();
  }

  reset() {
    this.planes = [];
    this.nextArrival = 0;
  }
}
