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

/** a marking: colour (w white, y yellow, r red), kind (l line, d double line, f filled shape),
 *  width in metres, dash and gap in metres (0 for solid), points */
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
const extent = (p: number[]): number => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return Math.max(x1 - x0, y1 - y0);
};
for (const name of ['DTAD_LV22_LINE', 'DTAD_RD_AL_LINE', 'DTAD_CROSSING_LINE']) {
  for (const { g, a } of rows(name)) {
    const [d, gap] = a.LINETYPE === 'SHORT-DASHED' ? [0.6, 0.6] : [0, 0];
    for (const p of g) if (p.length >= 4 && (name !== 'DTAD_LV22_LINE' || extent(p) >= 1.6)) marks.push([colour(a.COLOR), 'l', 0.12, d, gap, p]);
  }
}
for (const { g } of rows('DTAD_YL_BOX_LINE')) for (const p of g) marks.push(['y', 'l', 0.12, 0, 0, p]);
for (const { g, a } of rows('DTAD_LV22_FILLED')) for (const p of g) marks.push([colour(a.COLOR), 'f', 0, 0, 0, p]);

// tactile warning strips on the pavement at crossings: yellow studded bands
const tactile = rows('DTAD_TW_STRIP_LINE').flatMap(({ g }) => g).filter((p) => p.length >= 4);
// guard railings and barriers
const rails = rows('DTAD_RAILING_LINE').flatMap(({ g, a }) => g.filter((p) => p.length >= 4).map((p) => [a.LINETYPE === 'CBARRIER' ? 1 : 0, p] as [number, number[]]));
// signals: pedestrian (P..), vehicle (S..) and push buttons, with the way they face (degrees)
const lights = rows('DTAD_TRAFFIC_LIGHT_PT').map(({ g, a }) => [String(a.REFNAME ?? ''), g[0][0], g[0][1], Number(a.ANGLE ?? 0)] as [string, number, number, number]);

const W = OSM.w, H = OSM.h;
const onMap = (p: number[]): boolean => p.some((v, i) => (i % 2 ? v >= -5 && v <= H + 5 : v >= -5 && v <= W + 5));
const data = {
  kerbs: kerbs.filter(onMap), seawalls: seawalls.filter(onMap),
  marks: marks.filter((m) => onMap(m[5])), tactile: tactile.filter(onMap), rails: rails.filter((r) => onMap(r[1])),
  lights: lights.filter(([, x, y]) => x >= 0 && y >= 0 && x <= W && y <= H),
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
} = JSON.parse(String.raw\`${json}\`);
/** walls, fences and gates from the iB1000 map */
export const IB: { wall: number[][]; fence: number[][]; gate: number[][] } = JSON.parse(String.raw\`${ibJson}\`);
`);
console.log(`stanley-roads.ts: ${data.kerbs.length} kerbs, ${data.marks.length} marks, ${data.tactile.length} tactile, ${data.rails.length} rails, ${data.lights.length} lights; ${json.length} bytes`);
console.log('dash patterns', [...dashOf]);
