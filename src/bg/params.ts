// Ripple grid background: one thresholded scalar field of separable gaussian sources.
// Values from the reference piece; the view is fitted to the page instead of a card (see engine).

export const PITCH = 0.18;
export const SIGMA_K = 0.3;
export const THRESHOLD = 0.57;

export const GRID_NX = 5;
export const GRID_NY = 3;

export const RX_REST = 3.25;
export const RX_OPEN = 3.9; // gentler bloom than the card: it is a backdrop, the words are the show
export const RY_REST = 1.5;
export const RY_OPEN = 1.85;

export const SHELL_SOFT = 0.5;

export const RIPPLE_LEN = 0.233;
export const RIPPLE_MAX = 0.03;
export const RIPPLE_SPEED = 1.4;
export const RIPPLE_FLOOR = 0.12;

export const TWIRL_MAX = 0.32;
export const DRIFT_MAX = 0.025;
export const WOBBLE = 0.004;

export const BLOOM_SEC = 14;
export const BLOOM_SKEW = 0.65;

export const MODE_OFFSETS = [0, 0.5, 0.25] as const;
export const MODE_PITCH = [1.0, 0.88, 1.14] as const;

export const RATE_RIPPLE = 0.31;
export const RATE_TWIRL = 0.19;
export const RATE_DRIFT_X = 0.13;
export const RATE_DRIFT_Y = 0.107;
export const RATE_WOBBLE = 0.23;

export const CURSOR_PUSH = 0.02;
export const CURSOR_RADIUS = 0.34;
export const LENS_RADIUS = 0.36;
export const LENS_POWER = 1.25; // closer to 1 = a softer lens
export const CURSOR_EASE = 0.35; // lazier follow, so it trails the hand instead of chasing it
export const CURSOR_RIPPLE_BIAS = 0.2;

export const INK = '#1b1b1b';
export const PAPER = '#ffffff';

// It sits under the page at a few percent opacity, so full resolution buys nothing.
// it shows at 2% opacity, so a soft, low-res buffer looks identical and costs a fraction
export const DPR_CAP = 0.4;
/** Frames per second the grid redraws at; its motion is slow enough that 30 reads as smooth. */
export const BG_FPS = 30;

/**
 * Inked half-extent of the lattice at REST, in field units (measured across all three structures,
 * then pulled in a touch). The view is fitted to this on every resize so the pattern reaches every
 * edge of any screen, ultrawide included, even at its smallest. Same 11 x 7 sources, just larger.
 */
export const REST_HALF_X = 0.44;
export const REST_HALF_Y = 0.19;

/** Field units shown across the screen's short side, for a given long/short aspect. */
export function viewShort(aspect: number) {
  return Math.min(2 * REST_HALF_Y, (2 * REST_HALF_X) / aspect);
}

export function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

export interface Frame {
  ripple: number;
  twirl: number;
  driftX: number;
  driftY: number;
  wobble: number;
  rx: number;
  ry: number;
  ripplePhase: number;
}

export function frameAt(t: number): Frame {
  // skewed bloom: snaps open about a third of the way in, then takes twice as long to settle
  const u = Math.pow((((t % BLOOM_SEC) + BLOOM_SEC) % BLOOM_SEC) / BLOOM_SEC, BLOOM_SKEW);
  const energy = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
  const e = Math.pow(energy, 1.1);
  return {
    ripple: RIPPLE_MAX * (RIPPLE_FLOOR + (1 - RIPPLE_FLOOR) * e) * (0.65 + 0.35 * Math.sin(t * RATE_RIPPLE)),
    twirl: TWIRL_MAX * e * Math.sin(t * RATE_TWIRL),
    driftX: DRIFT_MAX * e * Math.sin(t * RATE_DRIFT_X),
    driftY: DRIFT_MAX * e * Math.sin(t * RATE_DRIFT_Y),
    wobble: WOBBLE * (0.35 + 0.65 * e * (0.6 + 0.4 * Math.sin(t * RATE_WOBBLE))),
    rx: RX_REST + (RX_OPEN - RX_REST) * energy,
    ry: RY_REST + (RY_OPEN - RY_REST) * energy,
    ripplePhase: t * RIPPLE_SPEED,
  };
}
