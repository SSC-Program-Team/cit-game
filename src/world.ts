/**
 * Stanley at real scale: one tile is one metre, 16 px. The ground, roads, coastline, walls and
 * every building outline come from OpenStreetMap (© OpenStreetMap contributors, ODbL) via
 * src/stanley-osm.ts and are rasterised here at load. The map is far too big for one canvas
 * (about 22,500 x 20,500 px), so it is drawn in 512 px chunks as you walk, and only the chunks
 * near the camera are kept. See docs/design/stanley-expansion.md §2.
 */
import { OSM } from './stanley-osm.ts';
import { ROUTES } from './minibus.ts';
import { COVER, ROOF } from './stanley-cover.ts';

export const TILE = 16;
export const MAP_W = OSM.w;
export const MAP_H = OSM.h;
const N = MAP_W * MAP_H;

export type PlaceKind =
  | 'job' | 'board' | 'shop' | 'pirate' | 'employer' | 'library' | 'course'
  | 'police' | 'prison' | 'flavour' | 'offer' | 'bus' | 'minibus';

export type Place = {
  id: string;
  /** tile the player stands on to interact */
  tx: number; ty: number;
  name: string;
  kind: PlaceKind;
  line: string;
  /** a person stands here (drawn by main.ts) */
  person?: string;
};

// ------------------------------------------------------------------ ground ---
export const Gr = {
  Hill: 0, Sea: 1, Beach: 2, Wood: 3, Cemetery: 4, Pitch: 5, Park: 6, Parking: 7, Plaza: 8, Pier: 9, Built: 10,
  School: 11, Yard: 12, Road: 13, Lane: 14, Path: 15, Steps: 16, Building: 17, Wall: 18,
  /** open grass (lawns and meadows seen in the aerial photo), the edge of a wood, shore rock */
  Grass: 19, Scrub: 20, Rock: 21,
  /** a moving stairway (Stanley Plaza): walkable, and it carries you along */
  Escalator: 22,
} as const;
export type Gr = (typeof Gr)[keyof typeof Gr];

/** ground per tile */
export const grid = new Uint8Array(N);
/** building index per tile, -1 for none */
export const bid = new Int32Array(N).fill(-1);

/** is this metre in the village core, where open ground is paved rather than garden */
const core = (x: number, y: number): boolean => (x >= 460 && x <= 845 && y >= 300 && y <= 700) || (x >= 280 && x <= 470 && y >= 260 && y <= 490);

const hash = (x: number, y: number, salt = 0): number => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// -------------------------------------------------------- tidy building outlines ---
/**
 * OSM outlines are traced by hand from aerial photos: every jog, bay and wobble is there, and at
 * 16 px a metre they read as odd shapes. Each outline is redrawn as an architect would block it in:
 *   1. find the building's main direction (the length-weighted average of its edge angles, mod 90°);
 *      if that is within 20° of north it is snapped to square with the map, for clean pixel walls;
 *   2. if the outline fills most of its rectangle in that direction, it simply becomes the rectangle;
 *   3. otherwise it is drawn on a 1 m grid in that direction, notches and stubs under 2 m are filled
 *      or trimmed, and the outside of what is left is traced back out: only right angles remain.
 * Small sheds are left alone. Artistic, not surveyed: walls move by up to a metre or so.
 */
function regularize(p: number[]): number[] {
  const n = p.length / 2 - (p[0] === p[p.length - 2] && p[1] === p[p.length - 1] ? 1 : 0);
  if (n < 3) return p;
  // 1. main direction
  let sx = 0, sy = 0, area = 0;
  for (let i = 0; i < n; i += 1) {
    const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], by = p[((i + 1) % n) * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax) * 4;
    sx += Math.cos(a) * len; sy += Math.sin(a) * len;
    area += ax * by - bx * ay;
  }
  area = Math.abs(area) / 2;
  if (area < 12) return p;
  let th = Math.atan2(sy, sx) / 4; // in (-45°, 45°]
  if (Math.abs(th) < (20 * Math.PI) / 180) th = 0;
  const c = Math.cos(th), s = Math.sin(th);
  const rot: number[] = [];
  for (let i = 0; i < n; i += 1) { const x = p[i * 2], y = p[i * 2 + 1]; rot.push(x * c + y * s, -x * s + y * c); }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < rot.length; i += 2) { x0 = Math.min(x0, rot[i]); x1 = Math.max(x1, rot[i]); y0 = Math.min(y0, rot[i + 1]); y1 = Math.max(y1, rot[i + 1]); }
  const back = (pts: number[]): number[] => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(Math.round((pts[i] * c - pts[i + 1] * s) * 4) / 4, Math.round((pts[i] * s + pts[i + 1] * c) * 4) / 4);
    out.push(out[0], out[1]);
    return out;
  };
  // 2. near enough a rectangle
  if (area / ((x1 - x0) * (y1 - y0)) > 0.84) return back([x0, y0, x1, y0, x1, y1, x0, y1]);
  // walls that already run square to the main direction, as a share of the perimeter
  let square = 0, perim = 0;
  for (let i = 0; i < n; i += 1) {
    const ex = rot[((i + 1) % n) * 2] - rot[i * 2], ey = rot[((i + 1) % n) * 2 + 1] - rot[i * 2 + 1], len = Math.hypot(ex, ey);
    perim += len;
    if (Math.min(Math.abs(ex), Math.abs(ey)) / (len || 1) < 0.2) square += len;
  }
  // a building with real diagonal or curved walls keeps them, just straightened
  if (square / perim < 0.85) return straighten(p, th);
  // 3. on a 1 m grid in the building's own direction
  const ox = Math.round(x0), oy = Math.round(y0);
  const W = Math.round(x1) - ox + 2, H = Math.round(y1) - oy + 2;
  let m: Uint8Array = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const px = ox + x + 0.5, py = oy + y + 0.5;
    let inside = false;
    for (let i = 0, j = rot.length - 2; i < rot.length; j = i, i += 2) {
      if ((rot[i + 1] > py) !== (rot[j + 1] > py) && px < ((rot[j] - rot[i]) * (py - rot[i + 1])) / (rot[j + 1] - rot[i + 1]) + rot[i]) inside = !inside;
    }
    m[y * W + x] = inside ? 1 : 0;
  }
  const get = (a: Uint8Array, x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? 0 : a[y * W + x]);
  /** grow (1) or shrink (0) by one cell, with a 3x3 cross */
  const morph = (a: Uint8Array, grow: boolean): Uint8Array => {
    const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const v = [get(a, x, y), get(a, x - 1, y), get(a, x + 1, y), get(a, x, y - 1), get(a, x, y + 1)];
      o[y * W + x] = grow ? (v.some((q) => q) ? 1 : 0) : (v.every((q) => q) ? 1 : 0);
    }
    return o;
  };
  const count = (a: Uint8Array): number => a.reduce((t, v) => t + v, 0);
  const before = count(m);
  if (!before) return p;
  // fill notches (close), then trim stubs (open) when that keeps the building whole
  const closed = morph(morph(m, true), false);
  m = closed;
  const opened = morph(morph(m, false), true);
  if (count(opened) > before * 0.85) m = opened;
  // 4. trace the outside: boundary edges of filled cells, chained into loops; keep the longest
  const next = new Map<string, [number, number]>();
  const add = (ax: number, ay: number, bx: number, by: number): void => { next.set(`${ax},${ay}`, [bx, by]); };
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!m[y * W + x]) continue;
    if (!get(m, x, y - 1)) add(x, y, x + 1, y);
    if (!get(m, x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!get(m, x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!get(m, x - 1, y)) add(x, y + 1, x, y);
  }
  let best: Array<[number, number]> = [];
  const used = new Set<string>();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: Array<[number, number]> = [];
    let k = start;
    while (!used.has(k) && next.has(k)) {
      used.add(k);
      const [x, y] = k.split(',').map(Number);
      loop.push([x, y]);
      const [nx, ny] = next.get(k)!;
      k = `${nx},${ny}`;
    }
    if (loop.length > best.length) best = loop;
  }
  if (best.length < 4) return p;
  // drop the points in the middle of straight runs
  const corners: number[] = [];
  for (let i = 0; i < best.length; i += 1) {
    const a = best[(i + best.length - 1) % best.length], b = best[i], d = best[(i + 1) % best.length];
    if ((a[0] === b[0] && b[0] === d[0]) || (a[1] === b[1] && b[1] === d[1])) continue;
    corners.push(ox + b[0], oy + b[1]);
  }
  return corners.length >= 8 ? back(corners) : p;
}
/**
 * Tidy an outline that has real diagonal walls: drop wobbles under 0.7 m, merge runs that point
 * the same way, square up walls within 15° of the main direction, and put the corners back where
 * the straightened walls meet. Falls back to the plain simplified outline if that goes wrong.
 */
function straighten(p: number[], th: number): number[] {
  // Douglas-Peucker on the closed ring
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const dp = (a: number, b: number, keep: boolean[]): void => {
    let far = -1, fd = 0.7;
    const [ax, ay] = pts[a], [bx, by] = pts[b % pts.length];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs((pts[i][0] - ax) * (by - ay) - (pts[i][1] - ay) * (bx - ax)) / l;
      if (d > fd) { fd = d; far = i; }
    }
    if (far >= 0) { keep[far] = true; dp(a, far, keep); dp(far, b, keep); }
  };
  // split the ring at the point farthest from the first, so a closed ring does not collapse
  let split = 0, sd = -1;
  for (let i = 0; i < pts.length; i += 1) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > sd) { sd = d; split = i; } }
  const keep = pts.map((_, i) => i === 0 || i === split);
  dp(0, split, keep); dp(split, pts.length, keep);
  let ring = pts.filter((_, i) => keep[i]);
  if (ring.length < 3) return p;
  const flat = (r: Array<[number, number]>): number[] => { const o: number[] = []; for (const [x, y] of r) o.push(x, y); o.push(r[0][0], r[0][1]); return o; };
  const simple = flat(ring);
  // edges as lines: a point and a direction, with near-square ones snapped
  type Line = { x: number; y: number; dx: number; dy: number; len: number };
  let lines: Line[] = [];
  const ux = Math.cos(th), uy = Math.sin(th);
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    let dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    const along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
    const tol = Math.sin((15 * Math.PI) / 180);
    if (Math.abs(across) < tol) { const sg = Math.sign(along); dx = ux * sg; dy = uy * sg; }
    else if (Math.abs(along) < tol) { const sg = Math.sign(across); dx = -uy * sg; dy = ux * sg; }
    lines.push({ x: (ax + bx) / 2, y: (ay + by) / 2, dx, dy, len });
  }
  // merge neighbours that now point the same way (keep the longer one's line)
  for (let changed = true; changed && lines.length > 3;) {
    changed = false;
    for (let i = 0; i < lines.length; i += 1) {
      const a = lines[i], b = lines[(i + 1) % lines.length];
      if (a.dx * b.dx + a.dy * b.dy > 0.985) {
        const keepA = a.len >= b.len;
        const m = keepA ? a : b;
        lines[i] = { ...m, len: a.len + b.len };
        lines.splice((i + 1) % lines.length, 1);
        if ((i + 1) % lines.length === 0 && i !== 0) lines = [lines[lines.length - 1], ...lines.slice(0, -1)];
        changed = true; break;
      }
    }
  }
  if (lines.length < 3) return simple;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const a = lines[(i + lines.length - 1) % lines.length], b = lines[i];
    const cr = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(cr) < 0.05) return simple;
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / cr;
    out.push([a.x + a.dx * t, a.y + a.dy * t]);
  }
  // sanity: corners near the original, area about the same
  const areaOf = (r: Array<[number, number]>): number => { let A = 0; for (let i = 0; i < r.length; i += 1) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; A += x0 * y1 - x1 * y0; } return Math.abs(A) / 2; };
  const a0 = areaOf(ring), a1 = areaOf(out);
  const nearOrig = out.every(([x, y]) => pts.some(([qx, qy]) => Math.hypot(qx - x, qy - y) < 2.5));
  if (!nearOrig || a1 < a0 * 0.85 || a1 > a0 * 1.15) return simple;
  return flat(out.map(([x, y]) => [Math.round(x * 4) / 4, Math.round(y * 4) / 4]));
}
/**
 * A terrace stepping along a diagonal street traces as a sawtooth of short walls. Any run of three
 * or more walls each under 2.6 m becomes one straight wall from the run's first corner to its last.
 */
function destair(p: number[]): number[] {
  const r: Array<[number, number]> = [];
  for (let i = 0; i + 1 < p.length; i += 2) r.push([p[i], p[i + 1]]);
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  const n = r.length;
  if (n < 6) return p;
  const short = r.map((a, i) => Math.hypot(r[(i + 1) % n][0] - a[0], r[(i + 1) % n][1] - a[1]) < 2.6);
  if (short.every(Boolean)) return p;
  // start just after a long wall, so runs do not wrap
  const s0 = (short.findIndex((v) => !v) + 1) % n;
  const drop = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n;) {
    const i = (s0 + k) % n;
    if (!short[i]) { k += 1; continue; }
    let len = 0;
    while (k + len < n && short[(s0 + k + len) % n]) len += 1;
    if (len >= 3) for (let j = 1; j < len; j += 1) drop[(s0 + k + j) % n] = true; // keep the run's ends
    k += len;
  }
  const out = r.filter((_, i) => !drop[i]);
  if (out.length < 3) return p;
  const area = (q: Array<[number, number]>): number => { let A = 0; for (let i = 0; i < q.length; i += 1) A += q[i][0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * q[i][1]; return Math.abs(A) / 2; };
  const a0 = area(r), a1 = area(out);
  if (a1 < a0 * 0.85 || a1 > a0 * 1.15) return p;
  const o: number[] = [];
  for (const [x, y] of out) o.push(x, y);
  o.push(out[0][0], out[0][1]);
  return o;
}
/**
 * Escalators, in metres. Stanley Plaza steps down the hill from the bus terminus deck to the
 * amphitheatre by the waterfront; a pair of escalators runs straight down through it, cut through
 * the building. `x` is the centre line; the west lane goes down (south), the east lane up.
 */
export type Escalator = { name: string; x: number; y0: number; y1: number; w: number };
export const ESCALATORS: Escalator[] = [{ name: 'stanley plaza escalators', x: 404, y0: 345, y1: 423, w: 5 }];
/** which way an escalator carries you at a world pixel: +1 south, -1 north, 0 not on one */
export function escalatorAt(px: number, py: number): number {
  const mx = px / 16, my = py / 16;
  for (const e of ESCALATORS) {
    if (my < e.y0 + 1.2 || my > e.y1 - 1.2 || Math.abs(mx - e.x) > e.w / 2 - 0.3) continue;
    if (Math.abs(mx - e.x) < 0.3) return 0; // the median between the lanes
    return mx < e.x ? 1 : -1;
  }
  return 0;
}
/** every building's tidied outline, by OSM index */
const SHAPES: number[][] = OSM.buildings.map(([p]) => destair(regularize(p)));

const AREA_CODE: Record<string, Gr> = {
  beach: Gr.Beach, wood: Gr.Wood, cemetery: Gr.Cemetery, pitch: Gr.Pitch, park: Gr.Park, parking: Gr.Parking,
  plaza: Gr.Plaza, pier: Gr.Pier, prison: Gr.Yard, school: Gr.School, built: Gr.Built, water: Gr.Sea,
};

/** fill a polygon (flat metre list) by tile centre, calling back each tile index */
function fillPoly(p: number[], cb: (k: number) => void): void {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < p.length; i += 2) { y0 = Math.min(y0, p[i]); y1 = Math.max(y1, p[i]); }
  const xs: number[] = [];
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(MAP_H - 1, Math.ceil(y1)); y += 1) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ay = p[i + 1], by = p[j + 1];
      if ((ay > cy) !== (by > cy)) xs.push(p[i] + ((cy - ay) * (p[j] - p[i])) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(MAP_W - 1, Math.floor(xs[i + 1] - 0.5)); x += 1) cb(y * MAP_W + x);
    }
  }
}

/** stamp a polyline of a given width, calling back each tile index whose centre is inside */
function stampLine(p: number[], width: number, cb: (k: number) => void): void {
  const r = width / 2;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(MAP_W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(MAP_H - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5, py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
      if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= r) cb(y * MAP_W + x);
    }
  }
}

/** mark every tile a thin line passes through (no width), for barriers like the coastline */
function traceLine(p: number[], cb: (k: number) => void): void {
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 4) + 1;
    for (let s = 0; s <= steps; s += 1) {
      const x = Math.floor(ax + ((bx - ax) * s) / steps), y = Math.floor(ay + ((by - ay) * s) / steps);
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) cb(y * MAP_W + x);
    }
  }
}

const bboxArea = (p: number[]): number => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return (x1 - x0) * (y1 - y0);
};

/** road widths in metres, kerb to kerb (footpaths a little wider than life so they read) */
const ROAD: Record<string, [Gr, number]> = {
  secondary: [Gr.Road, 9], tertiary: [Gr.Road, 7.5], tertiary_link: [Gr.Road, 6], unclassified: [Gr.Lane, 5.5],
  residential: [Gr.Lane, 5], living_street: [Gr.Lane, 4.5], service: [Gr.Lane, 3.5], pedestrian: [Gr.Path, 4],
  footway: [Gr.Path, 2.2], path: [Gr.Path, 1.8], steps: [Gr.Steps, 2.2], cycleway: [Gr.Path, 2],
};

{
  // 1. land use, biggest first so the smaller, more specific areas win
  const areas = [...OSM.areas].sort((a, b) => bboxArea(b[0]) - bboxArea(a[0]));
  for (const [p, cls] of areas) {
    const code = AREA_CODE[cls];
    if (code !== undefined) fillPoly(p, (k) => { grid[k] = code; });
  }
  // 2. the sea: trace the coastline as a barrier and flood both bays from inside
  const coast = new Uint8Array(N);
  for (const p of OSM.coast) traceLine(p, (k) => { coast[k] = 1; });
  const seeds: Array<[number, number]> = [[484, 820], [1212, 268], [284, 1156], [700, 1250]];
  for (const [sx, sy] of seeds) {
    const s0 = sy * MAP_W + sx;
    if (coast[s0] || grid[s0] === Gr.Sea && coast[s0] === 2) continue;
    const q = new Int32Array(N);
    let head = 0, tail = 0;
    q[tail++] = s0; coast[s0] = 2;
    while (head < tail) {
      const k = q[head++];
      grid[k] = Gr.Sea;
      const x = k % MAP_W;
      if (x > 0 && !coast[k - 1]) { coast[k - 1] = 2; q[tail++] = k - 1; }
      if (x < MAP_W - 1 && !coast[k + 1]) { coast[k + 1] = 2; q[tail++] = k + 1; }
      if (k >= MAP_W && !coast[k - MAP_W]) { coast[k - MAP_W] = 2; q[tail++] = k - MAP_W; }
      if (k < N - MAP_W && !coast[k + MAP_W]) { coast[k + MAP_W] = 2; q[tail++] = k + MAP_W; }
    }
  }
  // 2b. land cover from the aerial photo, where we have it: woods, lawns, coastal rock and sand.
  //     Only open ground is changed; roads, paths and buildings are stamped over it next.
  {
    const raw = atob(COVER.runs);
    const cover = new Uint8Array(COVER.w * COVER.h);
    for (let i = 0, o = 0; i < raw.length; i += 1) {
      const b = raw.charCodeAt(i), v = b >> 5;
      for (let n = (b & 31) + 1; n > 0; n -= 1) cover[o++] = v;
    }
    // metres to the sea (up to 24), so rock and sand are only taken on the shore
    const toSea = new Uint8Array(COVER.w * COVER.h).fill(255);
    const q: number[] = [];
    for (let y = 0; y < COVER.h; y += 1) for (let x = 0; x < COVER.w; x += 1) {
      if (grid[(y + COVER.y) * MAP_W + x + COVER.x] === Gr.Sea) { toSea[y * COVER.w + x] = 0; q.push(y * COVER.w + x); }
    }
    for (let h = 0; h < q.length; h += 1) {
      const k = q[h], d = toSea[k];
      if (d >= 24) continue;
      const x = k % COVER.w;
      for (const n of [x > 0 ? k - 1 : -1, x < COVER.w - 1 ? k + 1 : -1, k - COVER.w, k + COVER.w]) {
        if (n >= 0 && n < toSea.length && toSea[n] === 255) { toSea[n] = d + 1; q.push(n); }
      }
    }
    for (let y = 0; y < COVER.h; y += 1) for (let x = 0; x < COVER.w; x += 1) {
      const c = cover[y * COVER.w + x];
      if (!c) continue;
      const gx = x + COVER.x, gy = y + COVER.y, k = gy * MAP_W + gx, g = grid[k];
      const open = g === Gr.Hill || g === Gr.Wood || g === Gr.Park || g === Gr.School || (g === Gr.Built && !core(gx, gy));
      if (!open && !(g === Gr.Beach && c !== 1)) continue;
      const shore = toSea[y * COVER.w + x] <= 24;
      if (c === 1) grid[k] = Gr.Wood;
      else if (c === 2) grid[k] = g === Gr.Park || g === Gr.School ? g : Gr.Grass;
      else if (c === 3 && shore) grid[k] = Gr.Rock;
      else if (c === 4 && shore) grid[k] = Gr.Beach;
    }
  }
  // 3. roads and paths, footpaths first so roads win where they meet; a path over water is a pier
  const rank = (h: string): number => (ROAD[h]?.[0] === Gr.Road ? 3 : ROAD[h]?.[0] === Gr.Lane ? 2 : 1);
  for (const [p, h] of [...OSM.roads].sort((a, b) => rank(a[1]) - rank(b[1]))) {
    const def = ROAD[h];
    if (!def) continue;
    const [code, width] = def;
    stampLine(p, width, (k) => {
      if (grid[k] === Gr.Sea) { if (code === Gr.Path) grid[k] = Gr.Pier; return; }
      grid[k] = code;
    });
  }
  // 3b. pavements: open ground beside a road becomes footway (OSM rarely maps them)
  {
    const side = new Uint8Array(N);
    for (let y = 2; y < MAP_H - 2; y += 1) for (let x = 2; x < MAP_W - 2; x += 1) {
      const g = grid[y * MAP_W + x];
      if (g !== Gr.Road && g !== Gr.Lane) continue;
      const r = g === Gr.Road ? 2 : 1;
      for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) side[(y + dy) * MAP_W + x + dx] = 1;
    }
    for (let k = 0; k < N; k += 1) {
      const g = grid[k];
      if (side[k] && (g === Gr.Hill || g === Gr.Grass || g === Gr.Park || g === Gr.Built || g === Gr.School || g === Gr.Yard)) grid[k] = Gr.Path;
    }
  }
  // 4. buildings
  SHAPES.forEach((p, i) => fillPoly(p, (k) => { if (grid[k] !== Gr.Sea) { grid[k] = Gr.Building; bid[k] = i; } }));
  // 5. walls and fences (retaining walls are only a change of level)
  for (const [p, kind] of OSM.walls) {
    if (kind === 'retaining_wall') continue;
    traceLine(p, (k) => { if (grid[k] !== Gr.Sea && grid[k] !== Gr.Building) grid[k] = Gr.Wall; });
  }
  // 5a. escalators: cut a clear slot through whatever they pass
  for (const e of ESCALATORS) {
    for (let y = Math.floor(e.y0); y < Math.ceil(e.y1); y += 1) for (let x = Math.floor(e.x - e.w / 2); x < Math.ceil(e.x + e.w / 2); x += 1) {
      const k = y * MAP_W + x;
      grid[k] = y < e.y0 + 1.2 || y >= e.y1 - 1.2 ? Gr.Path : Gr.Escalator; // landings at both ends
      bid[k] = -1;
    }
  }
  // 5b. outside the aerial photo, open hillside gets invented copses, so it matches the wooded
  //     hills the photo shows (Stanley's slopes are mostly trees). Artistic, not surveyed.
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    const k = y * MAP_W + x;
    if (grid[k] !== Gr.Hill) continue;
    if (x >= COVER.x && x < COVER.x + COVER.w && y >= COVER.y && y < COVER.y + COVER.h) continue;
    const v = 0.7 * vnoise(x / 28, y / 28, 120) + 0.3 * vnoise(x / 9, y / 9, 121);
    if (v > 0.58) grid[k] = Gr.Wood;
    else if (v > 0.53) grid[k] = Gr.Scrub;
  }
  // 6. woods are thick, so they block; but keep a walkable fringe of scrub two metres deep along
  //    every path, road and building, so trails stay open and no door ends up in the trees
  {
    const keep = (g: number): boolean => g !== Gr.Wood && g !== Gr.Hill && g !== Gr.Grass && g !== Gr.Scrub && g !== Gr.Sea && g !== Gr.Rock && g !== Gr.Beach && g !== Gr.Cemetery && g !== Gr.Park && g !== Gr.School && g !== Gr.Built;
    const edge = new Uint8Array(N);
    for (let y = 2; y < MAP_H - 2; y += 1) for (let x = 2; x < MAP_W - 2; x += 1) {
      if (!keep(grid[y * MAP_W + x])) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) edge[(y + dy) * MAP_W + x + dx] = 1;
    }
    for (let k = 0; k < N; k += 1) if (edge[k] && grid[k] === Gr.Wood) grid[k] = Gr.Scrub;
  }
}

const SOLID = new Set<number>([Gr.Sea, Gr.Wood, Gr.Building, Gr.Wall]);

export function solidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return SOLID.has(grid[ty * MAP_W + tx]);
}

export const walkableTile = (tx: number, ty: number): boolean => !solidTile(tx, ty);
export const isSea = (tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && grid[ty * MAP_W + tx] === Gr.Sea;

/** a point in world pixels is solid if any corner of a small foot box is */
export function solidAt(px: number, py: number): boolean {
  const pts: Array<[number, number]> = [[px - 5, py - 3], [px + 5, py - 3], [px - 5, py + 2], [px + 5, py + 2]];
  return pts.some(([x, y]) => solidTile(Math.floor(x / TILE), Math.floor(y / TILE)));
}

// ------------------------------------------------------------- buildings ---
export type BuildingStyle = 'shop' | 'apartments' | 'house' | 'school' | 'temple' | 'civic' | 'mall' | 'heritage' | 'quarters';

export type Building = {
  /** outline in metres, flat [x0, y0, x1, y1, ...] */
  poly: number[];
  name: string;
  style: BuildingStyle;
  x0: number; y0: number; x1: number; y1: number;
  /** how many tile rows of front wall show below the roof */
  wall: number;
  door: { x: number; y: number } | null;
  roof: string;
  /** a pitched, tiled roof (otherwise flat, with a parapet) */
  pitched: boolean;
  /** real height in metres, from the 3D model, when known */
  height: number;
  /** how the front walls are drawn: rows of windows (default), open colonnades, or a glass curtain wall */
  facade: 'windows' | 'colonnade' | 'glass';
  /** a flat roof that people use: paving, planters and trees rather than plant rooms */
  terrace: boolean;
  /** chimney stacks on the roof */
  chimneys: number;
  /** a landmark's own wall colour, instead of its style's */
  wallColour?: string;
};

/**
 * Landmarks people know get their own look, so they read as themselves rather than as a generic
 * block. Keyed by the OSM name; anything not given keeps the usual style. Add to this as you go.
 */
type Landmark = { wall?: string; roof?: string; pitched?: boolean; facade?: Building['facade']; terrace?: boolean; chimneys?: number; wallH?: number };
const LANDMARKS: Record<string, Landmark> = {
  // 1840s granite colonial block, rebuilt here in 2001: colonnades on every floor, grey hipped roof
  'Murray House': { wall: '#ddd5c2', roof: '#5d6266', pitched: true, facade: 'colonnade', chimneys: 6, wallH: 6 },
  // terraced mall stepping down to the waterfront: glass shopfronts, a public terrace on top
  'Stanley Plaza': { wall: '#d9d3c6', roof: '#c9bfa8', pitched: false, facade: 'glass', terrace: true, wallH: 4 },
};


const ROOFS: Record<BuildingStyle, string[]> = {
  shop: ['#9a6a52', '#7a7a82', '#a8845a', '#6a7a8a', '#8a5a4a', '#b0a08a', '#6e8a7a'],
  apartments: ['#9aa0a8', '#a8aab0', '#8e949c', '#b4aca0'],
  house: ['#a8604a', '#b07a5a', '#8a6a5a', '#7a8a9a', '#9a5a4a', '#6a7a6a'],
  school: ['#8a3a32', '#9a4a3a', '#7e3a30'],
  temple: ['#3f7a5a'],
  civic: ['#8c8478', '#9a9286'],
  mall: ['#7d8fa3'],
  heritage: ['#8a8f86'],
  quarters: ['#7a7e86', '#868a90'],
};

function styleFor(kind: string, extra: string, cx: number, cy: number): BuildingStyle {
  if (kind === 'school' || kind === 'college' || kind === 'university') return 'school';
  if (kind === 'apartments' || kind === 'residential' && !core(cx, cy)) return 'apartments';
  if (extra === 'place_of_worship' || kind === 'church' || kind === 'temple' || kind === 'chapel') return 'temple';
  if (kind === 'retail' && extra === 'mall') return 'mall';
  if (extra === 'museum' || extra === 'monument' || extra === 'building') return 'heritage';
  if (kind === 'civic' || kind === 'public' || kind === 'service' || kind === 'government' || extra === 'post_office' || extra === 'water_sports') return 'civic';
  if (kind === 'dormitory') return 'quarters';
  if (kind === 'house' || kind === 'detached' || kind === 'terrace') return 'house';
  if (core(cx, cy)) return 'shop';
  if (cx >= 800 && cx <= 1170 && cy >= 580 && cy <= 980) return 'school';
  if (cx >= 1160 && cy >= 670) return 'quarters';
  return 'house';
}

export const BUILDINGS: Building[] = OSM.buildings.map(([, kind, name, extra], i) => {
  const p = SHAPES[i];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const style = name === 'Murray House' ? 'heritage' : styleFor(kind, extra, cx, cy);
  const span = Math.min(x1 - x0, y1 - y0);
  const tall = style === 'apartments' || style === 'quarters' || style === 'mall';
  const real = ROOF[i];
  let wall = Math.max(2, Math.min(tall ? 7 : style === 'school' ? 3 : 4, Math.round(span * (tall ? 0.4 : style === 'school' ? 0.2 : 0.3))));
  // with a real height, draw the front wall about 0.4 of it: tall enough to read, not so tall it hides the roof
  if (real?.[1]) wall = Math.max(2, Math.min(10, Math.round(real[1] * 0.4), Math.round((y1 - y0) * 0.6)));
  const roofs = ROOFS[style];
  const pitched = real ? real[2] === 1 : style === 'house' || style === 'heritage' || style === 'school' || style === 'temple';
  const lm = LANDMARKS[name] ?? {};
  return {
    poly: p, name, style, x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1), wall: lm.wallH ?? wall, door: null,
    roof: lm.roof ?? real?.[0] ?? roofs[Math.floor(hash(Math.round(x0), Math.round(y0), 5) * roofs.length)],
    pitched: lm.pitched ?? pitched, height: real?.[1] ?? 0,
    facade: lm.facade ?? 'windows', terrace: lm.terrace ?? false, chimneys: lm.chimneys ?? 0, wallColour: lm.wall,
  };
});

/** tiles of the same building directly below this one: 0 on the bottom (front) row */
const below = new Uint8Array(N);
for (let x = 0; x < MAP_W; x += 1) {
  for (let y = MAP_H - 2; y >= 0; y -= 1) {
    const k = y * MAP_W + x;
    if (bid[k] >= 0 && bid[k + MAP_W] === bid[k]) below[k] = Math.min(255, below[k + MAP_W] + 1);
  }
}
// each building's door: on its front row, as close to the middle as the outline allows
for (let k = 0; k < N; k += 1) {
  const b = bid[k];
  if (b < 0 || below[k] !== 0) continue;
  const B = BUILDINGS[b];
  const x = k % MAP_W, y = Math.floor(k / MAP_W);
  const mid = (B.x0 + B.x1) / 2;
  if (!B.door || Math.abs(x - mid) + (B.y1 - y) * 0.5 < Math.abs(B.door.x - mid) + (B.y1 - B.door.y) * 0.5) B.door = { x, y };
}

// ---------------------------------------------------------------- places ---
/** tiles you can walk to from the bus terminus */
let REACH: Uint8Array | null = null;
function reach(): Uint8Array {
  if (!REACH) {
    let s = { x: 752, y: 412 };
    for (let r = 0; r < 20 && solidTile(s.x, s.y); r += 1) s = { x: 752 + r, y: 412 + (r % 3) };
    REACH = reachable(s.x, s.y);
  }
  return REACH;
}

/** the nearest reachable tile to a point in metres */
export function standAt(x: number, y: number, radius = 30): { tx: number; ty: number } {
  const cx = Math.round(x), cy = Math.round(y);
  let best = { tx: cx, ty: cy };
  let bd = Infinity;
  for (let r = -radius; r <= radius; r += 1) {
    for (let c = -radius; c <= radius; c += 1) {
      const tx = cx + c, ty = cy + r;
      if (!walkableTile(tx, ty) || !reach()[ty * MAP_W + tx]) continue;
      const g = grid[ty * MAP_W + tx];
      // stand on the pavement, not in the traffic
      const d = Math.hypot(c, r) - (r > 0 ? 0.5 : 0) + (g === Gr.Road || g === Gr.Lane ? 4 : 0);
      if (d < bd) { bd = d; best = { tx, ty }; }
    }
  }
  return best;
}

/** stand at a named building's front door; falls back to a point if the name is not found */
function atBuilding(name: string, fx: number, fy: number): { tx: number; ty: number } {
  const b = BUILDINGS.filter((x) => x.name === name && x.door).sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))[0];
  return b?.door ? standAt(b.door.x, b.door.y + 1.5) : standAt(fx, fy);
}

/** stand at the front door of the real building nearest a point (for shops and workplaces) */
const taken = new Set<Building>();
function atDoor(x: number, y: number): { tx: number; ty: number } {
  let best: Building | null = null;
  let bd = Infinity;
  for (const b of BUILDINGS) {
    if (!b.door || taken.has(b) || (b.x1 - b.x0) * (b.y1 - b.y0) < 30) continue;
    const d = Math.hypot(b.door.x - x, b.door.y - y);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best || bd > 60) return standAt(x, y);
  taken.add(best);
  return standAt(best.door!.x, best.door!.y + 1.5, 6);
}
/** metres from the 8 m tile coordinates the first layout used */
const m8 = (t: number): number => t * 8 + 4;
const at = (tx8: number, ty8: number): { tx: number; ty: number } => standAt(m8(tx8), m8(ty8));
const shopAt = (tx8: number, ty8: number): { tx: number; ty: number } => atDoor(m8(tx8), m8(ty8));

export const PLACES: Place[] = [
  { id: 'terminus', ...at(96, 49), name: 'stanley village bus terminus', kind: 'offer', person: '#2c2e36',
    line: 'the 6, 6x, 260 and 73 all end here.' },
  { id: 'bus', ...at(92.5, 51), name: 'bus stop', kind: 'bus',
    line: 'the bus home. a night in your own bed: the day moves on.' },
  { id: 'board', ...at(83, 57.5), name: 'notice board', kind: 'board',
    line: 'freelance gigs, pinned up by the stall holders.' },
  { id: 'library', ...atBuilding('Stanley Municipal Services Building', m8(85), m8(54)), name: 'stanley public library', kind: 'library',
    line: 'upper ground floor of the municipal services building. free to study.' },
  { id: 'pixelfix', ...shopAt(89, 61), name: 'pixel fix', kind: 'shop',
    line: 'a ground-floor computer shop off stanley new street. ah yan runs it.' },
  { id: 'pirate', ...at(84, 66), name: 'phone stall', kind: 'pirate', person: '#3a2e4a',
    line: 'a man with a bag of discs. everything is cheap.' },
  { id: 'market', ...at(87, 66.5), name: 'stanley market', kind: 'job',
    line: 'the stall holders share one router.' },
  { id: 'store', ...shopAt(80, 60), name: 'the store', kind: 'job',
    line: 'a corner store with a card machine.' },
  { id: 'plaza', ...atBuilding('Stanley Plaza', m8(46), m8(47)), name: 'stanley plaza', kind: 'course',
    line: 'the training centre on the first floor runs short courses.' },
  { id: 'murray', ...atBuilding('Murray House', m8(52), m8(66)), name: 'tide restaurant', kind: 'employer',
    line: 'a restaurant in murray house. the manager is strict.' },
  { id: 'cafe', ...shopAt(64, 58), name: 'bayview cafe', kind: 'employer',
    line: 'a cafe on stanley main street. the owner, miss ho, is easy-going.' },
  { id: 'chantai', ...shopAt(76, 59), name: 'chan tai tea shop', kind: 'job',
    line: 'chan tai waves. she always needs something fixed.' },
  { id: 'bakery', ...shopAt(71, 59), name: 'bakery', kind: 'job',
    line: 'warm bread and a receipt printer that misbehaves.' },
  { id: 'tinhau', ...atBuilding('Tin Hau Temple', m8(43), m8(54)), name: 'tin hau temple', kind: 'flavour',
    line: 'its bell is dated 1767. it stood at the west end of stanley main street long before the plaza.' },
  { id: 'pier', ...at(56, 77), name: 'blake pier', kind: 'flavour',
    line: 'moved here from central in 2006, like murray house before it.' },
  { id: 'oldpolice', ...shopAt(94, 64), name: 'old stanley police station', kind: 'flavour',
    line: 'built 1859, the oldest police station building in hong kong. now a supermarket.' },
  { id: 'police', ...shopAt(98, 59), name: 'stanley police station', kind: 'police',
    line: 'the duty officer looks up. your record is on file here.' },
  { id: 'mainbeach', ...at(104, 27), name: 'stanley main beach', kind: 'flavour',
    line: 'tai tam bay side. dragon boat races here every tuen ng.' },
  { id: 'mahang', ...at(8, 22), name: 'ma hang estate', kind: 'flavour',
    line: 'public housing on the hill. stanley plaza and murray house sit on its land.' },
  { id: 'pakTai', ...at(36.5, 80.5), name: 'pak tai temple', kind: 'flavour',
    line: 'a small temple in stanley ma hang park, above the bay.' },
  { id: 'college', ...atBuilding('Administration Building (Luke Yip Building)', m8(127), m8(104)), name: "st stephen's college", kind: 'flavour',
    line: '22 tung tau wan road. the administration building. the largest school campus in hong kong.' },
  { id: 'backgate', ...standAt(812, 631), name: "ssc back gate", kind: 'flavour',
    line: "the back gate of st stephen's college, on wong ma kok road by the playground." },
  { id: 'chapel', ...atBuilding('Chapel', m8(123), m8(88)), name: 'ssc chapel', kind: 'flavour',
    line: 'built in 1950 to remember the people who died here in the war.' },
  { id: 'museum', ...atBuilding('Hong Kong Correctional Services Museum', m8(156), m8(92)), name: 'correctional services museum', kind: 'flavour',
    line: 'prison history, by the prison. free entry.' },
  { id: 'escalator', ...standAt(404, 342, 4), name: 'stanley plaza escalators', kind: 'flavour',
    line: 'they run from the bus terminus down through the plaza to the waterfront. stand on the left lane to go down, the right to go up.' },
  { id: 'stbeach', ...at(117, 141), name: "st stephen's beach", kind: 'flavour',
    line: 'a quiet beach on the peninsula, below the college.' },
  { id: 'cemetery', ...at(132, 128), name: 'stanley military cemetery', kind: 'flavour',
    line: 'graves from 1841 onwards, many from december 1941. people speak quietly here.' },
  { id: 'prison', ...at(151, 134), name: 'stanley prison', kind: 'prison',
    line: '99 tung tau wan road. you would rather not go in.' },
];

// green minibus stops: one place per stop, named after the routes that call there
for (const r of ROUTES) {
  for (const st of r.stops) {
    const others = ROUTES.filter((o) => o.stops.some((x) => x.id !== st.id && Math.hypot(x.x - st.x, x.y - st.y) < 20));
    if (PLACES.some((p) => p.id === st.id)) continue;
    PLACES.push({ id: st.id, ...standAt(st.x, st.y), name: `gmb ${[r.no, ...others.map((o) => o.no)].filter((v, i, a) => a.indexOf(v) === i).join(' / ')} stop - ${st.name}`,
      kind: 'minibus', line: 'a green minibus stop. pay the fare when you board.' });
  }
}

export const START = at(94, 49.5);
export const RELEASE = at(150, 133);

// -------------------------------------------------------------- pathing ---
/** breadth-first path over tiles near the start; returns tile centres in pixels, excluding the start */
export function findPath(sx: number, sy: number, gx: number, gy: number): Array<{ x: number; y: number }> {
  const s = { x: Math.floor(sx / TILE), y: Math.floor(sy / TILE) };
  let g = { x: Math.floor(gx / TILE), y: Math.floor(gy / TILE) };
  if (solidTile(g.x, g.y)) { const d = standAt(g.x, g.y, 8); g = { x: d.tx, y: d.ty }; }
  // search a window around both ends, not the whole map
  const pad = 40;
  const wx0 = Math.max(0, Math.min(s.x, g.x) - pad), wy0 = Math.max(0, Math.min(s.y, g.y) - pad);
  const ww = Math.min(MAP_W, Math.max(s.x, g.x) + pad) - wx0, wh = Math.min(MAP_H, Math.max(s.y, g.y) + pad) - wy0;
  const prev = new Int32Array(ww * wh).fill(-2);
  const q = new Int32Array(ww * wh);
  const key = (x: number, y: number): number => (y - wy0) * ww + (x - wx0);
  let head = 0, tail = 0;
  const sk = key(s.x, s.y), gk = key(g.x, g.y);
  q[tail++] = sk; prev[sk] = -1;
  while (head < tail) {
    const k = q[head++];
    if (k === gk) break;
    const x = (k % ww) + wx0, y = Math.floor(k / ww) + wy0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < wx0 || ny < wy0 || nx >= wx0 + ww || ny >= wy0 + wh || solidTile(nx, ny)) continue;
      const nk = key(nx, ny);
      if (prev[nk] !== -2) continue;
      prev[nk] = k; q[tail++] = nk;
    }
  }
  if (prev[gk] === -2) return [];
  const path: Array<{ x: number; y: number }> = [];
  for (let k = gk; k !== -1 && k !== sk; k = prev[k]) {
    path.unshift({ x: ((k % ww) + wx0) * TILE + TILE / 2, y: (Math.floor(k / ww) + wy0) * TILE + TILE / 2 + 4 });
  }
  return path;
}

/** every tile reachable on foot from a start tile */
export function reachable(tx: number, ty: number): Uint8Array {
  const seen = new Uint8Array(N);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  const s = ty * MAP_W + tx;
  q[tail++] = s; seen[s] = 1;
  while (head < tail) {
    const k = q[head++];
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny)) continue;
      const nk = ny * MAP_W + nx;
      if (!seen[nk]) { seen[nk] = 1; q[tail++] = nk; }
    }
  }
  return seen;
}

/** shortest walk in metres between two tiles (for tuning the walking speed) */
export function walkDistance(a: { tx: number; ty: number }, b: { tx: number; ty: number }): number {
  const dist = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  const s = a.ty * MAP_W + a.tx, t = b.ty * MAP_W + b.tx;
  q[tail++] = s; dist[s] = 0;
  while (head < tail) {
    const k = q[head++];
    if (k === t) return dist[k];
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny)) continue;
      const nk = ny * MAP_W + nx;
      if (dist[nk] < 0) { dist[nk] = dist[k] + 1; q[tail++] = nk; }
    }
  }
  return -1;
}

// ----------------------------------------------------------------- names ---
const NAMES: Array<[string, number, number]> = [
  ...OSM.areas.filter(([, cls, name]) => name && cls !== 'built').map(([p, , name]): [string, number, number] => {
    let sx = 0, sy = 0; for (let i = 0; i < p.length; i += 2) { sx += p[i]; sy += p[i + 1]; }
    return [name, (sx * 2) / p.length, (sy * 2) / p.length];
  }),
  ...OSM.pois.filter(([name, kind]) => name && kind !== 'bus_stop').map(([name, , x, y]): [string, number, number] => [name, x, y]),
  ...PLACES.map((p): [string, number, number] => [p.name, p.tx, p.ty]),
];

/** the name of the nearest named place, for the status bar */
export function areaNear(tx: number, ty: number): string {
  let best = '';
  let bd = Infinity;
  for (const [name, x, y] of NAMES) {
    const d = Math.hypot(x - tx, y - ty);
    if (d < bd) { bd = d; best = name; }
  }
  return bd < 90 ? best.replace(/[^\x20-\x7e]/g, '').trim().toLowerCase() || 'stanley' : 'stanley';
}

/** a driving route over road tiles between two points in metres; returns pixel points every 3 m */
export function roadRoute(ax: number, ay: number, bx: number, by: number, loose = false): Array<{ x: number; y: number }> {
  // strict: carriageways only. loose: also the paved bits OSM leaves between them (bus bays, plazas)
  const isRoad = (k: number): boolean => grid[k] === Gr.Road || grid[k] === Gr.Lane
    || (loose && (grid[k] === Gr.Path || grid[k] === Gr.Plaza || grid[k] === Gr.Parking || grid[k] === Gr.Steps));
  const nearestRoad = (x: number, y: number): number => {
    for (let r = 0; r < 60; r += 1) for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = Math.round(x) + dx, ty = Math.round(y) + dy;
      if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && isRoad(ty * MAP_W + tx)) return ty * MAP_W + tx;
    }
    return -1;
  };
  const s = nearestRoad(ax, ay), t = nearestRoad(bx, by);
  if (s < 0 || t < 0) return [];
  const prev = new Int32Array(N).fill(-2);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  q[tail++] = s; prev[s] = -1;
  while (head < tail) {
    const k = q[head++];
    if (k === t) break;
    const x = k % MAP_W;
    for (const nk of [x > 0 ? k - 1 : -1, x < MAP_W - 1 ? k + 1 : -1, k - MAP_W, k + MAP_W]) {
      if (nk < 0 || nk >= N || prev[nk] !== -2 || !isRoad(nk)) continue;
      prev[nk] = k; q[tail++] = nk;
    }
  }
  if (prev[t] === -2) return loose ? [] : roadRoute(ax, ay, bx, by, true);
  const tiles: number[] = [];
  for (let k = t; k !== -1; k = prev[k]) tiles.push(k);
  tiles.reverse();
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < tiles.length; i += 3) out.push({ x: (tiles[i] % MAP_W) * TILE + 8, y: Math.floor(tiles[i] / MAP_W) * TILE + 8 });
  const last = tiles[tiles.length - 1];
  out.push({ x: (last % MAP_W) * TILE + 8, y: Math.floor(last / MAP_W) * TILE + 8 });
  // smooth the staircase of a tile path into a road-like line
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 1; i < out.length - 1; i += 1) {
      out[i] = { x: (out[i - 1].x + out[i].x * 2 + out[i + 1].x) / 4, y: (out[i - 1].y + out[i].y * 2 + out[i + 1].y) / 4 };
    }
  }
  return out;
}

// ------------------------------------------------------------------ cars ---
/** drivable road lines in pixels, and which lines meet at each end */
export const ROAD_LINES: Array<Array<{ x: number; y: number }>> = OSM.roads
  .filter(([, h]) => ROAD[h]?.[0] === Gr.Road || h === 'unclassified' || h === 'residential')
  .map(([p]) => { const o: Array<{ x: number; y: number }> = []; for (let i = 0; i < p.length; i += 2) o.push({ x: p[i] * TILE, y: p[i + 1] * TILE }); return o; });

// ---------------------------------------------------------------- render ---
type TextFn = (g: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string) => void;
let textFn: TextFn = () => undefined;
export function setWorldText(fn: TextFn): void { textFn = fn; }

const CHUNK = 32;
const CPX = CHUNK * TILE;
const chunks = new Map<number, { canvas: HTMLCanvasElement; used: number }>();
const MAX_CHUNKS = 48; // zoomed out, about 12 chunks show at once, plus the ring drawn ahead
let frameNo = 0;

const at_ = (x: number, y: number): number => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? Gr.Sea : grid[y * MAP_W + x]);

/** draw the map under the camera; chunks are drawn on first sight and kept while near */
export function drawWorld(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number): void {
  frameNo += 1;
  let drew = false;
  const cx0 = Math.floor(camX / CPX), cy0 = Math.floor(camY / CPX);
  const cx1 = Math.floor((camX + w) / CPX), cy1 = Math.floor((camY + h) / CPX);
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      if (cx < 0 || cy < 0 || cx * CPX >= MAP_W * TILE || cy * CPX >= MAP_H * TILE) continue;
      const key = cy * 1000 + cx;
      let c = chunks.get(key);
      if (!c) { c = { canvas: renderChunk(cx, cy), used: frameNo }; chunks.set(key, c); drew = true; }
      c.used = frameNo;
      ctx.drawImage(c.canvas, cx * CPX - camX, cy * CPX - camY);
    }
  }
  // on a quiet frame, draw one chunk of the ring just off screen, so walking never waits for one
  if (!drew) {
    let best = -1, bd = Infinity;
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy += 1) for (let cx = cx0 - 1; cx <= cx1 + 1; cx += 1) {
      if (cx < 0 || cy < 0 || cx * CPX >= MAP_W * TILE || cy * CPX >= MAP_H * TILE || chunks.has(cy * 1000 + cx)) continue;
      const d = Math.hypot((cx + 0.5) * CPX - camX - w / 2, (cy + 0.5) * CPX - camY - h / 2);
      if (d < bd) { bd = d; best = cy * 1000 + cx; }
    }
    if (best >= 0) chunks.set(best, { canvas: renderChunk(best % 1000, Math.floor(best / 1000)), used: frameNo });
  }
  if (chunks.size > MAX_CHUNKS) {
    const old = [...chunks.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, chunks.size - MAX_CHUNKS);
    for (const [k] of old) chunks.delete(k);
  }
}

/** a small overview of the whole map, one pixel per `scale` metres, for checking the layout */
export function renderOverview(scale = 4): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(MAP_W / scale); c.height = Math.ceil(MAP_H / scale);
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
    const k = y * scale * MAP_W + x * scale;
    const col = OVERVIEW[grid[k]] ?? [0, 0, 0];
    const b = bid[k] >= 0 ? hexRgb(BUILDINGS[bid[k]].roof) : col;
    const i = (y * c.width + x) * 4;
    img.data[i] = b[0]; img.data[i + 1] = b[1]; img.data[i + 2] = b[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const OVERVIEW: Record<number, [number, number, number]> = {
  [Gr.Hill]: [90, 132, 70], [Gr.Sea]: [42, 95, 134], [Gr.Beach]: [220, 203, 152], [Gr.Wood]: [58, 101, 52],
  [Gr.Cemetery]: [116, 160, 90], [Gr.Pitch]: [90, 160, 74], [Gr.Park]: [106, 154, 82], [Gr.Parking]: [138, 138, 146],
  [Gr.Plaza]: [205, 191, 158], [Gr.Pier]: [138, 106, 74], [Gr.Built]: [150, 175, 120], [Gr.School]: [120, 168, 96],
  [Gr.Yard]: [150, 150, 150], [Gr.Road]: [74, 76, 88], [Gr.Lane]: [92, 94, 104], [Gr.Path]: [196, 191, 180],
  [Gr.Steps]: [168, 163, 154], [Gr.Building]: [150, 140, 130], [Gr.Wall]: [168, 166, 172],
  [Gr.Grass]: [104, 168, 82], [Gr.Scrub]: [72, 116, 58], [Gr.Rock]: [160, 138, 118], [Gr.Escalator]: [200, 200, 210],
};

function shade(hex: string, k: number): string {
  const [r, g, b] = hexRgb(hex);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** art pixels per metre: the ground and buildings are drawn this fine, then doubled up */
const ART = 8;
const LO = CHUNK * ART;

type RGB = [number, number, number];
const hex3 = (h: string): RGB => hexRgb(h);
/** hand-picked tones, darkest first: the ground is painted from these, never from raw noise */
const TONES: Record<string, RGB[]> = {
  meadow: ['#4b7a3a', '#588841', '#659648', '#77a552'].map(hex3),
  dry: ['#6f8a45', '#83984d', '#97a659', '#adb46a'].map(hex3),
  lawn: ['#4f8c42', '#5b9a49', '#68a852', '#7cb85f'].map(hex3),
  pitch: ['#4e9a44', '#58a64a', '#62b052', '#70bc5e'].map(hex3),
  scrub: ['#3a6331', '#446f37', '#4f7c3c', '#5f8b45'].map(hex3),
  wood: ['#263f24', '#2d4a29', '#35552e', '#3f6134'].map(hex3),
  sand: ['#d2b98a', '#dcc596', '#e5cfa2', '#eedab0'].map(hex3),
  rock: ['#6e5c52', '#937a69', '#ad937d', '#c8ae95'].map(hex3),
  rockGrey: ['#5f6062', '#808184', '#9c9c9c', '#b9b8b4'].map(hex3),
};
const BASE: Record<number, RGB> = {
  [Gr.Sea]: [40, 94, 136], [Gr.Parking]: [128, 128, 136], [Gr.Plaza]: [206, 192, 160], [Gr.Pier]: [140, 106, 72],
  [Gr.Yard]: [150, 150, 154], [Gr.Road]: [70, 72, 84], [Gr.Lane]: [88, 90, 100], [Gr.Path]: [196, 190, 178],
  [Gr.Steps]: [172, 166, 156], [Gr.Wall]: [170, 168, 174], [Gr.Built]: [184, 178, 166],
};
/** when two classes meet in a blend, the more 'man-made' one wins ties */
const PRIORITY: Record<number, number> = {
  [Gr.Road]: 9, [Gr.Lane]: 8, [Gr.Steps]: 7, [Gr.Path]: 7, [Gr.Pier]: 7, [Gr.Wall]: 9, [Gr.Plaza]: 6, [Gr.Parking]: 6,
  [Gr.Beach]: 3, [Gr.Sea]: 2, [Gr.Escalator]: 10,
};
/** natural ground: where two of these meet, the edge wanders instead of following the grid */
const NATURAL = new Set<number>([Gr.Hill, Gr.Grass, Gr.Wood, Gr.Scrub, Gr.Beach, Gr.Rock, Gr.Park, Gr.School, Gr.Cemetery, Gr.Sea]);

/** the ground class under a tile, with buildings standing on paving */
const groundAt = (x: number, y: number): number => {
  const g = at_(x, y);
  return g === Gr.Building ? (core(x, y) ? Gr.Built : Gr.Path) : g;
};

const noise = (x: number, y: number, s = 0): number => hash(x, y, s + 101);
/** smooth value noise, about one feature per unit */
function vnoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** blend weights: for each of the 8x8 places inside a tile, the pull of the 5x5 tiles around it.
 *  Wide enough that a diagonal edge of 1 m steps comes out as a straight line. */
const WT = (() => {
  const t = new Float32Array(ART * ART * 25);
  for (let sy = 0; sy < ART; sy += 1) for (let sx = 0; sx < ART; sx += 1) {
    const fx = (sx + 0.5) / ART, fy = (sy + 0.5) / ART;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      const d2 = (fx - 0.5 - dx) ** 2 + (fy - 0.5 - dy) ** 2;
      t[(sy * ART + sx) * 25 + (dy + 2) * 5 + dx + 2] = Math.exp(-d2 / (2 * 0.75 * 0.75));
    }
  }
  return t;
})();
const PULL_A = new Float32Array(32).fill(1), LEAN_A = new Float32Array(32), PRIO_A = new Float32Array(32);
for (let c = 0; c < 32; c += 1) {
  if (NATURAL.has(c)) LEAN_A[c] = (c * 0.618) % 1 < 0.5 ? 0.9 : -0.9;
  PRIO_A[c] = PRIORITY[c] ?? 0;
}
/** man-made strips hold their width under the blend (a 1 m footpath would otherwise thin out) */
const PULL: Record<number, number> = { [Gr.Escalator]: 2, [Gr.Road]: 1.2, [Gr.Lane]: 1.25, [Gr.Path]: 1.35, [Gr.Steps]: 1.35, [Gr.Pier]: 1.35, [Gr.Wall]: 1.6 };
for (const [c, v] of Object.entries(PULL)) PULL_A[Number(c)] = v;

/** slow noise for the grass, worked out once per 2x2 art pixels for the chunk being drawn */
let fieldBig = new Float32Array(0), fieldMid = new Float32Array(0), fieldDry = new Float32Array(0), fieldX = 0, fieldY = 0;
function grassFields(gx0: number, gy0: number): void {
  const n = LO / 2;
  if (fieldBig.length !== n * n) { fieldBig = new Float32Array(n * n); fieldMid = new Float32Array(n * n); fieldDry = new Float32Array(n * n); }
  fieldX = gx0; fieldY = gy0;
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
    const X = gx0 + x * 2, Y = gy0 + y * 2, k = y * n + x;
    fieldBig[k] = vnoise(X / 44, Y / 44, 11); fieldMid[k] = vnoise(X / 13, Y / 13, 12); fieldDry[k] = vnoise(X / 70, Y / 70, 5);
  }
}
/** grass: soft patches of four tones, with little blades of grass standing up in it */
function grassTone(gx: number, gy: number, kind: 'meadow' | 'lawn' | 'pitch' | 'scrub' | 'wood'): RGB {
  const f = ((gy - fieldY) >> 1) * (LO / 2) + ((gx - fieldX) >> 1);
  let v = 0.55 * fieldBig[f] + 0.3 * fieldMid[f] + 0.15 * noise(gx, gy, 13);
  let pal = TONES[kind];
  if (kind === 'meadow' && fieldDry[f] > 0.66) pal = TONES.dry;
  if (kind === 'lawn' || kind === 'pitch') v += ((gx >> 4) & 1 ? 0.12 : -0.04); // mowing stripes, 2 m wide
  let t = v < 0.38 ? 0 : v < 0.52 ? 1 : v < 0.66 ? 2 : 3;
  // blades: 3-pixel strokes, dark at the root and catching the light at the tip
  const rate = kind === 'meadow' ? 0.09 : kind === 'scrub' ? 0.12 : kind === 'wood' ? 0.05 : 0.04;
  const sy = gy + (gx * 5) % 3, k = noise(gx, Math.floor(sy / 3), 17);
  if (k < rate) t = sy % 3 === 0 ? Math.min(3, t + 2) : Math.max(0, t - 1);
  else if (kind === 'meadow' && k > 0.9985) return noise(gx, gy, 18) < 0.5 ? [238, 236, 220] : [240, 210, 80]; // clover, buttercups
  return pal[t];
}

/** shore granite: rounded boulders with dark cracks, lit from the top left */
function rockTone(gx: number, gy: number, wet: boolean): RGB {
  const S = 11;
  const cx = Math.floor(gx / S), cy = Math.floor(gy / S);
  let d1 = 1e9, d2 = 1e9, fx = 0, fy = 0, cell = 0;
  for (let j = -1; j <= 1; j += 1) for (let i = -1; i <= 1; i += 1) {
    const px = (cx + i + 0.15 + 0.7 * hash(cx + i, cy + j, 31)) * S, py = (cy + j + 0.15 + 0.7 * hash(cx + i, cy + j, 32)) * S;
    const d = (gx - px) ** 2 + (gy - py) ** 2;
    if (d < d1) { d2 = d1; d1 = d; fx = gx - px; fy = gy - py; cell = hash(cx + i, cy + j, 33); } else if (d < d2) d2 = d;
  }
  const pal = cell < 0.3 ? TONES.rockGrey : TONES.rock;
  let t: number;
  if (Math.sqrt(d2) - Math.sqrt(d1) < 1.3) t = 0;
  else { const lit = fx + fy; t = lit < -3 ? 3 : lit > 4 ? 1 : 2; }
  const c = pal[t];
  return wet ? [c[0] * 0.78, c[1] * 0.8, c[2] * 0.84] : c;
}

/** the label next to the art pixel being painted (set per pixel, so no closure is made each time) */
let opx = 0, opy = 0, oc = 0, olabel = new Uint8Array(0);
function other(dx: number, dy: number): number {
  const qx = opx + dx, qy = opy + dy;
  return qx < 0 || qy < 0 || qx >= LO || qy >= LO ? oc : olabel[qy * LO + qx];
}

function renderChunk(cx: number, cy: number): HTMLCanvasElement {
  const tx0 = cx * CHUNK, ty0 = cy * CHUNK;

  // ---- 1. ground, at ART pixels per metre. Each art pixel takes the class with the most pull from
  //         the 3x3 tiles around it, so edges come out round; natural edges also wander a little.
  const lo = document.createElement('canvas');
  lo.width = LO; lo.height = LO;
  const lg = lo.getContext('2d')!;
  const img = lg.createImageData(LO, LO);
  const label = new Uint8Array(LO * LO);
  const seaW = new Float32Array(LO * LO);
  const counts = new Float32Array(32);
  const taps = new Uint8Array(25), seen = new Uint8Array(25);
  // the chunk's tiles with a 2-tile margin, and which tiles have the same class all round them
  const WW = CHUNK + 4;
  const win = new Uint8Array(WW * WW);
  for (let y = 0; y < WW; y += 1) for (let x = 0; x < WW; x += 1) win[y * WW + x] = groundAt(tx0 + x - 2, ty0 + y - 2);
  const uniform = new Uint8Array(CHUNK * CHUNK);
  for (let y = 0; y < CHUNK; y += 1) for (let x = 0; x < CHUNK; x += 1) {
    const c = win[(y + 2) * WW + x + 2];
    let u = 1;
    for (let dy = 0; dy < 5 && u; dy += 1) for (let dx = 0; dx < 5; dx += 1) if (win[(y + dy) * WW + x + dx] !== c) { u = 0; break; }
    uniform[y * CHUNK + x] = u;
  }
  for (let py = 0; py < LO; py += 1) {
    const ly = Math.floor(py / ART), sy = py % ART;
    for (let px = 0; px < LO; px += 1) {
      const lx = Math.floor(px / ART), sx = px % ART;
      const i = py * LO + px;
      if (uniform[ly * CHUNK + lx]) { const c = win[(ly + 2) * WW + lx + 2]; label[i] = c; seaW[i] = c === Gr.Sea ? 1 : 0; continue; }
      for (let dy = 0, n = 0; dy < 5; dy += 1) for (let dx = 0; dx < 5; dx += 1, n += 1) taps[n] = win[(ly + dy) * WW + lx + dx];
      const w0 = (sy * ART + sx) * 25;
      const gx = tx0 * ART + px, gy = ty0 * ART + py;
      const wob = vnoise(gx / 7, gy / 7, 40) - 0.5;
      let nd = 0;
      for (let n = 0; n < 25; n += 1) {
        const c = taps[n];
        // natural edges wander: classes lean opposite ways on the same noise
        const w = WT[w0 + n] * PULL_A[c] * (1 + wob * LEAN_A[c]);
        if (counts[c] === 0) seen[nd++] = c;
        counts[c] += w;
      }
      let best = taps[12], bw = -1, tot = 0;
      for (let n = 0; n < nd; n += 1) {
        const c = seen[n];
        tot += counts[c];
        const w = counts[c] + PRIO_A[c] * 0.004;
        if (w > bw) { bw = w; best = c; }
      }
      const sea = counts[Gr.Sea];
      for (let n = 0; n < nd; n += 1) counts[seen[n]] = 0;
      label[i] = best;
      seaW[i] = sea / tot;
    }
  }
  grassFields(tx0 * ART, ty0 * ART);
  const data = img.data;
  for (let py = 0; py < LO; py += 1) {
    for (let px = 0; px < LO; px += 1) {
      const i = py * LO + px;
      const c = label[i];
      const gx = tx0 * ART + px, gy = ty0 * ART + py; // global art pixel, so textures run across chunks
      const mx = tx0 + px / ART, my = ty0 + py / ART;
      const n = noise(gx, gy);
      opx = px; opy = py; oc = c; olabel = label;
      let r: number, g: number, b: number;
      switch (c) {
        case Gr.Hill: [r, g, b] = grassTone(gx, gy, 'meadow'); break;
        case Gr.Grass: case Gr.Park: case Gr.Cemetery: [r, g, b] = grassTone(gx, gy, 'lawn'); break;
        case Gr.School: [r, g, b] = grassTone(gx, gy, 'lawn'); break;
        case Gr.Pitch: [r, g, b] = grassTone(gx, gy, 'pitch'); break;
        case Gr.Scrub: [r, g, b] = grassTone(gx, gy, 'scrub'); break;
        case Gr.Wood: [r, g, b] = grassTone(gx, gy, 'wood'); break;
        case Gr.Rock: [r, g, b] = rockTone(gx, gy, seaW[i] > 0.02); break;
        case Gr.Built: {
          if (!core(mx, my)) { [r, g, b] = grassTone(gx, gy, 'lawn'); break; }
          // paving between shophouses: 0.5 m setts
          [r, g, b] = BASE[Gr.Built];
          if (gx % 4 === 0 || (gy % 4 === 0 && (gx >> 2) % 2 === 0)) { r -= 14; g -= 14; b -= 14; }
          break;
        }
        case Gr.Sea: {
          // shallow water near the shore, foam on the line, glints out in the bay
          [r, g, b] = BASE[Gr.Sea];
          const shore = seaW[i] < 0.995;
          const deep = vnoise(gx / 90, gy / 90, 50);
          r -= deep * 10; g -= deep * 8; b -= deep * 4;
          // two bands of shallows, following the blended shore so they curve with it
          if (seaW[i] < 0.8) { r += 44; g += 56; b += 30; } else if (shore) { r += 24; g += 32; b += 16; }
          if (other(1, 0) !== Gr.Sea || other(-1, 0) !== Gr.Sea || other(0, 1) !== Gr.Sea || other(0, -1) !== Gr.Sea) { r = 214; g = 232; b = 240; }
          else if (shore && (other(2, 0) !== Gr.Sea || other(0, 2) !== Gr.Sea || other(-2, 0) !== Gr.Sea || other(0, -2) !== Gr.Sea)) { r += 40; g += 40; b += 30; }
          else if (noise(gx >> 2, gy, 3) < 0.012) { r += 50; g += 50; b += 40; }
          else if (Math.floor(gy / 3) % 7 === 0 && vnoise(gx / 10, gy / 3, 51) > 0.72) { r += 18; g += 20; b += 18; } // swell
          break;
        }
        case Gr.Path: case Gr.Plaza: {
          [r, g, b] = BASE[c];
          if (c === Gr.Plaza) {
            // metre slabs, each a slightly different stone
            const slab = hash(gx >> 3, gy >> 3, 21);
            const v = (slab - 0.5) * 16; r += v; g += v; b += v * 0.8;
            if (gx % 8 === 0 || gy % 8 === 0) { r -= 22; g -= 22; b -= 22; }
            break;
          }
          // small paving slabs, half a metre, staggered
          const row = gy >> 2;
          if (gy % 4 === 0 || (gx + (row % 2) * 2) % 4 === 0) { r -= 16; g -= 16; b -= 16; }
          else { const v = (n - 0.5) * 6; r += v; g += v; b += v; }
          break;
        }
        case Gr.Steps: [r, g, b] = BASE[c]; if (gy % 3 === 0) { r -= 34; g -= 34; b -= 34; } else if (gy % 3 === 1) { r += 10; g += 10; b += 10; } break;
        case Gr.Road: case Gr.Lane: case Gr.Parking: {
          [r, g, b] = BASE[c];
          const v = (n - 0.5) * 8 + (vnoise(gx / 30, gy / 30, 60) - 0.5) * 8; r += v; g += v; b += v;
          if (n > 0.985) { r += 22; g += 22; b += 22; }
          // kerbs where the carriageway meets anything else
          const edge = (q: number): boolean => q !== Gr.Road && q !== Gr.Lane && q !== Gr.Parking;
          if (edge(other(1, 0)) || edge(other(-1, 0)) || edge(other(0, 1)) || edge(other(0, -1))) { r = 168; g = 168; b = 172; }
          else if (edge(other(2, 0)) || edge(other(-2, 0)) || edge(other(0, 2)) || edge(other(0, -2))) { r -= 10; g -= 10; b -= 8; } // gutter
          else if (c === Gr.Parking && gx % 20 === 0 && gy % 40 < 32) { r = 230; g = 230; b = 230; }
          break;
        }
        case Gr.Beach: {
          const pal = TONES.sand;
          const v = 0.6 * vnoise(gx / 20, gy / 20, 70) + 0.4 * n;
          [r, g, b] = pal[v < 0.35 ? 0 : v < 0.55 ? 1 : v < 0.8 ? 2 : 3];
          if (seaW[i] > 0.05) { r -= 34; g -= 34; b -= 26; } // wet sand at the water's edge
          else if (n > 0.996) { r = 246; g = 240; b = 230; } // shells
          break;
        }
        case Gr.Pier: [r, g, b] = BASE[c]; if (gy % 3 === 0) { r -= 40; g -= 32; b -= 24; } else if (hash(gx >> 4, gy / 3 | 0, 80) < 0.3) { r -= 10; g -= 8; b -= 6; } break;
        case Gr.Wall: [r, g, b] = BASE[c]; if ((gy % 8) < 2) { r += 30; g += 30; b += 30; } else if ((gy % 8) > 5) { r -= 40; g -= 40; b -= 40; } break;
        case Gr.Yard: { [r, g, b] = BASE[c]; const v = (n - 0.5) * 8; r += v; g += v; b += v; break; }
        case Gr.Escalator: r = 58; g = 61; b = 72; break; // the escalators are drawn over it
        default: [r, g, b] = TONES.meadow[1];
      }
      // a soft dark rim where grass meets paving or a road, like a kerb's shadow
      if ((c === Gr.Hill || c === Gr.Grass || c === Gr.Park || c === Gr.School || c === Gr.Scrub) &&
        (PRIORITY[other(0, -1)] ?? 0) >= 6) { r *= 0.8; g *= 0.82; b *= 0.8; }
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);

  // ---- 2. road centre lines
  lg.save();
  lg.scale(ART, ART);
  lg.translate(-tx0, -ty0);
  lg.fillStyle = '#d8d0a0';
  for (const [p, h] of OSM.roads) {
    if (ROAD[h]?.[0] !== Gr.Road) continue;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      if (Math.max(ax, bx) < tx0 - 2 || Math.min(ax, bx) > tx0 + CHUNK + 2 || Math.max(ay, by) < ty0 - 2 || Math.min(ay, by) > ty0 + CHUNK + 2) continue;
      const len = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d < len; d += 0.25) {
        if (d % 5 > 2.5) continue;
        const x = ax + ((bx - ax) * d) / len, y = ay + ((by - ay) * d) / len;
        if (at_(Math.floor(x), Math.floor(y)) !== Gr.Road) continue;
        lg.fillRect(Math.round(x * ART) / ART - 1 / ART, Math.round(y * ART) / ART - 1 / ART, 2 / ART, 2 / ART);
      }
    }
  }

  // ---- 3. buildings, from their outlines, back to front
  const near = BUILDINGS.filter((b) => b.x1 >= tx0 - 2 && b.x0 <= tx0 + CHUNK + 2 && b.y1 >= ty0 - 2 && b.y0 <= ty0 + CHUNK + 2)
    .sort((p, q) => p.y1 - q.y1);
  for (const b of near) drawBuilding(lg, b);
  for (const e of ESCALATORS) if (e.x + e.w >= tx0 && e.x - e.w <= tx0 + CHUNK && e.y1 >= ty0 && e.y0 <= ty0 + CHUNK) drawEscalator(lg, e);
  lg.restore();

  // ---- 4. double up to screen pixels, then the props and labels at full resolution
  const c = document.createElement('canvas');
  c.width = CPX; c.height = CPX;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(lo, 0, 0, CPX, CPX);
  g.translate(-cx * CPX, -cy * CPX);
  for (let y = ty0 - 5; y < ty0 + CHUNK + 6; y += 1) for (let x = tx0 - 5; x < tx0 + CHUNK + 5; x += 1) drawProp(g, x, y);
  return c;
}

/** name plates for landmark buildings, in metres: main.ts draws them at screen size */
export const BUILDING_LABELS: Array<{ text: string; x: number; y: number }> = BUILDINGS
  .filter((b) => b.name && b.door && !/^(Block|House|No\.)/.test(b.name) && !/[^\x20-\x7e]/.test(b.name))
  .map((b) => ({
    text: b.name.replace(' (Luke Yip Building)', '').replace('Hong Kong Correctional Services Museum', 'CSD Museum').toLowerCase(),
    x: (b.x0 + b.x1) / 2, y: b.y1 - b.wall - 0.6,
  }));

/** an escalator pair, in metres: glass balustrades, steel median, two lanes of steps, landings */
function drawEscalator(g: CanvasRenderingContext2D, e: Escalator): void {
  const px = 1 / ART, x0 = e.x - e.w / 2, len = e.y1 - e.y0;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 0.4, e.y0 + 0.4, e.w, len); // it sits in a slot: shadow
  g.fillStyle = '#3a3d48'; g.fillRect(x0, e.y0, e.w, len);
  const lanes = [x0 + 0.45, e.x + 0.3];
  const lw = e.w / 2 - 0.75;
  for (const lx of lanes) {
    // steps: light treads with dark risers and yellow safety edges
    g.fillStyle = '#a9afb8'; g.fillRect(lx, e.y0 + 1.2, lw, len - 2.4);
    g.fillStyle = '#6e737e';
    for (let y = e.y0 + 1.2; y < e.y1 - 1.2; y += 0.4) g.fillRect(lx, y, lw, px);
    g.fillStyle = '#e8c23a'; g.fillRect(lx, e.y0 + 1.2, px, len - 2.4); g.fillRect(lx + lw - px, e.y0 + 1.2, px, len - 2.4);
    // black handrails either side
    g.fillStyle = '#16171c'; g.fillRect(lx - 0.22, e.y0 + 0.9, 0.16, len - 1.8); g.fillRect(lx + lw + 0.06, e.y0 + 0.9, 0.16, len - 1.8);
  }
  // glass balustrades on the outside, a lit steel median between the lanes
  g.fillStyle = 'rgba(170,215,235,0.75)'; g.fillRect(x0, e.y0 + 0.8, 0.22, len - 1.6); g.fillRect(x0 + e.w - 0.22, e.y0 + 0.8, 0.22, len - 1.6);
  g.fillStyle = '#c8ccd4'; g.fillRect(e.x - 0.3, e.y0 + 0.8, 0.6, len - 1.6);
  g.fillStyle = '#f2e6a0'; for (let y = e.y0 + 2; y < e.y1 - 2; y += 3) g.fillRect(e.x - px, y, 2 * px, 0.3);
  // landings: checker plates with a yellow comb line and an arrow for each lane
  for (const [ly, top] of [[e.y0, true], [e.y1 - 1.2, false]] as Array<[number, boolean]>) {
    g.fillStyle = '#8d929c'; g.fillRect(x0, ly, e.w, 1.2);
    g.fillStyle = '#a4a9b2';
    for (let y = ly; y < ly + 1.2; y += 0.25) for (let x = x0 + (((y - ly) * 4) % 2) * 0.25; x < x0 + e.w; x += 0.5) g.fillRect(x, y, 0.25, 0.25);
    g.fillStyle = '#e8c23a'; g.fillRect(x0, top ? ly + 1.2 - 2 * px : ly, e.w, 2 * px);
    lanes.forEach((lx, i) => {
      const down = i === 0, cx = lx + lw / 2, cy = ly + 0.6;
      g.fillStyle = down ? '#ff8a4a' : '#7be08a';
      g.beginPath();
      if (down) { g.moveTo(cx - 0.45, cy - 0.25); g.lineTo(cx + 0.45, cy - 0.25); g.lineTo(cx, cy + 0.3); }
      else { g.moveTo(cx - 0.45, cy + 0.25); g.lineTo(cx + 0.45, cy + 0.25); g.lineTo(cx, cy - 0.3); }
      g.closePath(); g.fill();
    });
  }
}

// ------------------------------------------------------------ buildings ---
const WALL_COLOUR: Record<BuildingStyle, string> = {
  shop: '#e8dcc8', apartments: '#e4e4de', house: '#ece4d4', school: '#c47e60', temple: '#b8463a',
  civic: '#e3ddd0', mall: '#c9d3dc', heritage: '#ddd2ba', quarters: '#d8d8d2',
};
const AWNINGS = ['#c8463a', '#3a7ac8', '#e0a83a', '#3aa86a', '#8a3ac8', '#d86a8a'];

const pipM = (x: number, y: number, p: number[]): boolean => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
};

/** drop vertices that move the outline less than `tol` metres: OSM traces many tiny jogs */
function simplifyRing(p: number[], tol: number): number[] {
  let pts: Array<[number, number]> = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  let changed = true;
  while (changed && pts.length > 4) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 4; i += 1) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ex = c[0] - a[0], ey = c[1] - a[1], l = Math.hypot(ex, ey) || 1;
      const d = Math.abs((b[0] - a[0]) * ey - (b[1] - a[1]) * ex) / l;
      if (d < tol) { pts.splice(i, 1); changed = true; i -= 1; }
    }
  }
  const out: number[] = [];
  for (const [x, y] of pts) out.push(x, y);
  out.push(pts[0][0], pts[0][1]);
  return out;
}
const outlines = new Map<Building, number[]>();

/**
 * Draw one building in metre coordinates (the context is already scaled to art pixels).
 * It is drawn as a block of height `wall` seen from the south: front walls go up from each
 * south-facing edge, back to front, and the roof sits on top of them, lifted by the same height.
 * Everything is kept inside the footprint, so a building never paints over the ground around it.
 */
function drawBuilding(g: CanvasRenderingContext2D, B: Building): void {
  let p = outlines.get(B);
  if (!p) { p = simplifyRing(B.poly, 0.35); outlines.set(B, p); }
  const px = 1 / ART;
  const h = B.wall;
  const path = (pts: number[], dy = 0): void => {
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) { if (i) g.lineTo(pts[i], pts[i + 1] + dy); else g.moveTo(pts[i], pts[i + 1] + dy); }
    g.closePath();
  };
  // cast shadow to the south-east, longer for taller buildings
  g.fillStyle = 'rgba(12,20,16,0.26)';
  path(p.map((v, i) => v + (i % 2 ? 0.4 : 0.5 + h * 0.3)));
  g.fill();

  g.save();
  // nothing of a building is drawn over an escalator slot cut through it
  g.beginPath(); g.rect(-1e4, -1e4, 3e4, 3e4);
  for (const e of ESCALATORS) g.rect(e.x - e.w / 2, e.y0, e.w, e.y1 - e.y0);
  g.clip('evenodd');
  path(p); g.clip();

  // ---- front walls
  const wall = B.wallColour ?? WALL_COLOUR[B.style];
  const shopfront = (B.style === 'shop' || B.style === 'mall') && B.facade === 'windows';
  const floors = Math.max(1, Math.min(Math.floor(h / 0.95), B.height ? Math.round(B.height / 3.2) : Math.floor(h / 2.2)));
  type Face = { ax: number; ay: number; ex: number; ey: number; len: number; ony: number };
  const faces: Face[] = [];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
    if (len < 0.2) continue;
    const nx = ey / len, ny = -ex / len;
    const out = pipM((ax + bx) / 2 + nx * 0.15, (ay + by) / 2 + ny * 0.15, p) ? -1 : 1;
    const ony = ny * out;
    if (ony < 0.12) continue; // faces away from us, or edge-on
    faces.push({ ax, ay, ex, ey, len, ony });
  }
  // back to front, so a wall further south covers the ones behind it
  faces.sort((a, b) => Math.max(a.ay, a.ay + a.ey) - Math.max(b.ay, b.ay + b.ey));
  /** a patch on a face: from t0 to t1 metres along it, z0 to z1 metres up */
  const patch = (f: Face, t0: number, t1: number, z0: number, z1: number): void => {
    const ux = f.ex / f.len, uy = f.ey / f.len;
    g.beginPath();
    g.moveTo(f.ax + ux * t0, f.ay + uy * t0 - z0); g.lineTo(f.ax + ux * t1, f.ay + uy * t1 - z0);
    g.lineTo(f.ax + ux * t1, f.ay + uy * t1 - z1); g.lineTo(f.ax + ux * t0, f.ay + uy * t0 - z1);
    g.closePath(); g.fill();
  };
  // the door goes on the biggest proper front face nearest the building's real entrance
  const door = B.door ? { x: B.door.x + 0.5, y: B.door.y + 1 } : null;
  let doorFace: Face | null = null, doorT = 0, doorD = Infinity;
  if (door) for (const f of faces) {
    if (f.len < 1.6 || f.ony < 0.5) continue;
    const t = Math.max(0.8, Math.min(f.len - 0.8, ((door.x - f.ax) * f.ex + (door.y - f.ay) * f.ey) / f.len));
    const d = Math.hypot(f.ax + (f.ex * t) / f.len - door.x, f.ay + (f.ey * t) / f.len - door.y);
    if (d < doorD) { doorD = d; doorFace = f; doorT = t; }
  }
  const colourAwning = AWNINGS[Math.floor(hash(B.x0, B.y0, 15) * AWNINGS.length)];
  for (const f of faces) {
    const lit = 0.8 + 0.2 * f.ony; // walls turned east or west catch less light
    g.fillStyle = shade(wall, lit); patch(f, 0, f.len, 0, h);
    g.fillStyle = shade(wall, 0.62); patch(f, 0, f.len, 0, 2 * px); // plinth
    g.fillStyle = shade(wall, lit * 0.86); patch(f, 0, f.len, h - 2 * px, h); // under the eaves
    if (floors > 2) {
      g.fillStyle = shade(wall, lit * 0.9);
      for (let k = 1; k < floors; k += 1) { const z = (k * h) / floors; patch(f, 0, f.len, z, z + px); }
    }
    if (f.len < 1.2) continue; // a jog in the outline: plain wall
    if (B.facade === 'colonnade') {
      // open verandahs: a deep shadow behind a row of pale columns on every floor, with a
      // cornice over each floor and a balustrade along the upper ones
      const storeys = Math.max(2, Math.round(h / 2));
      const sh = h / storeys;
      for (let k = 0; k < storeys; k += 1) {
        const z0 = k * sh;
        g.fillStyle = shade(wall, 0.42); patch(f, 0.2, f.len - 0.2, z0 + 0.12, z0 + sh - 0.28); // verandah in shadow
        g.fillStyle = shade(wall, 0.6); patch(f, 0.2, f.len - 0.2, z0 + sh - 0.5, z0 + sh - 0.28); // arch soffits
        const n = Math.max(2, Math.round(f.len / 1.6));
        for (let c = 0; c <= n; c += 1) {
          const tc = 0.2 + ((f.len - 0.4) * c) / n;
          g.fillStyle = shade(wall, 1.08); patch(f, tc - 0.17, tc + 0.17, z0 + 0.12, z0 + sh - 0.28);
          g.fillStyle = shade(wall, 0.8); patch(f, tc + 0.1, tc + 0.17, z0 + 0.12, z0 + sh - 0.28);
        }
        g.fillStyle = shade(wall, 1.15); patch(f, 0, f.len, z0 + sh - 0.28, z0 + sh); // cornice
        if (k > 0) { g.fillStyle = shade(wall, 0.95); patch(f, 0.2, f.len - 0.2, z0 + 0.12, z0 + 0.45); } // balustrade
      }
      continue;
    }
    if (B.facade === 'glass') {
      // a glass curtain wall: tinted panes between slim mullions, a stone band at each floor
      const storeys = Math.max(1, Math.round(h / 2));
      const sh = h / storeys;
      for (let k = 0; k < storeys; k += 1) {
        const z0 = k * sh;
        g.fillStyle = k === 0 ? '#86b4c8' : '#6f97ae'; patch(f, 0.15, f.len - 0.15, z0 + 0.2, z0 + sh - 0.15);
        g.fillStyle = 'rgba(255,255,255,0.28)'; patch(f, 0.15, f.len - 0.15, z0 + sh - 0.45, z0 + sh - 0.3);
        g.fillStyle = shade(wall, 0.9);
        for (let tc = 0.15; tc < f.len; tc += 1.5) patch(f, tc - px, tc + px, z0 + 0.2, z0 + sh - 0.15);
      }
      continue;
    }
    const step = B.style === 'apartments' || B.style === 'quarters' ? 1.5 : 2;
    const n = Math.max(1, Math.floor((f.len - 0.4) / step));
    const gap = f.len / n;
    const ww = Math.min(0.8, gap * 0.5);
    const storey = h / floors;
    const wh = Math.min(B.style === 'heritage' ? 1.1 : 0.85, storey * 0.55);
    const shopHere = shopfront && f.len >= 2.5 && f.ony > 0.4;
    for (let k = 0; k < floors; k += 1) {
      if (k === 0 && shopHere) continue;
      const zc = (k + 0.55) * storey;
      for (let w = 0; w < n; w += 1) {
        const tc = (w + 0.5) * gap;
        if (doorFace === f && k === 0 && Math.abs(tc - doorT) < 1.1) continue;
        const lit2 = hash(Math.round((f.ax + tc) * 3), Math.round(f.ay * 3) + k, 3) < 0.15;
        g.fillStyle = shade(wall, 0.6); patch(f, tc - ww / 2 - px, tc + ww / 2 + px, zc - wh / 2 - px, zc + wh / 2 + px); // frame
        g.fillStyle = B.style === 'heritage' ? '#4e5e6e' : lit2 ? '#e8d890' : '#5f8fac';
        patch(f, tc - ww / 2, tc + ww / 2, zc - wh / 2, zc + wh / 2);
        g.fillStyle = 'rgba(255,255,255,0.4)'; patch(f, tc - ww / 2, tc - ww / 2 + 2 * px, zc, zc + wh / 2);
      }
    }
    if (shopHere) {
      // glass shopfront under a striped awning, the whole width of the face
      g.fillStyle = '#7fb0c6'; patch(f, 0.2, f.len - 0.2, 0.15, Math.min(1.5, storey * 0.8));
      g.fillStyle = 'rgba(255,255,255,0.3)'; patch(f, 0.2, f.len - 0.2, Math.min(1.5, storey * 0.8) - 3 * px, Math.min(1.5, storey * 0.8));
      const top = Math.min(2.0, storey * 0.98), bot = top - 0.45;
      const stripes = Math.max(2, Math.round(f.len / 0.5));
      for (let s = 0; s < stripes; s += 1) {
        g.fillStyle = s % 2 ? '#f2eee4' : colourAwning;
        patch(f, (s * f.len) / stripes, ((s + 1) * f.len) / stripes, bot, top);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; patch(f, 0, f.len, bot - 2 * px, bot);
    }
  }
  if (doorFace) {
    const dh = Math.min(1.9, h - 0.3);
    g.fillStyle = shade(wall, 0.5); patch(doorFace, doorT - 0.6, doorT + 0.6, 0, dh + px);
    g.fillStyle = B.style === 'temple' ? '#5a2018' : '#3a2e26'; patch(doorFace, doorT - 0.5, doorT + 0.5, 0, dh);
    g.fillStyle = '#d8b060'; patch(doorFace, doorT + 0.25, doorT + 0.25 + 2 * px, dh * 0.5, dh * 0.5 + 2 * px);
  }

  // ---- the roof, on top of the walls
  g.save();
  g.translate(0, -h);
  g.fillStyle = B.roof;
  path(p); g.fill();
  g.save();
  path(p); g.clip();
  const roofSeed = Math.round(B.x0 * 7 + B.y0 * 13);
  if (B.pitched) {
    // two slopes: the far one in shade, tiles in rows, a bright ridge between them
    const wide = B.x1 - B.x0 >= B.y1 - B.y0;
    const ridgeY = (B.y0 + B.y1) / 2, ridgeX = (B.x0 + B.x1) / 2;
    g.fillStyle = shade(B.roof, 0.8);
    if (wide) g.fillRect(B.x0 - 1, B.y0 - 1, B.x1 - B.x0 + 2, ridgeY - B.y0 + 1);
    else g.fillRect(ridgeX, B.y0 - 1, B.x1 - ridgeX + 1, B.y1 - B.y0 + 2);
    g.fillStyle = shade(B.roof, 0.7);
    for (let y = Math.floor(B.y0); y < B.y1; y += 0.75) g.fillRect(B.x0 - 1, y, B.x1 - B.x0 + 2, px);
    g.fillStyle = shade(B.roof, 0.88);
    for (let y = Math.floor(B.y0); y < B.y1; y += 0.75) for (let x = Math.floor(B.x0) + ((y * 4) % 2) * 0.5; x < B.x1; x += 1) g.fillRect(x, y + px, px, 0.75 - px);
    g.fillStyle = shade(B.roof, 1.25);
    if (wide) g.fillRect(B.x0 - 1, ridgeY - px, B.x1 - B.x0 + 2, 2 * px);
    else g.fillRect(ridgeX - px, B.y0 - 1, 2 * px, B.y1 - B.y0 + 2);
    // eaves: a lit lip along the front
    g.strokeStyle = shade(B.roof, 1.12); g.lineWidth = 2 * px; path(p); g.stroke();
    if (B.style === 'temple') { g.lineWidth = 2 * px; g.strokeStyle = '#d8a83a'; path(p); g.stroke(); }
    // chimney stacks, spaced along the ridge
    for (let c = 0; c < B.chimneys; c += 1) {
      const f2 = (c + 0.5) / B.chimneys;
      const cx = wide ? B.x0 + (B.x1 - B.x0) * f2 : ridgeX + (c % 2 ? 1.2 : -2.2);
      const cy = wide ? ridgeY + (c % 2 ? 1 : -2) : B.y0 + (B.y1 - B.y0) * f2;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx + 0.3, cy + 0.3, 1, 1.4);
      g.fillStyle = shade(B.wallColour ?? '#cfc6b4', 1); g.fillRect(cx, cy - 0.6, 1, 1.4);
      g.fillStyle = shade(B.wallColour ?? '#cfc6b4', 0.75); g.fillRect(cx, cy + 0.4, 1, 0.4);
      g.fillStyle = '#3a3a3a'; g.fillRect(cx + 0.2, cy - 0.6, 0.6, 0.3);
    }
  } else if (B.terrace) {
    // a public roof terrace: big stone slabs, planters with trees, a glass balustrade at the edge
    g.fillStyle = shade(B.roof, 0.88);
    for (let y = Math.floor(B.y0); y < B.y1; y += 2) g.fillRect(B.x0 - 1, y, B.x1 - B.x0 + 2, px);
    for (let x = Math.floor(B.x0); x < B.x1; x += 2) g.fillRect(x, B.y0 - 1, px, B.y1 - B.y0 + 2);
    for (let y = Math.floor(B.y0) + 3; y < B.y1 - 3; y += 9) for (let x = Math.floor(B.x0) + 3 + ((y / 9) % 2) * 4; x < B.x1 - 3; x += 9) {
      if (!pipM(x - 1.5, y - 1.5, p) || !pipM(x + 1.5, y + 1.5, p) || !pipM(x + 1.5, y - 1.5, p) || !pipM(x - 1.5, y + 1.5, p)) continue;
      g.fillStyle = '#8a7a66'; g.fillRect(x - 1.3, y - 1.3, 2.6, 2.6); // planter
      g.fillStyle = '#5f8a44'; g.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(x + 0.5, y + 0.5, 1.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2e5a33'; g.beginPath(); g.arc(x, y - 0.4, 1.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4f8a46'; g.beginPath(); g.arc(x - 0.4, y - 0.8, 0.9, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(190,225,240,0.9)'; g.lineWidth = 3 * px; path(p); g.stroke();
  } else {
    // flat roof: parapet, then what sits on Hong Kong roofs: water tanks, air-con units, a stair
    // house, and solar panels on the big ones
    g.strokeStyle = shade(B.roof, 0.72); g.lineWidth = 3 * px; path(p); g.stroke();
    g.strokeStyle = shade(B.roof, 1.18); g.lineWidth = px; path(p, 2 * px); g.stroke();
    const area = (B.x1 - B.x0) * (B.y1 - B.y0);
    if (area > 500 && hash(roofSeed, 1, 78) < 0.55) {
      const sx = B.x0 + (B.x1 - B.x0) * 0.2, sy = B.y0 + (B.y1 - B.y0) * 0.2;
      const sw = (B.x1 - B.x0) * 0.6, sh2 = Math.min((B.y1 - B.y0) * 0.45, 8);
      for (let y = sy; y < sy + sh2; y += 1.4) for (let x = sx; x < sx + sw; x += 1.1) {
        if (!pipM(x, y, p) || !pipM(x + 1, y + 1.2, p)) continue;
        g.fillStyle = '#2a3a5a'; g.fillRect(x, y, 1, 1.2);
        g.fillStyle = '#4a6a9a'; g.fillRect(x, y, 1, px); g.fillRect(x, y, px, 1.2);
      }
    }
    for (let y = Math.floor(B.y0) + 1; y < B.y1 - 1; y += 3) for (let x = Math.floor(B.x0) + 1; x < B.x1 - 1; x += 3) {
      const r = hash(x, y, 77);
      if (r > 0.17 || !pipM(x + 0.2, y + 0.2, p) || !pipM(x + 2.4, y + 2.2, p) || !pipM(x + 2.4, y + 0.2, p) || !pipM(x + 0.2, y + 2.2, p)) continue;
      if (r < 0.06) { // water tank
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 0.7, y + 0.5, 1.1, 1.2);
        g.fillStyle = '#3a6a9a'; g.fillRect(x + 0.4, y + 0.3, 1.1, 1.2);
        g.fillStyle = '#6a9ac8'; g.fillRect(x + 0.4, y + 0.3, 1.1, 0.4);
      } else if (r < 0.14) { // air-con unit with its fan
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 0.5, y + 0.7, 1, 0.75);
        g.fillStyle = '#c8c8c4'; g.fillRect(x + 0.3, y + 0.5, 1, 0.75);
        g.fillStyle = '#7a7a78'; g.fillRect(x + 0.5, y + 0.625, 0.5, 0.5);
      } else { // stair house
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 0.4, y + 0.3, 2, 1.8);
        g.fillStyle = shade(B.roof, 1.1); g.fillRect(x, y, 2, 1.2);
        g.fillStyle = shade(B.roof, 0.78); g.fillRect(x, y + 1.2, 2, 0.75);
        g.fillStyle = '#3a2e26'; g.fillRect(x + 0.75, y + 1.3, 0.5, 0.65);
      }
    }
  }
  g.restore();
  g.strokeStyle = shade(B.roof, 0.5); g.lineWidth = px; path(p); g.stroke();
  g.restore(); // the lift
  g.restore(); // the footprint clip
  // the footprint's outline at ground level, so the block sits firmly on the ground
  g.strokeStyle = 'rgba(20,16,14,0.55)'; g.lineWidth = px; path(p); g.stroke();
}

/** a crisp disc in 2 px steps (one art pixel), so props match the ground's pixel grid */
function disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const x0 = Math.round(cx / 2) * 2, y0 = Math.round(cy / 2) * 2;
  for (let dy = -r; dy <= r; dy += 2) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) / 2) * 2;
    if (w > 0) g.fillRect(x0 - w, y0 + dy, w * 2, 2);
  }
}

/** three families of crown colour, darkest first: deep green, yellow-green, blue-green */
const CROWNS = [
  ['#1c3824', '#2a5230', '#3a6c3c', '#55894c', '#77a45e'],
  ['#25411f', '#365c2a', '#4b7634', '#668f42', '#89aa55'],
  ['#1a3a33', '#264f42', '#346653', '#4d8366', '#6fa07c'],
];
const BLOSSOM = ['#d86a9a', '#e8a0c0', '#f2c8d8'];

/** crowns are drawn once per size and look, then stamped: a wood has hundreds of them */
const crownCache = new Map<string, HTMLCanvasElement>();
function crown(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number, blossom = false): void {
  const R = Math.max(4, Math.round(r / 2) * 2), kq = Math.floor(k * 24) / 24;
  const key = `${R}|${kq}|${blossom ? 1 : 0}`;
  let spr = crownCache.get(key);
  if (!spr) {
    spr = document.createElement('canvas');
    spr.width = spr.height = 2 * R + 8;
    paintCrown(spr.getContext('2d')!, R + 4, R + 4, R, kq, blossom);
    crownCache.set(key, spr);
  }
  g.drawImage(spr, Math.round(cx / 2) * 2 - R - 4, Math.round(cy / 2) * 2 - R - 4);
}
/** a soft-edged shadow disc, cached per size */
const shadowCache = new Map<number, HTMLCanvasElement>();
function shadowDisc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number): void {
  const R = Math.max(2, Math.round(r / 2) * 2);
  let spr = shadowCache.get(R);
  if (!spr) {
    spr = document.createElement('canvas');
    spr.width = spr.height = 2 * R + 4;
    const sg = spr.getContext('2d')!;
    sg.fillStyle = '#0a180c'; disc(sg, R + 2, R + 2, R);
    shadowCache.set(R, spr);
  }
  g.globalAlpha = alpha;
  g.drawImage(spr, Math.round(cx / 2) * 2 - R - 2, Math.round(cy / 2) * 2 - R - 2);
  g.globalAlpha = 1;
}
/** a tree crown in pixel-art layers: rim, body, light side, a few bright clumps */
function paintCrown(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number, blossom: boolean): void {
  const pal = CROWNS[Math.floor(k * 3) % 3];
  g.fillStyle = pal[0]; disc(g, cx, cy, r + 2);
  g.fillStyle = pal[1]; disc(g, cx, cy, r);
  g.fillStyle = pal[2]; disc(g, cx - r * 0.18, cy - r * 0.2, r * 0.72);
  g.fillStyle = pal[3]; disc(g, cx - r * 0.32, cy - r * 0.36, r * 0.4);
  // clumps of leaves catching the light
  for (let i = 0; i < 4; i += 1) {
    const a = k * 40 + i * 1.7, d = r * (0.35 + 0.3 * ((i * 0.37 + k) % 1));
    g.fillStyle = i < 2 ? pal[3] : pal[4];
    disc(g, cx + Math.cos(a) * d * 0.8 - r * 0.15, cy + Math.sin(a) * d * 0.6 - r * 0.25, Math.max(2, r * 0.18));
  }
  if (blossom) {
    for (let i = 0; i < 9; i += 1) {
      const a = i * 2.4 + k * 9, d = r * 0.75 * ((i * 0.618) % 1);
      g.fillStyle = BLOSSOM[i % 3];
      g.fillRect(Math.round((cx + Math.cos(a) * d) / 2) * 2, Math.round((cy + Math.sin(a) * d) / 2) * 2, 2, 2);
    }
  }
}

function drawTree(g: CanvasRenderingContext2D, px: number, py: number, r: number, big: boolean): void {
  const R = big ? 18 : 12 + Math.round((r % 1) * 4) * 2;
  const cx = px + 8, cy = py - R * 0.55;
  shadowDisc(g, cx + R * 0.35, py + 10, R * 0.85, 0.28);
  g.fillStyle = '#4a3420'; g.fillRect(cx - 2, py - 2, 4, 14);
  g.fillStyle = '#6a4c30'; g.fillRect(cx - 2, py - 2, 2, 14);
  crown(g, cx, cy, R, r % 1, (r * 97) % 1 < 0.06);
}

function shrub(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const pal = CROWNS[Math.floor(r * 30) % 3];
  const w = 6 + Math.round(r * 10) * 2 % 6;
  g.fillStyle = 'rgba(16,32,16,0.25)'; disc(g, px + 10, py + 12, w);
  g.fillStyle = pal[1]; disc(g, px + 8, py + 8, w);
  g.fillStyle = pal[2]; disc(g, px + 6, py + 6, w - 3);
  g.fillStyle = pal[3]; g.fillRect(px + 2, py + 2, 4, 2); g.fillRect(px + 8, py + 4, 2, 2);
}

/** a clump of tall grass or ferns */
function tuft(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const pal = r < 0.5 ? ['#3f6a34', '#5e8c44', '#82aa58'] : ['#58703a', '#7c8e46', '#a8ac5c'];
  const x = px + 2 + Math.round(r * 5) * 2, y = py + 8;
  for (let i = 0; i < 5; i += 1) {
    const h = 4 + ((i * 3 + Math.round(r * 9)) % 4) * 2;
    g.fillStyle = pal[i % 2]; g.fillRect(x + i * 2, y - h, 2, h);
  }
  g.fillStyle = pal[2]; g.fillRect(x + 2, y - 8, 2, 2); g.fillRect(x + 6, y - 6, 2, 2);
}

function flowers(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const cols = ['#e05a6a', '#f2d24a', '#f2eee4', '#c06ae0', '#f08a3a'];
  const c = cols[Math.floor(r * 1000) % cols.length], c2 = cols[(Math.floor(r * 1000) + 2) % cols.length];
  for (let i = 0; i < 7; i += 1) {
    const x = px + 2 + ((i * 5) % 12) & ~1, y = py + 4 + ((i * 7) % 9) & ~1;
    g.fillStyle = '#3e6a38'; g.fillRect(x, y + 2, 2, 2);
    g.fillStyle = i % 3 ? c : c2; g.fillRect(x, y, 2, 2);
  }
}

function rock(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + 4, py + 10, 12, 4);
  g.fillStyle = '#6e6660'; g.fillRect(px + 2, py + 4, 12, 8);
  g.fillStyle = '#948a80'; g.fillRect(px + 2, py + 4, 10, 6);
  g.fillStyle = '#b4aa9c'; g.fillRect(px + 4, py + 4, 4, 2);
}

/** a big shore boulder */
function boulder(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const s = 8 + Math.round(r * 4) * 2;
  g.fillStyle = 'rgba(0,0,0,0.25)'; disc(g, px + 10, py + 12, s);
  g.fillStyle = '#6e5c52'; disc(g, px + 8, py + 8, s);
  g.fillStyle = '#9c8270'; disc(g, px + 6, py + 6, s - 3);
  g.fillStyle = '#c4a88e'; disc(g, px + 4, py + 3, Math.max(2, s - 8));
}

function bin(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 6, py + 12, 8, 2);
  g.fillStyle = '#3a7a4a'; g.fillRect(px + 6, py + 4, 6, 10);
  g.fillStyle = '#2a5a36'; g.fillRect(px + 6, py + 4, 6, 2);
}

function parkedCar(g: CanvasRenderingContext2D, px: number, py: number, r: number, vertical: boolean): void {
  const cols = ['#c8382f', '#e0e0e8', '#3a6ac8', '#2a2a30', '#e8c23a', '#6a6a72', '#f2f2f2'];
  const c = cols[Math.floor(r * cols.length)];
  const w = vertical ? 30 : 68, h = vertical ? 68 : 30;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 4, py + 4, w, h);
  g.fillStyle = shade(c, 0.7); g.fillRect(px - 2, py - 2, w + 4, h + 4);
  g.fillStyle = c; g.fillRect(px, py, w, h);
  g.fillStyle = '#1a2a3a';
  if (vertical) { g.fillRect(px + 4, py + 12, w - 8, 12); g.fillRect(px + 4, py + h - 18, w - 8, 8); }
  else { g.fillRect(px + 12, py + 4, 12, h - 8); g.fillRect(px + w - 18, py + 4, 8, h - 8); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(px + 2, py + 2, vertical ? w - 4 : 6, vertical ? 6 : h - 4);
}

/** are these trees part of a wood: then crowns fill it from two staggered lattices */
function woodCrowns(g: CanvasRenderingContext2D, x: number, y: number): void {
  for (const off of [0, 1]) {
    // lattice points every 3 m, the second set shifted half a step
    const lx = x - off, ly = y - off;
    if (((lx % 3) + 3) % 3 !== 0 || ((ly % 3) + 3) % 3 !== 0) continue;
    const k = hash(x, y, 90 + off);
    if (off && k < 0.3) continue;
    const jx = (hash(x, y, 91) - 0.5) * 24, jy = (hash(x, y, 92) - 0.5) * 20;
    const sz = hash(x, y, 93);
    const R = sz < 0.3 ? 16 + Math.round(sz * 20) * 2 : 24 + Math.round(sz * 9) * 2;
    const cx = x * TILE + 8 + jx, cy = y * TILE + 8 + jy - 10;
    shadowDisc(g, cx + R * 0.3, cy + R * 0.45, R, 0.3);
    crown(g, cx, cy, R, k);
  }
}

function drawProp(g: CanvasRenderingContext2D, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  const code = grid[y * MAP_W + x];
  const px = x * TILE, py = y * TILE;
  const r = hash(x, y, 7);
  // small things stay off the strip right against a building, where they would poke up over its wall
  let nb = false;
  for (let dy = -1; dy <= 1 && !nb; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (at_(x + dx, y + dy) === Gr.Building) { nb = true; break; }
  switch (code) {
    case Gr.Wood: woodCrowns(g, x, y); return;
    case Gr.Scrub:
      if (r < 0.06) drawTree(g, px, py, r * 16, r < 0.02);
      else if (r < 0.26) nb || shrub(g, px, py, r);
      else if (r < 0.4) nb || tuft(g, px, py, hash(x, y, 8));
      return;
    case Gr.Hill:
      if (r < 0.035) drawTree(g, px, py, r * 28, r < 0.012);
      else if (r < 0.09) nb || shrub(g, px, py, r);
      else if (r < 0.2) nb || tuft(g, px, py, hash(x, y, 8));
      else if (r < 0.215) nb || rock(g, px, py);
      else if (r < 0.225) nb || flowers(g, px, py, r);
      return;
    case Gr.Grass:
      if (r < 0.008) drawTree(g, px, py, r * 120, true);
      else if (r < 0.016) nb || flowers(g, px, py, r);
      else if (r < 0.03) nb || tuft(g, px, py, hash(x, y, 8));
      return;
    case Gr.Rock:
      if (r < 0.05) boulder(g, px, py, hash(x, y, 9));
      return;
    case Gr.Park: case Gr.School:
      if (r < 0.02) drawTree(g, px, py, r * 50, true);
      else if (r < 0.035) nb || shrub(g, px, py, r);
      else if (r < 0.045) nb || flowers(g, px, py, r);
      else if (r < 0.05) bench(g, px, py);
      else if (r < 0.06) nb || tuft(g, px, py, hash(x, y, 8));
      return;
    case Gr.Built:
      if (core(x, y)) { if (r < 0.01) bin(g, px, py); else if (r < 0.02) nb || flowers(g, px, py, r); return; }
      if (r < 0.04) drawTree(g, px, py, r * 25, false);
      else if (r < 0.1) nb || shrub(g, px, py, r);
      else if (r < 0.12) nb || flowers(g, px, py, r);
      else if (r < 0.16) nb || tuft(g, px, py, hash(x, y, 8));
      return;
    case Gr.Cemetery: if (x % 3 === 0 && y % 3 === 0) { g.fillStyle = '#e8e8e0'; g.fillRect(px + 6, py + 2, 6, 10); g.fillStyle = '#c8c8c0'; g.fillRect(px + 6, py + 2, 6, 2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 6, py + 12, 8, 2); } return;
    case Gr.Beach: if (r < 0.006) umbrella(g, px, py, hash(x, y, 32)); else if (r < 0.01) nb || rock(g, px, py); return;
    case Gr.Plaza:
      if (x >= 640 && x <= 720 && y >= 440 && y <= 540 && x % 7 === 0 && y % 6 === 0) stall(g, px, py, hash(x, y, 61));
      else if (r < 0.008) bench(g, px, py);
      else if (r < 0.014) nb || flowers(g, px, py, r);
      return;
    case Gr.Path: {
      const byRoad = at_(x - 1, y) === Gr.Road || at_(x + 1, y) === Gr.Road || at_(x, y - 1) === Gr.Road || at_(x, y + 1) === Gr.Road;
      if (byRoad && (x * 7 + y * 13) % 29 === 0) {
        // a street lamp
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 8, py + 13, 5, 2);
        g.fillStyle = '#3a3e4a'; g.fillRect(px + 7, py - 14, 2, 28);
        g.fillStyle = '#e8d8a0'; g.fillRect(px + 5, py - 17, 6, 4);
      } else if (byRoad && (x * 11 + y * 5) % 23 === 0) {
        // a street tree in its pit
        g.fillStyle = '#6a5a4a'; g.fillRect(px + 2, py + 6, 12, 8);
        drawTree(g, px, py, r * 30, false);
      } else if (r < 0.006) bin(g, px, py);
      else if (r < 0.009) bench(g, px, py);
      return;
    }
    case Gr.Lane: {
      // cars parked along the kerb of side streets
      const kerbN = at_(x, y - 1) !== Gr.Lane && at_(x, y - 1) !== Gr.Road;
      const kerbW = at_(x - 1, y) !== Gr.Lane && at_(x - 1, y) !== Gr.Road;
      // only on lanes wide enough to still drive past, and not too many
      const wideH = at_(x, y + 4) === Gr.Lane || at_(x, y + 4) === Gr.Road;
      const wideV = at_(x + 4, y) === Gr.Lane || at_(x + 4, y) === Gr.Road;
      if (kerbN && x % 7 === 0 && r < 0.18 && wideH && at_(x + 4, y) === Gr.Lane) parkedCar(g, px + 2, py + 2, hash(x * 13 + y, y * 7 + x, 71), false);
      else if (kerbW && y % 7 === 0 && r < 0.18 && wideV && at_(x, y + 4) === Gr.Lane) parkedCar(g, px + 2, py + 2, hash(x * 13 + y, y * 7 + x, 72), true);
      return;
    }
    case Gr.Sea: {
      if (r > 0.0012) return;
      let near = false;
      for (let d = 2; d <= 10 && !near; d += 2) near = at_(x + d, y) !== Gr.Sea || at_(x - d, y) !== Gr.Sea || at_(x, y + d) !== Gr.Sea || at_(x, y - d) !== Gr.Sea;
      if (!near) return;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 3, py + 9, 34, 4);
      g.fillStyle = hash(x, y, 42) < 0.5 ? '#f2eee4' : '#c84a3a'; g.fillRect(px, py, 34, 10);
      g.fillStyle = '#4a3a2a'; g.fillRect(px + 3, py + 3, 28, 4);
      g.fillStyle = '#e8e4d8'; g.fillRect(px + 12, py - 5, 10, 6);
      return;
    }
    default:
  }
}

/** a market stall: a striped awning over a table of goods */
function stall(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const cols = ['#c8463a', '#3a7ac8', '#e0a83a', '#3aa86a', '#8a3ac8', '#d86a8a'];
  const c = cols[Math.floor(r * cols.length)];
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + 4, py + 30, 64, 6);
  g.fillStyle = '#6a4a3a'; g.fillRect(px + 2, py + 18, 64, 14);
  const goods = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac08a', '#f2eee4', '#c05ae0'];
  for (let i = 0; i < 8; i += 1) { g.fillStyle = goods[(i + Math.floor(r * 6)) % goods.length]; g.fillRect(px + 5 + i * 7, py + 20, 5, 6); }
  for (let i = 0; i < 8; i += 1) { g.fillStyle = i % 2 ? '#f2eee4' : c; g.fillRect(px + i * 9, py, 9, 14); }
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px, py + 12, 72, 2);
  g.fillStyle = '#3a3a3a'; g.fillRect(px + 1, py + 14, 2, 18); g.fillRect(px + 67, py + 14, 2, 18);
}

function bench(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 1, py + 11, 20, 2);
  g.fillStyle = '#6a4a2e'; g.fillRect(px, py + 4, 20, 3); g.fillRect(px, py + 1, 20, 2);
  g.fillStyle = '#3a3a3a'; g.fillRect(px + 1, py + 7, 2, 4); g.fillRect(px + 17, py + 7, 2, 4);
}

function umbrella(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const cols = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac08a'];
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(px + 12, py + 12, 11, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8e4d8'; g.fillRect(px + 7, py - 2, 2, 14);
  g.fillStyle = cols[Math.floor(r * 4)]; g.beginPath(); g.arc(px + 8, py - 4, 11, Math.PI, 0); g.fill();
  g.fillStyle = '#f2eee4'; g.fillRect(px + 2, py + 6, 14, 5);
}
