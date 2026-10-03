import { COMMON, GROUPS } from './groups';
import index from './emoji-index.json';

// Context without AI. For every letter we ask, in order:
// 1. is its word part of a two-word name?  "ice cream" -> 🍦, "hot dog" -> 🌭
// 2. what does the word itself name?  emoji names first (most specific first: "cat" -> 🐈 🐱),
//    then ~2,900 looser keywords, with stemming ("raining" -> rain) and slang ("doggo" -> dog)
// 3. is it half typed?  from 4 letters, "umbre" -> ☂️
// 4. is it a theme word emojis don't spell out?  "exam" -> 📚 ✏️ ⏰
// Matches are padded with their neighbours in Unicode order (🍕 sits beside 🍔 🌭), which keeps
// a word's pool varied but on-topic. A word with nothing to say borrows from the closest matched
// word in its sentence, looking back first, then ahead. Otherwise: a common, friendly pool.

const E: string[] = index.e;
const G: number[] = index.g;
const K: Record<string, number[]> = index.k;
const N: Record<string, number[]> = index.n;
const KEYS = [...new Set([...Object.keys(N), ...Object.keys(K)])].sort();

const STOP = new Set(['my', 'me', 'we', 'us', 'it', 'is', 'am', 'be', 'to', 'of', 'in', 'on', 'at', 'an', 'or', 'so', 'if', 'do', 'go', 'up', 'no', 'the', 'for', 'and', 'with', 'you', 'your', 'are', 'was', 'this', 'that', 'have', 'from', 'but', 'not', 'can', 'all', 'its', 'our', 'out', 'get', 'got', 'just', 'some', 'what', 'when', 'then', 'them', 'they', 'will', 'into', 'more', 'very', 'really', 'about', 'there', 'here', 'been', 'were', 'would', 'could', 'should', 'him', 'her', 'his', 'she', 'who', 'how', 'why', 'too', 'also', 'only', 'one', 'two', 'did', 'does', 'has', 'had', 'let', 'like', 'make', 'over', 'under', 'every', 'little', 'tiny', 'big', 'try', 'first', 'still', 'than', 'way', 'new']);

const SLANG: Record<string, string> = {
  doggo: 'dog', pup: 'dog', puppy: 'dog', kitty: 'cat', kitten: 'cat', lol: 'laugh', lmao: 'laugh', haha: 'laugh',
  omg: 'scream', wow: 'astonished', bday: 'birthday', hbd: 'birthday', xmas: 'christmas', bf: 'heart', gf: 'heart',
  bae: 'heart', luv: 'love', ily: 'love', sleepy: 'sleep', tired: 'sleep',
  hangry: 'pizza', boba: 'tea', latte: 'coffee', espresso: 'coffee', beers: 'beer', vino: 'wine', nyc: 'statue',
  sad: 'crying', cry: 'crying', happy: 'smile', cool: 'sunglasses', fire: 'fire', lit: 'fire', vibes: 'sparkles',
};

const THEME = new Map<string, string[]>();
for (const g of GROUPS) for (const w of g.words) THEME.set(w, g.emojis);

/** Light stemming: the word plus plausible base forms, most specific first. */
function forms(w: string): string[] {
  const out = [w];
  const push = (x: string) => x.length >= 2 && !out.includes(x) && out.push(x);
  if (SLANG[w]) push(SLANG[w]);
  if (w.endsWith('ies')) push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) push(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) push(w.slice(0, -1));
  for (const suf of ['ing', 'ed', 'er', 'est', 'y', 'ly']) {
    if (!w.endsWith(suf) || w.length - suf.length < 3) continue;
    const base = w.slice(0, -suf.length);
    push(base);
    push(base + 'e');
    if (base.length > 2 && base.at(-1) === base.at(-2)) push(base.slice(0, -1)); // running -> run
  }
  return out;
}

function prefixHit(w: string): number[] | null {
  let lo = 0;
  let hi = KEYS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (KEYS[mid] < w) lo = mid + 1;
    else hi = mid;
  }
  let best: string | null = null;
  for (let i = lo; i < KEYS.length && KEYS[i].startsWith(w); i++) if (!best || KEYS[i].length < best.length) best = KEYS[i];
  return best ? (N[best] ?? K[best]) : null;
}

function neighbours(i: number, n = 3): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < E.length && G[j] === G[i]) out.push(j);
  return out;
}

/** Turn matched indices into a weighted pool: the best matches come up most. */
function poolFrom(direct: number[] | null, theme?: string[]): string[] | null {
  if (!direct && !theme) return null;
  const pool: string[] = [];
  if (direct) {
    const top = direct.slice(0, 5);
    top.forEach((i, rank) => {
      for (let r = 0; r < Math.max(1, 4 - rank); r++) pool.push(E[i]);
    });
    for (const i of top.slice(0, 2)) for (const j of neighbours(i)) pool.push(E[j]);
  }
  if (theme) pool.push(...theme, ...theme);
  return pool;
}

const clean = (raw: string) => raw.toLowerCase().replace(/[^a-z]/g, '');
const cache = new Map<string, string[] | null>();

/** The emoji pool for one word, or null when the word says nothing. */
export function matchWord(raw: string): string[] | null {
  const w = clean(raw);
  if (cache.has(w)) return cache.get(w)!;
  let result: string[] | null = null;
  if (w.length >= 2 && !STOP.has(w)) {
    let theme: string[] | undefined;
    let direct: number[] | null = null;
    for (const f of forms(w)) {
      theme ??= THEME.get(f);
      direct ??= N[f] ?? K[f] ?? null;
    }
    // half-typed words only from 4 letters, so "for" doesn't become "fortnite"
    if (!direct && !theme && w.length >= 4) direct = prefixHit(w);
    result = poolFrom(direct, theme);
  }
  cache.set(w, result);
  return result;
}

/** Two-word names: "ice cream", "hot dog", "hot air balloon"... */
function matchPair(a: string, b: string): string[] | null {
  const key = clean(a) + clean(b);
  if (key.length < 5) return null;
  const hit = N[key] ?? N[key.replace(/s$/, '')];
  return hit ? poolFrom(hit) : null;
}

type Span = { start: number; end: number; word: string };
function words(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(/\S+/g)) out.push({ start: m.index!, end: m.index! + m[0].length, word: m[0] });
  return out;
}

/**
 * Emojis for the letter at `i` in `text`, using everything the sentence says.
 */
export function emojisAt(text: string, i: number): string[] {
  const ws = words(text);
  const at = ws.findIndex((w) => i >= w.start && i < w.end);
  if (at === -1) return COMMON;

  const prev = ws[at - 1];
  const next = ws[at + 1];
  const own =
    (prev && matchPair(prev.word, ws[at].word)) ||
    (next && matchPair(ws[at].word, next.word)) ||
    matchWord(ws[at].word);
  if (own) return warm(own);

  // borrow from the sentence: look back first, then ahead, staying inside the sentence
  const breakAfter = (w: Span) => /[.!?]$/.test(w.word) || text.slice(w.end, (ws[ws.indexOf(w) + 1]?.start ?? w.end)).includes('\n');
  let backOpen = true;
  let fwdOpen = true;
  for (let d = 1; backOpen || fwdOpen; d++) {
    const back = ws[at - d];
    if (!back || breakAfter(back)) backOpen = false;
    else {
      const m = matchWord(back.word);
      if (m) return warm(m);
    }
    const fwd = ws[at + d];
    if (!fwd || breakAfter(ws[at + d - 1])) fwdOpen = false;
    else {
      const m = matchWord(fwd.word);
      if (m) return warm(m);
    }
  }
  return COMMON;
}

/** Ask the emoji font for these glyphs early so the first pop never lands on a blank. */
const warmed = new WeakSet<string[]>();
function warm(list: string[]) {
  if (!warmed.has(list)) {
    warmed.add(list);
    document.fonts?.load('40px "Noto Color Emoji"', [...new Set(list)].join('')).catch(() => {});
  }
  return list;
}
