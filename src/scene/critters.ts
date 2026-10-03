// Critters: small cartoon tenants move into the letters.
// Style: chunky flat blobs with a bold ink outline, big eyes, blush, a few kinds of headgear.
// They sit on the tops of strokes or cling to the sides. Their eyes follow the pointer, they blink
// and breathe, and every so often one hops over to visit the next letter. Bring the cursor close
// and they duck, eyes squeezed shut. Click: the ones nearby jump.
// Backspace: a critter whose letter disappears leaps to the letter beside it instead of vanishing.
import type { Effect, Letter, World, EdgePt } from './engine';
import { Spring, TAU, chance, clamp, easeOutBack, lerp, noise, pickOf, rand } from './kit';

const INK = '#191716';
const COLORS = ['#ff5a36', '#3d63e0', '#ffd23f', '#6fcf8a', '#ff8db5', '#b58cff', '#ff9f43'];
type Hat = 'none' | 'ears' | 'antenna' | 'horns' | 'sprout';

type Critter = {
  home: Letter;
  p: EdgePt;
  mode: 'sit' | 'cling';
  size: number; // body width in em
  tall: number;
  color: string;
  hat: Hat;
  born: number;
  blinkAt: number;
  blinkT: number;
  duck: Spring;
  lookX: Spring;
  lookY: Spring;
  phase: number;
  // a hop between two spots (visiting, escaping, or a happy jump in place)
  hop: { t0: number; dur: number; fx: number; fy: number; to: Letter; tp: EdgePt; h: number; spin: number } | null;
  nextVisit: number;
  happyUntil: number;
  leaving: number; // >0 when it has nowhere to go and is shrinking away
};
type Dust = { x: number; y: number; vx: number; vy: number; r: number; life: number };

export class Critters implements Effect {
  readonly name = 'Critters';
  readonly hint = 'Click to make them jump';
  private crew: Critter[] = [];
  private dust: Dust[] = [];

  grow(L: Letter, w: World) {
    L.data = true;
    const tops = L.glyph.up;
    // not every letter gets a tenant: a crowd stops being cute
    const crowd = this.crew.filter((c) => !c.leaving).length;
    if (tops.length && (chance(0.62) || crowd === 0)) this.crew.push(this.make(L, pickOf(tops), 'sit', w.t));
    const sides = L.glyph.edges.filter((e) => Math.abs(e.nx) > 0.85 && e.y > L.glyph.asc * 0.35 && e.y < L.glyph.asc * 0.85);
    if (sides.length && chance(0.14)) this.crew.push(this.make(L, pickOf(sides), 'cling', w.t + 0.15));
  }

  private make(L: Letter, p: EdgePt, mode: Critter['mode'], t: number): Critter {
    return {
      home: L, p, mode,
      size: mode === 'cling' ? rand(0.13, 0.17) : rand(0.15, 0.24),
      tall: rand(0.85, 1.15),
      color: pickOf(COLORS),
      hat: pickOf<Hat>(['none', 'ears', 'antenna', 'horns', 'sprout', 'ears']),
      born: t,
      blinkAt: t + rand(1, 4),
      blinkT: -1,
      duck: new Spring(120, 12),
      lookX: new Spring(40, 9),
      lookY: new Spring(40, 9),
      phase: rand(0, 100),
      hop: null,
      nextVisit: t + rand(6, 14),
      happyUntil: 0,
      leaving: 0,
    };
  }

  wither(L: Letter, w: World) {
    // tenants of a deleted letter leap to the nearest letter still standing
    for (const c of this.crew) {
      if (c.home !== L || c.leaving) continue;
      const to = this.neighbour(L, w);
      if (to) this.jump(c, to, pickOf(to.glyph.up), w, 0.42, 0.45);
      else c.leaving = w.t;
    }
  }

  gone(L: Letter) {
    return !this.crew.some((c) => c.home === L && c.hop === null);
  }

  private neighbour(L: Letter, w: World): Letter | null {
    let best: Letter | null = null;
    let bd = Infinity;
    for (const o of w.letters) {
      if (o === L || o.dead || !o.glyph.up.length) continue;
      const d = Math.hypot(o.x - L.x, (o.y - L.y) * 2);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private spot(c: Critter, w: World) {
    const b = w.at(c.home, c.p);
    if (c.mode === 'cling') return { x: b.x + c.p.nx * c.size * w.fontPx * 0.42, y: b.y };
    return b;
  }

  private jump(c: Critter, to: Letter, tp: EdgePt, w: World, h: number, dur: number) {
    const from = this.spot(c, w);
    c.hop = { t0: w.t, dur, fx: from.x, fy: from.y, to, tp, h, spin: chance(0.3) ? (chance(0.5) ? 1 : -1) : 0 };
    c.mode = 'sit';
  }

  click(x: number, y: number, w: World) {
    for (const c of this.crew) {
      if (c.hop || c.leaving) continue;
      const s = this.spot(c, w);
      if (Math.hypot(s.x - x, s.y - y) > w.fontPx * 3) continue;
      c.happyUntil = w.t + 1.2;
      setTimeout(() => !c.hop && this.jump(c, c.home, c.p, w, rand(0.35, 0.6), rand(0.45, 0.6)), rand(0, 160));
    }
  }

  update(w: World) {
    const { t, dt, pointer: m, fontPx: F } = w;
    for (const c of this.crew) {
      if (c.hop) {
        if (t - c.hop.t0 >= c.hop.dur) {
          // landing: little dust puff, settle on the new spot
          c.home = c.hop.to;
          c.p = c.hop.tp;
          c.hop = null;
          c.duck.v = 0.35; // squash on landing
          const s = this.spot(c, w);
          for (let i = 0; i < 5; i++) this.dust.push({ x: s.x + rand(-8, 8), y: s.y, vx: rand(-50, 50), vy: rand(-30, -5), r: rand(2, 4), life: 1 });
        }
        continue;
      }
      const s = this.spot(c, w);
      const eyeY = s.y - c.size * c.tall * F * 0.7;
      const dx = m.x - s.x;
      const dy = m.y - eyeY;
      const d = Math.hypot(dx, dy);
      // shy: duck when the cursor comes right up to them
      const close = m.active > 0.5 && d < c.size * F * 1.6;
      c.duck.step(close ? 1 : 0, dt);
      // eyes follow the pointer, or wander when it is away
      const lx = m.active > 0.3 ? clamp(dx / (F * 1.2), -1, 1) : noise(t * 0.4 + c.phase);
      const ly = m.active > 0.3 ? clamp(dy / (F * 1.2), -1, 1) : noise(t * 0.33 + c.phase + 9) * 0.5;
      c.lookX.step(lx, dt);
      c.lookY.step(ly, dt);
      if (t > c.blinkAt) {
        c.blinkT = t;
        c.blinkAt = t + (chance(0.2) ? 0.25 : rand(2, 5)); // the odd double blink
      }
      // now and then, visit the neighbours
      if (!c.home.dead && t > c.nextVisit && !close) {
        c.nextVisit = t + rand(7, 15);
        const others = w.letters.filter((o) => o !== c.home && !o.dead && o.glyph.up.length && Math.abs(o.x - c.home.x) < F * 1.6 && Math.abs(o.y - c.home.y) < F * 0.5);
        if (others.length) this.jump(c, pickOf(others), pickOf(pickOf(others).glyph.up), w, rand(0.35, 0.55), rand(0.5, 0.7));
      }
    }
    // shrink away only when there was nowhere to jump to
    this.crew = this.crew.filter((c) => !(c.leaving && t - c.leaving > 0.22) && !(c.hop === null && c.home.dead && !c.leaving));
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 0.92;
      d.vy *= 0.92;
      d.life -= dt * 2.4;
    }
    this.dust = this.dust.filter((d) => d.life > 0);
  }

  draw(_back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    const { t, fontPx: F } = w;
    for (const d of this.dust) {
      front.fillStyle = '#d9d2c7';
      front.beginPath();
      front.arc(d.x, d.y, d.r * d.life, 0, TAU);
      front.fill();
    }
    for (const c of this.crew) {
      let x: number;
      let y: number;
      let rot = 0;
      let air = 0;
      if (c.hop) {
        const u = clamp((t - c.hop.t0) / c.hop.dur);
        const to = c.hop.to.dead ? { x: c.hop.fx, y: c.hop.fy } : w.at(c.hop.to, c.hop.tp);
        x = lerp(c.hop.fx, to.x, u);
        y = lerp(c.hop.fy, to.y, u) - Math.sin(u * Math.PI) * c.hop.h * F;
        rot = c.hop.spin * u * TAU;
        air = Math.sin(u * Math.PI);
      } else {
        const s = this.spot(c, w);
        x = s.x;
        y = s.y;
      }
      const grow = easeOutBack(clamp((t - c.born) / 0.5), 2.2);
      const leave = c.leaving ? 1 - clamp((t - c.leaving) / 0.2) : 1;
      const k = grow * leave;
      if (k <= 0.01) continue;
      this.body(front, c, x, y, rot, air, k, t, F);
    }
  }

  private body(ctx: CanvasRenderingContext2D, c: Critter, x: number, y: number, rot: number, air: number, k: number, t: number, F: number) {
    const W = c.size * F * k;
    const breathe = Math.sin(t * 2.2 + c.phase) * 0.03;
    const duck = clamp(c.duck.v, -0.4, 1.2);
    // squash and stretch: ducking squashes, being airborne stretches
    const sy = c.tall * (1 + breathe - duck * 0.32 + air * 0.18);
    const sx = 1 - breathe * 0.6 + duck * 0.22 - air * 0.1;
    const H = W * sy;
    const Wx = W * sx;
    const lw = Math.max(1.6, W * 0.06);
    ctx.save();
    ctx.translate(x, y);
    if (c.mode === 'cling') ctx.rotate(c.p.nx > 0 ? 0.12 : -0.12);
    ctx.rotate(rot);
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // feet (or hands gripping the stroke when clinging)
    ctx.fillStyle = INK;
    if (c.mode === 'cling') {
      const side = -Math.sign(c.p.nx || 1);
      for (const yy of [-0.65, -0.3]) {
        ctx.beginPath();
        ctx.ellipse(side * Wx * 0.5, yy * H, W * 0.09, W * 0.06, 0, 0, TAU);
        ctx.fill();
      }
    } else {
      for (const xx of [-0.22, 0.22]) {
        ctx.beginPath();
        ctx.ellipse(xx * Wx, -W * 0.02, W * 0.11, W * 0.06, 0, 0, TAU);
        ctx.fill();
      }
    }

    // headgear behind the body outline
    const top = -H;
    if (c.hat === 'ears') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(s * Wx * 0.3, top + H * 0.12, W * 0.14, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    } else if (c.hat === 'horns') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff3d6';
        ctx.beginPath();
        ctx.moveTo(s * Wx * 0.18, top + H * 0.12);
        ctx.lineTo(s * Wx * 0.3, top - H * 0.12);
        ctx.lineTo(s * Wx * 0.38, top + H * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // body: a soft blob, slightly wider at the bottom
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(Wx * 0.62, 0, Wx * 0.56, top * 0.55, Wx * 0.42, top * 0.82);
    ctx.bezierCurveTo(Wx * 0.3, top * 1.02, -Wx * 0.3, top * 1.02, -Wx * 0.42, top * 0.82);
    ctx.bezierCurveTo(-Wx * 0.56, top * 0.55, -Wx * 0.62, 0, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // a little shine
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-Wx * 0.24, top * 0.72, W * 0.07, W * 0.11, -0.4, 0, TAU);
    ctx.fill();

    if (c.hat === 'antenna') {
      const sway = Math.sin(t * 3 + c.phase) * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, top * 0.98);
      ctx.quadraticCurveTo(W * 0.05, top - H * 0.2, Math.sin(sway) * W * 0.18, top - H * 0.32);
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(Math.sin(sway) * W * 0.18, top - H * 0.32, W * 0.065, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (c.hat === 'sprout') {
      ctx.beginPath();
      ctx.moveTo(0, top * 0.98);
      ctx.lineTo(0, top - H * 0.14);
      ctx.stroke();
      ctx.fillStyle = '#6fcf8a';
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(0, top - H * 0.14);
        ctx.rotate(s * (0.7 + Math.sin(t * 2 + c.phase) * 0.12));
        ctx.beginPath();
        ctx.ellipse(0, -W * 0.09, W * 0.06, W * 0.1, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // face
    const ex = Wx * 0.2;
    const ey = top * 0.6;
    const er = W * 0.13;
    const blinking = c.blinkT > 0 && t - c.blinkT < 0.12;
    const happy = t < c.happyUntil;
    const lookX = clamp(c.lookX.v, -1, 1) * er * 0.45;
    const lookY = clamp(c.lookY.v, -1, 1) * er * 0.4;
    for (const s of [-1, 1]) {
      const cx = s * ex + lookX * 0.25;
      if (duck > 0.45) {
        // squeezed shut: > <
        ctx.beginPath();
        ctx.moveTo(cx - s * er * 0.6, ey - er * 0.5);
        ctx.lineTo(cx + s * er * 0.4, ey);
        ctx.lineTo(cx - s * er * 0.6, ey + er * 0.5);
        ctx.stroke();
      } else if (blinking || happy) {
        // closed or smiling eyes: a curve
        ctx.beginPath();
        if (happy) ctx.arc(cx, ey + er * 0.2, er * 0.6, Math.PI * 1.15, Math.PI * 1.85);
        else ctx.moveTo(cx - er * 0.7, ey), ctx.lineTo(cx + er * 0.7, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, ey, er, er * 1.1, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cx + lookX, ey + lookY, er * 0.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx + lookX - er * 0.18, ey + lookY - er * 0.2, er * 0.16, 0, TAU);
        ctx.fill();
      }
    }
    // blush and mouth
    ctx.fillStyle = 'rgba(255,120,140,0.55)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * Wx * 0.34, ey + er * 1.15, W * 0.07, W * 0.04, 0, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    if (happy || air > 0.2) {
      ctx.fillStyle = '#7a1f2b';
      ctx.ellipse(lookX * 0.2, ey + er * 1.35, W * 0.06, W * 0.075, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (duck > 0.45) {
      ctx.moveTo(-W * 0.05, ey + er * 1.35);
      ctx.lineTo(W * 0.05, ey + er * 1.35);
      ctx.stroke();
    } else {
      ctx.arc(lookX * 0.2, ey + er * 1.0, W * 0.07, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  reset() {
    this.crew = [];
    this.dust = [];
  }
}
