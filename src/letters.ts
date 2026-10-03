import gsap from 'gsap';
import { COMMON } from './groups';

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rotating picker: never repeats any of the last few picks, so a trail is always varied. */
const recent: string[] = [];
export function pick(list: string[]): string {
  let e = list[(Math.random() * list.length) | 0];
  for (let i = 0; i < 12 && recent.includes(e); i++) e = list[(Math.random() * list.length) | 0];
  recent.push(e);
  if (recent.length > Math.min(5, list.length - 1)) recent.shift();
  return e;
}

/** Warm up the emoji font with the common pool so the first pops never land on a blank. */
export function preload() {
  document.fonts?.load('40px "Noto Color Emoji"', COMMON.join('')).catch(() => {});
}

/**
 * Emojis are drawn as text with the device's emoji font: real Apple emojis on Apple devices
 * (Apple Color Emoji), Noto Color Emoji everywhere else. Nothing proprietary ships with the site.
 */
export function emojiImg(e: string, cls = 'em') {
  const el = document.createElement('span');
  el.className = `emo ${cls}`;
  el.textContent = e;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** One character: <span.ch><span.g>a</span></span>. */
export function makeChar(c: string) {
  const ch = document.createElement('span');
  ch.className = 'ch';
  const g = document.createElement('span');
  g.className = 'g';
  g.textContent = c;
  ch.append(g);
  return ch;
}

const busy = new WeakSet<HTMLElement>();

type PopOpts = { scale?: number; delay?: number; speed?: number; keepOut?: boolean };
export type Pop = { release: (quick?: boolean) => void };

/**
 * The wabi move in two halves. pop() fades the letter while the emoji grows in over it and holds
 * until release(), which shrinks the emoji away as the letter fades back in underneath.
 * `speed` < 1 compresses everything (fast typing). `keepOut` leaves the letter hidden (deletes).
 */
export function pop(ch: HTMLElement, emoji: string, opts: PopOpts = {}): Pop | null {
  if (busy.has(ch) || ch.textContent === ' ' || ch.classList.contains('nl')) return null;
  busy.add(ch);
  const g = ch.querySelector('.g') as HTMLElement;
  const img = emojiImg(emoji);
  ch.append(img);
  const ts = opts.speed && opts.speed < 1 ? 1 / opts.speed : 1;
  const scale = opts.scale ?? gsap.utils.random(0.94, 1.06);
  const rot = gsap.utils.random(-6, 6);
  const delay = opts.delay ?? 0;

  const inTl = gsap.timeline({ delay }).timeScale(ts);
  if (reduced) inTl.set(g, { opacity: 0 }).fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.15 });
  else {
    inTl.to(g, { opacity: 0, duration: 0.14, ease: 'power1.out' }, 0)
      .fromTo(img,
        { scale: scale * 0.72, rotation: rot * 1.6, opacity: 0, '--b': 2.5 },
        { scale, rotation: rot, opacity: 1, '--b': 0, duration: 0.3, ease: 'back.out(1.5)' }, 0);
  }

  let released = false;
  return {
    release(quick = false) {
      if (released) return;
      released = true;
      // never cut the arrival short: wait for it, then leave (faster after a quick swipe)
      const wait = Math.max(0, (inTl.endTime() - gsap.globalTimeline.time()) );
      const out = gsap.timeline({
        delay: Math.min(wait, quick ? 0.12 : 0.3),
        onComplete: () => {
          img.remove();
          busy.delete(ch);
        },
      }).timeScale(ts * (quick ? 1.6 : 1));
      if (reduced) {
        out.to(img, { opacity: 0, duration: 0.2 });
        if (!opts.keepOut) out.to(g, { opacity: 1, duration: 0.2 }, '<');
        return;
      }
      out.to(img, { scale: scale * 0.7, opacity: 0, '--b': 2.5, duration: 0.26, ease: 'power2.inOut' });
      if (!opts.keepOut) {
        out.fromTo(g, { opacity: 0, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.28, ease: 'power1.out', clearProps: 'filter' }, '<+0.04');
      }
    },
  };
}

/** Timed version: pop in, hold, leave. Returns a promise-like handle via onDone. */
export function swap(ch: HTMLElement, emoji: string, opts: PopOpts & { hold?: number; onDone?: () => void } = {}) {
  const p = pop(ch, emoji, opts);
  if (!p) return null;
  const ts = opts.speed && opts.speed < 1 ? opts.speed : 1;
  const hold = (opts.hold ?? gsap.utils.random(0.4, 0.55)) * ts;
  gsap.delayedCall((opts.delay ?? 0) + 0.3 * ts + hold, () => {
    p.release();
    if (opts.onDone) gsap.delayedCall(0.6 * ts, opts.onDone);
  });
  return p;
}

/**
 * Hover that reads intent. Resting on a letter for ~70 ms pops it, and it stays while you stay.
 * Sweeping fast leaves a sparse, quick trail (every other letter, short hold) instead of a wall.
 * Returns an unbind.
 */
export function bindHover(root: HTMLElement, emojisFor: (ch: HTMLElement) => string[]) {
  const DWELL = 70; // ms
  const FAST = 1.4; // px per ms
  let speed = 0;
  let lx = 0, ly = 0, lt = 0;
  let cur: { ch: HTMLElement; timer: number; p: Pop | null } | null = null;
  let skip = false;

  const move = (ev: PointerEvent) => {
    const now = performance.now();
    const dt = Math.max(now - lt, 1);
    const v = Math.hypot(ev.clientX - lx, ev.clientY - ly) / dt;
    speed = dt > 100 ? v : speed * 0.6 + v * 0.4;
    lx = ev.clientX; ly = ev.clientY; lt = now;
  };

  const leaveCur = (quick: boolean) => {
    if (!cur) return;
    clearTimeout(cur.timer);
    cur.p?.release(quick);
    cur = null;
  };

  const over = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch') return;
    const ch = (ev.target as HTMLElement).closest('.ch') as HTMLElement | null;
    if (!ch || ch === cur?.ch || !root.contains(ch) || ch.closest('.fx') || ch.textContent === ' ') return;
    const fast = speed > FAST;
    leaveCur(fast);
    if (fast) {
      skip = !skip;
      cur = { ch, timer: 0, p: null };
      if (!skip) swap(ch, pick(emojisFor(ch)), { hold: 0.08, speed: 0.6 });
      return;
    }
    const entry = { ch, timer: 0, p: null as Pop | null };
    entry.timer = window.setTimeout(() => {
      entry.p = pop(ch, pick(emojisFor(ch)));
      // a calm hover sometimes wakes a neighbour too, like wabi
      if (Math.random() < 0.25) {
        const all = [...root.querySelectorAll<HTMLElement>('.ch')].filter((c) => !c.closest('.fx'));
        const n = all[all.indexOf(ch) + (Math.random() < 0.5 ? -1 : 1)];
        if (n && n.textContent !== ' ') swap(n, pick(emojisFor(n)), { delay: 0.06, hold: 0.3 });
      }
    }, DWELL);
    cur = entry;
  };
  const leave = () => leaveCur(speed > FAST);

  root.addEventListener('pointermove', move);
  root.addEventListener('pointerover', over);
  root.addEventListener('pointerleave', leave);
  return () => {
    leaveCur(true);
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerover', over);
    root.removeEventListener('pointerleave', leave);
  };
}

/** Split plain text into word-wrapped char spans (for static lines like the hero). */
export function splitInto(el: HTMLElement, text: string) {
  el.textContent = '';
  const chars: HTMLElement[] = [];
  text.split(/( )/).forEach((part) => {
    if (part === ' ') {
      const sp = makeChar(' ');
      el.append(sp);
      chars.push(sp);
      return;
    }
    const w = document.createElement('span');
    w.className = 'word';
    for (const c of part) {
      const ch = makeChar(c);
      w.append(ch);
      chars.push(ch);
    }
    el.append(w);
  });
  return chars;
}
