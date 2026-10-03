import gsap from 'gsap';
import { emojisAt } from './context';
import { emojiImg, makeChar, pick, swap, reduced, bindHover } from './letters';

type Char = { c: string; el: HTMLElement; bud?: HTMLElement; budList?: string[] };

/**
 * A custom-rendered editor. A hidden textarea owns the real text, selection and keyboard
 * (so paste, arrows, mobile keyboards all work); we diff its value on every input and animate
 * only the characters that were inserted or removed. Surviving characters FLIP to their new spots.
 */
export function startEditor(opts: {
  editor: HTMLElement;
  input: HTMLTextAreaElement;
  text: HTMLElement;
  fx: HTMLElement;
}) {
  const { editor, input, text, fx } = opts;
  let chars: Char[] = [];
  let value = '';
  let lastInput = 0;
  const caret = document.createElement('span');
  caret.className = 'caret';
  const placeholder = document.createElement('span');
  placeholder.className = 'ph';
  placeholder.textContent = 'Type something…';

  const emojisFor = (el: HTMLElement) => {
    const i = chars.findIndex((c) => c.el === el);
    return emojisAt(value, Math.max(i, 0));
  };
  bindHover(text, emojisFor);

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

  function animateIn(ch: Char, idx: number, k: number, many: boolean, speed: number) {
    if (ch.c === '\n') return;
    const g = ch.el.querySelector('.g') as HTMLElement;
    const delay = many ? k * 0.012 : 0;
    if (reduced || ch.c === ' ') {
      gsap.from(g, { opacity: 0, duration: 0.15, delay });
      return;
    }
    const list = emojisAt(value, idx);
    if (many) {
      // pasted text: quick fade-up, a few sprouts so it still feels alive
      gsap.from(g, { opacity: 0, y: '0.2em', filter: 'blur(3px)', duration: 0.4, delay, ease: 'power3.out', clearProps: 'filter,transform' });
      if (Math.random() < 0.35) gsap.delayedCall(delay + 0.2, () => grow(ch, list, 1));
      return;
    }
    // garden: the letter itself appears right away so you always see what you type
    gsap.fromTo(g, { opacity: 0, y: '0.12em' }, { opacity: 1, y: 0, duration: 0.24 * speed, ease: 'power2.out', clearProps: 'transform' });
    const prev = chars[idx - 1];
    const chance = prev?.bud ? 0.2 : 0.55; // avoid bud clumps
    if (Math.random() < chance) grow(ch, list, speed);
  }

  /** Garden: a small emoji sprouts on top of the letter and stays, gently swaying. */
  function grow(ch: Char, list: string[], speed = 1) {
    if (ch.bud || !ch.el.isConnected) return;
    const bud = emojiImg(pick(list), 'bud');
    ch.el.append(bud);
    ch.bud = bud;
    ch.budList = list;
    const r = gsap.utils.random(-7, 7);
    gsap.fromTo(bud, { scale: 0, rotation: r * 2, opacity: 0 }, { scale: 1, rotation: r, opacity: 1, duration: 0.55 * speed, ease: 'back.out(1.8)' });
    if (!reduced) gsap.to(bud, { rotation: -r * 0.6, duration: gsap.utils.random(2, 3), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.6 });
  }

  // ---------- remove: the subtle swap, the letter leaves as an emoji that fades away ----------
  function animateOut(ch: Char, r: DOMRect | undefined, idxInOld: number, oldValue: string, k: number, many: boolean, speed: number) {
    // r comes from before any letter left the line; measuring here would see the text already reflowed
    if (!r) return;
    const host = fx.getBoundingClientRect();
    if (ch.c === '\n' || ch.c === ' ' || r.width === 0) return;
    gsap.killTweensOf(ch.el);
    ch.el.querySelectorAll('.em, .bud, .g').forEach((n) => gsap.killTweensOf(n));
    const ghost = ch.el;
    ghost.classList.add('ghost');
    Object.assign(ghost.style, { left: `${r.left - host.left}px`, top: `${r.top - host.top}px`, fontSize: getComputedStyle(text).fontSize, transform: '' });
    ghost.querySelectorAll('.em').forEach((n) => n.remove());
    fx.append(ghost);
    const g = ghost.querySelector('.g') as HTMLElement;
    gsap.set(g, { opacity: 1, clearProps: 'filter' });

    const delay = many ? Math.min(k * 0.008, 0.25) : 0;
    if (reduced || (many && Math.random() > 0.3)) {
      ghost.querySelectorAll<HTMLElement>('.bud').forEach((b) => gsap.to(b, { opacity: 0, duration: 0.2 }));
      gsap.to(g, { opacity: 0, y: '-0.08em', duration: 0.22, delay, ease: 'power1.in', onComplete: () => ghost.remove() });
      return;
    }
    // the letter lets go: lifts a hair, shrinks and blurs out
    gsap.to(g, { y: '-0.1em', scale: 0.6, opacity: 0, filter: 'blur(4px)', duration: 0.22 * speed, delay, ease: 'power2.in' });
    // its emoji pops into the gap and floats off like a bubble, drifting and tilting a little
    const em = emojiImg(pick(emojisAt(oldValue, idxInOld)), 'em');
    ghost.append(em);
    const dir = gsap.utils.random(-1, 1);
    gsap.timeline({ delay, onComplete: () => ghost.remove() })
      .timeScale(1 / speed)
      .fromTo(em, { scale: 0.35, opacity: 0, '--b': 4, rotation: -10 * dir }, { scale: 0.9, opacity: 1, '--b': 0, rotation: 6 * dir, duration: 0.2, ease: 'back.out(2.2)' })
      .to(em, { y: '-0.85em', x: `${0.22 * dir}em`, scale: 0.42, rotation: 20 * dir, opacity: 0, '--b': 3, duration: 0.55, ease: 'power2.in' }, '+=0.03');
    // a sprout on that letter rises with it
    ghost.querySelectorAll<HTMLElement>('.bud').forEach((b) =>
      gsap.to(b, { y: '-0.5em', scale: 0.5, opacity: 0, duration: 0.4 * speed, delay, ease: 'power2.in' })
    );
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
    const oldValue = value;
    removed.forEach((ch, k) => animateOut(ch, before.get(ch.el), p + k, oldValue, k, manyOut, speed));
    const added = inserted.map(makeCharFor);
    chars.splice(p, removedCount, ...added);
    value = next;
    layout();
    steady(before, p, added.length, shiftBefore);
    flip(before, speed);
    const manyIn = added.length > 3;
    added.forEach((ch, k) => animateIn(ch, p + k, k, manyIn, speed));
    retheme(p + added.length - 1);
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

  /**
   * Once a word is recognised ("st" -> "study"), sprouts that grew on its first letters
   * from the generic pool hop over to the word's own emojis.
   */
  function retheme(at: number) {
    let a = at;
    while (a > 0 && /\S/.test(value[a - 1])) a--;
    let b = Math.max(at, 0);
    while (b < value.length && /\S/.test(value[b])) b++;
    for (let i = a; i < b; i++) {
      const ch = chars[i];
      if (!ch?.bud) continue;
      const list = emojisAt(value, i);
      if (list === ch.budList) continue;
      ch.budList = list;
      const bud = ch.bud;
      gsap.timeline()
        .to(bud, { scale: 0, duration: 0.16, ease: 'power2.in' })
        .call(() => { bud.textContent = pick(list); })
        .to(bud, { scale: 1, duration: 0.45, ease: 'back.out(2)' });
    }
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
    if (el) reroll(chars.findIndex((c) => c.el === el));
  });

  /** Click a word: its emojis get a fresh roll (new sprouts in garden, a swap wave in swap). */
  function reroll(i: number) {
    if (i < 0 || !/\S/.test(value[i] ?? '')) return;
    let a = i;
    while (a > 0 && /\S/.test(value[a - 1])) a--;
    let b = i;
    while (b < value.length && /\S/.test(value[b])) b++;
    for (let j = a; j < b; j++) {
      const ch = chars[j];
      const list = emojisAt(value, j);
      if (ch.bud) {
        const bud = ch.bud;
        gsap.timeline({ delay: (j - a) * 0.04 })
          .to(bud, { scale: 0, rotation: '+=40', duration: 0.15, ease: 'power2.in' })
          .call(() => { bud.textContent = pick(list); })
          .to(bud, { scale: 1, rotation: '-=40', duration: 0.5, ease: 'back.out(2.2)' });
      } else if (Math.random() < 0.4 && !chars[j - 1]?.bud) {
        gsap.delayedCall((j - a) * 0.04, () => grow(ch, list));
      }
    }
  }

  // ---------- public ----------
  /** Clear every sprout and grow a fresh set over the existing text. */
  function regrowBuds() {
    for (const ch of chars) {
      if (!ch.bud) continue;
      const old = ch.bud;
      ch.bud = undefined;
      gsap.killTweensOf(old);
      gsap.to(old, { scale: 0, opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: () => old.remove() });
    }
    let lastBud = -2;
    chars.forEach((ch, i) => {
      if (!/\S/.test(ch.c) || i - lastBud < 2 || Math.random() > 0.5) return;
      lastBud = i;
      gsap.delayedCall(0.2 + i * 0.025, () => grow(ch, emojisAt(value, i)));
    });
  }

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
  return { regrowBuds, clear, typeIn, backspaceAll, stopTyping, getText: () => value };
}
