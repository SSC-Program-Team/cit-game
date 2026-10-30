/**
 * Stanley at real scale: one tile is one metre, 16 px. The ground, roads, coastline, walls and
 * every building outline come from OpenStreetMap (© OpenStreetMap contributors, ODbL) via
 * src/stanley-osm.ts and are rasterised here at load. The map is far too big for one canvas
 * (about 22,500 x 20,500 px), so it is drawn in 512 px chunks as you walk, and only the chunks
 * near the camera are kept. See docs/design/stanley-expansion.md §2.
 */
import { OSM } from './stanley-osm.ts';
import { ROUTES } from './minibus.ts';

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
} as const;
export type Gr = (typeof Gr)[keyof typeof Gr];

/** ground per tile */
export const grid = new Uint8Array(N);
/** building index per tile, -1 for none */
export const bid = new Int32Array(N).fill(-1);

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
      if (side[k] && (g === Gr.Hill || g === Gr.Park || g === Gr.Built || g === Gr.School || g === Gr.Yard)) grid[k] = Gr.Path;
    }
  }
  // 4. buildings
  OSM.buildings.forEach(([p], i) => fillPoly(p, (k) => { if (grid[k] !== Gr.Sea) { grid[k] = Gr.Building; bid[k] = i; } }));
  // 5. walls and fences (retaining walls are only a change of level)
  for (const [p, kind] of OSM.walls) {
    if (kind === 'retaining_wall') continue;
    traceLine(p, (k) => { if (grid[k] !== Gr.Sea && grid[k] !== Gr.Building) grid[k] = Gr.Wall; });
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
};

/** is this metre in the village core, where open ground is paved rather than garden */
const core = (x: number, y: number): boolean => (x >= 460 && x <= 845 && y >= 300 && y <= 700) || (x >= 280 && x <= 470 && y >= 260 && y <= 490);

const hash = (x: number, y: number, salt = 0): number => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

export const BUILDINGS: Building[] = OSM.buildings.map(([p, kind, name, extra]) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const style = name === 'Murray House' ? 'heritage' : styleFor(kind, extra, cx, cy);
  const span = Math.min(x1 - x0, y1 - y0);
  const tall = style === 'apartments' || style === 'quarters' || style === 'mall';
  const wall = Math.max(2, Math.min(tall ? 7 : style === 'school' ? 3 : 4, Math.round(span * (tall ? 0.4 : style === 'school' ? 0.2 : 0.3))));
  const roofs = ROOFS[style];
  return {
    poly: p, name, style, x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1), wall, door: null,
    roof: roofs[Math.floor(hash(Math.round(x0), Math.round(y0), 5) * roofs.length)],
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
const MAX_CHUNKS = 28;
let frameNo = 0;

const at_ = (x: number, y: number): number => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? Gr.Sea : grid[y * MAP_W + x]);

/** draw the map under the camera; chunks are drawn on first sight and kept while near */
export function drawWorld(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number): void {
  frameNo += 1;
  const cx0 = Math.floor(camX / CPX), cy0 = Math.floor(camY / CPX);
  const cx1 = Math.floor((camX + w) / CPX), cy1 = Math.floor((camY + h) / CPX);
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      if (cx < 0 || cy < 0 || cx * CPX >= MAP_W * TILE || cy * CPX >= MAP_H * TILE) continue;
      const key = cy * 1000 + cx;
      let c = chunks.get(key);
      if (!c) { c = { canvas: renderChunk(cx, cy), used: frameNo }; chunks.set(key, c); }
      c.used = frameNo;
      ctx.drawImage(c.canvas, cx * CPX - camX, cy * CPX - camY);
    }
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
};

function shade(hex: string, k: number): string {
  const [r, g, b] = hexRgb(hex);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** art pixels per metre: the ground and buildings are drawn this fine, then doubled up */
const ART = 8;
const LO = CHUNK * ART;

/** base colour per ground class, as [r, g, b] */
const BASE: Record<number, [number, number, number]> = {
  [Gr.Hill]: [92, 136, 72], [Gr.Sea]: [40, 94, 136], [Gr.Beach]: [222, 205, 154], [Gr.Wood]: [56, 98, 50],
  [Gr.Cemetery]: [112, 158, 88], [Gr.Pitch]: [88, 158, 72], [Gr.Park]: [104, 154, 82], [Gr.Parking]: [128, 128, 136],
  [Gr.Plaza]: [206, 192, 160], [Gr.Pier]: [140, 106, 72], [Gr.School]: [116, 166, 92], [Gr.Yard]: [150, 150, 154],
  [Gr.Road]: [70, 72, 84], [Gr.Lane]: [88, 90, 100], [Gr.Path]: [196, 190, 178], [Gr.Steps]: [172, 166, 156],
  [Gr.Wall]: [170, 168, 174],
};
const PAVED: [number, number, number] = [184, 178, 166];
const GARDEN: [number, number, number] = [118, 162, 92];
/** when two classes meet in a blend, the more 'man-made' one wins ties */
const PRIORITY: Record<number, number> = {
  [Gr.Road]: 9, [Gr.Lane]: 8, [Gr.Steps]: 7, [Gr.Path]: 7, [Gr.Pier]: 7, [Gr.Wall]: 9, [Gr.Plaza]: 6, [Gr.Parking]: 6,
  [Gr.Beach]: 3, [Gr.Sea]: 2,
};

/** the ground class under a tile, with buildings standing on paving */
const groundAt = (x: number, y: number): number => {
  const g = at_(x, y);
  return g === Gr.Building ? Gr.Built : g;
};

const noise = (x: number, y: number, s = 0): number => hash(x, y, s + 101);

function renderChunk(cx: number, cy: number): HTMLCanvasElement {
  const tx0 = cx * CHUNK, ty0 = cy * CHUNK;

  // ---- 1. ground, at ART pixels per metre, blending the tile grid so edges come out smooth
  const lo = document.createElement('canvas');
  lo.width = LO; lo.height = LO;
  const lg = lo.getContext('2d')!;
  const img = lg.createImageData(LO, LO);
  const label = new Uint8Array(LO * LO);
  const seaW = new Float32Array(LO * LO);
  const counts = new Float32Array(32);
  for (let py = 0; py < LO; py += 1) {
    const fy = ty0 + (py + 0.5) / ART - 0.5;
    const y0 = Math.floor(fy), wy = fy - y0;
    for (let px = 0; px < LO; px += 1) {
      const fx = tx0 + (px + 0.5) / ART - 0.5;
      const x0 = Math.floor(fx), wx = fx - x0;
      counts.fill(0);
      const c00 = groundAt(x0, y0), c10 = groundAt(x0 + 1, y0), c01 = groundAt(x0, y0 + 1), c11 = groundAt(x0 + 1, y0 + 1);
      counts[c00] += (1 - wx) * (1 - wy); counts[c10] += wx * (1 - wy); counts[c01] += (1 - wx) * wy; counts[c11] += wx * wy;
      let best = c00, bw = -1;
      for (const c of [c00, c10, c01, c11]) {
        const w = counts[c] + (PRIORITY[c] ?? 0) * 0.001;
        if (w > bw) { bw = w; best = c; }
      }
      label[py * LO + px] = best;
      seaW[py * LO + px] = counts[Gr.Sea];
    }
  }
  const data = img.data;
  for (let py = 0; py < LO; py += 1) {
    for (let px = 0; px < LO; px += 1) {
      const i = py * LO + px;
      const c = label[i];
      const gx = tx0 * ART + px, gy = ty0 * ART + py; // global art pixel, so textures run across chunks
      const mx = tx0 + px / ART, my = ty0 + py / ART;
      let col: [number, number, number] = BASE[c] ?? BASE[Gr.Hill];
      if (c === Gr.Built) col = core(mx, my) ? PAVED : GARDEN;
      let [r, g, b] = col;
      const n = noise(gx, gy);
      const other = (dx: number, dy: number): number => {
        const qx = px + dx, qy = py + dy;
        return qx < 0 || qy < 0 || qx >= LO || qy >= LO ? c : label[qy * LO + qx];
      };
      switch (c) {
        case Gr.Sea: {
          // shallow water near the shore, foam on the line, glints out in the bay
          const shore = seaW[i] < 0.999;
          if (shore) { r += 30; g += 36; b += 22; }
          if (other(1, 0) !== Gr.Sea || other(-1, 0) !== Gr.Sea || other(0, 1) !== Gr.Sea || other(0, -1) !== Gr.Sea) { r = 214; g = 232; b = 240; }
          else if (noise(gx >> 2, gy, 3) < 0.012) { r += 50; g += 50; b += 40; }
          else { const v = (n - 0.5) * 8; r += v; g += v; b += v; }
          break;
        }
        case Gr.Hill: case Gr.Park: case Gr.School: case Gr.Cemetery: case Gr.Pitch: case Gr.Built: {
          if (c === Gr.Built && core(mx, my)) { // paving between shophouses
            if (gx % 4 === 0 || (gy % 4 === 0 && (gx >> 2) % 2 === 0)) { r -= 14; g -= 14; b -= 14; }
            break;
          }
          const v = (n - 0.5) * 14; r += v; g += v * 1.2; b += v * 0.6;
          if (n < 0.06) { r -= 22; g -= 20; b -= 18; } else if (n > 0.97) { r += 26; g += 28; b += 12; }
          if (c === Gr.Pitch && ((gx >> 4) % 2 === 0)) { r += 8; g += 10; b += 6; }
          if (c === Gr.Hill && noise(gx >> 3, gy >> 3, 9) < 0.25) { r -= 8; g -= 6; b -= 6; }
          break;
        }
        case Gr.Wood: { const v = (n - 0.5) * 20; r += v; g += v; b += v * 0.5; break; }
        case Gr.Path: case Gr.Plaza: {
          // small paving slabs, half a metre, staggered
          const row = gy >> 2;
          if (gy % 4 === 0 || (gx + (row % 2) * 2) % 4 === 0) { r -= 16; g -= 16; b -= 16; }
          else { const v = (n - 0.5) * 8; r += v; g += v; b += v; }
          break;
        }
        case Gr.Steps: if (gy % 3 === 0) { r -= 34; g -= 34; b -= 34; } break;
        case Gr.Road: case Gr.Lane: case Gr.Parking: {
          const v = (n - 0.5) * 12; r += v; g += v; b += v;
          if (n > 0.985) { r += 30; g += 30; b += 30; }
          // kerbs where the carriageway meets anything else
          const edge = (q: number): boolean => q !== Gr.Road && q !== Gr.Lane && q !== Gr.Parking;
          if (edge(other(1, 0)) || edge(other(-1, 0)) || edge(other(0, 1)) || edge(other(0, -1))) { r = 168; g = 168; b = 172; }
          else if (c === Gr.Parking && gx % 20 === 0 && gy % 40 < 32) { r = 230; g = 230; b = 230; }
          break;
        }
        case Gr.Beach: {
          const v = (n - 0.5) * 16; r += v; g += v; b += v;
          if (seaW[i] > 0.05) { r -= 30; g -= 30; b -= 26; } // wet sand at the water's edge
          break;
        }
        case Gr.Pier: if (gy % 3 === 0) { r -= 40; g -= 32; b -= 24; } break;
        case Gr.Wall: if ((gy % 8) < 2) { r += 30; g += 30; b += 30; } else if ((gy % 8) > 5) { r -= 40; g -= 40; b -= 40; } break;
        case Gr.Yard: { const v = (n - 0.5) * 10; r += v; g += v; b += v; break; }
        default:
      }
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
  lg.restore();

  // ---- 4. double up to screen pixels, then the props and labels at full resolution
  const c = document.createElement('canvas');
  c.width = CPX; c.height = CPX;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(lo, 0, 0, CPX, CPX);
  g.translate(-cx * CPX, -cy * CPX);
  for (let y = ty0 - 2; y < ty0 + CHUNK + 3; y += 1) for (let x = tx0 - 3; x < tx0 + CHUNK + 3; x += 1) drawProp(g, x, y);
  for (const b of BUILDINGS) {
    if (!b.name || !b.door || b.x1 < tx0 - 20 || b.x0 > tx0 + CHUNK + 20 || b.y1 < ty0 - 4 || b.y0 > ty0 + CHUNK + 4) continue;
    if (/^(Block|House|No\.)/.test(b.name) || /[^\x20-\x7e]/.test(b.name)) continue;
    const label2 = b.name.replace(' (Luke Yip Building)', '').replace('Hong Kong Correctional Services Museum', 'CSD Museum').toUpperCase();
    const width = label2.length * 6 + 8;
    if (width > (b.x1 - b.x0) * TILE + 24) continue;
    const lx = Math.round(((b.x0 + b.x1) / 2) * TILE - width / 2);
    const ly = Math.round((b.y1 - b.wall - 0.6) * TILE);
    g.fillStyle = '#2a2420'; g.fillRect(lx - 1, ly - 1, width + 2, 12);
    g.fillStyle = '#f8f4e8'; g.fillRect(lx, ly, width, 10);
    textFn(g, label2, lx + 4, ly + 1, '#2a2a30');
  }
  return c;
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

/** draw one building in metre coordinates (the context is already scaled to art pixels) */
function drawBuilding(g: CanvasRenderingContext2D, B: Building): void {
  const p = B.poly;
  const px = 1 / ART;
  const path = (pts: number[], dy = 0): void => {
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) { if (i) g.lineTo(pts[i], pts[i + 1] + dy); else g.moveTo(pts[i], pts[i + 1] + dy); }
    g.closePath();
  };
  // drop shadow to the south-east
  g.fillStyle = 'rgba(0,0,0,0.22)';
  path(p.map((v, i) => v + (i % 2 ? 0.5 : 0.6)));
  g.fill();
  // roof: the whole outline
  g.fillStyle = B.roof;
  path(p); g.fill();
  g.save();
  path(p); g.clip();
  const pitched = B.style === 'house' || B.style === 'heritage' || B.style === 'school' || B.style === 'temple';
  if (pitched) {
    // tiles in rows, and a ridge along the long side
    g.fillStyle = shade(B.roof, 0.86);
    for (let y = Math.floor(B.y0); y < B.y1; y += 0.75) g.fillRect(B.x0 - 1, y, B.x1 - B.x0 + 2, px);
    const wide = B.x1 - B.x0 >= B.y1 - B.y0;
    g.fillStyle = shade(B.roof, 1.2);
    if (wide) g.fillRect(B.x0 - 1, (B.y0 + B.y1 - B.wall) / 2, B.x1 - B.x0 + 2, 2 * px);
    else g.fillRect((B.x0 + B.x1) / 2 - px, B.y0 - 1, 2 * px, B.y1 - B.y0 + 2);
    if (B.style === 'temple') { g.fillStyle = '#d8a83a'; g.lineWidth = 2 * px; g.strokeStyle = '#d8a83a'; path(p); g.stroke(); }
  } else {
    // flat roof: parapet, and plant boxes and water tanks
    g.strokeStyle = shade(B.roof, 0.72); g.lineWidth = 3 * px; path(p); g.stroke();
    g.strokeStyle = shade(B.roof, 1.18); g.lineWidth = px; path(p, 2 * px); g.stroke();
    for (let y = Math.floor(B.y0) + 1; y < B.y1 - 1; y += 3) for (let x = Math.floor(B.x0) + 1; x < B.x1 - 1; x += 3) {
      const r = hash(x, y, 77);
      if (r > 0.12 || !pipM(x + 1, y + 1, p) || !pipM(x + 2.5, y + 2, p)) continue;
      g.fillStyle = shade(B.roof, 0.8); g.fillRect(x + 0.3, y + 0.3, 1.6, 1.2);
      g.fillStyle = shade(B.roof, 1.15); g.fillRect(x + 0.3, y + 0.3, 1.6, px * 2);
    }
  }
  g.restore();
  g.strokeStyle = shade(B.roof, 0.6); g.lineWidth = px; path(p); g.stroke();

  // front walls: every edge facing south, rising from its ground line into the footprint
  const h = B.wall;
  const wall = WALL_COLOUR[B.style];
  const door = B.door ? { x: B.door.x + 0.5, y: B.door.y + 1 } : null;
  let doorEdge = -1, doorT = 0, doorD = Infinity;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
    if (len < 0.5) continue;
    const nx = ey / len, ny = -ex / len;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    // outward normal: the side of the edge that is outside the outline
    const out = pipM(mx + nx * 0.2, my + ny * 0.2, p) ? -1 : 1;
    const ony = ny * out;
    if (ony < 0.25) continue;
    if (door) {
      const t = Math.max(0, Math.min(1, ((door.x - ax) * ex + (door.y - ay) * ey) / (len * len)));
      const d = Math.hypot(ax + ex * t - door.x, ay + ey * t - door.y);
      if (d < doorD) { doorD = d; doorEdge = i; doorT = t; }
    }
    const lit = 0.82 + 0.18 * ony; // walls turned east or west catch less light
    g.fillStyle = shade(wall, lit);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by - h); g.lineTo(ax, ay - h); g.closePath(); g.fill();
    g.fillStyle = shade(B.roof, 0.55);
    g.beginPath(); g.moveTo(ax, ay - h); g.lineTo(bx, by - h); g.lineTo(bx, by - h + 3 * px); g.lineTo(ax, ay - h + 3 * px); g.closePath(); g.fill();
    g.fillStyle = shade(wall, 0.62);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by - 2 * px); g.lineTo(ax, ay - 2 * px); g.closePath(); g.fill();
    // windows: a row per storey, one every couple of metres
    const floors = Math.max(1, Math.floor(h / 2.2));
    const shopfront = B.style === 'shop' || B.style === 'mall';
    const step = B.style === 'apartments' || B.style === 'quarters' ? 1.4 : 2;
    for (let f = 0; f < floors; f += 1) {
      const z = ((f + 0.55) * h) / floors;
      if (f === 0 && shopfront) continue;
      for (let t = step / 2 + 0.3; t < len - 0.5; t += step) {
        const wx = ax + (ex * t) / len, wy = ay + (ey * t) / len - z;
        g.fillStyle = B.style === 'heritage' ? '#5a6a7a' : hash(Math.round(wx * 4), Math.round(wy * 4), 3) < 0.15 ? '#e8d890' : '#6a9ab4';
        g.fillRect(wx - 0.35, wy - 0.45, 0.7, B.style === 'heritage' ? 1.1 : 0.8);
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(wx - 0.35, wy - 0.45, 0.2, 0.3);
      }
    }
    if (shopfront) {
      // glass shopfront and a striped awning along the ground floor
      g.fillStyle = '#8ab8cc';
      g.beginPath(); g.moveTo(ax, ay - 0.3); g.lineTo(bx, by - 0.3); g.lineTo(bx, by - 1.5); g.lineTo(ax, ay - 1.5); g.closePath(); g.fill();
      const colour = AWNINGS[Math.floor(hash(Math.round(ax), Math.round(ay), 15) * AWNINGS.length)];
      for (let t = 0; t < len; t += 0.5) {
        const t2 = Math.min(len, t + 0.5);
        const sx = ax + (ex * t) / len, sy = ay + (ey * t) / len, fx2 = ax + (ex * t2) / len, fy2 = ay + (ey * t2) / len;
        g.fillStyle = Math.round(t * 2) % 2 ? '#f2eee4' : colour;
        g.beginPath(); g.moveTo(sx, sy - 1.5); g.lineTo(fx2, fy2 - 1.5); g.lineTo(fx2, fy2 - 2.0); g.lineTo(sx, sy - 2.0); g.closePath(); g.fill();
      }
    }
  }
  // the door, on the front wall nearest the building's real entrance
  if (doorEdge >= 0) {
    const ax = p[doorEdge], ay = p[doorEdge + 1], bx = p[doorEdge + 2], by = p[doorEdge + 3];
    const dx = ax + (bx - ax) * doorT, dy = ay + (by - ay) * doorT;
    g.fillStyle = B.style === 'temple' ? '#5a2018' : '#3a2e26';
    g.fillRect(dx - 0.55, dy - 1.9, 1.1, 1.9);
    g.fillStyle = '#d8b060'; g.fillRect(dx + 0.25, dy - 1.0, 2 * px, 2 * px);
  }
}

function drawTree(g: CanvasRenderingContext2D, px: number, py: number, r: number, big: boolean): void {
  const s = big ? 6 : 0;
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(px + 8, py + 14, 10 + s / 2, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a3e26'; g.fillRect(px + 6, py + 4, 4, 10);
  const dark = r < 0.33 ? '#2f5e34' : r < 0.66 ? '#355f2e' : '#2c5838';
  g.fillStyle = dark; g.beginPath(); g.arc(px + 8, py - 2 - s / 2, 10 + s / 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = r < 0.5 ? '#3e7442' : '#4a7a3a'; g.beginPath(); g.arc(px + 6, py - 4 - s / 2, 7 + s / 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a9a54'; g.fillRect(px + 2, py - 9 - s / 2, 5, 3);
}

function shrub(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 1, py + 10, 14, 3);
  g.fillStyle = r < 0.5 ? '#3e6a38' : '#4a7a3e'; g.fillRect(px + 1, py + 4, 14, 8);
  g.fillStyle = r < 0.5 ? '#4e7c44' : '#5a8a48'; g.fillRect(px + 3, py + 2, 10, 4);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(px + 4, py + 3, 3, 1);
}

function flowers(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const cols = ['#e05a6a', '#f2d24a', '#f2eee4', '#c06ae0', '#f08a3a'];
  for (let i = 0; i < 7; i += 1) {
    g.fillStyle = '#3e6a38'; g.fillRect(px + 2 + ((i * 5) % 12), py + 4 + ((i * 7) % 9), 2, 3);
    g.fillStyle = cols[Math.floor(hash(i, Math.floor(r * 1000), 5) * cols.length)];
    g.fillRect(px + 2 + ((i * 5) % 12), py + 3 + ((i * 7) % 9), 2, 2);
  }
}

function rock(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 3, py + 10, 11, 3);
  g.fillStyle = '#8a8a86'; g.fillRect(px + 3, py + 5, 10, 7);
  g.fillStyle = '#a8a8a2'; g.fillRect(px + 4, py + 5, 6, 2);
}

function bin(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 5, py + 12, 8, 2);
  g.fillStyle = '#3a7a4a'; g.fillRect(px + 5, py + 3, 7, 10);
  g.fillStyle = '#2a5a36'; g.fillRect(px + 5, py + 3, 7, 2);
}

function parkedCar(g: CanvasRenderingContext2D, px: number, py: number, r: number, vertical: boolean): void {
  const cols = ['#c8382f', '#e0e0e8', '#3a6ac8', '#2a2a30', '#e8c23a', '#6a6a72', '#f2f2f2'];
  const c = cols[Math.floor(r * cols.length)];
  const w = vertical ? 30 : 68, h = vertical ? 68 : 30;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 3, py + 3, w, h);
  g.fillStyle = c; g.fillRect(px, py, w, h);
  g.fillStyle = '#1a2a3a';
  if (vertical) { g.fillRect(px + 3, py + 12, w - 6, 12); g.fillRect(px + 3, py + h - 18, w - 6, 8); }
  else { g.fillRect(px + 12, py + 3, 12, h - 6); g.fillRect(px + w - 18, py + 3, 8, h - 6); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(px + 2, py + 2, vertical ? w - 4 : 6, vertical ? 6 : h - 4);
}

function drawProp(g: CanvasRenderingContext2D, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  const code = grid[y * MAP_W + x];
  const px = x * TILE, py = y * TILE;
  const r = hash(x, y, 7);
  switch (code) {
    case Gr.Wood: if (x % 2 === 0 && y % 2 === 0) drawTree(g, px + Math.floor(r * 6) - 3, py, r, r < 0.4); return;
    case Gr.Hill:
      if (r < 0.05) drawTree(g, px, py, r * 20, r < 0.02);
      else if (r < 0.13) shrub(g, px, py, r);
      else if (r < 0.15) rock(g, px, py);
      return;
    case Gr.Park: case Gr.School:
      if (r < 0.02) drawTree(g, px, py, r * 50, true);
      else if (r < 0.035) shrub(g, px, py, r);
      else if (r < 0.045) flowers(g, px, py, r);
      else if (r < 0.05) bench(g, px, py);
      return;
    case Gr.Built:
      if (core(x, y)) { if (r < 0.01) bin(g, px, py); else if (r < 0.02) flowers(g, px, py, r); return; }
      if (r < 0.04) drawTree(g, px, py, r * 25, false);
      else if (r < 0.1) shrub(g, px, py, r);
      else if (r < 0.12) flowers(g, px, py, r);
      return;
    case Gr.Cemetery: if (x % 3 === 0 && y % 3 === 0) { g.fillStyle = '#e8e8e0'; g.fillRect(px + 5, py + 3, 6, 9); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 5, py + 12, 6, 2); } return;
    case Gr.Beach: if (r < 0.006) umbrella(g, px, py, hash(x, y, 32)); else if (r < 0.01) rock(g, px, py); return;
    case Gr.Plaza:
      if (x >= 640 && x <= 720 && y >= 440 && y <= 540 && x % 7 === 0 && y % 6 === 0) stall(g, px, py, hash(x, y, 61));
      else if (r < 0.008) bench(g, px, py);
      else if (r < 0.014) flowers(g, px, py, r);
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
