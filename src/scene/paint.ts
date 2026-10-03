// Paint: thick wet paint is poured over the tops of the letters and runs down the strokes.
// Style: glossy flat paint in a bright palette, a white sheen on every drip, round bulbs at the tips.
// Drips creep down slowly and keep growing while you wait; the odd drop lets go and splats below.
// Pointer: drips lean towards it like sticky paint. Click: a splat of a fresh colour.
// Backspace: the paint pulls back up into the letter.
import type { Effect, Letter, World, EdgePt } from './engine';
import { Spring, TAU, chance, clamp, easeIn, easeOutBack, easeOutCubic, pickOf, rand } from './kit';

const PAINT = ['#ff5a36', '#3d63e0', '#ffcf3f', '#ff8db5', '#5ccf8f', '#b58cff'];

type Drip = { p: EdgePt; len: number; w: number; start: number; dur: number; lean: Spring; dropAt: number; dropped: boolean };
type Data = { color: string; coat: EdgePt[]; drips: Drip[]; start: number };
type Drop = { x: number; y: number; vy: number; r: number; c: string; floor: number; splat: number };
type Splat = { x: number; y: number; r: number; c: string; t: number; blobs: { a: number; d: number; r: number }[] };

export class Paint implements Effect {
  readonly name = 'Paint';
  readonly hint = 'Click to throw some paint';
  private drops: Drop[] = [];
  private splats: Splat[] = [];

  grow(L: Letter, w: World) {
    const up = L.glyph.up;
    if (!up.length) {
      L.data = null;
      return;
    }
    const n = 1 + (chance(0.6) ? 1 : 0) + (chance(0.25) ? 1 : 0);
    const drips: Drip[] = [];
    for (let i = 0; i < n; i++) {
      drips.push({
        p: pickOf(up), len: rand(0.12, 0.5), w: rand(0.028, 0.048), start: w.t + 0.2 + i * 0.3, dur: rand(2.5, 6),
        lean: new Spring(30, 7), dropAt: w.t + rand(4, 10), dropped: false,
      });
    }
    L.data = { color: pickOf(PAINT), coat: up, drips, start: w.t } as Data;
  }

  wither() {}

  gone(L: Letter, w: World) {
    return w.t - L.diedAt > 0.25;
  }

  click(x: number, y: number, w: World) {
    const c = pickOf(PAINT);
    this.splats.push({ x, y, r: w.fontPx * rand(0.06, 0.09), c, t: w.t, blobs: Array.from({ length: 9 }, () => ({ a: rand(0, TAU), d: rand(0.9, 2.3), r: rand(0.12, 0.38) })) });
    if (this.splats.length > 14) this.splats.shift();
  }

  update(w: World) {
    const { t, dt, pointer: m, fontPx: F } = w;
    for (const L of w.letters) {
      const d = L.data as Data | null;
      if (!d || L.dead) continue;
      for (const dr of d.drips) {
        const base = w.at(L, dr.p);
        const tipY = base.y + dr.len * F * easeOutCubic((t - dr.start) / dr.dur);
        const near = Math.abs(m.y - tipY) < F * 0.6 && Math.abs(m.x - base.x) < F * 0.7 ? m.active : 0;
        dr.lean.step(near ? clamp((m.x - base.x) / F, -0.35, 0.35) : 0, dt);
        // a ripe drip lets a drop go
        if (!dr.dropped && t > dr.dropAt && t - dr.start > dr.dur) {
          dr.dropped = true;
          const tb = (w.letters.find((x) => !x.dead) ?? L);
          const floor = tb.y + (tb.glyph.asc + tb.glyph.desc) * tb.scale + F * rand(0.05, 0.2);
          this.drops.push({ x: base.x + dr.lean.v * F * 0.3, y: tipY, vy: 0, r: dr.w * F * 0.6, c: d.color, floor, splat: 0 });
        }
      }
    }
    for (const dp of this.drops) {
      if (dp.splat) continue;
      dp.vy += 900 * dt;
      dp.y += dp.vy * dt;
      if (dp.y >= dp.floor) {
        dp.y = dp.floor;
        dp.splat = t;
      }
    }
    this.drops = this.drops.filter((dp) => !dp.splat || t - dp.splat < 6);
  }

  draw(_back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    const { t, fontPx: F } = w;
    for (const s of this.splats) this.splat(front, s, t);
    for (const dp of this.drops) {
      front.fillStyle = dp.c;
      front.beginPath();
      if (dp.splat) {
        const k = easeOutBack(clamp((t - dp.splat) / 0.25), 2);
        front.ellipse(dp.x, dp.y, dp.r * 2.2 * k, dp.r * 0.7 * k, 0, 0, TAU);
      } else front.ellipse(dp.x, dp.y, dp.r, dp.r * 1.25, 0, 0, TAU);
      front.fill();
    }
    for (const L of w.letters) {
      const d = L.data as Data | null;
      if (!d) continue;
      // poured on, and pulled back up on delete
      const keep = L.dead ? 1 - easeIn(clamp((t - L.diedAt) / 0.22)) : 1;
      const pour = easeOutCubic((t - d.start) / 0.45) * keep;
      if (pour <= 0.01) continue;
      const coatR = F * 0.032 * pour;
      front.fillStyle = d.color;
      // the coat: a thick band of paint sitting on every top surface of the letter
      front.beginPath();
      for (const p of d.coat) {
        const s = w.at(L, p);
        front.moveTo(s.x + coatR, s.y + coatR * 0.2);
        front.arc(s.x, s.y + coatR * 0.2, coatR, 0, TAU);
      }
      front.fill();
      // drips running down from it
      for (const dr of d.drips) {
        const g = easeOutCubic((t - dr.start) / dr.dur) * keep;
        if (g <= 0.01) continue;
        const s = w.at(L, dr.p);
        const len = dr.len * F * g;
        const wd = dr.w * F * keep;
        const lean = dr.lean.v * F * 0.3 * g;
        const tipX = s.x + lean;
        const tipY = s.y + len;
        front.fillStyle = d.color;
        front.beginPath();
        front.moveTo(s.x - wd * 0.5, s.y);
        front.quadraticCurveTo(s.x - wd * 0.45, s.y + len * 0.6, tipX - wd * 0.38, tipY);
        front.lineTo(tipX + wd * 0.38, tipY);
        front.quadraticCurveTo(s.x + wd * 0.45, s.y + len * 0.6, s.x + wd * 0.5, s.y);
        front.closePath();
        front.fill();
        front.beginPath();
        front.arc(tipX, tipY, wd * 0.55, 0, TAU);
        front.fill();
        // sheen
        front.strokeStyle = 'rgba(255,255,255,0.55)';
        front.lineWidth = Math.max(1, wd * 0.16);
        front.lineCap = 'round';
        front.beginPath();
        front.moveTo(s.x - wd * 0.18, s.y + len * 0.15);
        front.quadraticCurveTo(s.x - wd * 0.18, s.y + len * 0.6, tipX - wd * 0.2, tipY - wd * 0.1);
        front.stroke();
        front.fillStyle = 'rgba(255,255,255,0.6)';
        front.beginPath();
        front.arc(tipX - wd * 0.2, tipY - wd * 0.12, wd * 0.12, 0, TAU);
        front.fill();
      }
    }
  }

  private splat(ctx: CanvasRenderingContext2D, s: Splat, t: number) {
    const k = easeOutBack(clamp((t - s.t) / 0.22), 2.2);
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * k, 0, TAU);
    for (const b of s.blobs) {
      const x = s.x + Math.cos(b.a) * s.r * b.d * k;
      const y = s.y + Math.sin(b.a) * s.r * b.d * k;
      ctx.moveTo(x + s.r * b.r * k, y);
      ctx.arc(x, y, s.r * b.r * k, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(s.x - s.r * 0.3 * k, s.y - s.r * 0.35 * k, s.r * 0.22 * k, s.r * 0.12 * k, -0.6, 0, TAU);
    ctx.fill();
  }

  reset() {
    this.drops = [];
    this.splats = [];
  }
}
