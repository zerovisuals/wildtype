// Export: replays your text being typed while mirroring the live DOM onto a canvas every frame,
// then encodes it. MP4 through MediaRecorder (Chrome 126+, Safari), WebM as fallback; GIF with gifenc.
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export type Backdrop = { id: string; label: string; bg: string; ink: string };
export const BACKDROPS: Backdrop[] = [
  { id: 'white', label: 'White', bg: '#ffffff', ink: '#161616' },
  { id: 'black', label: 'Black', bg: '#0e0e0f', ink: '#f2f2f2' },
  { id: 'cream', label: 'Cream', bg: '#f6f1e7', ink: '#1d1a16' },
  { id: 'lilac', label: 'Lilac', bg: '#e9e6ff', ink: '#1b1830' },
  { id: 'mint', label: 'Mint', bg: '#e2f4e8', ink: '#13261a' },
];

type Opts = {
  format: 'mp4' | 'gif';
  backdrop: Backdrop;
  text: HTMLElement; // .text
  fx: HTMLElement; // ghost layer
  frame: HTMLElement; // area that maps onto the video
  /** replay: starts a retype and returns its length in seconds. live: records until stopped() or max. */
  source: { kind: 'replay'; run: () => number } | { kind: 'live'; stopped: () => boolean; max: number };
  onProgress: (p: number, seconds: number) => void;
};

const opacityChain = (el: Element, stop: Element) => {
  let o = 1;
  for (let n: Element | null = el; n && n !== stop.parentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    o *= parseFloat(cs.opacity);
    if (cs.visibility === 'hidden') return 0;
  }
  return o;
};

const ownTransform = (el: Element) => {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { s: 1, r: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { s: Math.hypot(m.a, m.b), r: Math.atan2(m.b, m.a) };
};

const blurOf = (el: HTMLElement) => {
  const b = el.style.getPropertyValue('--b');
  if (b) return parseFloat(b) || 0;
  const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(el).filter);
  return m ? parseFloat(m[1]) : 0;
};

function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, o: Opts) {
  const { backdrop, text, fx, frame } = o;
  ctx.save();
  ctx.fillStyle = backdrop.bg;
  ctx.fillRect(0, 0, W, H);

  const fr = frame.getBoundingClientRect();
  const k = Math.min(W / fr.width, H / fr.height) * 0.92;
  const ox = W / 2 - (fr.left + fr.width / 2) * k;
  const oy = H / 2 - (fr.top + fr.height / 2) * k;

  const draw = (el: HTMLElement, root: HTMLElement, isEmoji: boolean) => {
    const alpha = opacityChain(el, root);
    if (alpha < 0.01) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const cs = getComputedStyle(el);
    const { s, r: rot } = ownTransform(el);
    const size = parseFloat(cs.fontSize) * s * k;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox + (r.left + r.width / 2) * k, oy + (r.top + r.height / 2) * k);
    ctx.rotate(rot);
    ctx.font = `${isEmoji ? 400 : cs.fontWeight} ${size}px ${cs.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const blur = blurOf(el) * s * k;
    if (blur > 0.2) ctx.filter = `blur(${blur}px)`;
    if (isEmoji) {
      ctx.shadowColor = 'rgba(0,0,0,0.16)';
      ctx.shadowBlur = size * 0.12;
      ctx.shadowOffsetY = size * 0.07;
    } else {
      ctx.fillStyle = document.body.dataset.fx === 'bugs' ? ladybug(ctx, size) : backdrop.ink;
    }
    const m = ctx.measureText(el.textContent ?? '');
    // center of the font box sits on the element's center; work back to the baseline
    ctx.fillText(el.textContent ?? '', 0, (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2);
    ctx.restore();
  };

  for (const root of [text, fx]) {
    root.querySelectorAll<HTMLElement>('.g').forEach((g) => draw(g, root, false));
  }

  // the caret, blinking like the real one (only shown while someone is typing live)
  const caret = text.querySelector<HTMLElement>('.caret');
  if (o.source.kind === 'live' && caret && Math.floor(performance.now() / 525) % 2 === 0) {
    const r = caret.getBoundingClientRect();
    ctx.fillStyle = backdrop.ink;
    ctx.fillRect(ox + (r.left - 1) * k, oy + r.top * k, 2 * k, r.height * k);
  }

  // small wordmark, bottom right
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = backdrop.ink;
  ctx.font = `600 ${Math.round(H * 0.026)}px 'Plus Jakarta Sans', sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('wildtype', W - H * 0.045, H - H * 0.045);
  ctx.restore();
}

/** Red with black spots, the Bugs letter fill, as a canvas pattern sized to the type. */
let spots: { size: number; pat: CanvasPattern | null } = { size: 0, pat: null };
function ladybug(ctx: CanvasRenderingContext2D, size: number) {
  const cell = Math.max(6, Math.round(size * 0.23));
  if (spots.size !== cell) {
    const c = document.createElement('canvas');
    c.width = cell * 3;
    c.height = cell * 3;
    const x = c.getContext('2d')!;
    x.fillStyle = '#e8392e';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#1d1a17';
    for (const [px, py, r] of [[0.3, 0.35, 0.16], [1.6, 0.9, 0.11], [2.4, 2.2, 0.15], [0.9, 2.1, 0.12], [2.1, 0.3, 0.1], [1.2, 1.5, 0.08]]) {
      x.beginPath();
      x.arc(px * cell, py * cell, r * cell, 0, Math.PI * 2);
      x.fill();
    }
    spots = { size: cell, pat: ctx.createPattern(c, 'repeat') };
  }
  return spots.pat ?? '#e8392e';
}

export function videoMime() {
  const c = ['video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return c.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? null;
}

export async function record(o: Opts): Promise<Blob> {
  const gif = o.format === 'gif';
  const W = gif ? 800 : 1600;
  const H = gif ? 450 : 900;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: gif })!;

  const src = o.source;
  const length = src.kind === 'replay' ? src.run() + 1.6 : src.max; // replay: typing + a hold to enjoy it
  const start = performance.now();
  const finished = (ms: number) => ms >= length * 1000 || (src.kind === 'live' && src.stopped());

  if (gif) {
    const enc = GIFEncoder();
    const step = 50; // 20 fps
    for (let t = 0; !finished(t); t += step) {
      await new Promise<void>((res) => {
        const wait = () => (performance.now() - start >= t ? res() : requestAnimationFrame(wait));
        wait();
      });
      drawFrame(ctx, W, H, o);
      const { data } = ctx.getImageData(0, 0, W, H);
      const palette = quantize(data, 256);
      enc.writeFrame(applyPalette(data, palette), W, H, { palette, delay: step });
      o.onProgress(t / (length * 1000), t / 1000);
    }
    enc.finish();
    return new Blob([enc.bytes()], { type: 'image/gif' });
  }

  const mime = videoMime();
  if (!mime) throw new Error('This browser cannot record video. Try GIF, or Chrome / Safari.');
  const stream = canvas.captureStream(60);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start();
  await new Promise<void>((res) => {
    const tick = () => {
      drawFrame(ctx, W, H, o);
      const ms = performance.now() - start;
      o.onProgress(Math.min(ms / (length * 1000), 1), ms / 1000);
      if (!finished(ms)) requestAnimationFrame(tick);
      else res();
    };
    tick();
  });
  rec.stop();
  await done;
  return new Blob(chunks, { type: mime.split(';')[0] });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
