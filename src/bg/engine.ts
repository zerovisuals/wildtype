// WebGL ripple grid. Ported from the reference card and fitted to a full page:
// the view is fitted to the lattice's rest extent (viewShort) so one fixed 11 x 7 lattice fills any screen,
// and on portrait screens the field is turned a quarter so the lattice's long axis runs down the phone.
import {
  viewShort, CURSOR_EASE, CURSOR_PUSH, CURSOR_RADIUS, CURSOR_RIPPLE_BIAS, DPR_CAP, BG_FPS, GRID_NX, GRID_NY, INK,
  LENS_POWER, LENS_RADIUS, MODE_OFFSETS, MODE_PITCH, PAPER, PITCH, RIPPLE_LEN, SHELL_SOFT, SIGMA_K, THRESHOLD,
  frameAt, rgb,
} from './params';

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const frag = (nx: number, ny: number) => `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uPitch;
uniform float uViewScale;
uniform float uPortrait;
uniform float uSigma;
uniform float uThreshold;
uniform float uRx;
uniform float uRy;
uniform float uShellSoft;
uniform float uRipple;
uniform float uRippleLen;
uniform float uRipplePhase;
uniform float uTwirl;
uniform vec2  uDrift;
uniform float uWobble;
uniform vec2  uCursor;
uniform float uCursorAmt;
uniform float uCursorPush;
uniform float uCursorRadius;
uniform float uRippleBias;
uniform float uRowOffset;
uniform float uLens;
uniform float uLensRadius;
uniform float uLensPower;
uniform vec3  uInk;
uniform vec3  uPaper;

#define TAU 6.28318530718
#define NX ${nx}
#define NY ${ny}

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// shells fade in by index, so an outer ring emerges as slivers instead of popping on
float axisWeight(float fk, float radius){
  return 1.0 - smoothstep(radius - uShellSoft, radius + uShellSoft, abs(fk));
}

float axisSumX(float u, float radius){
  float s = 0.0;
  for (int k = -NX; k <= NX; k++) {
    float fk = float(k);
    float d = u - fk * uPitch;
    s += axisWeight(fk, radius) * exp(-(d * d) / (2.0 * uSigma * uSigma));
  }
  return s;
}

// even and odd rows as two rectangular sub-lattices keep the hex packing separable
float axisSumYParity(float u, float radius, float want){
  float s = 0.0;
  for (int k = -NY; k <= NY; k++) {
    float fk = float(k);
    float parity = abs(fk - 2.0 * floor(fk * 0.5));
    if (abs(parity - want) > 0.5) continue;
    float d = u - fk * uPitch;
    s += axisWeight(fk, radius) * exp(-(d * d) / (2.0 * uSigma * uSigma));
  }
  return s;
}

vec2 warp(vec2 p){
  p -= uDrift;
  vec2 origin = uCursor * (uRippleBias * uCursorAmt);
  float r = length(p - origin);
  float a = atan(p.y - origin.y, p.x - origin.x);
  a += uTwirl * r;
  // ripple displaces r as a function of r; faded out before the origin so the centre stays round
  r += uRipple * sin(TAU * r / uRippleLen - uRipplePhase) * smoothstep(0.0, 0.1, r);
  r = max(r, 0.0);
  p = origin + vec2(cos(a), sin(a)) * r;

  // pointer lens: moves the sample point, eased out toward the rim
  vec2 toL = p - uCursor;
  float dL = length(toL);
  if (dL < uLensRadius && uLens > 0.001) {
    float x = dL / uLensRadius;
    float mapped = pow(max(x, 1e-4), uLensPower);
    float rim = 1.0 - smoothstep(0.7, 1.0, x);
    float nr = mix(x, mapped, uLens * rim) * uLensRadius;
    p = uCursor + (toL / (dL + 1e-4)) * nr;
  }

  // pointer push: a gaussian displacement, never an added source
  vec2 toC = p - uCursor;
  float dC = length(toC);
  float bump = exp(-(dC * dC) / (2.0 * uCursorRadius * uCursorRadius));
  p += (toC / (dC + 1e-4)) * bump * uCursorPush * uCursorAmt;

  p += uWobble * vec2(vnoise(p * 7.0 + uTime * 0.05) - 0.5,
                      vnoise(p * 7.0 + 31.7 - uTime * 0.04) - 0.5);
  return p;
}

float field(vec2 P){
  vec2 q = warp(P);
  float even = axisSumX(q.x, uRx) * axisSumYParity(q.y, uRy, 0.0);
  float odd  = axisSumX(q.x - uRowOffset * uPitch, uRx) * axisSumYParity(q.y, uRy, 1.0);
  return even + odd - uThreshold;
}

void main(){
  vec2 c = gl_FragCoord.xy - 0.5 * uRes;
  if (uPortrait > 0.5) c = vec2(c.y, -c.x);
  vec2 P = uViewScale * c / min(uRes.x, uRes.y);
  float f = field(P);
  #ifdef HAS_FWIDTH
    float w = fwidth(f) * 0.75;
  #else
    float w = 1.6 / (uSigma * min(uRes.x, uRes.y));
  #endif
  w = max(w, 1e-5);
  float ink = smoothstep(-w, w, f);
  gl_FragColor = vec4(mix(uPaper, uInk, ink), 1.0);
}
`;

export class RippleGrid {
  readonly ok: boolean;
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private running = false;
  private destroyed = false;
  private clock = 0;
  private last = 0;
  private cur = { x: 0, y: 0, tx: 0, ty: 0, amt: 0, tamt: 0 };
  private mode = -1;
  private modePitch = 1;
  private started = false;
  private view = 0.38;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    this.ok = !!this.gl && this.build();
    if (this.ok) {
      this.resize();
      this.draw(0);
    }
  }

  private compile(type: number, src: string) {
    const gl = this.gl!;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private build() {
    const gl = this.gl!;
    const hasDeriv = !!gl.getExtension('OES_standard_derivatives');
    const src = (hasDeriv ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_FWIDTH 1\n' : '') + frag(GRID_NX, GRID_NY);
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, src);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    this.prog = prog;
    gl.useProgram(prog);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const n of ['uRes', 'uTime', 'uPitch', 'uViewScale', 'uPortrait', 'uSigma', 'uThreshold', 'uRx', 'uRy', 'uShellSoft', 'uRipple',
      'uRippleLen', 'uRipplePhase', 'uTwirl', 'uDrift', 'uWobble', 'uInk', 'uPaper', 'uCursor', 'uCursorAmt', 'uCursorPush',
      'uCursorRadius', 'uRippleBias', 'uRowOffset', 'uLens', 'uLensRadius', 'uLensPower']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    gl.uniform1f(this.u.uThreshold, THRESHOLD);
    gl.uniform1f(this.u.uShellSoft, SHELL_SOFT);
    gl.uniform1f(this.u.uRippleLen, RIPPLE_LEN);
    gl.uniform3fv(this.u.uInk, rgb(INK));
    gl.uniform3fv(this.u.uPaper, rgb(PAPER));
    gl.uniform1f(this.u.uCursorPush, CURSOR_PUSH);
    gl.uniform1f(this.u.uCursorRadius, CURSOR_RADIUS);
    gl.uniform1f(this.u.uRippleBias, CURSOR_RIPPLE_BIAS);
    gl.uniform1f(this.u.uLensRadius, LENS_RADIUS);
    gl.uniform1f(this.u.uLensPower, LENS_POWER);
    this.pickMode();
    return true;
  }

  /** New lattice structure. Only ever called while nothing is on screen (first start, or resume). */
  private pickMode() {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    let next = this.mode;
    while (next === this.mode) next = Math.floor(Math.random() * MODE_OFFSETS.length);
    this.mode = next;
    this.modePitch = MODE_PITCH[next];
    gl.uniform1f(this.u.uRowOffset, MODE_OFFSETS[next]);
    gl.uniform1f(this.u.uPitch, PITCH * this.modePitch);
    gl.uniform1f(this.u.uSigma, SIGMA_K * PITCH * this.modePitch);
  }

  /** Pointer in 0..1 page coordinates. */
  setPointer(nx: number, ny: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    let cx = (nx - 0.5) * w;
    let cy = (0.5 - ny) * h;
    if (h > w) [cx, cy] = [cy, -cx];
    const s = this.view / Math.min(w, h);
    this.cur.tx = cx * s;
    this.cur.ty = cy * s;
    this.cur.tamt = 1;
  }

  clearPointer() {
    this.cur.tamt = 0;
  }

  resize() {
    const gl = this.gl;
    if (!gl || this.destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform1f(this.u.uPortrait, h > w ? 1 : 0);
    this.view = viewShort(Math.max(w, h) / Math.min(w, h));
    gl.uniform1f(this.u.uViewScale, this.view);
    if (!this.running) this.draw(this.clock);
  }

  private draw(t: number) {
    const gl = this.gl;
    if (!gl || !this.prog || this.destroyed) return;
    const f = frameAt(t);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, t);
    // dividing the shell radius by the pitch factor keeps the footprint when the density changes
    gl.uniform1f(this.u.uRx, f.rx / this.modePitch);
    gl.uniform1f(this.u.uRy, f.ry / this.modePitch);
    gl.uniform1f(this.u.uRipple, f.ripple);
    gl.uniform1f(this.u.uRipplePhase, f.ripplePhase);
    gl.uniform1f(this.u.uTwirl, f.twirl);
    gl.uniform2f(this.u.uDrift, f.driftX, f.driftY);
    gl.uniform1f(this.u.uWobble, f.wobble);
    gl.uniform2f(this.u.uCursor, this.cur.x, this.cur.y);
    gl.uniform1f(this.u.uCursorAmt, this.cur.amt);
    gl.uniform1f(this.u.uLens, this.cur.amt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** `repick` swaps the lattice structure; only safe when nobody saw the last frame (hidden tab). */
  start(repick = true) {
    if (this.running || !this.ok || this.destroyed) return;
    if (this.started && repick) this.pickMode();
    this.started = true;
    this.running = true;
    this.last = performance.now();
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.last < 1000 / BG_FPS - 2) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(now - this.last, 50) / 1000;
      this.clock += dt;
      this.last = now;
      const k = 1 - Math.exp(-dt / CURSOR_EASE);
      const c = this.cur;
      c.x += (c.tx - c.x) * k;
      c.y += (c.ty - c.y) * k;
      c.amt += (c.tamt - c.amt) * k;
      this.draw(this.clock);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.destroyed = true;
    const gl = this.gl;
    if (!gl) return;
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.quad) gl.deleteBuffer(this.quad);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Mount the grid on a fixed full-page canvas; it pauses on hidden tabs and follows the pointer. */
export function mountBackground(canvas: HTMLCanvasElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let held = false;
  // phones and touch tablets skip the shader entirely: no GL context, no battery spent
  if (matchMedia('(pointer: coarse), (max-width: 760px)').matches) {
    canvas.remove();
    return { hold(_on: boolean) {} };
  }
  const engine = new RippleGrid(canvas);
  const control = {
    /** Freeze on the current frame (e.g. while recording, which never includes the background). */
    hold(on: boolean) {
      held = on;
      if (on) engine.stop();
      else if (!document.hidden && !reduced) engine.start(false); // it stayed visible: keep the same lattice
    },
  };
  if (!engine.ok) {
    canvas.remove();
    return control;
  }
  if (reduced) return control;
  const sync = () => (document.hidden ? engine.stop() : !held && engine.start());
  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') engine.setPointer(e.clientX / innerWidth, e.clientY / innerHeight);
  });
  document.documentElement.addEventListener('pointerleave', () => engine.clearPointer());
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => engine.resize(), 120);
  });
  return control;
}
