// Builds src/emoji-index.json: every usable emoji (Unicode order, which clusters related ones)
// plus a keyword -> emoji lookup from emojilib (MIT) and Unicode names. Run: node scripts/build-index.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const lib = JSON.parse(readFileSync('node_modules/emojilib/dist/emoji-en-US.json', 'utf8'));
const groups = JSON.parse(readFileSync('node_modules/unicode-emoji-json/data-by-group.json', 'utf8'));

// People & Body is mostly skin-tone and gesture sequences; Flags and Symbols read as UI, not objects
const SKIP_GROUPS = new Set(['Flags', 'Symbols', 'Component', 'People & Body']);
// ugly, gross, violent, sexual, medical, death and religious emojis stay out of a free-for-anything effect
const BLOCK = new Set([...'🤮🤢🤧😷🤒🤕🥵🥶😵💀☠️😈👿👹👺🤡💩🤬💦💋🫦🍆🍑🔫🗡️⚔️💣🪓🔪🧨💊💉🩸🩹🩼🩻🚬⚰️🪦⚱️📿🪬🧿⛪🕌🛕🕍🕋⛩️🏩🪳🦟🪰🪱🦠🧫🧬🚽🪠🧻🪒🦴🫀🫁🧠🦷🚨🚔🔞⛓️🪝🪤🗿🛢️🧯🪫🔌'.matchAll(/\p{Extended_Pictographic}️?/gu)].map((m) => m[0].replace(/️/g, '')));
const e = [];
const g = [];
groups.forEach((grp, gi) => {
  if (SKIP_GROUPS.has(grp.name)) return;
  for (const em of grp.emojis) {
    if (parseFloat(em.emoji_version) > 14) continue; // drawn on every iPhone from iOS 15.4 and by Noto
    if (BLOCK.has(em.emoji.replace(/️/g, ''))) continue;
    if (em.emoji.includes('‍')) continue; // ZWJ combos: noisy for context, inconsistent sizes
    e.push(em.emoji);
    g.push(gi);
  }
});
const pos = new Map(e.map((x, i) => [x, i]));

// name words rank above loose keywords: "cat" finds 🐈 🐱 before 😺
const n = {};
groups.forEach((grp) => {
  for (const em of grp.emojis) {
    const i = pos.get(em.emoji);
    if (i === undefined) continue;
    const words = em.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 1);
    const keys = [...words];
    for (let j = 0; j < words.length - 1; j++) keys.push(words[j] + words[j + 1]); // "ice cream" -> icecream
    for (const w of keys) (n[w] ??= []).includes(i) || n[w].push(i);
  }
});
// most specific first: the shortest name wins ("cat" 🐈 before "grinning cat with smiling eyes" 😸)
const nameLen = new Map();
groups.forEach((grp) => grp.emojis.forEach((em) => pos.has(em.emoji) && nameLen.set(pos.get(em.emoji), em.name.length)));
for (const w of Object.keys(n)) {
  if (n[w].length > 12) delete n[w];
  else n[w].sort((a, b) => nameLen.get(a) - nameLen.get(b));
}

const k = {};
const add = (word, i) => {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length < 2) return;
  (k[word] ??= []).includes(i) || k[word].push(i);
};
for (const [em, words] of Object.entries(lib)) {
  const i = pos.get(em) ?? pos.get(em.replace(/️/g, ''));
  if (i === undefined) continue;
  for (const w of words) for (const part of w.split(/[_\s-]+/)) add(part, i);
}
// drop generic words that point at too many emojis ("face", "hand", "person"...)
for (const w of Object.keys(k)) if (k[w].length > 18) delete k[w];

writeFileSync('src/emoji-index.json', JSON.stringify({ e, g, k, n }));
console.log(`${e.length} emojis, ${Object.keys(k).length} keywords`);
