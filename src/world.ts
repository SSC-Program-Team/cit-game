/**
 * Stanley, top-down, at real proportions: 176 x 160 tiles of 8 m each, traced from
 * OpenStreetMap (© OpenStreetMap contributors, ODbL). North is up. The ground, roads and
 * every building footprint come from src/stanley-grid.ts; names from src/stanley-names.ts.
 * Game places (shops, employers, the notice board) are pinned to the real buildings they
 * stand in for. See docs/design/stanley-expansion.md §2.
 */
import { decodeGrid, GRID_W, GRID_H } from './stanley-grid.ts';
import { NAMED_BUILDINGS, NAMED_PLACES, ROAD_LABELS, COMPOUNDS } from './stanley-names.ts';

export const TILE = 16;
export const MAP_W = GRID_W;
export const MAP_H = GRID_H;

export type PlaceKind =
  | 'job' | 'board' | 'shop' | 'pirate' | 'employer' | 'library' | 'course'
  | 'police' | 'prison' | 'flavour' | 'offer' | 'bus';

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

/** the tile grid, one character per tile (legend in stanley-grid.ts) */
export const ground: string[][] = decodeGrid().map((r) => r.split(''));

const isBuilding = (ch: string): boolean => ch >= 'A' && ch <= 'Z' && ch !== 'P';

// tracing the coastline leaves a few sea tiles stranded inland; anything not joined to a bay
// becomes rocky shore
{
  const seen = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y += 1) for (let x = 0; x < GRID_W; x += 1) {
    if (seen[y * GRID_W + x] || ground[y][x] !== '~') continue;
    const blob = [y * GRID_W + x];
    seen[blob[0]] = 1;
    for (let i = 0; i < blob.length; i += 1) {
      const k = blob[i]; const bx = k % GRID_W, by = Math.floor(k / GRID_W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const nk = ny * GRID_W + nx;
        if (!seen[nk] && ground[ny][nx] === '~') { seen[nk] = 1; blob.push(nk); }
      }
    }
    if (blob.length < 60) for (const k of blob) ground[Math.floor(k / GRID_W)][k % GRID_W] = '_';
  }
}
const SOLID = new Set(['~', 'f']);

const inPoly = (x: number, y: number, p: number[]): boolean => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
};

/** tiles inside a prison wall: off limits */
const walled = new Uint8Array(GRID_W * GRID_H);
for (let y = 0; y < GRID_H; y += 1) for (let x = 0; x < GRID_W; x += 1) {
  if (COMPOUNDS.some(([, p]) => inPoly(x + 0.5, y + 0.5, p))) walled[y * GRID_W + x] = 1;
}

export function solidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  const ch = ground[ty][tx];
  return SOLID.has(ch) || isBuilding(ch) || walled[ty * MAP_W + tx] === 1;
}

export const walkableTile = (tx: number, ty: number): boolean => !solidTile(tx, ty);

/** a point in world pixels is solid if any corner of a small foot box is */
export function solidAt(px: number, py: number): boolean {
  const pts: Array<[number, number]> = [[px - 4, py - 3], [px + 4, py - 3], [px - 4, py + 2], [px + 4, py + 2]];
  return pts.some(([x, y]) => solidTile(Math.floor(x / TILE), Math.floor(y / TILE)));
}

// ------------------------------------------------------------- buildings ---
export type BuildingStyle = 'shop' | 'apartments' | 'house' | 'school' | 'temple' | 'civic' | 'mall' | 'heritage' | 'quarters';

export type Building = {
  id: number;
  tiles: number[];
  x0: number; y0: number; x1: number; y1: number;
  name: string;
  style: BuildingStyle;
};

/** building id per tile, or -1 */
export const buildingAt = new Int32Array(MAP_W * MAP_H).fill(-1);
export const BUILDINGS: Building[] = [];

function styleFor(kind: string, x: number, y: number): BuildingStyle {
  if (kind === 'school') return 'school';
  if (kind === 'apartments') return 'apartments';
  if (kind === 'place_of_worship' || kind === 'church') return 'temple';
  if (kind === 'mall') return 'mall';
  if (kind === 'heritage' || kind === 'museum') return 'heritage';
  if (kind === 'civic' || kind === 'post_office' || kind === 'service' || kind === 'water_sports') return 'civic';
  if (kind === 'dormitory') return 'quarters';
  // unnamed: the village core is shophouses; the hills are houses; the college grounds are school
  if (x >= 60 && x <= 104 && y >= 44 && y <= 84) return 'shop';
  if (x >= 100 && x <= 146 && y >= 72 && y <= 122) return 'school';
  if (x >= 145 && y >= 84) return 'quarters';
  return 'house';
}

{
  const seen = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const k = y * MAP_W + x;
      const ch = ground[y][x];
      if (seen[k] || !isBuilding(ch)) continue;
      const b: Building = { id: BUILDINGS.length, tiles: [], x0: x, y0: y, x1: x, y1: y, name: '', style: 'house' };
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const t = stack.pop()!;
        const tx = t % MAP_W, ty = Math.floor(t / MAP_W);
        b.tiles.push(t);
        buildingAt[t] = b.id;
        b.x0 = Math.min(b.x0, tx); b.x1 = Math.max(b.x1, tx); b.y0 = Math.min(b.y0, ty); b.y1 = Math.max(b.y1, ty);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
          const nk = ny * MAP_W + nx;
          if (!seen[nk] && ground[ny][nx] === ch) { seen[nk] = 1; stack.push(nk); }
        }
      }
      b.style = styleFor('', b.x0, b.y0);
      BUILDINGS.push(b);
    }
  }
  for (const [name, kind, x, y] of NAMED_BUILDINGS) {
    const id = buildingAt[y * MAP_W + x];
    if (id < 0) continue;
    const b = BUILDINGS[id];
    if (!b.name) b.name = name;
    b.style = styleFor(kind, x, y);
  }
}

// ---------------------------------------------------------------- places ---
/** tiles you can walk to from the bus terminus; OSM outlines seal off a few courtyards */
let REACH: Uint8Array | null = null;
function reach(): Uint8Array {
  if (!REACH) {
    let sx = 93, sy = 52;
    for (let r = 0; r < 6 && solidTile(sx, sy); r += 1) { sx = 93 + r; sy = 52; }
    REACH = reachable(sx, sy);
  }
  return REACH;
}

/** the nearest reachable tile to a point, so a place can be pinned to a real building */
function door(x: number, y: number): { tx: number; ty: number } {
  const cx = Math.round(x), cy = Math.round(y);
  let best = { tx: cx, ty: cy };
  let bd = Infinity;
  for (let r = -10; r <= 10; r += 1) {
    for (let c = -10; c <= 10; c += 1) {
      const tx = cx + c, ty = cy + r;
      if (!walkableTile(tx, ty) || !reach()[ty * MAP_W + tx]) continue;
      // prefer standing south of a building, where its door is drawn
      const d = Math.hypot(c, r) - (r > 0 ? 0.4 : 0);
      if (d < bd) { bd = d; best = { tx, ty }; }
    }
  }
  return best;
}

const at = (x: number, y: number): { tx: number; ty: number } => door(x, y);

export const PLACES: Place[] = [
  { id: 'terminus', ...at(96, 49), name: 'stanley village bus terminus', kind: 'offer', person: '#2c2e36',
    line: 'the 6, 6x, 260 and 73 all end here.' },
  { id: 'bus', ...at(92, 51), name: 'bus stop', kind: 'bus',
    line: 'the bus home. a night in your own bed: the day moves on.' },
  { id: 'board', ...at(83, 57.5), name: 'notice board', kind: 'board',
    line: 'freelance gigs, pinned up by the stall holders.' },
  { id: 'library', ...at(85, 54), name: 'stanley public library', kind: 'library',
    line: 'upper ground floor of the municipal services building. free to study.' },
  { id: 'pixelfix', ...at(89, 61), name: 'pixel fix', kind: 'shop',
    line: 'a ground-floor computer shop off stanley new street. ah yan runs it.' },
  { id: 'pirate', ...at(84, 66), name: 'phone stall', kind: 'pirate', person: '#3a2e4a',
    line: 'a man with a bag of discs. everything is cheap.' },
  { id: 'market', ...at(87, 67), name: 'stanley market', kind: 'job',
    line: 'the stall holders share one router.' },
  { id: 'store', ...at(80, 60), name: 'the store', kind: 'job',
    line: 'a corner store with a card machine.' },
  { id: 'plaza', ...at(46, 47), name: 'stanley plaza', kind: 'course',
    line: 'the training centre on the first floor runs short courses.' },
  { id: 'murray', ...at(52, 66), name: 'tide restaurant', kind: 'employer',
    line: 'a restaurant in murray house. the manager is strict.' },
  { id: 'cafe', ...at(64, 58), name: 'bayview cafe', kind: 'employer',
    line: 'a cafe on stanley main street. the owner, miss ho, is easy-going.' },
  { id: 'chantai', ...at(76, 59), name: 'chan tai tea shop', kind: 'job',
    line: 'chan tai waves. she always needs something fixed.' },
  { id: 'bakery', ...at(71, 59), name: 'bakery', kind: 'job',
    line: 'warm bread and a receipt printer that misbehaves.' },
  { id: 'tinhau', ...at(43, 54), name: 'tin hau temple', kind: 'flavour',
    line: 'its bell is dated 1767. it stood at the west end of stanley main street long before the plaza.' },
  { id: 'pier', ...at(56, 77), name: 'blake pier', kind: 'flavour',
    line: 'moved here from central in 2006, like murray house before it.' },
  { id: 'oldpolice', ...at(94, 65), name: 'old stanley police station', kind: 'flavour',
    line: 'built 1859, the oldest police station building in hong kong. now a supermarket.' },
  { id: 'police', ...at(98, 60), name: 'stanley police station', kind: 'police',
    line: 'the duty officer looks up. your record is on file here.' },
  { id: 'mainbeach', ...at(104, 27), name: 'stanley main beach', kind: 'flavour',
    line: 'tai tam bay side. dragon boat races here every tuen ng.' },
  { id: 'mahang', ...at(8, 22), name: 'ma hang estate', kind: 'flavour',
    line: 'public housing on the hill. stanley plaza and murray house sit on its land.' },
  { id: 'pakTai', ...at(36.5, 80.5), name: 'pak tai temple', kind: 'flavour',
    line: 'a small temple in stanley ma hang park, above the bay.' },
  { id: 'college', ...at(127, 104), name: "st stephen's college", kind: 'flavour',
    line: '22 tung tau wan road. the administration building. the largest school campus in hong kong.' },
  { id: 'chapel', ...at(123, 88), name: 'ssc chapel', kind: 'flavour',
    line: 'built in 1950 to remember the people who died here in the war.' },
  { id: 'museum', ...at(156, 92), name: 'correctional services museum', kind: 'flavour',
    line: 'prison history, by the prison. free entry.' },
  { id: 'stbeach', ...at(117, 141), name: "st stephen's beach", kind: 'flavour',
    line: 'a quiet beach on the peninsula, below the college.' },
  { id: 'cemetery', ...at(132, 128), name: 'stanley military cemetery', kind: 'flavour',
    line: 'graves from 1841 onwards, many from december 1941. people speak quietly here.' },
  { id: 'prison', ...at(151, 134), name: 'stanley prison', kind: 'prison',
    line: '99 tung tau wan road. you would rather not go in.' },
];

export const START = at(94, 49);
export const RELEASE = at(150, 133);

// -------------------------------------------------------------- pathing ---
/** breadth-first path over tiles; returns tile centres in pixels, excluding the start */
export function findPath(sx: number, sy: number, gx: number, gy: number, limit = 6000): Array<{ x: number; y: number }> {
  const start = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
  let goal = [Math.floor(gx / TILE), Math.floor(gy / TILE)];
  if (solidTile(goal[0], goal[1])) {
    const d = door(goal[0], goal[1]);
    goal = [d.tx, d.ty];
  }
  const key = (x: number, y: number): number => y * MAP_W + x;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
  const q = new Int32Array(MAP_W * MAP_H);
  let head = 0, tail = 0;
  const s = key(start[0], start[1]);
  const target = key(goal[0], goal[1]);
  q[tail++] = s;
  prev[s] = -1;
  while (head < tail && tail < limit * 8) {
    const k = q[head++];
    if (k === target) break;
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny)) continue;
      const nk = key(nx, ny);
      if (prev[nk] !== -2) continue;
      prev[nk] = k;
      q[tail++] = nk;
    }
  }
  if (prev[target] === -2) return [];
  const path: Array<{ x: number; y: number }> = [];
  for (let k = target; k !== -1 && k !== s; k = prev[k]) {
    path.unshift({ x: (k % MAP_W) * TILE + TILE / 2, y: Math.floor(k / MAP_W) * TILE + TILE / 2 + 4 });
  }
  return path;
}

/** every tile reachable on foot from a start tile (used by the content check) */
export function reachable(tx: number, ty: number): Uint8Array {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const q = [ty * MAP_W + tx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i += 1) {
    const k = q[i];
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny)) continue;
      const nk = ny * MAP_W + nx;
      if (!seen[nk]) { seen[nk] = 1; q.push(nk); }
    }
  }
  return seen;
}

/** the name of the nearest named place, for the status bar */
export function areaNear(tx: number, ty: number): string {
  let best = '';
  let bd = Infinity;
  for (const [name, , x, y] of NAMED_PLACES) {
    const d = Math.hypot(x - tx, y - ty);
    if (d < bd) { bd = d; best = name; }
  }
  return bd < 30 ? best.toLowerCase() : 'stanley';
}

// ---------------------------------------------------------------- render ---
type TextFn = (g: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string) => void;

const hash = (x: number, y: number, salt = 0): number => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const GROUND_COLOURS: Record<string, [string, string]> = {
  '~': ['#2a5f86', '#2c6390'],
  ',': ['#6a9a52', '#64934c'],
  '.': ['#5a8446', '#567f43'],
  'f': ['#3e6a38', '#3a6534'],
  'c': ['#74a05a', '#6e9a54'],
  'P': ['#5aa04a', '#54984a'],
  'k': ['#8a8a92', '#84848c'],
  'o': ['#cdbf9e', '#c6b897'],
  'p': ['#8a6a4a', '#82633f'],
  'r': ['#b8b2a6', '#b2ac9f'],
  '_': ['#dccb98', '#d4c38f'],
  'g': ['#7aa45e', '#76a05a'],
  '=': ['#4a4c58', '#484a56'],
  'e': ['#5c5e68', '#5a5c66'],
  '-': ['#c4bfb4', '#bdb8ad'],
  's': ['#a8a39a', '#a29d94'],
};

const ROOF: Record<BuildingStyle, string[]> = {
  shop: ['#9a6a52', '#7a7a82', '#a8845a', '#6a7a8a', '#8a5a4a', '#b0a08a'],
  apartments: ['#9aa0a8', '#a8aab0', '#8e949c'],
  house: ['#a8604a', '#b07a5a', '#8a6a5a', '#7a8a9a', '#9a5a4a'],
  school: ['#8a3a32', '#9a4a3a', '#7e3a30'],
  temple: ['#3f7a5a'],
  civic: ['#8c8478', '#9a9286'],
  mall: ['#7d8fa3'],
  heritage: ['#8a8f86'],
  quarters: ['#7a7e86', '#868a90'],
};

const WALL: Record<BuildingStyle, string> = {
  shop: '#e8dcc8', apartments: '#e2e2dc', house: '#ece4d4', school: '#c07a5e', temple: '#b8463a',
  civic: '#e3ddd0', mall: '#c9d3dc', heritage: '#ddd2ba', quarters: '#d8d8d2',
};

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const g_ = (x: number, y: number): string => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? '~' : ground[y][x]);

/** draws the whole map, once, into an offscreen canvas */
export function renderWorld(text: TextFn): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W * TILE;
  c.height = MAP_H * TILE;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;

  // ---- ground
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      let k = ground[y][x];
      if (isBuilding(k)) k = 'r';
      // built-up land outside the village core is gardens and lawns, not paving
      const core = (x >= 58 && x <= 104 && y >= 40 && y <= 86) || (x >= 36 && x <= 58 && y >= 34 && y <= 60);
      if (k === 'r' && !core) k = 'g';
      const [a, b] = GROUND_COLOURS[k] ?? GROUND_COLOURS['r'];
      const px = x * TILE, py = y * TILE;
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(px, py, TILE, TILE);
      const r = hash(x, y);
      if (k === '-' || k === 'o' || k === 'r') {
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.fillRect(px, py + TILE - 1, TILE, 1);
        g.fillRect(px + TILE - 1, py, 1, TILE);
      } else if (k === ',' || k === '.' || k === 'c' || k === 'g') {
        g.fillStyle = 'rgba(30,60,30,0.35)';
        for (let i = 0; i < 4; i += 1) g.fillRect(px + Math.floor(hash(x, y, i) * 15), py + Math.floor(hash(x, y, i + 9) * 14), 1, 2);
      } else if (k === 'p') {
        g.fillStyle = 'rgba(40,24,10,0.45)';
        for (let i = 3; i < TILE; i += 4) g.fillRect(px, py + i, TILE, 1);
      } else if (k === 's') {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let i = 2; i < TILE; i += 4) g.fillRect(px, py + i, TILE, 1);
      } else if (k === '~') {
        if (r < 0.25) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(px + Math.floor(r * 40), py + Math.floor(hash(x, y, 3) * 12), 5, 1); }
      } else if (k === '_') {
        g.fillStyle = 'rgba(120,100,60,0.3)';
        if (r < 0.5) g.fillRect(px + Math.floor(r * 24), py + Math.floor(hash(x, y, 4) * 12), 2, 1);
      } else if (k === 'k') {
        g.fillStyle = 'rgba(255,255,255,0.4)';
        if (x % 2 === 0) g.fillRect(px, py + 2, 1, 10);
      } else if (k === 'P') {
        g.fillStyle = 'rgba(255,255,255,0.18)';
        if ((x + y) % 6 === 0) g.fillRect(px, py + 7, TILE, 1);
      }
      // kerbs: a pale edge where a road meets anything that is not road
      if (k === '=' || k === 'e') {
        g.fillStyle = 'rgba(220,220,220,0.35)';
        const road = (ch: string): boolean => ch === '=' || ch === 'e';
        if (!road(g_(x, y - 1))) g.fillRect(px, py, TILE, 1);
        if (!road(g_(x, y + 1))) g.fillRect(px, py + TILE - 1, TILE, 1);
        if (!road(g_(x - 1, y))) g.fillRect(px, py, 1, TILE);
        if (!road(g_(x + 1, y))) g.fillRect(px + TILE - 1, py, 1, TILE);
      }
      // foam where the sea meets land
      if (k === '~') {
        g.fillStyle = 'rgba(220,240,255,0.5)';
        if (g_(x, y - 1) !== '~') g.fillRect(px, py, TILE, 2);
        if (g_(x - 1, y) !== '~') g.fillRect(px, py, 2, TILE);
        if (g_(x + 1, y) !== '~') g.fillRect(px + TILE - 2, py, 2, TILE);
        if (g_(x, y + 1) !== '~') g.fillRect(px, py + TILE - 2, TILE, 2);
      }
    }
  }

  // ---- the cemetery's rows of headstones
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    if (ground[y][x] !== 'c' || (x + y) % 2) continue;
    g.fillStyle = '#e8e8e0'; g.fillRect(x * TILE + 5, y * TILE + 4, 5, 7);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x * TILE + 5, y * TILE + 11, 5, 1);
  }

  // ---- buildings, back to front
  for (const b of [...BUILDINGS].sort((p, q) => p.y1 - q.y1)) drawBuilding(g, b);

  // ---- prison walls: grey, topped with wire, a watchtower at every corner
  for (const [, p] of COMPOUNDS) {
    g.fillStyle = 'rgba(40,40,46,0.18)';
    g.beginPath();
    for (let i = 0; i < p.length; i += 2) { const x = p[i] * TILE, y = p[i + 1] * TILE; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fill();
    g.lineJoin = 'miter';
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#a8a6ac'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#d8d8dc'; g.lineWidth = 1; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < p.length - 2; i += 2) {
      if (i > 0 && Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) < 6) continue;
      const x = p[i] * TILE, y = p[i + 1] * TILE;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 5, y - 3, 13, 12);
      g.fillStyle = '#7a7880'; g.fillRect(x - 7, y - 9, 14, 14);
      g.fillStyle = '#4a4850'; g.fillRect(x - 7, y - 9, 14, 3);
      g.fillStyle = '#e8d8a0'; g.fillRect(x - 3, y - 4, 6, 3);
    }
  }

  // ---- trees: woods are dense, open hillside gets the odd one
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    const k = ground[y][x];
    const dense = k === 'f';
    const garden = k === 'r' && !((x >= 58 && x <= 104 && y >= 40 && y <= 86) || (x >= 36 && x <= 58 && y >= 34 && y <= 60));
    const sparse = (k === '.' && hash(x, y, 7) < 0.18) || (k === ',' && hash(x, y, 8) < 0.06) || (garden && hash(x, y, 9) < 0.07);
    if (dense || sparse) drawTree(g, x * TILE, y * TILE, hash(x, y, 11));
  }

  // ---- street lamps along the main roads, benches on the promenade and in the parks
  for (let y = 1; y < MAP_H - 1; y += 1) for (let x = 1; x < MAP_W - 1; x += 1) {
    const k = ground[y][x];
    if (k === '-' && (x * 7 + y * 3) % 23 === 0 && (g_(x - 1, y) === '=' || g_(x + 1, y) === '=' || g_(x, y - 1) === '=' || g_(x, y + 1) === '=')) {
      const px = x * TILE + 7, py = y * TILE;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 2, py + 13, 4, 2);
      g.fillStyle = '#3a3e4a'; g.fillRect(px, py - 6, 2, 19);
      g.fillStyle = '#e8d8a0'; g.fillRect(px - 1, py - 8, 4, 3);
    }
    if ((k === ',' || k === 'o' || k === '-') && hash(x, y, 21) < 0.012 && g_(x, y + 1) !== '~') {
      const px = x * TILE + 2, py = y * TILE + 6;
      g.fillStyle = '#6a4a2e'; g.fillRect(px, py, 12, 3);
      g.fillStyle = '#4a3220'; g.fillRect(px + 1, py + 3, 1, 3); g.fillRect(px + 10, py + 3, 1, 3);
    }
  }

  // ---- beach umbrellas
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    if (ground[y][x] !== '_' || hash(x, y, 31) > 0.06) continue;
    const px = x * TILE + 8, py = y * TILE + 8;
    const cols = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac08a'];
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(px + 3, py + 5, 7, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = cols[Math.floor(hash(x, y, 32) * 4)]; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2eee4'; g.fillRect(px - 1, py - 1, 2, 2);
  }

  // ---- boats moored in the bays
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    if (ground[y][x] !== '~' || hash(x, y, 41) > 0.004) continue;
    let nearLand = false;
    for (let r = -6; r <= 6 && !nearLand; r += 1) for (let c2 = -6; c2 <= 6; c2 += 1) if (g_(x + c2, y + r) !== '~') { nearLand = true; break; }
    if (!nearLand) continue;
    const px = x * TILE, py = y * TILE + 4;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 2, py + 7, 22, 3);
    g.fillStyle = hash(x, y, 42) < 0.5 ? '#f2eee4' : '#c84a3a'; g.fillRect(px, py, 22, 7);
    g.fillStyle = '#4a3a2a'; g.fillRect(px + 2, py + 2, 18, 3);
    g.fillStyle = '#e8e4d8'; g.fillRect(px + 8, py - 3, 6, 4);
  }

  // ---- notice board in the market bazaar
  const board = PLACES.find((p) => p.id === 'board')!;
  {
    const bx = board.tx * TILE - 6, by = board.ty * TILE - 18;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 2, by + 16, 26, 3);
    g.fillStyle = '#4a3226'; g.fillRect(bx + 3, by + 10, 2, 8); g.fillRect(bx + 23, by + 10, 2, 8);
    g.fillStyle = '#5a3e2a'; g.fillRect(bx, by - 2, 28, 15);
    g.fillStyle = '#b8864a'; g.fillRect(bx + 2, by, 24, 11);
    ['#f2eee4', '#ffe28a', '#a8d8ff', '#f2eee4'].forEach((c2, i) => { g.fillStyle = c2; g.fillRect(bx + 3 + i * 6, by + 2 + (i % 2) * 2, 4, 5); });
  }

  // ---- labels: roads, water, and the big landmarks
  for (const [name, x, y, angle] of ROAD_LABELS) {
    let a = angle;
    if (a > Math.PI / 2) a -= Math.PI;
    if (a < -Math.PI / 2) a += Math.PI;
    g.save(); g.translate(x * TILE, y * TILE); g.rotate(a);
    text(g, name, -name.length * 3, -4, 'rgba(30,32,40,0.6)');
    g.restore();
  }
  text(g, 'STANLEY BAY', 30 * TILE, 112 * TILE, 'rgba(220,235,255,0.6)');
  text(g, 'TAI TAM BAY', 150 * TILE, 30 * TILE, 'rgba(220,235,255,0.6)');
  for (const b of BUILDINGS) {
    if (!b.name || b.tiles.length < 6) continue;
    if (!['Stanley Plaza', 'Murray House', 'Tin Hau Temple', 'Stanley Municipal Services Building', 'School House',
      'Chapel', 'Hong Kong Correctional Services Museum', 'Stanley Main Beach Water Sports Centre', 'Stanley Post Office',
      'Ho Tim Building', 'Tang Shiu Kin Hall', 'Martin Hostel', 'Centenary Building', 'Li Ka Shing Building',
      'Administration Building (Luke Yip Building)'].includes(b.name)) continue;
    const label = b.name.replace(' (Luke Yip Building)', '').replace('Hong Kong Correctional Services Museum', 'CSD Museum')
      .replace('Stanley Municipal Services Building', 'Municipal Bldg').replace('Stanley Main Beach Water Sports Centre', 'Water Sports')
      .toUpperCase();
    const cx = ((b.x0 + b.x1 + 1) / 2) * TILE;
    const w = label.length * 6 + 6;
    g.fillStyle = 'rgba(248,246,240,0.92)'; g.fillRect(Math.round(cx - w / 2), b.y0 * TILE + 2, w, 10);
    text(g, label, Math.round(cx - w / 2) + 3, b.y0 * TILE + 3, '#2a2a30');
  }
  return c;
}

function drawTree(g: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const s = r < 0.5 ? 0 : 2;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 2, py + 12, 14, 4);
  g.fillStyle = '#5a3e26'; g.fillRect(px + 7, py + 9, 3, 6);
  g.fillStyle = r < 0.33 ? '#2f5e34' : r < 0.66 ? '#355f2e' : '#2c5838';
  g.fillRect(px + 1 - s, py - 3 - s, 15 + s, 13 + s);
  g.fillStyle = r < 0.5 ? '#3e7442' : '#4a7a3a'; g.fillRect(px + 3 - s, py - 5 - s, 11 + s, 12);
  g.fillStyle = '#5a9a54'; g.fillRect(px + 4, py - 4 - s, 5, 4);
}

function drawBuilding(g: CanvasRenderingContext2D, b: Building): void {
  const roofs = ROOF[b.style];
  const roof = roofs[Math.floor(hash(b.x0, b.y0, 5) * roofs.length)];
  const wall = WALL[b.style];
  const mine = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && buildingAt[y * MAP_W + x] === b.id;
  const tall = b.style === 'apartments' || b.style === 'quarters' || b.style === 'mall';
  const face = tall ? 12 : 8;

  // shadow: down and right of every edge tile
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (const t of b.tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (!mine(x, y + 1)) g.fillRect(x * TILE + 3, (y + 1) * TILE, TILE, 3);
    if (!mine(x + 1, y)) g.fillRect((x + 1) * TILE, y * TILE + 4, 3, TILE);
  }
  // roof over the whole footprint
  for (const t of b.tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    const px = x * TILE, py = y * TILE;
    g.fillStyle = roof; g.fillRect(px, py, TILE, TILE);
    if (!mine(x, y - 1)) { g.fillStyle = shade(roof, 1.2); g.fillRect(px, py, TILE, 2); }
    if (!mine(x - 1, y)) { g.fillStyle = shade(roof, 1.1); g.fillRect(px, py, 1, TILE); }
    if (b.style === 'temple') { g.fillStyle = '#2a5a40'; for (let i = 1; i < TILE; i += 4) g.fillRect(px + i, py + 2, 2, TILE - 4); }
    else if (b.style === 'house' || b.style === 'heritage') { g.fillStyle = shade(roof, 0.88); for (let i = 3; i < TILE; i += 5) g.fillRect(px, py + i, TILE, 1); }
    else if ((x * 3 + y * 5) % 11 === 0) { g.fillStyle = shade(roof, 0.82); g.fillRect(px + 4, py + 4, 7, 5); }
  }
  // front wall on every south-facing edge
  for (const t of b.tiles) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    if (mine(x, y + 1)) continue;
    const px = x * TILE, py = (y + 1) * TILE - face;
    g.fillStyle = wall; g.fillRect(px, py, TILE, face);
    g.fillStyle = shade(wall, 0.8); g.fillRect(px, py + face - 2, TILE, 2);
    if (b.style === 'temple') { g.fillStyle = '#d8a83a'; g.fillRect(px, py, TILE, 1); }
    // windows, or arches for the colonial buildings
    if (b.style === 'heritage') {
      g.fillStyle = '#5a6a7a'; g.fillRect(px + 4, py + 2, 4, face - 4);
      g.fillStyle = shade(wall, 0.9); g.fillRect(px + 3, py + 1, 6, 1);
    } else {
      g.fillStyle = b.style === 'shop' && hash(x, y, 9) < 0.5 ? '#3a4a5a' : '#7aa8c0';
      g.fillRect(px + 3, py + 2, 4, face - 5);
      g.fillRect(px + 9, py + 2, 4, face - 5);
      if (tall) { g.fillRect(px + 3, py - 0, 4, 1); g.fillRect(px + 9, py - 0, 4, 1); }
    }
    // shop awnings in the village
    if (b.style === 'shop' && hash(x, y, 13) < 0.45) {
      const cols = ['#c8463a', '#3a7ac8', '#e0a83a', '#3aa86a', '#8a3ac8'];
      g.fillStyle = cols[Math.floor(hash(b.x0, b.y0, 14) * cols.length)];
      g.fillRect(px, py - 2, TILE, 3);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(px + 2, py - 2, 3, 3); g.fillRect(px + 9, py - 2, 3, 3);
    }
  }
}
