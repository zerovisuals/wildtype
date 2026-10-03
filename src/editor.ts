import gsap from 'gsap';
import { makeChar, reduced } from './letters';

type Char = { c: string; el: HTMLElement };

/** What the scene hears about: a letter arrived, or a letter left (with where it was). */
export type EditorHooks = {
  insert(el: HTMLElement, c: string, speed: number): void;
  remove(el: HTMLElement, rect: DOMRect, c: string): void;
};

/**
 * A custom-rendered editor. A hidden textarea owns the real text, selection and keyboard
 * (so paste, arrows, mobile keyboards all work); we diff its value on every input and animate
 * only the characters that were inserted or removed. Surviving characters FLIP to their new spots.
 * The editor only moves type; everything that grows on it lives in the scene (src/scene).
 */
export function startEditor(opts: {
  editor: HTMLElement;
  input: HTMLTextAreaElement;
  text: HTMLElement;
  fx: HTMLElement;
  hooks: EditorHooks;
}) {
  const { editor, input, text, fx, hooks } = opts;
  let chars: Char[] = [];
  let value = '';
  let lastInput = 0;
  const caret = document.createElement('span');
  caret.className = 'caret';
  const placeholder = document.createElement('span');
  placeholder.className = 'ph';
  placeholder.textContent = 'Type something…';

  // ---------- layout ----------
  function layout() {
    text.textContent = '';
    if (chars.length === 0) {
      text.append(caret, placeholder);
      return;
    }
    let word: HTMLElement | null = null;
    const caretAt = input.selectionStart ?? value.length;
    const put = (node: Node) => (word ?? text).append(node);
    chars.forEach((ch, i) => {
      if (i === caretAt) put(caret);
      if (ch.c === ' ' || ch.c === '\n') {
        word = null;
        text.append(ch.el);
        return;
      }
      if (!word) {
        word = document.createElement('span');
        word.className = 'word';
        text.append(word);
      }
      word.append(ch.el);
    });
    if (caretAt >= chars.length) put(caret);
  }

  function rects() {
    const m = new Map<HTMLElement, DOMRect>();
    for (const ch of chars) m.set(ch.el, ch.el.getBoundingClientRect());
    return m;
  }

  function flip(before: Map<HTMLElement, DOMRect>, speed: number) {
    if (reduced) return;
    for (const ch of chars) {
      const a = before.get(ch.el);
      if (!a) continue;
      const b = ch.el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      gsap.fromTo(ch.el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.38 * speed, ease: 'power3.out', overwrite: 'auto' });
    }
  }

  // ---------- insert ----------
  function makeCharFor(c: string): Char {
    if (c === '\n') {
      const el = document.createElement('span');
      el.className = 'ch nl';
      return { c, el };
    }
    return { c, el: makeChar(c) };
  }

  function animateIn(ch: Char, k: number, many: boolean, speed: number) {
    if (ch.c === '\n') return;
    const g = ch.el.querySelector('.g') as HTMLElement;
    const delay = many ? k * 0.012 : 0;
    if (reduced) gsap.from(g, { opacity: 0, duration: 0.15, delay });
    else gsap.fromTo(g, { opacity: 0, y: '0.06em', filter: 'blur(3px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.3 * speed, delay, ease: 'power2.out', clearProps: 'transform,filter' });
    if (ch.c !== ' ') gsap.delayedCall(delay, () => ch.el.isConnected && hooks.insert(ch.el, ch.c, speed));
  }

  // ---------- remove: the letter lets go softly; the scene withers what grew on it ----------
  function animateOut(ch: Char, r: DOMRect | undefined, k: number, many: boolean, speed: number) {
    // r comes from before any letter left the line; measuring here would see the text already reflowed
    if (!r || ch.c === '\n' || r.width === 0) return;
    if (ch.c !== ' ') hooks.remove(ch.el, r, ch.c);
    if (ch.c === ' ') return;
    const host = fx.getBoundingClientRect();
    gsap.killTweensOf(ch.el);
    const ghost = ch.el;
    ghost.classList.add('ghost');
    Object.assign(ghost.style, { left: `${r.left - host.left}px`, top: `${r.top - host.top}px`, fontSize: getComputedStyle(text).fontSize, transform: '' });
    fx.append(ghost);
    const g = ghost.querySelector('.g') as HTMLElement;
    gsap.killTweensOf(g);
    const delay = many ? Math.min(k * 0.008, 0.25) : 0;
    gsap.fromTo(g, { opacity: 1 }, {
      opacity: 0, scale: 0.7, y: '0.04em',
      duration: 0.14 * speed, delay, ease: 'power2.in', onComplete: () => ghost.remove(),
    });
  }

  // ---------- sync ----------
  function sync() {
    const next = input.value;
    if (next === value) return layout();
    const now = performance.now();
    // fast typing compresses the animations (down to ~45%), slow typing plays them fully
    const speed = gsap.utils.clamp(0.45, 1, (now - lastInput) / 220);
    lastInput = now;

    let p = 0;
    while (p < value.length && p < next.length && value[p] === next[p]) p++;
    let s = 0;
    while (s < value.length - p && s < next.length - p && value[value.length - 1 - s] === next[next.length - 1 - s]) s++;
    const removedCount = value.length - p - s;
    const inserted = [...next.slice(p, next.length - s)];

    const before = rects();
    const shiftBefore = gsap.getProperty(text, 'x') as number;
    const removed = chars.slice(p, p + removedCount);
    const manyOut = removed.length > 3;
    removed.forEach((ch, k) => animateOut(ch, before.get(ch.el), k, manyOut, speed));
    const added = inserted.map(makeCharFor);
    chars.splice(p, removedCount, ...added);
    value = next;
    layout();
    steady(before, p, added.length, shiftBefore);
    flip(before, speed);
    const manyIn = added.length > 3;
    added.forEach((ch, k) => animateIn(ch, k, manyIn, speed));
  }

  /**
   * Centred text re-centres on every edit, which made deleting look like letters collapsing inward.
   * So for one instant the line holds still (the letter before the edit keeps its spot, so the cut
   * reads at the right end), then it eases back to centre right away. One soft drift, no jumps.
   */
  let drift: gsap.core.Tween | null = null;
  function steady(before: Map<HTMLElement, DOMRect>, p: number, addedLen: number, shiftBefore: number) {
    drift?.kill();
    const pin = chars[p - 1] ?? chars[p + addedLen];
    const a = pin && before.get(pin.el);
    const b = pin?.el.getBoundingClientRect();
    if (reduced || !a || !b || Math.abs(a.top - b.top) > 2) {
      gsap.set(text, { x: 0 }); // empty, or the line wrapped: the FLIP carries it
      return;
    }
    gsap.set(text, { x: shiftBefore + (a.left - b.left) });
    drift = gsap.to(text, { x: 0, duration: 0.5, ease: 'power2.out' });
  }

  input.addEventListener('input', sync);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === input) layout();
  });
  input.addEventListener('focus', () => editor.classList.add('focused'));
  input.addEventListener('blur', () => editor.classList.remove('focused'));

  // click on a letter to put the caret there
  editor.addEventListener('pointerdown', (ev) => {
    const el = (ev.target as HTMLElement).closest('.ch') as HTMLElement | null;
    let at = value.length;
    if (el) {
      const i = chars.findIndex((c) => c.el === el);
      const r = el.getBoundingClientRect();
      if (i >= 0) at = ev.clientX < r.left + r.width / 2 ? i : i + 1;
    }
    ev.preventDefault();
    input.focus({ preventScroll: true });
    input.setSelectionRange(at, at);
    layout();
  });

  // ---------- public ----------
  /** Every live letter, for the scene to regrow on when the effect changes. */
  const letters = () => chars.filter((c) => /\S/.test(c.c)).map((c) => ({ el: c.el, c: c.c }));

  function clear(focus = true) {
    input.value = '';
    sync();
    if (focus) input.focus({ preventScroll: true });
  }

  // scheduled keystrokes (demo typing, replays) so they can be cancelled at any moment
  const scheduled: gsap.core.Tween[] = [];
  const later = (t: number, fn: () => void) => scheduled.push(gsap.delayedCall(t, fn));
  function stopTyping() {
    scheduled.splice(0).forEach((d) => d.kill());
  }

  /** Type a string in letter by letter, like a person would. Returns how long it takes. */
  function typeIn(str: string, step = 0.08) {
    let t = 0;
    [...str].forEach((c) => {
      // a touch of human rhythm: small pauses after spaces and punctuation
      t += step * (/[,.!?]/.test(c) ? 2.6 : c === ' ' ? 1.4 : gsap.utils.random(0.75, 1.25));
      later(t, () => {
        input.value += c;
        input.setSelectionRange(input.value.length, input.value.length);
        sync();
      });
    });
    return t;
  }

  /** Delete everything from the end, one letter at a time. Returns how long it takes. */
  function backspaceAll(step = 0.035) {
    const n = input.value.length;
    for (let k = 0; k < n; k++)
      later((k + 1) * step, () => {
        input.value = input.value.slice(0, -1);
        input.setSelectionRange(input.value.length, input.value.length);
        sync();
      });
    return n * step;
  }

  layout();
  return { clear, typeIn, backspaceAll, stopTyping, letters, getText: () => value };
}
