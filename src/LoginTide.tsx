import { useEffect, useRef, type RefObject } from "react";
import { headBuilder, mulberry32, FLOATS_PER_POINT } from "./poseidonFigure";

/**
 * The sign-in screen's full-page backdrop, all in dots:
 *  - the sea: a flat grid swelling like open water, with a ripple that
 *    follows the pointer;
 *  - the sky: a constellation of stars — homes — joined by faint lines with
 *    a glow running along them, water travelling from home to home;
 *  - Poseidon: a head peeking over the top of the card, dim and quiet, his
 *    glowing eyes following the pointer;
 *  - a shooting star trailing behind the pointer.
 *
 * Plain WebGL1 rather than three.js — it's a few draw calls of points and
 * lines, so the library (~600 KB) would be almost all dead weight on the one
 * page every user has to load before anything else. The two matrices
 * three.js would have built are done by hand below (perspective + lookAt).
 *
 * The head is placed against `frameRef` (the card) in screen pixels rather
 * than in the sea's world, so it always sits on the card's top edge
 * whatever the window shape; it's left out on phones and when there isn't
 * room above the card.
 *
 * Renders nothing (the CSS background shows through) when WebGL isn't
 * available; draws one still frame under prefers-reduced-motion; pauses
 * while the tab is hidden.
 */

const VERTEX = `
attribute vec3 position;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform float uTime;
uniform float uSize;
uniform float uMaxSize;
uniform vec2 uPointer;
varying float vHeight;
varying float vDepth;
varying float vNearPointer;
void main() {
  vec3 p = position;
  float swell = sin(p.x * 0.32 + uTime * 0.7) * 0.38
              + sin(p.z * 0.48 + uTime * 0.55) * 0.26
              + sin((p.x + p.z) * 0.95 + uTime * 1.25) * 0.07;
  float d = distance(p.xz, uPointer);
  float ripple = sin(d * 2.4 - uTime * 3.2) * 0.32 * exp(-d * 0.38);
  p.y += swell + ripple;
  vHeight = swell + ripple;
  vNearPointer = exp(-d * 0.45);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_PointSize = min(uSize / vDepth, uMaxSize);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
precision mediump float;
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform float uGlow;
varying float vHeight;
varying float vDepth;
varying float vNearPointer;
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5) discard;
  float crest = smoothstep(-0.35, 0.75, vHeight);
  float fade = 1.0 - smoothstep(9.0, 36.0, vDepth);
  float glow = uGlow * vNearPointer;
  vec3 color = mix(uDeep, uCrest, crest) + uCrest * glow * 1.2;
  float a = min(fade * (0.45 + crest * 0.9 + glow), 1.0);
  gl_FragColor = vec4(min(color, 1.0) * a, a); // premultiplied, see blendFunc
}`;

// The head: model-space points (see poseidonFigure.ts) turned by uRot,
// given a little perspective, then placed in CSS pixels at uAnchor. Dots
// shimmer along their normals like water running over the surface; ones
// facing away are kept faint so the shape reads as solid.
const FIGURE_VERTEX = `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 info; // seed, kind (1 = glowing pupil)
uniform mat3 uRot;
uniform vec2 uAnchor;
uniform float uUnit;
uniform vec2 uViewport;
uniform float uPixelRatio;
uniform float uTime;
uniform vec2 uFade;
varying float vLight;
varying float vFace;
varying float vAlpha;
varying float vKind;
void main() {
  vec3 p = position + normal * sin(position.y * 7.0 - uTime * 1.8 + info.x * 6.2831) * 0.015;
  vec3 r = uRot * p;
  vec3 n = uRot * normal;
  float persp = 6.0 / (6.0 - r.z);
  vec2 px = uAnchor + vec2(r.x, -r.y) * persp * uUnit;
  gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
  vLight = max(dot(n, normalize(vec3(-0.3, 0.85, 0.45))), 0.0);
  vFace = smoothstep(-0.5, 0.6, n.z);
  vKind = info.y;
  vAlpha = smoothstep(uFade.x, uFade.y, position.y) * (0.7 + 0.3 * sin(uTime * 2.3 + info.x * 40.0));
  gl_PointSize = mix(2.6, 3.2, info.y) * clamp(uUnit / 110.0, 0.8, 1.5) * persp * uPixelRatio;
}`;

const FIGURE_FRAGMENT = `
precision mediump float;
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform float uOpacity;
varying float vLight;
varying float vFace;
varying float vAlpha;
varying float vKind;
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5) discard;
  // Light carries the features (brow, nose, sockets): lit dots are bright
  // and solid, ones turned from the light fall back toward the dark sea.
  vec3 color = mix(uDeep * 1.2, uCrest, vLight);
  float a = (0.2 + 0.8 * vFace) * (0.35 + 0.65 * vLight) * vAlpha;
  if (vKind > 0.5) {
    color = mix(uCrest, vec3(1.0), 0.35);
    a = vAlpha;
  }
  a = min(a * uOpacity, 1.0);
  gl_FragColor = vec4(min(color, 1.0) * a, a);
}`;


// The sky, drawn twice from one program: once as GL_POINTS (the stars) and
// once as GL_LINES (the links between them). Positions are 0..1 of the
// screen, y down. For a star `info` is (seed, 1 if it's a brighter "home");
// for a line end it's (seed of the line, 0 or 1 for which end).
const SKY_VERTEX = `
attribute vec2 position;
attribute vec2 info;
uniform vec2 uShift;
uniform float uPixelRatio;
varying float vSeed;
varying float vAlong;
varying float vFade;
void main() {
  vec2 p = position + uShift;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  vSeed = info.x;
  vAlong = info.y;
  vFade = 1.0 - smoothstep(0.4, 0.62, position.y); // gone before the sea
  gl_PointSize = mix(2.2, 4.4, info.y) * uPixelRatio;
}`;

const SKY_FRAGMENT = `
precision mediump float;
uniform vec3 uCrest;
uniform float uTime;
uniform float uLine;
varying float vSeed;
varying float vAlong;
varying float vFade;
void main() {
  float a;
  if (uLine > 0.5) {
    // A short pulse sliding from one end to the other, each line on its own
    // clock, over a barely-there base line.
    float flow = fract(uTime * 0.09 + vSeed);
    float d = (vAlong - flow) * 9.0;
    a = 0.14 + 0.7 * exp(-d * d);
  } else {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + vSeed) + vSeed * 50.0);
    a = mix(0.75, 1.0, vAlong) * twinkle;
  }
  a *= vFade;
  gl_FragColor = vec4(min(mix(uCrest, vec3(1.0), 0.25), 1.0) * a, min(a, 1.0));
}`;

const STARS = 90;
const LINKS = 2; // each star joins its nearest few neighbours…
const LINK_REACH = 0.16; // …that are this close (in screen heights)

/** Seeded so it's the same sky on every visit. */
function buildSky(count: number) {
  const rng = mulberry32(19);
  const stars: { x: number; y: number; seed: number; home: number }[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({ x: rng(), y: 0.03 + rng() * 0.55, seed: rng(), home: rng() < 0.22 ? 1 : 0 });
  }
  const starData = new Float32Array(stars.flatMap((s) => [s.x, s.y, s.seed, s.home]));

  // Distances measured as on a 16:9 screen, so links don't stretch sideways.
  const seen = new Set<string>();
  const lines: number[] = [];
  stars.forEach((s, i) => {
    stars
      .map((o, j) => ({ j, d: Math.hypot((o.x - s.x) * 1.78, o.y - s.y) }))
      .filter(({ j, d }) => j !== i && d < LINK_REACH)
      .sort((a, b) => a.d - b.d)
      .slice(0, LINKS)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) return;
        seen.add(key);
        const o = stars[j];
        const seed = rng();
        lines.push(s.x, s.y, seed, 0, o.x, o.y, seed, 1);
      });
  });
  return { stars: starData, starCount: count, lines: new Float32Array(lines), lineVerts: lines.length / 4 };
}

// The pointer's shooting star: soft glowing dots in CSS pixels, each with
// its own brightness and size — a bright head, a tapering tail along the
// path the pointer just took, and a few sparks shed as it moves.
const TRAIL_VERTEX = `
attribute vec2 position;
attribute vec2 info; // alpha, size in CSS px
uniform vec2 uViewport;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  gl_Position = vec4(position.x / uViewport.x * 2.0 - 1.0, 1.0 - position.y / uViewport.y * 2.0, 0.0, 1.0);
  vAlpha = info.x;
  gl_PointSize = info.y * uPixelRatio;
}`;

const TRAIL_FRAGMENT = `
precision mediump float;
uniform vec3 uCrest;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = vAlpha * (1.0 - smoothstep(0.2, 1.0, d));
  gl_FragColor = vec4(mix(uCrest, vec3(1.0), 0.6) * a, a);
}`;

const TRAIL_LIFE = 0.45; // seconds a point of the tail lasts
const SPARK_LIFE = 0.9;
const TRAIL_MAX = 480; // dots per frame, tail and sparks together

const SIZE = 64; // world units, the grid is SIZE × SIZE centred on the origin
const FOV = (55 * Math.PI) / 180;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Vec3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Camera basis for eye → target (y up): right, up, back. */
function basis(eye: Vec3, target: Vec3) {
  const z = norm(sub(eye, target));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return { x, y, z };
}

/** Column-major, as uniformMatrix4fv wants it. */
function viewMatrix(eye: Vec3, b: ReturnType<typeof basis>) {
  const { x, y, z } = b;
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function perspective(aspect: number, near = 0.1, far = 100) {
  const f = 1 / Math.tan(FOV / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

// 3×3 rotations, column-major. The face looks down +z: a positive yaw turns
// it toward +x (screen right), a positive pitch tips it down.
function rotY(a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
function rotX(a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
function mul3(a: number[], b: number[]) {
  const m = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      m[col * 3 + row] = a[row] * b[col * 3] + a[3 + row] * b[col * 3 + 1] + a[6 + row] * b[col * 3 + 2];
    }
  }
  return m;
}

function link(gl: WebGLRenderingContext, vs: string, fs: string, attribs: string[]) {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  // Fixed locations, so switching programs only means re-pointing them.
  attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link failed");
  return p;
}


type Props = {
  deep: string;
  crest: string;
  /** The sign-in card; the head peeks over its top edge. */
  frameRef: RefObject<HTMLElement | null>;
};

export default function LoginTide({ deep, crest, frameRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl) return;

    const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25);

    let ocean: WebGLProgram;
    let fig: WebGLProgram;
    let sky: WebGLProgram;
    let trail: WebGLProgram;
    try {
      ocean = link(gl, VERTEX, FRAGMENT, ["position"]);
      fig = link(gl, FIGURE_VERTEX, FIGURE_FRAGMENT, ["position", "normal", "info"]);
      sky = link(gl, SKY_VERTEX, SKY_FRAGMENT, ["position", "info"]);
      trail = link(gl, TRAIL_VERTEX, TRAIL_FRAGMENT, ["position", "info"]);
    } catch {
      return; // leave the CSS background on its own
    }
    const [deepRgb, crestRgb] = [hexToRgb(deep), hexToRgb(crest)];

    // ---- sea ----

    // The grid, already lying flat in the XZ plane.
    const segments = mobile ? 100 : 190;
    const n = segments + 1;
    const positions = new Float32Array(n * n * 3);
    for (let i = 0, k = 0; i < n; i++) {
      for (let j = 0; j < n; j++, k += 3) {
        positions[k] = (j / segments - 0.5) * SIZE;
        positions[k + 2] = (i / segments - 0.5) * SIZE;
      }
    }
    const oceanBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, oceanBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.useProgram(ocean);
    const u = (name: string) => gl.getUniformLocation(ocean, name);
    const uProj = u("projectionMatrix");
    const uView = u("viewMatrix");
    const uTime = u("uTime");
    const uPointer = u("uPointer");
    gl.uniform1f(u("uSize"), 34 * pixelRatio);
    gl.uniform1f(u("uMaxSize"), 4 * pixelRatio);
    gl.uniform3fv(u("uDeep"), deepRgb);
    gl.uniform3fv(u("uCrest"), crestRgb);
    gl.uniform1f(u("uGlow"), 0.35);

    // ---- sky ----

    const skyData = buildSky(mobile ? Math.round(STARS / 2) : STARS);
    const starBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, skyData.stars, gl.STATIC_DRAW);
    const lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, skyData.lines, gl.STATIC_DRAW);

    gl.useProgram(sky);
    const s = (name: string) => gl.getUniformLocation(sky, name);
    const sShift = s("uShift");
    const sTime = s("uTime");
    const sLine = s("uLine");
    gl.uniform1f(s("uPixelRatio"), pixelRatio);
    gl.uniform3fv(s("uCrest"), crestRgb);

    // ---- shooting star ----

    const trailBuf = gl.createBuffer();
    const trailData = new Float32Array(TRAIL_MAX * 4);
    gl.useProgram(trail);
    const tViewport = gl.getUniformLocation(trail, "uViewport");
    gl.uniform1f(gl.getUniformLocation(trail, "uPixelRatio"), pixelRatio);
    gl.uniform3fv(gl.getUniformLocation(trail, "uCrest"), crestRgb);
    // Recent pointer positions (newest last) and loose sparks, in CSS px.
    const path: { x: number; y: number; t: number }[] = [];
    const sparks: { x: number; y: number; vx: number; vy: number; t: number; size: number }[] = [];
    const sparkRng = mulberry32(5);

    // ---- head ----

    gl.useProgram(fig);
    const f = (name: string) => gl.getUniformLocation(fig, name);
    const fRot = f("uRot");
    const fAnchor = f("uAnchor");
    const fUnit = f("uUnit");
    const fViewport = f("uViewport");
    const fTime = f("uTime");
    const fFade = f("uFade");
    const fOpacity = f("uOpacity");
    gl.uniform1f(f("uPixelRatio"), pixelRatio);
    gl.uniform3fv(f("uDeep"), deepRgb);
    gl.uniform3fv(f("uCrest"), crestRgb);

    let headBuf: WebGLBuffer | null = null;
    let headCount = 0;
    let headShownAt = 0;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    // ---- layout ----

    let aspect = 1;
    const view = { w: 1, h: 1 };
    const card = { left: 0, top: 0, width: 0 };
    function measure() {
      const r = frameRef.current?.getBoundingClientRect();
      if (r) Object.assign(card, { left: r.left, top: r.top, width: r.width });
    }
    function resize() {
      view.w = canvas!.clientWidth;
      view.h = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.round(view.w * pixelRatio));
      canvas!.height = Math.max(1, Math.round(view.h * pixelRatio));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      aspect = view.w / Math.max(view.h, 1);
      gl!.useProgram(ocean);
      gl!.uniformMatrix4fv(uProj, false, perspective(aspect));
      gl!.useProgram(fig);
      gl!.uniform2f(fViewport, view.w, view.h);
      gl!.useProgram(trail);
      gl!.uniform2f(tViewport, view.w, view.h);
      measure();
    }
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", measure, { passive: true });
    const cardObserver = new ResizeObserver(measure);
    if (frameRef.current) cardObserver.observe(frameRef.current);

    // Pointer in NDC (-1..1, y up); `target` is where it is, `cur` eases
    // toward it so the camera drift and ripple glide instead of snapping.
    // `pointerPx` is the same in CSS pixels, for the head to look at — it
    // starts on the middle of the screen, i.e. on the card.
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const pointerPx = { x: window.innerWidth / 2, y: window.innerHeight * 0.5 };
    function onPointer(e: PointerEvent) {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointerPx.x = e.clientX;
      pointerPx.y = e.clientY;
      if (still) return;
      const now = performance.now() / 1000;
      const prev = path[path.length - 1];
      path.push({ x: e.clientX, y: e.clientY, t: now });
      // Sparks fly off in proportion to speed, drifting back and down.
      const moved = prev ? Math.hypot(e.clientX - prev.x, e.clientY - prev.y) : 0;
      for (let i = Math.min(Math.floor(moved / 14), 3); i > 0 && sparks.length < 90; i--) {
        sparks.push({
          x: e.clientX,
          y: e.clientY,
          vx: (sparkRng() - 0.5) * 50 - (prev ? (e.clientX - prev.x) * 0.6 : 0),
          vy: (sparkRng() - 0.5) * 50 + 20,
          t: now,
          size: 1.5 + sparkRng() * 2,
        });
      }
    }
    window.addEventListener("pointermove", onPointer, { passive: true });

    // ---- drawing ----

    function drawSky(t: number) {
      gl!.useProgram(sky);
      // A touch of parallax: the sky slides a little against the pointer.
      gl!.uniform2f(sShift, -cur.x * 0.008, cur.y * 0.006);
      gl!.uniform1f(sTime, t);
      gl!.enableVertexAttribArray(1);
      for (const [buf, mode, count, line] of [
        [starBuf, gl!.POINTS, skyData.starCount, 0],
        [lineBuf, gl!.LINES, skyData.lineVerts, 1],
      ] as const) {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
        gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 16, 0);
        gl!.vertexAttribPointer(1, 2, gl!.FLOAT, false, 16, 8);
        gl!.uniform1f(sLine, line);
        gl!.drawArrays(mode, 0, count);
      }
      gl!.disableVertexAttribArray(1);
    }

    const look = { yaw: 0, pitch: 0.15 };
    function drawHead(t: number, ease: number) {
      // Needs a little room above the card to peek into.
      if (!headBuf || card.top < 80) return;
      const appear = still ? 1 : clamp((performance.now() - headShownAt) / 2200, 0, 1);
      const rise = 1 - (1 - appear) ** 3;

      gl!.useProgram(fig);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, headBuf);
      const stride = FLOATS_PER_POINT * 4;
      gl!.vertexAttribPointer(0, 3, gl!.FLOAT, false, stride, 0);
      gl!.vertexAttribPointer(1, 3, gl!.FLOAT, false, stride, 12);
      gl!.vertexAttribPointer(2, 2, gl!.FLOAT, false, stride, 24);
      gl!.enableVertexAttribArray(1);
      gl!.enableVertexAttribArray(2);

      // Big, centred on the card, eyes just over its top edge and the rest
      // of him hidden behind it (on a short screen the crown runs off the
      // top, which only makes him loom larger); he rises into place when he
      // first appears. Kept dim so he's a presence, not the main event.
      const unit = Math.min(view.h * 0.27, 260);
      const hx = card.left + card.width / 2;
      const hy = card.top - unit * 0.22 + (1 - rise) * unit * 1.4;
      // Turn toward the pointer, within a believable range of a neck —
      // nodding kept small, or looking down sinks his eyes behind the card.
      const wantYaw = clamp(((pointerPx.x - hx) / view.w) * 1.6, -0.6, 0.6);
      const wantPitch = clamp(((pointerPx.y - hy) / view.h) * 0.6, -0.25, 0.22);
      look.yaw += (wantYaw - look.yaw) * ease;
      look.pitch += (wantPitch - look.pitch) * ease;

      gl!.uniform1f(fTime, t);
      gl!.uniform1f(fOpacity, rise * 0.6);
      gl!.uniformMatrix3fv(fRot, false, mul3(rotX(look.pitch), rotY(look.yaw)));
      gl!.uniform2f(fAnchor, hx, hy);
      gl!.uniform1f(fUnit, unit);
      gl!.uniform2f(fFade, -1.5, -0.9);
      gl!.drawArrays(gl!.POINTS, 0, headCount);

      gl!.disableVertexAttribArray(1);
      gl!.disableVertexAttribArray(2);
    }

    // The ripple's centre: where the ray under the pointer meets the water
    // (y = 0), so it lands right under the cursor at any window shape.
    const ripple = { x: 0, z: 2 };
    function drawSea(t: number) {
      gl!.useProgram(ocean);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, oceanBuf);
      gl!.vertexAttribPointer(0, 3, gl!.FLOAT, false, 0, 0);
      gl!.enableVertexAttribArray(0);

      const eye: Vec3 = [cur.x * 0.8, 1.6 + cur.y * 0.2, 12];
      const b = basis(eye, [0, aspect < 1 ? 5.2 : 3.8, -4]);
      gl!.uniformMatrix4fv(uView, false, viewMatrix(eye, b));

      const tan = Math.tan(FOV / 2);
      const cx = cur.x * tan * aspect;
      const cy = cur.y * tan;
      const dir: Vec3 = [
        b.x[0] * cx + b.y[0] * cy - b.z[0],
        b.x[1] * cx + b.y[1] * cy - b.z[1],
        b.x[2] * cx + b.y[2] * cy - b.z[2],
      ];
      if (dir[1] < -0.01) {
        const s = -eye[1] / dir[1];
        const lim = SIZE / 2;
        ripple.x = clamp(eye[0] + dir[0] * s, -lim, lim);
        ripple.z = clamp(eye[2] + dir[2] * s, -lim, lim);
      }
      gl!.uniform2f(uPointer, ripple.x, ripple.z);
      gl!.uniform1f(uTime, t);
      gl!.drawArrays(gl!.POINTS, 0, n * n);
    }

    function drawTrail() {
      const now = performance.now() / 1000;
      while (path.length && now - path[0].t > TRAIL_LIFE) path.shift();
      for (let i = sparks.length - 1; i >= 0; i--) if (now - sparks[i].t > SPARK_LIFE) sparks.splice(i, 1);
      if (!path.length && !sparks.length) return;

      let k = 0;
      const put = (x: number, y: number, alpha: number, size: number) => {
        if (k >= TRAIL_MAX * 4) return;
        trailData[k++] = x;
        trailData[k++] = y;
        trailData[k++] = alpha;
        trailData[k++] = size;
      };
      // The tail: dots every ~3px along the path, fading and thinning with age.
      for (let i = path.length - 1; i > 0; i--) {
        const a = path[i], b = path[i - 1];
        const steps = Math.min(Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 3), 30);
        for (let j = 0; j < steps; j++) {
          const f = j / steps;
          const life = 1 - (now - (a.t + (b.t - a.t) * f)) / TRAIL_LIFE;
          if (life > 0) put(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, life * life * 0.8, 1.5 + life * 5);
        }
      }
      // The head: a bright point with a soft halo, while it's moving.
      const head = path[path.length - 1];
      if (head) {
        const life = 1 - (now - head.t) / TRAIL_LIFE;
        put(head.x, head.y, life * 0.35, 18 * life);
        put(head.x, head.y, life, 7);
      }
      for (const p of sparks) {
        const age = now - p.t;
        const life = 1 - age / SPARK_LIFE;
        put(p.x + p.vx * age, p.y + p.vy * age + 30 * age * age, life * 0.9, p.size);
      }

      gl!.useProgram(trail);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, trailBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, trailData.subarray(0, k), gl!.DYNAMIC_DRAW);
      gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 16, 0);
      gl!.vertexAttribPointer(1, 2, gl!.FLOAT, false, 16, 8);
      gl!.enableVertexAttribArray(1);
      gl!.drawArrays(gl!.POINTS, 0, k / 4);
      gl!.disableVertexAttribArray(1);
    }

    function drawAt(t: number, ease = 1) {
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      drawSky(t);
      drawSea(t);
      drawHead(t, ease);
      drawTrail();
    }

    const start = performance.now();
    const frameGap = mobile ? 1000 / 30 : 0;
    let last = 0;
    let raf = 0;
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (now - last < frameGap) return;
      // The head's turn eases by elapsed time, not per frame, so it keeps
      // the same pace on a PC that can't hold 60 fps.
      const ease = last ? 1 - Math.exp(-((now - last) / 1000) * 3) : 0.05;
      last = now;
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      drawAt((now - start) / 1000, ease);
    }

    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(frame);
    }

    const redrawStill = () => drawAt(4);
    if (still) {
      redrawStill();
      window.addEventListener("resize", redrawStill);
    } else {
      raf = requestAnimationFrame(frame);
      document.addEventListener("visibilitychange", onVisibility);
    }
    canvas.classList.add("is-ready");

    // Build the head in ~8ms slices between frames so the sea starts moving
    // straight away and typing never stutters; it rises into view when done.
    let buildTimer = 0;
    if (!mobile) {
      const builder = headBuilder();
      const pump = () => {
        const done = builder.step(performance.now() + 8);
        if (!done) {
          buildTimer = window.setTimeout(pump, 0);
          return;
        }
        headBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, headBuf);
        gl.bufferData(gl.ARRAY_BUFFER, done, gl.STATIC_DRAW);
        headCount = done.length / FLOATS_PER_POINT;
        headShownAt = performance.now();
        if (still) redrawStill();
      };
      buildTimer = window.setTimeout(pump, 200);
    }

    // GPU reset / driver hiccup: fade back out to the plain CSS background
    // rather than leave a blank canvas on top of it.
    function onLost() {
      cancelAnimationFrame(raf);
      canvas!.classList.remove("is-ready");
    }
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(buildTimer);
      cardObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", redrawStill);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      // Free the GL objects but not the context: a canvas hands back the
      // same context on the next getContext, so losing it here would leave
      // StrictMode's remount (and any remount) drawing into a dead one.
      for (const b of [oceanBuf, starBuf, lineBuf, trailBuf, headBuf]) gl.deleteBuffer(b);
      for (const p of [ocean, fig, sky, trail]) gl.deleteProgram(p);
    };
  }, [deep, crest, frameRef]);

  return <canvas ref={canvasRef} className="login-tide" aria-hidden="true" />;
}
