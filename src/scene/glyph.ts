// Glyph sampler: renders one character offscreen and returns its real shape as points on the edge
// of the ink, each with an outward normal. Effects grow things out of these, so a stem leaves the
// top of an "n" arch or the bowl of an "o", not the corner of a bounding box.

export type EdgePt = { x: number; y: number; nx: number; ny: number }; // px at sample size, y down
export type Glyph = {
  size: number; // sample font size in px
  asc: number; // font ascent at sample size
  desc: number; // font descent at sample size
  width: number; // advance width at sample size
  edges: EdgePt[];
  up: EdgePt[]; // edges facing mostly up: tops of strokes
  down: EdgePt[]; // edges facing mostly down: the undersides, baselines
};

const S = 120;
const cache = new Map<string, Glyph>();

export function sampleGlyph(c: string, family: string, weight: string): Glyph {
  const key = `${weight}|${family}|${c}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const font = `${weight} ${S}px ${family}`;
  ctx.font = font;
  const m = ctx.measureText(c);
  const asc = m.fontBoundingBoxAscent || S * 0.9;
  const desc = m.fontBoundingBoxDescent || S * 0.25;
  const pad = 4;
  const w = Math.ceil(m.width) + pad * 2;
  const h = Math.ceil(asc + desc) + pad * 2;
  cv.width = Math.max(w, 2);
  cv.height = Math.max(h, 2);
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(c, pad, pad + asc);
  const a = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cv.width || y >= cv.height ? 0 : a[(y * cv.width + x) * 4 + 3]);

  const edges: EdgePt[] = [];
  const step = 2;
  for (let y = 1; y < cv.height - 1; y += step) {
    for (let x = 1; x < cv.width - 1; x += step) {
      if (at(x, y) < 128) continue;
      if (at(x - 1, y) >= 128 && at(x + 1, y) >= 128 && at(x, y - 1) >= 128 && at(x, y + 1) >= 128) continue;
      // outward normal = down the alpha gradient, measured over a 3 px reach for smoothness
      let gx = 0;
      let gy = 0;
      for (let d = 1; d <= 3; d++) {
        gx += at(x + d, y) - at(x - d, y);
        gy += at(x, y + d) - at(x, y - d);
      }
      const len = Math.hypot(gx, gy) || 1;
      edges.push({ x: x - pad, y: y - pad, nx: -gx / len, ny: -gy / len });
    }
  }
  const g: Glyph = {
    size: S,
    asc,
    desc,
    width: m.width,
    edges,
    up: edges.filter((e) => e.ny < -0.55),
    down: edges.filter((e) => e.ny > 0.55),
  };
  cache.set(key, g);
  return g;
}

/**
 * Walk along the outline from a random edge point, nearest neighbour to nearest neighbour,
 * and return an ordered run of points: a path that hugs the letter, for vines and creepers.
 */
export function contourRun(g: Glyph, maxPts: number, start?: EdgePt): EdgePt[] {
  if (!g.edges.length) return [];
  const pool = g.edges.slice();
  let cur = start ?? pool[(Math.random() * pool.length) | 0];
  const out: EdgePt[] = [cur];
  const used = new Set<EdgePt>([cur]);
  for (let i = 0; i < maxPts; i++) {
    let best: EdgePt | null = null;
    let bd = 7 * 7; // never jump across a counter or to another stroke
    for (const e of pool) {
      if (used.has(e)) continue;
      const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) break;
    used.add(best);
    out.push(best);
    cur = best;
  }
  return out;
}
