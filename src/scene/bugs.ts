// Bugs: ants and ladybugs go about their day on the type (and the type turns ladybug red).
// Style: small inked insects, ladybugs in glossy red with spots, legs that really step.
// They walk the actual outline of each letter. Every so often a column of ants marches along a
// wavy line under the word, some carrying leaf bits, and ladybugs take off on their own.
// Pointer: ants bolt away from it, ladybugs fly to another letter.
// Click: a strawberry drops in. Ants swarm it, take bites, and carry red bits home.
// Backspace: the bugs on that letter hop to its neighbour.
import type { Effect, Letter, World, EdgePt } from './engine';
import { contourRun } from './glyph';
import { TAU, chance, clamp, easeOutBack, lerp, pickOf, rand } from './kit';

const INK = '#1d1a17';
type Kind = 'ant' | 'lady';
type Treat = { x: number; y: number; vy: number; ground: number; landed: boolean; left: number; born: number; bites: { a: number; r: number }[] };
type Bug = {
  kind: Kind;
  L: Letter | null; // walking a letter's outline, or null while on the ground
  path: EdgePt[];
  s: number;
  dir: number;
  speed: number; // em / s
  x: number;
  y: number;
  ang: number;
  leg: number;
  born: number;
  flee: number;
  hop: { t0: number; dur: number; fx: number; fy: number; to: Letter; path: EdgePt[]; s: number; h: number; fly: boolean } | null;
  treat: Treat | null;
  eatUntil: number;
  carry: string | null; // a bit of leaf or strawberry on its back
  march: { x0: number; x1: number; y: number; delay: number; t0: number; dur: number; wave: number } | null;
  nextFlight: number;
};

function pathOn(L: Letter) {
  const run = contourRun(L.glyph, Math.round(rand(70, 140)));
  return run.filter((_, i) => i % 2 === 0);
}

export class Bugs implements Effect {
  readonly name = 'Bugs';
  readonly hint = 'Click to drop a strawberry';
  private bugs: Bug[] = [];
  private treats: Treat[] = [];
  private nextMarch = 0;

  grow(L: Letter, w: World) {
    L.data = true;
    if (chance(0.6)) this.spawn(L, 'ant', w);
    if (chance(0.35)) this.spawn(L, 'ant', w);
    if (chance(0.3)) this.spawn(L, 'lady', w);
    if (!this.nextMarch) this.nextMarch = w.t + rand(2, 4);
  }

  private blank(kind: Kind, w: World): Bug {
    return {
      kind, L: null, path: [], s: 0, dir: 1, speed: kind === 'ant' ? rand(0.5, 0.75) : rand(0.18, 0.28),
      x: 0, y: 0, ang: 0, leg: rand(0, TAU), born: w.t, flee: 0, hop: null, treat: null, eatUntil: 0,
      carry: null, march: null, nextFlight: w.t + rand(6, 14),
    };
  }

  private spawn(L: Letter, kind: Kind, w: World) {
    const path = pathOn(L);
    if (path.length < 10) return;
    const b = this.blank(kind, w);
    b.L = L;
    b.path = path;
    b.s = rand(0, path.length - 1);
    b.dir = chance(0.5) ? 1 : -1;
    this.bugs.push(b);
  }

  /** The slider landed: a ladybug lifts off from it and flies up to the word. */
  land(x: number, y: number, w: World) {
    const live = w.letters.filter((L) => !L.dead);
    if (!live.length) return;
    const b = this.blank('lady', w);
    b.x = x;
    b.y = y;
    this.bugs.push(b);
    this.hopTo(b, pickOf(live), w, 1.1, 1.2);
  }

  wither(L: Letter, w: World) {
    const others = w.letters.filter((o) => o !== L && !o.dead);
    for (const b of this.bugs) {
      if (b.L !== L || b.hop) continue;
      const to = others.sort((a, c) => Math.abs(a.x - L.x) - Math.abs(c.x - L.x))[0];
      if (to) this.hopTo(b, to, w, b.kind === 'lady' ? 0.6 : 0.25);
      else b.flee = -1; // nowhere to go: it wanders off
    }
  }

  gone(L: Letter) {
    return !this.bugs.some((b) => b.L === L && !b.hop && b.flee !== -1);
  }

  private hopTo(b: Bug, to: Letter, w: World, h: number, dur?: number) {
    const path = pathOn(to);
    if (path.length < 10) return;
    b.march = null;
    b.hop = { t0: w.t, dur: dur ?? (b.kind === 'lady' ? 0.9 : 0.55), fx: b.x, fy: b.y, to, path, s: rand(0, path.length - 1), h, fly: b.kind === 'lady' };
  }

  click(x: number, y: number, w: World) {
    const treat: Treat = { x, y: y - w.fontPx * 0.6, vy: 0, ground: y, landed: false, left: 1, born: w.t, bites: [] };
    this.treats.push(treat);
    let coming = 0;
    for (const b of this.bugs) {
      if (b.kind !== 'ant' || b.hop || b.flee === -1) continue;
      if (Math.hypot(b.x - x, b.y - y) < w.fontPx * 4.5) {
        b.treat = treat;
        b.march = null;
        coming++;
      }
    }
    // nobody close enough: a column marches in for it
    if (coming < 3) this.startMarch(w, treat);
  }

  /** A column of ants walks a wavy line under the word, from one side of the page to the other. */
  private startMarch(w: World, to: Treat | null = null) {
    const live = w.letters.filter((L) => !L.dead);
    const F = w.fontPx;
    const ground = live.length ? Math.max(...live.map((L) => L.y + (L.glyph.asc + L.glyph.desc * 0.4) * L.scale)) + F * 0.12 : w.H * 0.6;
    const fromLeft = to ? to.x > w.W / 2 : chance(0.5);
    const x0 = fromLeft ? -40 : w.W + 40;
    const x1 = to ? to.x : fromLeft ? w.W + 40 : -40;
    const n = 5 + ((Math.random() * 4) | 0);
    const dur = Math.abs(x1 - x0) / (F * 0.9);
    const leafy = !to && chance(0.6);
    for (let i = 0; i < n; i++) {
      const b = this.blank('ant', w);
      b.march = { x0, x1, y: to ? to.y : ground, delay: i * 0.32, t0: w.t, dur, wave: rand(0, TAU) };
      b.x = x0;
      b.y = ground;
      b.treat = to;
      b.carry = leafy && i % 2 === 0 ? '#5ea66a' : null;
      this.bugs.push(b);
    }
  }

  private pos(b: Bug, w: World) {
    const n = b.path.length;
    const i = clamp(Math.floor(b.s), 0, n - 2);
    const u = b.s - i;
    const a = b.path[i];
    const c = b.path[i + 1];
    const pa = w.at(b.L!, a);
    const pc = w.at(b.L!, c);
    const off = w.fontPx * (b.kind === 'ant' ? 0.016 : 0.036); // stand on the surface, not inside it
    const nx = lerp(a.nx, c.nx, u);
    const ny = lerp(a.ny, c.ny, u);
    return { x: lerp(pa.x, pc.x, u) + nx * off, y: lerp(pa.y, pc.y, u) + ny * off, ang: Math.atan2(pc.y - pa.y, pc.x - pa.x) + (b.dir < 0 ? Math.PI : 0) };
  }

  update(w: World) {
    const { t, dt, pointer: m, fontPx: F } = w;
    const live = w.letters.filter((L) => !L.dead);
    // something is always going on: a march every so often, ladybugs taking little flights
    if (live.length && this.nextMarch && t > this.nextMarch) {
      this.nextMarch = t + rand(8, 14);
      this.startMarch(w);
    }
    for (const tr of this.treats) {
      if (tr.landed) continue;
      tr.vy += 1600 * dt;
      tr.y += tr.vy * dt;
      // it drops in from just above where you clicked and lands right there
      if (tr.y >= tr.ground) {
        tr.y = tr.ground;
        tr.landed = true;
      }
    }
    for (const b of this.bugs) {
      b.leg += dt * (b.kind === 'ant' ? 22 : 12) * (b.flee > 0 ? 2 : 1);
      if (b.hop) {
        const u = clamp((t - b.hop.t0) / b.hop.dur);
        const to = b.hop.to;
        const q = b.hop.path[Math.floor(b.hop.s)];
        const target = { x: to.x + q.x * to.scale, y: to.y + q.y * to.scale };
        b.x = lerp(b.hop.fx, target.x, u);
        b.y = lerp(b.hop.fy, target.y, u) - Math.sin(u * Math.PI) * b.hop.h * F;
        b.ang = Math.atan2(target.y - b.hop.fy, target.x - b.hop.fx);
        if (u >= 1 || to.dead) {
          if (to.dead) {
            b.hop = null;
            b.flee = -1;
            continue;
          }
          b.L = to;
          b.path = b.hop.path;
          b.s = b.hop.s;
          b.hop = null;
          b.nextFlight = t + rand(6, 14);
        }
        continue;
      }
      if (b.flee === -1) {
        b.y += F * 0.6 * dt;
        b.ang = Math.PI / 2;
        continue;
      }
      if (b.march && !b.treat) {
        // marching under the word in single file
        const u = clamp((t - b.march.t0 - b.march.delay) / b.march.dur);
        const px = b.x;
        const py = b.y;
        b.x = lerp(b.march.x0, b.march.x1, u);
        b.y = b.march.y + Math.sin(u * 9 + b.march.wave) * F * 0.04;
        if (u > 0) b.ang = Math.atan2(b.y - py, b.x - px);
        if (u >= 1) b.flee = -1; // gone off the page
        continue;
      }
      if (b.treat) {
        const tr = b.treat;
        const dx = tr.x - b.x;
        const dy = tr.y - b.y;
        const d = Math.hypot(dx, dy);
        if (tr.left <= 0 && t > b.eatUntil) {
          // full: carry a red bit home
          b.treat = null;
          b.carry = '#e8392e';
          if (live.length) this.hopTo(b, pickOf(live), w, 0.35, 0.9);
          continue;
        }
        if (d > F * 0.09) {
          const v = F * (b.kind === 'ant' ? 1.1 : 0.5);
          b.x += (dx / d) * v * dt;
          b.y += (dy / d) * v * dt;
          b.ang = Math.atan2(dy, dx);
        } else {
          if (t > b.eatUntil && tr.left > 0) {
            b.eatUntil = t + rand(0.8, 1.4);
            tr.left -= 0.06;
            tr.bites.push({ a: Math.atan2(-dy, -dx) + rand(-0.4, 0.4), r: rand(0.18, 0.28) });
          }
          b.leg -= dt * 18; // standing still, munching
        }
        continue;
      }
      if (!b.L) continue;
      // walking the outline
      const near = m.active > 0.4 && Math.hypot(m.x - b.x, m.y - b.y) < F * 0.55;
      const others = live.filter((o) => o !== b.L);
      if (b.kind === 'lady' && others.length && (near || t > b.nextFlight)) {
        this.hopTo(b, pickOf(others), w, rand(0.6, 1));
        continue;
      }
      if (near && b.flee <= 0) {
        const ahead = this.pos({ ...b, s: clamp(b.s + b.dir * 3, 0, b.path.length - 1.01) }, w);
        if (Math.hypot(m.x - ahead.x, m.y - ahead.y) < Math.hypot(m.x - b.x, m.y - b.y)) b.dir *= -1;
        b.flee = 1.2;
      }
      b.flee = Math.max(0, b.flee - dt);
      const segPx = Math.max(0.5, b.L.scale * 4);
      b.s += (b.dir * b.speed * F * (b.flee > 0 ? 3 : 1) * dt) / segPx;
      if (b.s <= 0 || b.s >= b.path.length - 1.01) {
        b.s = clamp(b.s, 0, b.path.length - 1.01);
        b.dir *= -1;
      }
      if (chance(dt * 0.15)) b.s -= (b.dir * b.speed * F * dt) / segPx;
      const p = this.pos(b, w);
      b.x = p.x;
      b.y = p.y;
      b.ang = p.ang;
    }
    this.bugs = this.bugs.filter((b) => !(b.flee === -1 && (b.y > w.H + 30 || b.x < -60 || b.x > w.W + 60)));
    if (this.bugs.length > 60) this.bugs.splice(0, this.bugs.length - 60);
    this.treats = this.treats.filter((tr) => tr.left > 0 || this.bugs.some((b) => b.treat === tr));
  }

  draw(_back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World) {
    const F = w.fontPx;
    for (const tr of this.treats) this.strawberry(front, tr, F, w.t);
    for (const b of this.bugs) {
      const grow = clamp((w.t - b.born) / 0.3);
      if (grow <= 0) continue;
      front.save();
      front.translate(b.x, b.y);
      front.rotate(b.ang);
      front.scale(grow, grow);
      if (b.kind === 'ant') this.ant(front, F, b.leg, b.carry);
      else this.lady(front, F, b.leg, !!b.hop);
      front.restore();
    }
  }

  private strawberry(ctx: CanvasRenderingContext2D, tr: Treat, F: number, t: number) {
    const k = clamp(tr.left, 0, 1);
    const pop = easeOutBack(clamp((t - tr.born) / 0.3), 2);
    const R = F * 0.11 * pop * (0.45 + 0.55 * k);
    if (R < 1) return;
    ctx.save();
    ctx.translate(tr.x, tr.y - R * 0.9);
    ctx.rotate(Math.sin(t * 2 + tr.born) * 0.05);
    ctx.fillStyle = '#e8392e';
    ctx.strokeStyle = '#a3241c';
    ctx.lineWidth = Math.max(1.2, R * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, R * 1.05);
    ctx.bezierCurveTo(-R * 1.1, R * 0.4, -R * 1.05, -R * 0.75, 0, -R * 0.62);
    ctx.bezierCurveTo(R * 1.05, -R * 0.75, R * 1.1, R * 0.4, 0, R * 1.05);
    ctx.fill();
    ctx.stroke();
    // bites taken out of it
    ctx.fillStyle = '#ffffff';
    for (const b of tr.bites.slice(-8)) {
      ctx.beginPath();
      ctx.arc(Math.cos(b.a) * R * 0.85, Math.sin(b.a) * R * 0.75, R * b.r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe08a';
    for (const [x, y] of [[-0.4, -0.15], [0.05, -0.3], [0.42, -0.1], [-0.2, 0.25], [0.25, 0.3], [0, 0.65], [-0.5, 0.35], [0.5, 0.4]]) {
      ctx.beginPath();
      ctx.ellipse(x * R, y * R, R * 0.06, R * 0.09, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#4f9a5a';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      ctx.moveTo(0, -R * 0.6);
      ctx.quadraticCurveTo(Math.cos(a - 0.2) * R * 0.5, -R * 0.6 + Math.sin(a - 0.2) * R * 0.35, Math.cos(a) * R * 0.62, -R * 0.62 + Math.sin(a) * R * 0.32 + R * 0.12);
      ctx.quadraticCurveTo(Math.cos(a + 0.2) * R * 0.5, -R * 0.6 + Math.sin(a + 0.2) * R * 0.35, 0, -R * 0.6);
    }
    ctx.fill();
    ctx.strokeStyle = '#3c7d50';
    ctx.lineWidth = Math.max(1.4, R * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.62);
    ctx.quadraticCurveTo(R * 0.1, -R * 0.9, R * 0.25, -R * 1.0);
    ctx.stroke();
    ctx.restore();
  }

  private legs(ctx: CanvasRenderingContext2D, L: number, phase: number, spread: number, lw: number) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const swing = Math.sin(phase + i * 2.1 + (side > 0 ? Math.PI : 0)) * 0.35;
        const bx = (i - 1) * L * 0.18;
        const a = side * (Math.PI / 2) + swing + (i - 1) * 0.35 * side;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + Math.cos(a) * L * spread * 0.5, Math.sin(a) * L * spread * 0.5);
        ctx.lineTo(bx + Math.cos(a) * L * spread + L * 0.06 * Math.sign(Math.cos(a) || 1), Math.sin(a) * L * spread * 1.1);
        ctx.stroke();
      }
    }
  }

  private ant(ctx: CanvasRenderingContext2D, F: number, leg: number, carry: string | null) {
    const L = F * 0.1;
    this.legs(ctx, L, leg, 0.42, Math.max(1.1, F * 0.005));
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-L * 0.33, 0, L * 0.24, L * 0.16, 0, 0, TAU);
    ctx.ellipse(0, 0, L * 0.13, L * 0.1, 0, 0, TAU);
    ctx.ellipse(L * 0.25, 0, L * 0.12, L * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.9, F * 0.004);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(L * 0.32, s * L * 0.05);
      ctx.quadraticCurveTo(L * 0.5, s * L * 0.08, L * 0.56, s * L * 0.2 + Math.sin(leg * 0.5) * L * 0.03);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-L * 0.38, -L * 0.06, L * 0.08, L * 0.04, 0, 0, TAU);
    ctx.fill();
    if (carry) {
      // its prize, held up over its head
      ctx.fillStyle = carry;
      ctx.beginPath();
      if (carry === '#5ea66a') ctx.ellipse(L * 0.2, -L * 0.2, L * 0.28, L * 0.13, -0.5, 0, TAU);
      else ctx.arc(L * 0.25, -L * 0.18, L * 0.13, 0, TAU);
      ctx.fill();
    }
  }

  private lady(ctx: CanvasRenderingContext2D, F: number, leg: number, flying: boolean) {
    const L = F * 0.15;
    if (!flying) this.legs(ctx, L, leg, 0.38, Math.max(1.1, F * 0.0045));
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(L * 0.36, 0, L * 0.16, L * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(L * 0.42, s * L * 0.09, L * 0.035, 0, TAU);
      ctx.fill();
    }
    if (flying) {
      const buzz = Math.abs(Math.sin(leg * 3));
      ctx.fillStyle = 'rgba(230,240,255,0.75)';
      ctx.strokeStyle = 'rgba(29,26,23,0.35)';
      ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-L * 0.1, s * L * (0.35 + buzz * 0.15), L * 0.38, L * 0.16, s * 0.4, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, F * 0.0045);
    for (const s of [-1, 1]) {
      ctx.save();
      if (flying) ctx.rotate(s * 0.45);
      ctx.fillStyle = '#e8392e';
      ctx.beginPath();
      ctx.ellipse(-L * 0.05, 0, L * 0.36, L * 0.3, 0, s < 0 ? Math.PI : 0, s < 0 ? TAU : Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      for (const [x, y, r] of [[-0.18, 0.13, 0.07], [0.08, 0.17, 0.06], [-0.3, 0.05, 0.045]]) {
        ctx.beginPath();
        ctx.arc(x * L, s * y * L, r * L, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-L * 0.12, -L * 0.14, L * 0.08, L * 0.04, -0.3, 0, TAU);
    ctx.fill();
  }

  reset() {
    this.bugs = [];
    this.treats = [];
    this.nextMarch = 0;
  }
}
