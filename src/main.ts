import gsap from 'gsap';
import { preload } from './letters';
import { startEditor } from './editor';
import { Scene } from './scene/engine';
import { Meadow } from './scene/meadow';
import { Critters } from './scene/critters';
import { Balloons } from './scene/balloons';
import { Doodles } from './scene/doodles';
import { Paint } from './scene/paint';
import { Bugs } from './scene/bugs';
import { Planes } from './scene/planes';
import type { Effect } from './scene/engine';

const EFFECTS: Record<string, () => Effect> = {
  meadow: () => new Meadow(),
  critters: () => new Critters(),
  balloons: () => new Balloons(),
  doodles: () => new Doodles(),
  paint: () => new Paint(),
  bugs: () => new Bugs(),
  planes: () => new Planes(),
};
import { BACKDROPS, record, download, videoMime } from './export';
import { mountBackground } from './bg/engine';

preload();
const bg = mountBackground(document.querySelector('#bg') as HTMLCanvasElement);

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const input = $<HTMLTextAreaElement>('#input');

// the scene: what grows on the letters, drawn behind and in front of the type
const scene = new Scene($<HTMLCanvasElement>('#sceneBack'), $<HTMLCanvasElement>('#sceneFront'), $('#text'), new Meadow());

const editor = startEditor({
  editor: $('#editor'),
  input,
  text: $('#text'),
  fx: $('#fx'),
  hooks: {
    insert: (el, c, speed) => scene.add(el, c, speed),
    remove: (el, rect) => scene.remove(el, rect),
  },
});

// a click anywhere in the playground (not on a control) belongs to the scene
$('#play').addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button, .dock, dialog')) return;
  scene.click(e.clientX, e.clientY);
});

// ---------- toast ----------
const toastEl = $('#toast');
function toast(msg: string) {
  toastEl.textContent = msg;
  gsap.killTweensOf(toastEl);
  gsap.timeline()
    .fromTo(toastEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'back.out(1.6)' })
    .to(toastEl, { opacity: 0, y: 6, duration: 0.3, ease: 'power2.in' }, '+=1.6');
}

// ---------- a little illustration rides on the effect knob, one per effect ----------
const KNOB_ART: Record<string, string> = {
  meadow: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 31 C15.5 25 16.5 21 16 16" stroke="#3c7d50" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M16 25 C19 22 22 22.5 23.5 24 C21 26 18.5 26 16 25Z" fill="#5ea66a"/>
    <g transform="translate(16 11)">
      <ellipse cx="0" cy="-4.6" rx="5.4" ry="4.6" fill="#d83a1f"/>
      <ellipse cx="4.6" cy="0" rx="4.6" ry="5.4" fill="#ff5a36"/>
      <ellipse cx="0" cy="4.6" rx="5.4" ry="4.6" fill="#d83a1f"/>
      <ellipse cx="-4.6" cy="0" rx="4.6" ry="5.4" fill="#ff5a36"/>
      <circle r="2.3" fill="#2a1e1a"/>
      <circle cx="2.4" cy="-1.6" r=".7" fill="#ffbe2e"/><circle cx="-2.2" cy="1.8" r=".7" fill="#ffbe2e"/><circle cx="-1.6" cy="-2.4" r=".7" fill="#ffbe2e"/>
    </g></svg>`,
  critters: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M5 31 C5 19 9 13 16 13 C23 13 27 19 27 31Z" fill="#b58cff" stroke="#191716" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="9.5" cy="14.5" r="3" fill="#b58cff" stroke="#191716" stroke-width="1.6"/>
    <circle cx="22.5" cy="14.5" r="3" fill="#b58cff" stroke="#191716" stroke-width="1.6"/>
    <path d="M5.6 25 C6 18 10 14 16 14 C22 14 26 18 26.4 25" fill="#b58cff"/>
    <ellipse cx="12.4" cy="22" rx="2.6" ry="2.9" fill="#fff" stroke="#191716" stroke-width="1.3"/>
    <ellipse cx="19.6" cy="22" rx="2.6" ry="2.9" fill="#fff" stroke="#191716" stroke-width="1.3"/>
    <circle class="pupil" cx="12.9" cy="22.4" r="1.3" fill="#191716"/><circle class="pupil" cx="20.1" cy="22.4" r="1.3" fill="#191716"/>
    <ellipse cx="9.4" cy="26.4" rx="1.6" ry=".9" fill="#ff7890" opacity=".6"/><ellipse cx="22.6" cy="26.4" rx="1.6" ry=".9" fill="#ff7890" opacity=".6"/>
    </svg>`,
  balloons: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 20.5 C14.5 24 17.5 27 16 31" stroke="#2a2522" stroke-width="1.1" fill="none"/>
    <path d="M16 20.5 C9.5 18.5 8.5 11 10 7.5 C11.5 3.5 20.5 3.5 22 7.5 C23.5 11 22.5 18.5 16 20.5Z" fill="#3d7bf0" stroke="#2a5bc4" stroke-width="1.2"/>
    <path d="M14.8 21.6 L16 20.2 L17.2 21.6Z" fill="#2a5bc4"/>
    <ellipse cx="12.6" cy="9" rx="1.2" ry="2.4" transform="rotate(25 12.6 9)" fill="#fff" opacity=".8"/>
    </svg>`,
  doodles: `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 6 C16.8 13 18.6 15 26 16 C18.6 17 16.8 19 16 26 C15.2 19 13.4 17 6 16 C13.4 15 15.2 13 16 6Z" stroke="#2747c9" stroke-width="1.8"/>
    <path d="M25 5.5 L27 3.5 M27.5 8 L30 7.5 M23 3 L23.4 0.8" stroke="#e5484d" stroke-width="1.5"/>
    </svg>`,
  paint: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M4 22 C4 16 9 15 12 17 C14 18 15 16 17 15 C20 13.5 27 14 28 20 C28.6 23.5 26 25 24 24 L24 28.5 A2.2 2.2 0 0 1 19.6 28.5 L19.6 24.6 C18 25.4 15.6 25.2 14.4 24.4 L14.4 30 A2.4 2.4 0 0 1 9.6 30 L9.6 24.8 C6 25.6 4 24.6 4 22Z" fill="#3d63e0"/>
    <path d="M8 19.5 C9.5 18.2 11 18.4 12 19" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".6"/>
    <circle cx="11.2" cy="29.6" r=".8" fill="#fff" opacity=".6"/>
    </svg>`,
  bugs: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <g stroke="#1d1a17" stroke-width="1.2" stroke-linecap="round">
      <path d="M10 20 L6 18 M10 24 L5.5 25 M13 27 L11 30.5 M22 20 L26 18 M22 24 L26.5 25 M19 27 L21 30.5"/>
    </g>
    <ellipse cx="16" cy="13.5" rx="4.2" ry="3.4" fill="#1d1a17"/>
    <circle cx="14.2" cy="12.4" r=".8" fill="#fff"/><circle cx="17.8" cy="12.4" r=".8" fill="#fff"/>
    <path d="M16 15 C9 15 7.5 21 8.5 24 C10 28.5 22 28.5 23.5 24 C24.5 21 23 15 16 15Z" fill="#e8392e" stroke="#1d1a17" stroke-width="1.3"/>
    <path d="M16 15.5 L16 27.6" stroke="#1d1a17" stroke-width="1.2"/>
    <circle cx="12" cy="20" r="1.6" fill="#1d1a17"/><circle cx="20" cy="20" r="1.6" fill="#1d1a17"/><circle cx="12.6" cy="24.6" r="1.2" fill="#1d1a17"/><circle cx="19.4" cy="24.6" r="1.2" fill="#1d1a17"/>
    <ellipse cx="11.4" cy="17.4" rx="1.4" ry=".7" fill="#fff" opacity=".55" transform="rotate(-25 11.4 17.4)"/>
    </svg>`,
  planes: `<svg viewBox="0 0 32 32" aria-hidden="true" stroke="#2a2522" stroke-width="1.3" stroke-linejoin="round">
    <path d="M29 9 L4 17.5 L11.5 19.5Z" fill="#d9d2c4"/>
    <path d="M29 9 L11.5 19.5 L13.5 27 L16.6 21.6 L23 25Z" fill="#fff"/>
    <path d="M29 9 L13.5 27" fill="none"/>
    <circle cx="5" cy="25" r=".9" fill="#2a2522" stroke="none" opacity=".5"/><circle cx="2.4" cy="28.4" r=".7" fill="#2a2522" stroke="none" opacity=".35"/>
    </svg>`,
};

// ---------- segmented controls ----------
const controls: Record<string, (v: string, animate?: boolean) => void> = {};
function segmented(el: HTMLElement, initial: string, onPick: (v: string) => void, onLand?: (x: number, y: number) => void) {
  const knob = document.createElement('span');
  knob.className = 'knob';
  el.prepend(knob);
  const btns = [...el.querySelectorAll<HTMLButtonElement>('.seg-btn')];
  let current: HTMLButtonElement | null = null;
  // the palette stands up on wide screens and lies down on phones: slide along whichever axis it has
  const vertical = () => getComputedStyle(el).flexDirection === 'column';
  const place = (b: HTMLButtonElement) => ({ x: b.offsetLeft, y: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight });
  const choose = (b: HTMLButtonElement, animate = true) => {
    btns.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    const moved = current && current !== b;
    current = b;
    onPick(b.dataset.v!);
    const to = place(b);
    if (!animate || !moved) {
      gsap.set(knob, to);
      return;
    }
    const v = vertical();
    const from = v ? (gsap.getProperty(knob, 'y') as number) : (gsap.getProperty(knob, 'x') as number);
    const dir = Math.sign((v ? to.y : to.x) - from) || 1;
    // cartoon timing: it leans and stretches into the slide, then squashes as it lands
    const lean = v ? { scaleX: 0.82, skewY: -10 * dir } : { scaleY: 0.82, skewX: -10 * dir };
    const over = v ? { scaleX: 1.12, skewY: 4 * dir } : { scaleY: 1.12, skewX: 4 * dir };
    const rest = v ? { scaleX: 1, skewY: 0 } : { scaleY: 1, skewX: 0 };
    gsap.timeline()
      .to(knob, { ...to, duration: 0.42, ease: 'power3.inOut' }, 0)
      .to(knob, { ...lean, duration: 0.18, ease: 'power2.out' }, 0)
      .to(knob, { ...over, duration: 0.12, ease: 'power2.in' }, 0.3)
      .to(knob, { ...rest, duration: 0.5, ease: 'elastic.out(1, 0.45)' }, 0.42)
      .call(() => {
        // the new drawing does a little hop as the knob arrives under it
        const icon = b.querySelector('.seg-icon');
        if (icon) gsap.fromTo(icon, { scale: 0.6, rotation: -18 * dir }, { scale: 1, rotation: 0, duration: 0.55, ease: 'back.out(2.6)' });
        if (!onLand) return;
        const r = knob.getBoundingClientRect();
        onLand(r.left + r.width / 2, r.top + r.height / 2);
      }, [], 0.4);
  };
  btns.forEach((b) => b.addEventListener('click', () => choose(b)));
  document.fonts.ready.then(() => choose(btns.find((b) => b.dataset.v === initial)!, false));
  addEventListener('resize', () => current && gsap.set(knob, place(current)));
  return (v: string, animate = true) => {
    const b = btns.find((x) => x.dataset.v === v);
    if (b) choose(b, animate);
  };
}

// the effect buttons are their drawings; the name lives in a tooltip and for screen readers
document.querySelectorAll<HTMLButtonElement>('#fxSeg .seg-btn').forEach((b) => {
  const label = b.textContent?.trim() ?? '';
  b.setAttribute('aria-label', label);
  b.innerHTML = `<span class="seg-icon">${KNOB_ART[b.dataset.v!] ?? ''}</span><span class="seg-tip" aria-hidden="true">${label}</span>`;
});

// ---------- share link: text and font live in the URL hash ----------
const shared = new URLSearchParams(location.hash.slice(1));
const startFx = EFFECTS[shared.get('e') ?? ''] ? shared.get('e')! : 'meadow';
let fxName = startFx;
let showcasePick = false; // true while the demo itself is switching effects
let pinned: string | null = null; // an effect the person chose: the showcase stays on it
controls.fx = segmented(
  $('#fxSeg'),
  startFx,
  (v) => {
    if (scene.name !== v) scene.setEffect(EFFECTS[v]()); // also covers a shared link that opens on another effect
    if (!showcasePick && fxName !== v) pinned = v;
    fxName = v;
    document.body.dataset.fx = v; // lets the type itself dress for the effect (ladybug letters for Bugs)
    $('.hint').textContent = scene.hint;
  },
  // the knob lands with the new effect's own interaction: bees, a balloon, a scribble, a hop
  (x, y) => scene.land(x, y),
);
$('.hint').textContent = scene.hint;

// ---------- idle showcase: each effect introduces itself with a phrase that suits it ----------
const SHOWCASE: { fx: string; lines: string[] }[] = [
  { fx: 'meadow', lines: ['in full bloom', 'let it grow', 'spring is here'] },
  { fx: 'critters', lines: ['who lives here', 'tiny neighbours', 'hello friends'] },
  { fx: 'balloons', lines: ['happy birthday', 'party time', 'you did it'] },
  { fx: 'doodles', lines: ['big ideas', 'note to self', 'good vibes'] },
  { fx: 'paint', lines: ['fresh paint', 'wet ink', 'colour me in'] },
  { fx: 'bugs', lines: ['small world', 'busy busy', 'picnic day'] },
  { fx: 'planes', lines: ['take off', 'send it', 'see you soon'] },
];
const DEMO = SHOWCASE[0].lines[0];
let round = 0;
/** The next phrase, and the effect to show it in (or the pinned one, if the person picked). */
function nextLine() {
  const order = pinned ? SHOWCASE.filter((s) => s.fx === pinned) : SHOWCASE;
  const set = order[round % order.length];
  const text = set.lines[Math.floor(round / SHOWCASE.length) % set.lines.length];
  round++;
  return { fx: set.fx, text };
}
let auto = false; // the demo owns the text right now
let autoCall: gsap.core.Tween | null = null;
let idle: number | undefined;

function runAuto() {
  auto = true;
  document.body.classList.add('demo');
  const { fx, text } = nextLine();
  if (fx !== fxName) {
    showcasePick = true;
    controls.fx(fx);
    showcasePick = false;
  }
  const t = editor.typeIn(text, 0.075);
  // each effect gets a proper moment before the phrase goes
  autoCall = gsap.delayedCall(t + 8, () => {
    const d = editor.backspaceAll(0.032);
    autoCall = gsap.delayedCall(d + 0.7, runAuto);
  });
}
function stopAuto() {
  autoCall?.kill();
  editor.stopTyping();
  document.body.classList.remove('demo');
}
/** Hand the stage to the person: the demo stops and its words leave. */
function takeOver() {
  if (!auto) return;
  stopAuto();
  auto = false;
  input.value = '';
  input.dispatchEvent(new Event('input'));
}
/** After a quiet moment the demo comes back: when the field is empty, or when a click only paused it. */
function scheduleIdle() {
  clearTimeout(idle);
  idle = window.setTimeout(() => {
    if (recording || document.querySelector('dialog[open]')) return scheduleIdle();
    if (auto) {
      // the demo was only paused by a click: clear its line and carry on
      const d = editor.backspaceAll(0.032);
      autoCall = gsap.delayedCall(d + 0.7, runAuto);
    } else if (!editor.getText()) runAuto();
  }, 3500);
}

// first keystroke takes over before the key lands, so it types into an empty field
input.addEventListener('keydown', (e) => {
  if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Unidentified') takeOver();
});
input.addEventListener('beforeinput', takeOver); // virtual keyboards that skip keydown
input.addEventListener('paste', takeOver);
input.addEventListener('input', () => !auto && scheduleIdle());
$('#editor').addEventListener('pointerdown', () => {
  // clicking pauses the demo where it is (so a word can be rerolled); typing then replaces it
  if (auto) stopAuto();
  scheduleIdle();
});

document.fonts.ready.then(() => {
  const t = shared.get('t');
  if (t) editor.typeIn(t);
  else runAuto();
});

$('#shareBtn').addEventListener('click', async () => {
  const p = new URLSearchParams({ t: editor.getText() || DEMO, e: fxName });
  const url = `${location.origin}${location.pathname}#${p}`;
  history.replaceState(null, '', `#${p}`);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'wildtype', url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    }
  } catch {
    /* share sheet dismissed */
  }
});

$('#clear').addEventListener('click', () => {
  stopAuto();
  auto = false;
  editor.clear();
  scheduleIdle();
});

// ---------- export sheet ----------
const exportSheet = $<HTMLDialogElement>('#exportSheet');
const canMp4 = !!videoMime()?.includes('mp4');
let format: 'mp4' | 'gif' = canMp4 ? 'mp4' : 'gif';
let take: 'live' | 'replay' = 'live';
let backdrop = BACKDROPS[0];
let recording = false;
const MAX_LIVE = { mp4: 60, gif: 15 }; // seconds; GIFs get heavy fast
exportSheet.innerHTML = `
  <h2>Export</h2>
  <p id="takeHelp"></p>
  <div class="row"><span class="label">Record</span>
    <div class="seg" id="takeSeg" role="radiogroup" aria-label="What to record">
      <button role="radio" data-v="live" class="seg-btn">Live</button>
      <button role="radio" data-v="replay" class="seg-btn">Replay</button>
    </div>
  </div>
  <div class="row"><span class="label">Format</span>
    <div class="seg" id="fmtSeg" role="radiogroup" aria-label="Format">
      <button role="radio" data-v="mp4" class="seg-btn">${canMp4 ? 'MP4' : 'Video'}</button>
      <button role="radio" data-v="gif" class="seg-btn">GIF</button>
    </div>
  </div>
  <div class="row"><span class="label">Background</span>
    <div class="row" id="swatches" role="radiogroup" aria-label="Background" style="margin:0">
      ${BACKDROPS.map((b) => `<button class="swatch" role="radio" aria-label="${b.label}" data-id="${b.id}" style="background:${b.bg}"></button>`).join('')}
    </div>
  </div>
  <div class="actions">
    <button class="btn" id="exportCancel">Close</button>
    <button class="btn primary" id="exportGo">Start recording</button>
  </div>`;
const HELP = {
  live: 'Records you as you go: typing, deleting, hovering. Press Stop when you are done.',
  replay: 'Your text gets typed out again, cleanly, and recorded on its own.',
};
const setTake = (v: string) => {
  take = v as 'live' | 'replay';
  $('#takeHelp').textContent = HELP[take];
  $('#exportGo').textContent = take === 'live' ? 'Start recording' : 'Record replay';
};
const swatches = [...exportSheet.querySelectorAll<HTMLButtonElement>('.swatch')];
const setSwatch = (id: string) => {
  backdrop = BACKDROPS.find((b) => b.id === id)!;
  swatches.forEach((s) => s.setAttribute('aria-checked', String(s.dataset.id === id)));
};
swatches.forEach((s) => s.addEventListener('click', () => setSwatch(s.dataset.id!)));
$('#exportCancel').addEventListener('click', () => exportSheet.close());

$('#exportBtn').addEventListener('click', () => {
  if (recording) return;
  setSwatch(backdrop.id);
  exportSheet.showModal();
  controls.take ??= segmented($('#takeSeg'), take, setTake);
  controls.fmt ??= segmented($('#fmtSeg'), format, (v) => (format = v as 'mp4' | 'gif'));
});

// the recording pill: a red dot, the time, and Stop
const pill = document.createElement('div');
pill.className = 'rec-pill';
pill.hidden = true;
pill.innerHTML = `<span class="rec-dot"></span><span class="rec-time">0:00</span><button class="rec-stop" type="button">Stop</button>`;
document.body.append(pill);
const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

async function runExport() {
  const wasAuto = auto;
  stopAuto();
  auto = false;
  clearTimeout(idle);
  exportSheet.close();
  recording = true;
  bg.hold(true); // the background is not in the export, so give the recorder the GPU
  const fx = $('#fx');
  const freshStart = () => {
    // start on a clean frame: no leftover exit animations
    fx.querySelectorAll('*').forEach((n) => gsap.killTweensOf(n));
    fx.replaceChildren();
  };

  let stopped = false;
  const stop = () => (stopped = true);
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop();
  let source: Parameters<typeof record>[0]['source'];

  if (take === 'live') {
    // the demo's line is not yours, so start empty; your own text stays so you can keep going
    if (wasAuto) {
      editor.clear(false);
      freshStart();
    }
    pill.hidden = false;
    gsap.fromTo(pill, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'back.out(1.6)' });
    (pill.querySelector('button') as HTMLButtonElement).onclick = stop;
    document.addEventListener('keydown', onKey);
    input.focus({ preventScroll: true });
    source = { kind: 'live', stopped: () => stopped, max: MAX_LIVE[format] };
  } else {
    const text = editor.getText() || DEMO;
    source = {
      kind: 'replay',
      run: () => {
        editor.clear(false);
        freshStart();
        (document.activeElement as HTMLElement | null)?.blur();
        gsap.delayedCall(0.35, () => editor.typeIn(text, 0.08));
        // typeIn's rhythm varies a little (pauses after spaces and commas); budget for its slow side
        return 0.35 + text.length * 0.08 * 1.4 + 0.4;
      },
    };
  }

  try {
    const blob = await record({
      format,
      backdrop,
      text: $('#text'),
      fx,
      frame: $('#editor'),
      source,
      onProgress: (p, sec) => {
        if (take === 'live') {
          (pill.querySelector('.rec-time') as HTMLElement).textContent = `${fmtTime(sec)} / ${fmtTime(MAX_LIVE[format])}`;
          return;
        }
        toastEl.textContent = `Recording ${Math.round(p * 100)}%`;
        gsap.set(toastEl, { opacity: 1, y: 0 });
      },
    });
    const ext = blob.type.includes('gif') ? 'gif' : blob.type.includes('mp4') ? 'mp4' : 'webm';
    download(blob, `wildtype.${ext}`);
    toast(ext === 'webm' ? 'Saved as WebM (this browser has no MP4 recording)' : `Saved wildtype.${ext}`);
  } catch (err) {
    toast((err as Error).message || 'Export failed');
  } finally {
    recording = false;
    bg.hold(false);
    document.removeEventListener('keydown', onKey);
    if (!pill.hidden) gsap.to(pill, { opacity: 0, y: 8, duration: 0.25, onComplete: () => void (pill.hidden = true) });
    if (wasAuto && take === 'replay') {
      // the exported line stays a beat, then the demo carries on
      auto = true;
      autoCall = gsap.delayedCall(2, () => {
        const d = editor.backspaceAll(0.032);
        autoCall = gsap.delayedCall(d + 0.7, runAuto);
      });
    } else scheduleIdle();
  }
}
$('#exportGo').addEventListener('click', runExport);
