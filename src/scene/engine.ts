// The scene: two full-page canvases, one behind the type and one in front, that the active effect
// draws into every frame. It tracks every letter on screen (where it is right now, its real shape),
// the pointer (position and speed), and hands effects a simple world to grow things in.
import { sampleGlyph, type Glyph, type EdgePt } from './glyph';

export type Letter = {
  id: number;
  el: HTMLElement;
  g: HTMLElement;
  c: string;
  glyph: Glyph;
  /** where the letter is this frame (frozen once it is deleted) */
  x: number; // content-area left, page px
  y: number; // content-area top, page px
  scale: number; // page px per glyph sample px
  dead: boolean;
  diedAt: number;
  born: number;
  data: any; // owned by the effect
};

export type Pointer = { x: number; y: number; vx: number; vy: number; speed: number; active: number };

export type World = {
  t: number;
  dt: number;
  W: number;
  H: number;
  fontPx: number;
  letters: Letter[];
  pointer: Pointer;
  /** page position of a sampled glyph point on a letter */
  at(L: Letter, p: { x: number; y: number }): { x: number; y: number };
};

export interface Effect {
  readonly name: string;
  readonly hint: string;
  grow(L: Letter, w: World, speed: number): void;
  wither(L: Letter, w: World): void;
  /** true once everything that grew on a dead letter has finished leaving */
  gone(L: Letter, w: World): boolean;
  click(x: number, y: number, w: World): void;
  update(w: World): void;
  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, w: World): void;
  reset(): void;
}

export type { Glyph, EdgePt };

export class Scene {
  private back: CanvasRenderingContext2D;
  private front: CanvasRenderingContext2D;
  private letters: Letter[] = [];
  private effect: Effect;
  private nextId = 1;
  private last = performance.now();
  private t = 0;
  private dpr = 1;
  private pointer: Pointer = { x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, active: 0 };
  private pointerTarget = 0;
  private fontPx = 100;
  private running = false;
  private lastMove = 0;
  private drawAcc = 1;
  private seed = 1;
  private noise = [...document.querySelectorAll('[data-boil]')];
  /** drawn frames per second (posterize time), and the boil re-draws its wobble every BOIL_EVERY frames: on twos */
  static FPS = 24;
  static BOIL_EVERY = 2;
  private frameNo = 0;

  constructor(
    readonly backCanvas: HTMLCanvasElement,
    readonly frontCanvas: HTMLCanvasElement,
    private text: HTMLElement,
    effect: Effect,
  ) {
    this.back = backCanvas.getContext('2d')!;
    this.front = frontCanvas.getContext('2d')!;
    this.effect = effect;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const dt = Math.max(e.timeStamp - this.lastMove || 16, 1);
      this.lastMove = e.timeStamp;
      const vx = (e.clientX - this.pointer.x) / dt;
      const vy = (e.clientY - this.pointer.y) / dt;
      if (this.pointer.x > -9000) {
        this.pointer.vx = this.pointer.vx * 0.7 + vx * 0.3;
        this.pointer.vy = this.pointer.vy * 0.7 + vy * 0.3;
      }
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointerTarget = 1;
    });
    document.documentElement.addEventListener('pointerleave', () => (this.pointerTarget = 0));
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    this.start();
  }

  private resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [this.backCanvas, this.frontCanvas]) {
      c.width = Math.round(innerWidth * this.dpr);
      c.height = Math.round(innerHeight * this.dpr);
    }
  }

  get hint() {
    return this.effect.hint;
  }

  get name() {
    return this.effect.name.toLowerCase();
  }

  setEffect(effect: Effect) {
    this.effect.reset();
    this.effect = effect;
    // everything on screen grows again in the new style
    this.letters = this.letters.filter((L) => !L.dead);
    this.letters.forEach((L, i) => {
      L.data = undefined;
      L.born = this.t + i * 0.035;
      setTimeout(() => L.el.isConnected && effect.grow(L, this.world(), 1), i * 35);
    });
  }

  private fontInfo() {
    const cs = getComputedStyle(this.text);
    this.fontPx = parseFloat(cs.fontSize);
    return { family: cs.fontFamily, weight: cs.fontWeight };
  }

  add(el: HTMLElement, c: string, speed = 1) {
    const g = el.querySelector('.g') as HTMLElement | null;
    if (!g) return;
    const f = this.fontInfo();
    const L: Letter = {
      id: this.nextId++, el, g, c,
      glyph: sampleGlyph(c, f.family, f.weight),
      x: 0, y: 0, scale: 1, dead: false, diedAt: 0, born: this.t, data: undefined,
    };
    this.place(L);
    this.letters.push(L);
    this.effect.grow(L, this.world(), speed);
  }

  remove(el: HTMLElement, rect: DOMRect) {
    const L = this.letters.find((l) => l.el === el && !l.dead);
    if (!L) return;
    this.place(L, rect);
    L.dead = true;
    L.diedAt = this.t;
    this.effect.wither(L, this.world());
  }

  /** The font changed: resample shapes so growth stays on the real outlines. */
  refont() {
    const f = this.fontInfo();
    for (const L of this.letters) if (!L.dead) L.glyph = sampleGlyph(L.c, f.family, f.weight);
  }

  click(x: number, y: number) {
    this.effect.click(x, y, this.world());
  }

  private place(L: Letter, rect?: DOMRect) {
    const r = rect ?? L.g.getBoundingClientRect(); // a deleted letter: its .ch box is its .g box
    L.scale = this.fontPx / L.glyph.size;
    const contentH = (L.glyph.asc + L.glyph.desc) * L.scale;
    L.x = r.left;
    L.y = r.top + (r.height - contentH) / 2; // inline-block line box: content sits in the middle
  }

  private world(): World {
    return {
      t: this.t,
      dt: 0,
      W: innerWidth,
      H: innerHeight,
      fontPx: this.fontPx,
      letters: this.letters,
      pointer: this.pointer,
      at: (L, p) => ({ x: L.x + p.x * L.scale, y: L.y + p.y * L.scale }),
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.t += dt;
      this.frame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
  }

  private frame(dt: number) {
    this.fontInfo();
    const p = this.pointer;
    p.active += (this.pointerTarget - p.active) * Math.min(1, dt * 6);
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.speed = Math.hypot(p.vx, p.vy);
    for (const L of this.letters) if (!L.dead) this.place(L);

    const w = this.world();
    w.dt = dt;
    this.effect.update(w);
    this.letters = this.letters.filter((L) => !L.dead || !this.effect.gone(L, w));
    w.letters = this.letters;

    // posterize: redraw on a 24 fps beat; the boil changes on twos (12 a second), like hand-drawn animation
    this.drawAcc += dt;
    if (this.drawAcc < 1 / Scene.FPS) return;
    this.drawAcc %= 1 / Scene.FPS;
    if (this.frameNo++ % Scene.BOIL_EVERY === 0) {
      this.seed = (this.seed % 7) + 1; // a handful of seeds, cycled, reads as a steady boil
      for (const n of this.noise) n.setAttribute('seed', String(this.seed));
    }
    for (const ctx of [this.back, this.front]) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    this.effect.draw(this.back, this.front, w);
  }
}
