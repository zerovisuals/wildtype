// Snow: it is snowing on the page, and the snow settles on your words.
// Style: white snow with a cool blue-grey ink line, little six-armed flakes, soft round banks.
// Flakes land on the real tops of the strokes and pile up into caps. The pointer is wind: it pushes
// falling flakes around, and a fast swipe across a letter blows its snow off.
// Click: shakes the snow off nearby letters in a puff. Backspace: the cap drops off in clumps.
import type { Effect, Letter, World } from './engine';
import { TAU, chance, clamp, noise, rand } from './kit';

const LINE = '#9fb7d3';
const SNOW = '#ffffff';
const MAX_PILE = 15; // glyph px at sample size (~0.12 em)

type Flake = { x: number; y: number; vx: number; vy: number; r: number; star: boolean; rot: number; spin: number; front: boolean; phase: number; clump?: boolean; life: number };
type Data = { h: Float32Array; order: number[] };

export class Snow implements Effect {
  readonly name = 'Snow';
  readonly hint = 'Click to shake the snow off';
  private flakes: Flake[] = [];
  private spawnAcc = 0;

  grow(L: Letter, w: World) {
    const up = L.glyph.up;
    L.data = { h: new Float32Array(up.length), order: up.map((_, i) => i).sort((a, b) => up[a].x - up[b].x) } as Data;
    // a small flurry right above a new letter so it whitens up quickly
    const top = w.at(L, { x: L.glyph.width / 2, y: 0 });
    for (let i = 0; i < 10; i++) this.flakes.push(this.flake(top.x + rand(-0.4, 0.4) * L.glyph.width * L.scale, top.y - rand(20, 120), w, true));
  }

  private flake(x: number, y: number, w: World, front = chance(0.7)): Flake {
    const big = chance(0.18);
    return { x, y, vx: rand(-8, 8), vy: rand(28, 55), r: big ? rand(4, 6.5) : rand(1.6, 3.2), star: big, rot: rand(0, TAU), spin: rand(-1, 1), front, phase: rand(0, 100), life: 1 };
    void w;
  }

  wither(L: Letter, w: World) {
    const d = L.data as Data | undefined;
    if (!d) return;
    // the cap drops off in clumps
    L.glyph.up.forEach((p, i) => {
      if (d.h[i] < 3 || i % 3) return;
      const s = w.at(L, p);
      this.flakes.push({ x: s.x, y: s.y - d.h[i] * L.scale * 0.5, vx: rand(-30, 30), vy: rand(-20, 20), r: clamp(d.h[i] * L.scale * 0.45, 2, 9), star: false, rot: 0, spin: 0, front: true, phase: 0, clump: true, life: 1 });
    });
    d.h.fill(0);
  }

  gone() {
    return true;
  }

  click(x: number, y: number, w: World) {
    for (const L of w.letters) {
      const d = L.data as Data | undefined;
      if (!d || L.dead) continue;
      L.glyph.up.forEach((p, i) => {
        if (d.h[i] < 1) return;
        const s = w.at(L, p);
        const dist = Math.hypot(s.x - x, s.y - y);
        if (dist > w.fontPx * 2.4) return;
        const k = 1 - dist / (w.fontPx * 2.4);
        if (i % 2 === 0) for (let j = 0; j < 2; j++) this.flakes.push({ ...this.flake(s.x, s.y - d.h[i] * L.scale, w, true), vx: (s.x - x) * 1.5 + rand(-40, 40), vy: rand(-160, -60) * k });
        d.h[i] *= 1 - k;
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      this.flakes.push({ ...this.flake(x, y, w, true), vx: Math.cos(a) * rand(60, 160), vy: Math.sin(a) * rand(60, 160) - 60 });
    }
  }

  update(w: World) {
    const { t, dt, pointer: m, W, H } = w;
    // keep it snowing
    this.spawnAcc += dt * 22;
    while (this.spawnAcc > 1 && this.flakes.length < 260) {
      this.spawnAcc -= 1;
      this.flakes.push(this.flake(rand(-20, W + 20), -10, w));
    }
    const wind = noise(t * 0.15) * 14;
    for (const f of this.flakes) {
      f.phase += dt;
      // the pointer is wind: flakes near it get pushed along with its motion and away from it
      if (m.active > 0.1) {
        const dx = f.x - m.x;
        const dy = f.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < 170) {
          const k = (1 - d / 170) ** 2 * m.active;
          f.vx += (m.vx * 900 * k + (dx / (d || 1)) * 220 * k) * dt;
          f.vy += (m.vy * 900 * k + (dy / (d || 1)) * 220 * k) * dt;
        }
      }
      const fall = f.clump ? 260 : f.r * 12 + 20;
      f.vx += (wind + Math.sin(f.phase * 1.7 + f.x * 0.01) * 10 - f.vx) * dt * 1.4;
      f.vy += (fall - f.vy) * dt * (f.clump ? 3 : 1.2);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
    }

    // settle flakes onto letter tops
    for (const L of w.letters) {
      const d = L.data as Data | undefined;
      if (!d || L.dead) continue;
      const up = L.glyph.up;
      const left = L.x;
      const right = L.x + L.glyph.width * L.scale;
      const top = L.y;
      const bottom = L.y + (L.glyph.asc + L.glyph.desc) * L.scale;
      for (const f of this.flakes) {
        if (f.clump || f.vy <= 0 || f.x < left || f.x > right || f.y < top - 30 || f.y > bottom) continue;
        const gx = (f.x - L.x) / L.scale;
        const gy = (f.y - L.y) / L.scale;
        for (let i = 0; i < up.length; i++) {
          const p = up[i];
          if (Math.abs(p.x - gx) > 2.5) continue;
          const surface = p.y - d.h[i];
          if (gy >= surface - 2 && gy <= p.y + 3) {
            if (d.h[i] < MAX_PILE) d.h[i] += f.r * 0.9;
            f.life = 0;
            break;
          }
        }
      }
      // a fast swipe right over a letter blows its snow off
      if (m.active > 0.5 && m.speed > 1.1 && m.x > left - 20 && m.x < right + 20 && m.y > top - 40 && m.y < bottom) {
        up.forEach((p, i) => {
          if (d.h[i] < 2) return;
          const s = w.at(L, p);
          if (Math.abs(s.x - m.x) > 40) return;
          if (i % 3 === 0) this.flakes.push({ ...this.flake(s.x, s.y - d.h[i] * L.scale, w, true), vx: m.vx * 400 + rand(-40, 40), vy: m.vy * 300 - rand(40, 90) });
          d.h[i] *= 0.6;
        });
      }
      // let piles slump into each other so caps read as one soft bank, not a comb
      const o = d.order;
      for (let k = 1; k < o.length - 1; k++) {
        const a = o[k - 1], b = o[k], c = o[k + 1];
        if (Math.abs(up[a].x - up[b].x) < 4 && Math.abs(up[c].x - up[b].x) < 4 && Math.abs(up[a].y - up[c].y) < 6) d.h[b] += ((d.h[a] + d.h[c]) / 2 - d.h[b]) * dt * 3;
      }
    }
    this.flakes = this.flakes.filter((f) => f.life > 0 && f.y < H + 20 && f.x > -60 && f.x < W + 60);
  }

  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    for (const f of this.flakes) this.drawFlake(f.front ? front : back, f);
    // snow caps: blobs of white over a slightly larger blue-grey layer, which reads as one inked outline
    for (const L of w.letters) {
      const d = L.data as Data | undefined;
      if (!d || L.dead) continue;
      for (const pass of [0, 1]) {
        front.fillStyle = pass ? SNOW : LINE;
        front.beginPath();
        L.glyph.up.forEach((p, i) => {
          const h = d.h[i];
          if (h < 0.8) return;
          const s = w.at(L, p);
          const r = Math.max(h * L.scale * 0.62, 2.2) + (pass ? 0 : 1.6);
          const cy = s.y - h * L.scale * 0.42;
          front.moveTo(s.x + r, cy);
          front.arc(s.x, cy, r, 0, TAU);
        });
        front.fill();
      }
    }
  }

  private drawFlake(ctx: CanvasRenderingContext2D, f: Flake) {
    if (f.star) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * f.r, Math.sin(a) * f.r);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.fillStyle = SNOW;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  reset() {
    this.flakes = [];
  }
}
