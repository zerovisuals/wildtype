export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
