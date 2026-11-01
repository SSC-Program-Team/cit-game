/**
 * Real kerbs and road markings for Stanley, written to src/stanley-roads.ts.
 *
 *   node --experimental-strip-types --no-warnings scripts/import-roads.ts
 *
 * Inputs (both in content/):
 * - ib1000-stanley.json: the Lands Department's iB1000 1:1000 map, cut down by
 *   scripts/import-ib1000.py. Its kerb lines (road margins) give each carriageway's real edges.
 * - csdi-traffic-aids-stanley.json: the Transport Department's Traffic Aids Drawings
 *   (2nd generation) from CSDI, fetched in the browser for the map box: lane lines, yellow
 *   lines, yellow boxes, arrows and words, crossings, tactile strips, railings and signals.
 *
 * Both are surveyed in the Hong Kong 1980 Grid and sit 1 m east and 7.5 m north of OpenStreetMap
 * here, the same shift the pedestrian network needed (scripts/import-pedestrian.ts).
 *
 * How marking codes are read (the drawings carry Transport Department diagram codes, not colours
 * by name): colour 0 is white, 6 is yellow, 1 is red; RM1041 is a double yellow line and RM1040 a
 * single one; a line's dash pattern comes from its LINE_PATTERN where the drawing gives one, and
 * a code that has one somewhere uses it everywhere. Everything else is drawn solid as surveyed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { OSM } from '../src/stanley-osm.ts';

const SHIFT: [number, number] = [-1, 7.5];
const r1 = (v: number): number => Math.round(v * 10) / 10;

// ---- iB1000 kerbs (already in game metres and shifted)
const ib = JSON.parse(readFileSync(new URL('../content/ib1000-stanley.json', import.meta.url), 'utf8'));
const kerbs: number[][] = ib.kinds.kerb ?? [];
const seawalls: number[][] = ib.kinds.seawall ?? [];
// walls, fences and gates (gates keep a gap in them)
const walls: number[][] = ib.kinds.wall ?? [], fences: number[][] = ib.kinds.fence ?? [], gates: number[][] = ib.kinds.gate ?? [];

// ---- traffic aids
type Layer = { geom: string; same: Record<string, unknown>; keys: string[]; f: unknown[][] };
const td: { KX: number; KY: number; layers: Record<string, Layer> } =
  JSON.parse(readFileSync(new URL('../content/csdi-traffic-aids-stanley.json', import.meta.url), 'utf8'));
const [lat0, lon0] = OSM.origin;
const dx0 = (lon0 - 114.2045) * td.KX, dy0 = (22.2235 - lat0) * td.KY;
const decode = (s: string): number[] => {
  const v = s.split(' ').map(Number), out: number[] = [];
  let x = 0, y = 0;
  for (let i = 0; i + 1 < v.length; i += 2) { x += v[i]; y += v[i + 1]; out.push(r1(x - dx0 + SHIFT[0]), r1(y - dy0 + SHIFT[1])); }
  return out;
};
const rows = (name: string): Array<{ g: number[][]; a: Record<string, unknown> }> => {
  const L = td.layers[name];
  if (!L) return [];
  return L.f.map((r) => {
    const a: Record<string, unknown> = { ...L.same };
    L.keys.forEach((k, i) => { a[k] = r[i + 1]; });
    const g = Array.isArray(r[0]) ? (r[0] as string[]) : [r[0] as string];
    return { g: g.map(decode), a };
  });
};

/** a marking: colour (w white, y yellow, r red), kind (l line, d double line, f filled shape,
 *  p filled outline (dash holds its feature number), s road studs, z zigzag), width in metres,
 *  dash and gap in metres (0 for solid), points */
type Mark = [string, string, number, number, number, number[]];
const marks: Mark[] = [];
const colour = (c: unknown): string => (c === 6 || c === '6' ? 'y' : c === 1 || c === '1' ? 'r' : 'w');

// dash patterns by code, from the lines that carry one
const dashOf = new Map<string, [number, number]>();
for (const { a } of rows('DTAD_RD_MARK_LINE_C')) {
  const p = typeof a.LINE_PATTERN_1 === 'string' ? a.LINE_PATTERN_1.split(' ').map(Number) : null;
  if (p && p.length === 2 && !dashOf.has(String(a.LINETYPE))) dashOf.set(String(a.LINETYPE), [p[0], p[1]]);
}
const dash = (code: string): [number, number] => {
  const base = code.replace(/_(DASH|SOLID)$/, '');
  if (code.endsWith('_SOLID')) return [0, 0];
  return dashOf.get(base) ?? dashOf.get(code) ?? (code.endsWith('_DASH') ? [1, 1] : [0, 0]);
};

for (const name of ['DTAD_RD_MARK_LINE', 'DTAD_RD_MARK_LINE_C']) {
  for (const { g, a } of rows(name)) {
    if (/^(RM1127|ZIGZAG)/.test(String(a.LINETYPE))) continue; // drawn as zigzags below
    const [d, gap] = dash(String(a.LINETYPE));
    for (const p of g) marks.push([colour(a.COLOR), 'l', 0.15, d, gap, p]);
  }
}
for (const { g, a } of rows('DTAD_RST_ZONE_LINE')) {
  const kind = a.LINETYPE === 'RM1041' ? 'd' : 'l';
  for (const p of g) if (p.length >= 4) marks.push(['y', kind, 0.1, 0, 0, p]);
}
// outline strokes: arrows, words and zebra stripes painted on the road. The drawings' own notes
// ("Removable Railing") are stroked text too, in letters about a metre tall; road words are 1.6 m
// or more, so a stroke whose whole extent is under 1.6 m is taken to be a note and left out
const boxOf = (p: number[]): number[] => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return [x0, y0, x1, y1];
};
const extent = (p: number[]): number => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return Math.max(x1 - x0, y1 - y0);
};
// A closed outline small enough to be a painted shape (a zebra stripe, a crossing's yellow bar, an
// arrow, a letter) is filled, as the paint is: kind 'p', its feature's number in the dash slot so
// the letters' counters can be cut out (even-odd) with the rest of the same word.
const closed = (p: number[]): boolean => p.length >= 8 && Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) < 0.3;
const area = (p: number[]): number => { let a = 0; for (let i = 0; i + 3 < p.length; i += 2) a += p[i] * p[i + 3] - p[i + 2] * p[i + 1]; return Math.abs(a / 2); };
/** the way a ring's long side runs (radians, 0..pi) */
const axis = (p: number[]): number => {
  let best = 0, bl = 0;
  for (let i = 0; i + 3 < p.length; i += 2) { const l = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); if (l > bl) { bl = l; best = Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i]); } }
  return ((best % Math.PI) + Math.PI) % Math.PI;
};
let group = 0;
// zebra stripes, so the yellow island symbols drawn over them can be told apart
const stripes = rows('DTAD_CROSSING_LINE').flatMap(({ g }) => g).filter(closed);
const overStripe = (p: number[]): number[] | null => {
  const b = boxOf(p), m = 1.5;
  return stripes.find((q) => { const c = boxOf(q); return b[0] < c[2] + m && c[0] - m < b[2] && b[1] < c[3] + m && c[1] - m < b[3]; }) ?? null;
};
for (const name of ['DTAD_LV22_LINE', 'DTAD_RD_AL_LINE', 'DTAD_CROSSING_LINE', 'DTAD_RD_MARK_SYM_LINE']) {
  for (const { g, a } of rows(name)) {
    group += 1;
    const [d, gap] = a.LINETYPE === 'SHORT-DASHED' ? [0.6, 0.6] : [0, 0];
    // words and symbols from the symbol layer: bus stop and taxi stand words are yellow
    const sym = name === 'DTAD_RD_MARK_SYM_LINE' ? String(a.REFNAME) : '';
    let col = sym ? (/^(1047|1140|1175)$/.test(sym) ? 'y' : 'w') : colour(a.COLOR);
    if (name === 'DTAD_LV22_LINE' && a.LINETYPE === 'ZEBRAGUIDE') { for (const p of g) if (p.length >= 4) marks.push(['w', 's', 0.15, 0, 0, p]); continue; }
    for (const p of g) {
      if (p.length < 4 || (name === 'DTAD_LV22_LINE' && extent(p) < 1.6 && !closed(p))) continue;
      // a little ring is the drawing's symbol for a road stud: a stud
      if (closed(p) && extent(p) < 0.8) { const b = boxOf(p); marks.push(['w', 's', 0.15, 0, 0, [r1((b[0] + b[2]) / 2), r1((b[1] + b[3]) / 2), r1((b[0] + b[2]) / 2 + 0.1), r1((b[1] + b[3]) / 2)]]); continue; }
      if (closed(p) && area(p) < 15) {
        // a yellow shape over a zebra: a stripe if it lies the same way (painted white), otherwise
        // the drawing's own island symbol, not paint
        let c = col;
        if (name === 'DTAD_LV22_LINE' && col === 'y') {
          const s = overStripe(p);
          if (s) { const da = Math.abs(axis(p) - axis(s)); if (Math.min(da, Math.PI - da) > 0.26) continue; c = 'w'; }
        }
        marks.push([c, 'p', 0, group, 0, p]);
      } else marks.push([col, 'l', 0.12, d, gap, p]);
    }
  }
}
// zigzag lines either side of a zebra (white in Hong Kong): kind 'z'
for (const name of ['DTAD_RD_MARK_LINE', 'DTAD_RD_MARK_LINE_C']) {
  for (const { g, a } of rows(name)) if (/^(RM1127|ZIGZAG)/.test(String(a.LINETYPE))) for (const p of g) if (p.length >= 4) marks.push(['w', 'z', 0.12, 0, 0, p]);
}
for (const { g } of rows('DTAD_YL_BOX_LINE')) for (const p of g) marks.push(['y', 'l', 0.12, 0, 0, p]);
for (const { g, a } of rows('DTAD_LV22_FILLED')) for (const p of g) marks.push([colour(a.COLOR), 'f', 0, 0, 0, p]);

// tactile warning strips on the pavement at crossings: yellow studded bands
const tactile = rows('DTAD_TW_STRIP_LINE').flatMap(({ g }) => g).filter((p) => p.length >= 4);
// guard railings and barriers
const rails = rows('DTAD_RAILING_LINE').flatMap(({ g, a }) => g.filter((p) => p.length >= 4).map((p) => [a.LINETYPE === 'CBARRIER' ? 1 : 0, p] as [number, number[]]));
// signals: pedestrian (P..), vehicle (S..) and push buttons, with the way they face (degrees)
// LOOK RIGHT / LOOK LEFT painted at the kerb of a crossing (diagrams 1135 and 1136), with the way
// the words run (degrees)
const looks = rows('DTAD_RD_MARK_SYM_PT').filter(({ a }) => a.REFNAME === '1135' || a.REFNAME === '1136')
  .map(({ g, a }) => [a.REFNAME === '1135' ? 'R' : 'L', g[0][0], g[0][1], Number(a.ANGLE ?? 0)] as [string, number, number, number]);
// a zebra's yellow beacons: one at each end of each run of stripes, a metre and a half past the last
// stripe (on the pavement or the island)
const beacons: Array<[number, number]> = [];
for (const { g } of rows('DTAD_CROSSING_LINE')) {
  const cs = g.filter(closed).map((p) => { const b = boxOf(p); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; });
  if (cs.length < 3) continue;
  // the two stripes furthest apart are the ends
  let a = cs[0], b = cs[1], best = -1;
  for (const p of cs) for (const q of cs) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > best) { best = d; a = p; b = q; } }
  const ux = (b[0] - a[0]) / best, uy = (b[1] - a[1]) / best;
  beacons.push([r1(a[0] - ux * 1.5), r1(a[1] - uy * 1.5)], [r1(b[0] + ux * 1.5), r1(b[1] + uy * 1.5)]);
}
// traffic signs on posts: their figure numbers in the regulations, and the way they face
const signs = rows('DTAD_TS_ABV_PT').map(({ g, a }) => [String(a.REFNAME ?? ''), g[0][0], g[0][1], Number(a.ANGLE ?? 0)] as [string, number, number, number]);
const lights = rows('DTAD_TRAFFIC_LIGHT_PT').map(({ g, a }) => [String(a.REFNAME ?? ''), g[0][0], g[0][1], Number(a.ANGLE ?? 0)] as [string, number, number, number]);

const W = OSM.w, H = OSM.h;
const onMap = (p: number[]): boolean => p.some((v, i) => (i % 2 ? v >= -5 && v <= H + 5 : v >= -5 && v <= W + 5));
const data = {
  kerbs: kerbs.filter(onMap), seawalls: seawalls.filter(onMap),
  marks: marks.filter((m) => onMap(m[5])), tactile: tactile.filter(onMap), rails: rails.filter((r) => onMap(r[1])),
  lights: lights.filter(([, x, y]) => x >= 0 && y >= 0 && x <= W && y <= H),
  looks: looks.filter(([, x, y]) => x >= 0 && y >= 0 && x <= W && y <= H),
  signs: signs.filter(([, x, y]) => x >= 0 && y >= 0 && x <= W && y <= H),
  // none where the crossing has signals (a signal-controlled crossing has no beacons), one where
  // two runs of stripes meet on an island
  beacons: beacons.filter(([x, y], i) => !lights.some(([, lx, ly]) => Math.hypot(lx - x, ly - y) < 12)
    && !beacons.slice(0, i).some(([qx, qy]) => Math.hypot(qx - x, qy - y) < 1.5)),
};
const json = JSON.stringify(data);
if (json.includes('`') || json.includes('${')) throw new Error('unexpected characters in data');
const ibOut = { wall: walls.filter(onMap), fence: fences.filter(onMap), gate: gates.filter(onMap) };
const ibJson = JSON.stringify(ibOut);
writeFileSync(new URL('../src/stanley-roads.ts', import.meta.url), `/**
 * GENERATED by scripts/import-roads.ts. Kerbs from the Lands Department's iB1000 map; road
 * markings, railings and signals from the Transport Department's Traffic Aids Drawings (CSDI).
 * Source: Lands Department and Transport Department, HKSAR Government. Game metres.
 */
export type Mark = [colour: string, kind: string, width: number, dash: number, gap: number, points: number[]];
export const ROADS: {
  kerbs: number[][]; seawalls: number[][]; marks: Mark[]; tactile: number[][];
  rails: Array<[barrier: number, points: number[]]>; lights: Array<[ref: string, x: number, y: number, angle: number]>;
  looks: Array<[side: string, x: number, y: number, angle: number]>; signs: Array<[fig: string, x: number, y: number, angle: number]>;
  beacons: Array<[x: number, y: number]>;
} = JSON.parse(String.raw\`${json}\`);
/** walls, fences and gates from the iB1000 map */
export const IB: { wall: number[][]; fence: number[][]; gate: number[][] } = JSON.parse(String.raw\`${ibJson}\`);
`);
console.log(`stanley-roads.ts: ${data.kerbs.length} kerbs, ${data.marks.length} marks, ${data.tactile.length} tactile, ${data.rails.length} rails, ${data.lights.length} lights; ${json.length} bytes`);
console.log('dash patterns', [...dashOf]);
