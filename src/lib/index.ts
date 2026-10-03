// emojiii as a drop-in library.
//   hover(el)   letters turn into emojis under the pointer (the wabi move)
//   garden(el)  small emojis sprout on top of the letters and sway
// Both read the element's text for context ("pizza" grows 🍕), and return a cleanup function.
import gsap from 'gsap';
import { emojisAt } from '../context';
import { bindHover, emojiImg, pick, splitInto, reduced } from '../letters';

const CSS = `
.ch{position:relative;display:inline-block;white-space:pre}
.ch .g{display:inline-block}
.word{display:inline-block;white-space:nowrap}
.emo{font-family:'Apple Color Emoji','Noto Color Emoji','Segoe UI Emoji',sans-serif;font-style:normal;font-weight:400;letter-spacing:0;line-height:1;display:grid;place-items:center}
.em,.bud{position:absolute;pointer-events:none;user-select:none;--b:0;filter:blur(calc(var(--b)*1px)) drop-shadow(0 .06em .09em rgba(0,0,0,.16));will-change:transform,opacity}
.em{left:50%;top:50%;font-size:.74em;width:1.2em;height:1.2em;margin:-.66em 0 0 -.6em;z-index:3}
.bud{left:50%;bottom:80%;font-size:.37em;width:1.2em;height:1.2em;margin-left:-.6em;transform-origin:50% 100%;z-index:2}
`;

function inject() {
  if (document.getElementById('emojiii-css')) return;
  const s = document.createElement('style');
  s.id = 'emojiii-css';
  s.textContent = CSS;
  document.head.append(s);
}

function prepare(el: HTMLElement) {
  inject();
  const html = el.innerHTML;
  const text = el.textContent ?? '';
  const chars = splitInto(el, text);
  el.setAttribute('aria-label', text);
  chars.forEach((c) => c.setAttribute('aria-hidden', 'true'));
  const restore = () => {
    el.innerHTML = html;
    el.removeAttribute('aria-label');
  };
  return { text, chars, restore };
}

export type Options = {
  /** Use your own emoji pool instead of the context engine. */
  emojis?: string[];
};

export function hover(el: HTMLElement, opts: Options = {}) {
  const { text, chars, restore } = prepare(el);
  const unbind = bindHover(el, (ch) => opts.emojis ?? emojisAt(text, chars.indexOf(ch)));
  return () => {
    unbind();
    restore();
  };
}

export function garden(el: HTMLElement, opts: Options & { density?: number } = {}) {
  const { text, chars, restore } = prepare(el);
  const density = opts.density ?? 0.45;
  const tweens: gsap.core.Animation[] = [];
  let last = -2;
  chars.forEach((ch, i) => {
    if (!/\S/.test(text[i]) || i - last < 2 || Math.random() > density) return;
    last = i;
    const bud = emojiImg(pick(opts.emojis ?? emojisAt(text, i)), 'bud');
    ch.append(bud);
    const r = gsap.utils.random(-7, 7);
    tweens.push(gsap.fromTo(bud, { scale: 0, rotation: r * 2 }, { scale: 1, rotation: r, duration: 0.6, delay: 0.1 + i * 0.03, ease: 'back.out(1.8)' }));
    if (!reduced) tweens.push(gsap.to(bud, { rotation: -r * 0.6, duration: gsap.utils.random(2, 3), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.8 }));
  });
  return () => {
    tweens.forEach((t) => t.kill());
    restore();
  };
}
