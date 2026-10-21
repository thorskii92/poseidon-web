/**
 * The dot-Poseidon that peeks over the sign-in card: a bald head and neck
 * like a wireframe face scan, as a cloud of points scattered over a surface,
 * with two glowing pupils.
 *
 * The surface is a signed distance function (ellipsoids, spheres and
 * tapered capsules blended together), so there's no 3D model file to ship.
 * Points are found by rejection-sampling a thin shell around it and then
 * snapping them onto it along the gradient, which spreads them roughly
 * evenly by area.
 *
 * Model space: y up, the face looks down +z, the head is ~2 units tall
 * (chin to crown) with the neck below.
 *
 * Output is interleaved, 8 floats a point: position xyz, normal xyz, a
 * random seed (twinkle phase) and a kind (0 surface, 1 glowing pupil).
 */

export const FLOATS_PER_POINT = 8;

type Sdf = (x: number, y: number, z: number) => number;

// ---- primitives (scalar args so the hot loop doesn't allocate) ----

function ellipsoid(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function sphere(x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) {
  return Math.hypot(x - cx, y - cy, z - cz) - r;
}

/** Capsule from a to b whose radius goes r1 → r2. */
function taper(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (r1 + (r2 - r1) * h);
}

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

// ---- the head and neck ----

const head: Sdf = (x, y, z) => {
  let d = ellipsoid(x, y, z, 0, 0.2, -0.05, 0.72, 0.9, 0.85); // cranium
  d = smin(d, ellipsoid(x, y, z, 0, -0.2, 0.2, 0.58, 0.75, 0.62), 0.2); // face
  d = smin(d, ellipsoid(x, y, z, 0, -0.62, 0.3, 0.4, 0.28, 0.38), 0.2); // jaw, chin
  d = smin(d, taper(x, y, z, -0.38, 0.18, 0.66, 0.38, 0.18, 0.66, 0.08, 0.08), 0.1); // brow
  for (const s of [-1, 1]) {
    d = smin(d, sphere(x, y, z, s * 0.36, -0.14, 0.5, 0.2), 0.15); // cheekbone
    d = smax(d, -sphere(x, y, z, s * 0.24, 0.04, 0.8, 0.15), 0.08); // eye socket
    d = Math.min(d, sphere(x, y, z, s * 0.24, 0.03, 0.62, 0.11)); // eyeball
    d = smin(d, sphere(x, y, z, s * 0.08, -0.27, 0.84, 0.065), 0.05); // nostril wing
    d = smin(d, ellipsoid(x, y, z, s * 0.7, 0.0, -0.02, 0.08, 0.2, 0.13), 0.06); // ear
  }
  d = smin(d, taper(x, y, z, 0, 0.08, 0.76, 0, -0.24, 0.94, 0.06, 0.1), 0.06); // nose
  d = smin(d, taper(x, y, z, -0.16, -0.42, 0.78, 0.16, -0.42, 0.78, 0.045, 0.045), 0.04); // upper lip
  d = smin(d, taper(x, y, z, -0.13, -0.5, 0.76, 0.13, -0.5, 0.76, 0.05, 0.05), 0.04); // lower lip
  d = smin(d, taper(x, y, z, 0, -0.65, -0.08, 0, -1.6, -0.05, 0.31, 0.36), 0.15); // neck
  return d;
};
const HEAD_BOX = [-0.85, 0.85, -1.65, 1.15, -1.0, 1.05];

// ---- sampling ----

/** Small seeded PRNG, so the figure (and the stars) come out the same on
 *  every load. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grad = new Float64Array(3);
/** Unit gradient of f at p into `grad` (tetrahedral differences, 4 evals). */
function gradient(f: Sdf, x: number, y: number, z: number) {
  const k = 0.002;
  const a = f(x + k, y - k, z - k);
  const b = f(x - k, y - k, z + k);
  const c = f(x - k, y + k, z - k);
  const e = f(x + k, y + k, z + k);
  const gx = a - b - c + e, gy = -a - b + c + e, gz = -a + b - c + e;
  const l = Math.hypot(gx, gy, gz) || 1;
  grad[0] = gx / l;
  grad[1] = gy / l;
  grad[2] = gz / l;
}

function* sampleSurface(f: Sdf, box: number[], count: number, out: number[], rng: () => number) {
  const [x0, x1, y0, y1, z0, z1] = box;
  let got = 0;
  for (let tries = 0; got < count && tries < count * 80; tries++) {
    if ((tries & 511) === 0) yield;
    let x = x0 + rng() * (x1 - x0);
    let y = y0 + rng() * (y1 - y0);
    let z = z0 + rng() * (z1 - z0);
    if (Math.abs(f(x, y, z)) > 0.05) continue;
    for (let i = 0; i < 3; i++) {
      const d = f(x, y, z);
      gradient(f, x, y, z);
      x -= grad[0] * d;
      y -= grad[1] * d;
      z -= grad[2] * d;
    }
    if (Math.abs(f(x, y, z)) > 0.005) continue;
    gradient(f, x, y, z);
    out.push(x, y, z, grad[0], grad[1], grad[2], rng(), 0);
    got++;
  }
}

/** The glowing pupils: a small bright disc on the front of each eyeball. */
function pupils(out: number[], rng: () => number) {
  for (const s of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.04;
      out.push(s * 0.24 + Math.cos(a) * r, 0.03 + Math.sin(a) * r, 0.73, 0, 0, 1, rng(), 1);
    }
  }
}

/**
 * Builds the head a slice at a time so it never stalls the page: call
 * `step(deadline)` repeatedly (e.g. from setTimeout) until it returns the
 * finished points (interleaved, FLOATS_PER_POINT each) instead of null.
 */
export function headBuilder(detail = 1) {
  const out: number[] = [];
  const work = (function* () {
    const rng = mulberry32(20261021);
    yield* sampleSurface(head, HEAD_BOX, Math.round(4000 * detail), out, rng);
    pupils(out, rng);
  })();

  return {
    step(deadline: number): Float32Array | null {
      while (performance.now() < deadline) {
        if (work.next().done) return new Float32Array(out);
      }
      return null;
    },
  };
}
