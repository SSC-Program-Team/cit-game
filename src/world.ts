/**
 * Stanley village, top-down. North is up; Stanley Bay is west and south.
 *
 * The ground is painted from rectangles rather than typed as ASCII so a street can be moved
 * by editing one line. The layout follows the real village (see
 * docs/design/stanley-expansion.md §2) but is compressed to fit a few screens.
 */

export const TILE = 16;
export const MAP_W = 96;
export const MAP_H = 70;

/** ground kinds; capital letters never appear here, buildings are separate */
export type Ground = '~' | ',' | '=' | '-' | 'o' | 'm' | 'p' | 'b' | '_' | 't' | 'x';

const SOLID_GROUND = new Set<Ground>(['~', 't', 'x']);

export type BuildingStyle = 'shop' | 'civic' | 'stall' | 'colonial' | 'mall' | 'temple' | 'prison' | 'school' | 'estate';

export type Building = {
  id: string;
  x: number; y: number; w: number; h: number;
  sign: string;
  style: BuildingStyle;
  roof: string;
  wall: string;
  /** sign colour */
  ink?: string;
};

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

/**
 * Where things really are. Each landmark's latitude/longitude (Wikipedia and other public
 * sources, October 2026) is mapped to a tile. The mapping is piecewise: the village core is
 * drawn larger than the hills, bays and prison grounds around it, but every landmark keeps its
 * real direction from its neighbours.
 *
 *   landmark                      lat, lon              tile
 *   Ma Hang Estate                22.2214, 114.2065     (9, 6)
 *   Tin Hau Temple (Main St)      west end of Main St   (8, 26)
 *   Murray House                  22.2182, 114.2097     (18, 29)
 *   Stanley Market                22.2188, 114.2120     (38, 24)
 *   Old Stanley Police Station    22.2183, 114.2131     (47, 29)
 *   Stanley Main Beach            22.2212, 114.2140     (65, 6)
 *   Stanley Bay (centre)          22.2162, 114.2112     (30, 50)  sea, south of Main St
 *   St Stephen's College          22.2157, 114.2160     (67, 47)
 *   St Stephen's Beach            22.2130, 114.2148     (57, 55)
 *   Stanley Prison                22.2119, 114.2189     (86, 63)
 */
export const ANCHORS: Array<[string, number, number, number, number]> = [
  ['ma hang estate', 22.2214, 114.2065, 9, 6],
  ['murray house', 22.2182, 114.2097, 18, 29],
  ['stanley market', 22.2188, 114.2120, 38, 24],
  ['old stanley police station', 22.2183, 114.2131, 47, 29],
  ['stanley main beach', 22.2212, 114.2140, 65, 6],
  ["st stephen's college", 22.2157, 114.2160, 67, 47],
  ["st stephen's beach", 22.2130, 114.2148, 57, 55],
  ['stanley prison', 22.2119, 114.2189, 86, 63],
];

export const ground: Ground[][] = Array.from({ length: MAP_H }, () => Array<Ground>(MAP_W).fill(','));

function paint(g: Ground, x: number, y: number, w: number, h: number): void {
  for (let r = y; r < y + h; r += 1) {
    for (let c = x; c < x + w; c += 1) {
      if (r >= 0 && r < MAP_H && c >= 0 && c < MAP_W) ground[r][c] = g;
    }
  }
}

// ---- Stanley Bay: west of Ma Hang, and south of Main Street down to the college peninsula
paint('~', 0, 0, 4, MAP_H);
paint('~', 0, 36, 50, 9);
paint('~', 0, 45, 56, MAP_H - 45);
paint('_', 4, 0, 1, 33);                       // the rocky Ma Hang shore

// ---- Tai Tam Bay: east of Stanley Main Beach, the coast slanting south-east to the prison
for (let y = 0; y < MAP_H; y += 1) {
  const coast = y < 12 ? 68 : y < 44 ? 68 + Math.round((y - 12) * 0.84) : 95;
  paint('~', coast, y, MAP_W - coast, 1);
}
paint('_', 63, 0, 5, 12);                      // Stanley Main Beach

// ---- Stanley Village Road, north to south, then Tung Tau Wan Road on to the college and prison
paint('-', 50, 0, 1, 36);
paint('=', 51, 0, 3, 42);
paint('-', 54, 0, 1, 39);
paint('=', 54, 39, 29, 3);                     // Tung Tau Wan Road east
paint('-', 54, 38, 27, 1);
paint('-', 54, 42, 25, 1);
paint('=', 80, 42, 3, 15);                     // and south to the prison gate
paint('-', 78, 57, 14, 1);

// ---- Stanley Beach Road, east to the beach; the bus terminus beside it
paint('-', 55, 8, 8, 1);
paint('=', 55, 9, 8, 2);
paint('-', 55, 11, 8, 1);
paint('b', 55, 12, 9, 7);

// ---- Carmel Road down from Ma Hang to Stanley Plaza
paint('-', 15, 0, 1, 13);
paint('=', 16, 0, 2, 13);
paint('-', 18, 0, 1, 13);

// ---- Stanley Plaza forecourt and Ma Hang Park, west of the market
paint('o', 5, 13, 23, 20);

// ---- Stanley Market Road, along the front of the municipal building
paint('-', 28, 17, 22, 1);
paint('=', 28, 18, 23, 2);
paint('-', 28, 20, 22, 1);

// ---- Stanley Market: the lanes, with Stanley New Street through the middle
paint('m', 28, 21, 22, 12);

// ---- Stanley Main Street: the waterfront promenade
paint('-', 5, 33, 50, 3);

// ---- Blake Pier, out into the bay in front of Murray House
paint('p', 18, 36, 2, 6);
paint('p', 15, 42, 8, 2);

// ---- St Stephen's Beach on the peninsula's west shore
paint('_', 56, 47, 4, 13);

// ---- the college sports field
paint(',', 60, 50, 17, 6);

// ---- trees: the hills around Ma Hang, above the library, on the peninsula and by the prison
const TREES: Array<[number, number]> = [
  [20, 1], [23, 3], [26, 0], [21, 6], [25, 8], [28, 2], [31, 5], [35, 1], [38, 4], [42, 2], [45, 6],
  [47, 1], [48, 9], [44, 9], [22, 11], [26, 12], [12, 1], [5, 12],
  [57, 22], [60, 33], [64, 34], [72, 30], [71, 35], [74, 33], [58, 36], [62, 37],
  [56, 44], [74, 45], [76, 48], [78, 52], [60, 60], [71, 59], [73, 63], [76, 66], [70, 67],
  [58, 64], [62, 67], [66, 64], [93, 50], [91, 46], [85, 47], [87, 52], [93, 56],
];
for (const [x, y] of TREES) if (ground[y]?.[x] === ',') ground[y][x] = 't';

export const BUILDINGS: Building[] = [
  { id: 'mahang1', x: 6, y: 2, w: 6, h: 6, sign: 'MA HANG', style: 'estate', roof: '#a8a49c', wall: '#e2d8c4', ink: '#4a6a3a' },
  { id: 'mahang2', x: 6, y: 9, w: 7, h: 3, sign: '', style: 'estate', roof: '#a8a49c', wall: '#e2d8c4' },
  { id: 'plaza', x: 10, y: 15, w: 12, h: 7, sign: 'STANLEY PLAZA', style: 'mall', roof: '#7d8fa3', wall: '#c9d3dc', ink: '#2a4a6a' },
  { id: 'tinhau', x: 6, y: 24, w: 5, h: 3, sign: 'TIN HAU', style: 'temple', roof: '#3f7a5a', wall: '#b8463a', ink: '#ffd36a' },
  { id: 'murray', x: 13, y: 26, w: 10, h: 6, sign: 'MURRAY HOUSE', style: 'colonial', roof: '#8a8f86', wall: '#d9cfb8', ink: '#5a4a34' },
  { id: 'store', x: 22, y: 23, w: 5, h: 4, sign: 'STORE', style: 'shop', roof: '#4a5a3e', wall: '#e4e0d0', ink: '#3e7a3a' },
  { id: 'library', x: 29, y: 10, w: 13, h: 7, sign: 'STANLEY LIBRARY', style: 'civic', roof: '#8c8478', wall: '#e3ddd0', ink: '#3a3a3a' },
  { id: 'pixelfix', x: 43, y: 12, w: 6, h: 5, sign: 'PIXEL FIX', style: 'shop', roof: '#3a4458', wall: '#d8d4cc', ink: '#2f6fb5' },
  { id: 'stall1', x: 29, y: 22, w: 6, h: 3, sign: 'T-SHIRTS', style: 'stall', roof: '#c8463a', wall: '#6a4a3a' },
  { id: 'stall2', x: 39, y: 22, w: 4, h: 3, sign: 'SILK', style: 'stall', roof: '#3aa86a', wall: '#6a4a3a' },
  { id: 'stall3', x: 44, y: 22, w: 5, h: 3, sign: 'PHONES', style: 'stall', roof: '#8a3ac8', wall: '#6a4a3a' },
  { id: 'teashop', x: 24, y: 28, w: 5, h: 4, sign: 'TEA SHOP', style: 'shop', roof: '#9a4e3c', wall: '#e8dcc2', ink: '#b8323c' },
  { id: 'cafe', x: 30, y: 28, w: 5, h: 4, sign: 'BAYVIEW CAFE', style: 'shop', roof: '#3d6b6a', wall: '#efe6d4', ink: '#2a6a6a' },
  { id: 'bakery', x: 38, y: 28, w: 5, h: 4, sign: 'BAKERY', style: 'shop', roof: '#a8743a', wall: '#f0e2c8', ink: '#9a5a1e' },
  { id: 'oldpolice', x: 44, y: 26, w: 6, h: 6, sign: 'SUPERMARKET', style: 'colonial', roof: '#7a6a5a', wall: '#f2efe6', ink: '#c8323c' },
  { id: 'police', x: 56, y: 24, w: 8, h: 6, sign: 'POLICE', style: 'civic', roof: '#4a5a7a', wall: '#dfe3ea', ink: '#1e3a7a' },
  { id: 'watersports', x: 57, y: 2, w: 5, h: 4, sign: 'WATER SPORTS', style: 'civic', roof: '#3a7aa8', wall: '#e8eef2', ink: '#1a4a7a' },
  { id: 'college', x: 61, y: 43, w: 12, h: 6, sign: 'ST STEPHENS COLLEGE', style: 'school', roof: '#8a3a32', wall: '#b86a52', ink: '#f2e2c2' },
  // village houses on the hillsides: private homes, so no names
  { id: 'house1', x: 66, y: 21, w: 5, h: 4, sign: '', style: 'estate', roof: '#b07a5a', wall: '#ece4d4' },
  { id: 'house2', x: 66, y: 28, w: 5, h: 4, sign: '', style: 'estate', roof: '#7a8a9a', wall: '#e8e8e0' },
  { id: 'house3', x: 23, y: 4, w: 5, h: 4, sign: '', style: 'estate', roof: '#9a6a5a', wall: '#efe6d6' },
  { id: 'house4', x: 36, y: 6, w: 5, h: 3, sign: '', style: 'estate', roof: '#6a7a6a', wall: '#ece8dc' },
  { id: 'prison', x: 80, y: 58, w: 12, h: 11, sign: 'STANLEY PRISON', style: 'prison', roof: '#6a6a70', wall: '#9a989e', ink: '#2a2a30' },
];

export const PLACES: Place[] = [
  { id: 'terminus', tx: 62, ty: 19, name: 'bus terminus', kind: 'offer', person: '#2c2e36',
    line: 'the 6, 6x, 260 and 73 all end here.' },
  { id: 'bus', tx: 57, ty: 13, name: 'bus shelter', kind: 'bus',
    line: 'the bus home. a night in your own bed: the day moves on.' },
  { id: 'board', tx: 37, ty: 25, name: 'notice board', kind: 'board',
    line: 'freelance gigs, pinned up by the stall holders.' },
  { id: 'library', tx: 35, ty: 17, name: 'stanley public library', kind: 'library',
    line: 'free to study. quiet, warm, sixteen computers.' },
  { id: 'pixelfix', tx: 46, ty: 17, name: 'pixel fix', kind: 'shop',
    line: 'laptops, tools and legit software. the owner is called ah yan.' },
  { id: 'pirate', tx: 46, ty: 25, name: 'phone stall', kind: 'pirate', person: '#3a2e4a',
    line: 'a man with a bag of discs. everything is cheap.' },
  { id: 'plaza', tx: 16, ty: 22, name: 'stanley plaza', kind: 'course',
    line: 'the training centre on the first floor runs short courses.' },
  { id: 'murray', tx: 18, ty: 32, name: 'tide restaurant', kind: 'employer',
    line: 'a restaurant in murray house. the manager is strict.' },
  { id: 'cafe', tx: 32, ty: 32, name: 'bayview cafe', kind: 'employer',
    line: 'the owner, miss ho, is easy-going.' },
  { id: 'chantai', tx: 26, ty: 32, name: 'chan tai tea shop', kind: 'job',
    line: 'chan tai waves. she always needs something fixed.' },
  { id: 'bakery', tx: 40, ty: 32, name: 'bakery', kind: 'job',
    line: 'warm bread and a receipt printer that misbehaves.' },
  { id: 'store', tx: 24, ty: 27, name: 'the store', kind: 'job',
    line: 'a corner store with a card machine.' },
  { id: 'market', tx: 32, ty: 25, name: 'stanley market', kind: 'job',
    line: 'the stall holders share one router.' },
  { id: 'tinhau', tx: 8, ty: 27, name: 'tin hau temple', kind: 'flavour',
    line: 'at the west end of stanley main street. its bell is dated 1767.' },
  { id: 'pier', tx: 18, ty: 42, name: 'blake pier', kind: 'flavour',
    line: 'moved here from central in 2006, like murray house before it.' },
  { id: 'oldpolice', tx: 47, ty: 32, name: 'old stanley police station', kind: 'flavour',
    line: 'built 1859, the oldest police station building in hong kong. now a supermarket.' },
  { id: 'police', tx: 59, ty: 30, name: 'stanley police station', kind: 'police',
    line: 'the duty officer looks up. your record is on file here.' },
  { id: 'mainbeach', tx: 64, ty: 7, name: 'stanley main beach', kind: 'flavour',
    line: 'tai tam bay side. dragon boat races here every tuen ng.' },
  { id: 'mahang', tx: 9, ty: 12, name: 'ma hang estate', kind: 'flavour',
    line: 'public housing up the hill. stanley plaza and murray house sit on its land.' },
  { id: 'college', tx: 67, ty: 50, name: "st stephen's college", kind: 'flavour',
    line: '22 tung tau wan road. the largest school campus in hong kong.' },
  { id: 'stbeach', tx: 59, ty: 54, name: "st stephen's beach", kind: 'flavour',
    line: 'a quiet beach on the stanley bay side of the peninsula.' },
  { id: 'cemetery', tx: 66, ty: 58, name: 'stanley military cemetery', kind: 'flavour',
    line: 'graves from 1841 onwards, many from december 1941. people speak quietly here.' },
  { id: 'prison', tx: 86, ty: 57, name: 'stanley prison', kind: 'prison',
    line: '99 tung tau wan road. you would rather not go in.' },
];

export const START = { tx: 58, ty: 17 };
export const RELEASE = { tx: 84, ty: 57 };

// ---------------------------------------------------------------- queries ---
const blocked: boolean[][] = Array.from({ length: MAP_H }, (_, y) =>
  Array.from({ length: MAP_W }, (_, x) => SOLID_GROUND.has(ground[y][x])));
for (const b of BUILDINGS) {
  for (let r = b.y; r < b.y + b.h; r += 1) for (let c = b.x; c < b.x + b.w; c += 1) blocked[r][c] = true;
}

export function solidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return blocked[ty][tx];
}

/** a point in world pixels is solid if any corner of a small foot box is */
export function solidAt(px: number, py: number): boolean {
  const pts: Array<[number, number]> = [[px - 4, py - 3], [px + 4, py - 3], [px - 4, py + 2], [px + 4, py + 2]];
  return pts.some(([x, y]) => solidTile(Math.floor(x / TILE), Math.floor(y / TILE)));
}

/** breadth-first path over tiles; returns tile centres in pixels, excluding the start */
export function findPath(sx: number, sy: number, gx: number, gy: number): Array<{ x: number; y: number }> {
  const start = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
  let goal = [Math.floor(gx / TILE), Math.floor(gy / TILE)];
  if (solidTile(goal[0], goal[1])) {
    // tapped a building or the sea: walk to the nearest open tile instead
    let best: number[] | null = null;
    let bd = Infinity;
    for (let r = -4; r <= 4; r += 1) for (let c = -4; c <= 4; c += 1) {
      const x = goal[0] + c, y = goal[1] + r;
      if (!solidTile(x, y) && Math.abs(c) + Math.abs(r) < bd) { bd = Math.abs(c) + Math.abs(r); best = [x, y]; }
    }
    if (!best) return [];
    goal = best;
  }
  const key = (x: number, y: number): number => y * MAP_W + x;
  const prev = new Map<number, number>();
  const q: number[] = [key(start[0], start[1])];
  prev.set(q[0], -1);
  const target = key(goal[0], goal[1]);
  while (q.length) {
    const k = q.shift()!;
    if (k === target) break;
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const nk = key(nx, ny);
      if (solidTile(nx, ny) || prev.has(nk)) continue;
      prev.set(nk, k);
      q.push(nk);
    }
  }
  if (!prev.has(target)) return [];
  const path: Array<{ x: number; y: number }> = [];
  for (let k = target; k !== -1 && k !== key(start[0], start[1]); k = prev.get(k)!) {
    path.unshift({ x: (k % MAP_W) * TILE + TILE / 2, y: Math.floor(k / MAP_W) * TILE + TILE / 2 + 4 });
  }
  return path;
}

// ---------------------------------------------------------------- render ---
type TextFn = (g: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string) => void;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const GROUND_COLOURS: Record<Ground, [string, string]> = {
  '~': ['#2a5f86', '#2f6a94'],
  ',': ['#5e8a4a', '#567f44'],
  '=': ['#4a4c58', '#464854'],
  '-': ['#b4b0a6', '#aaa69c'],
  'o': ['#cdbf9e', '#c4b695'],
  'm': ['#a89a86', '#9e907c'],
  'p': ['#8a6a4a', '#7e6044'],
  'b': ['#56585f', '#5c5e66'],
  '_': ['#c8b88a', '#bcac80'],
  't': ['#5e8a4a', '#567f44'],
  'x': ['#6a6a70', '#5e5e64'],
};

/** draws the whole map, once, into an offscreen canvas */
export function renderWorld(text: TextFn): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W * TILE;
  c.height = MAP_H * TILE;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = rand(7);

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const k = ground[y][x];
      const [a, b] = GROUND_COLOURS[k];
      const px = x * TILE, py = y * TILE;
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(px, py, TILE, TILE);
      if (k === '-' || k === 'o') {
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.fillRect(px, py + TILE - 1, TILE, 1);
        g.fillRect(px + TILE - 1, py, 1, TILE);
      } else if (k === 'm') {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 3; i += 1) g.fillRect(px + Math.floor(r() * 14), py + Math.floor(r() * 14), 2, 1);
      } else if (k === ',' || k === 't') {
        g.fillStyle = 'rgba(30,60,30,0.35)';
        for (let i = 0; i < 4; i += 1) g.fillRect(px + Math.floor(r() * 15), py + Math.floor(r() * 14), 1, 2);
      } else if (k === 'p') {
        g.fillStyle = 'rgba(40,24,10,0.45)';
        for (let i = 3; i < TILE; i += 4) g.fillRect(px, py + i, TILE, 1);
      } else if (k === '~') {
        g.fillStyle = 'rgba(255,255,255,0.06)';
        if (r() < 0.3) g.fillRect(px + Math.floor(r() * 10), py + Math.floor(r() * 12), 5, 1);
      } else if (k === '_') {
        g.fillStyle = 'rgba(90,80,60,0.4)';
        if (r() < 0.5) g.fillRect(px + Math.floor(r() * 12), py + Math.floor(r() * 12), 3, 2);
      }
      // a foam line where the sea meets land
      if (k === '~' && y > 0 && ground[y - 1][x] !== '~') {
        g.fillStyle = 'rgba(220,240,255,0.5)';
        g.fillRect(px, py, TILE, 2);
      }
    }
  }

  // road markings: dashed centre lines
  g.fillStyle = '#d8d0a0';
  for (let y = 0; y < 39; y += 1) if (y % 2 === 0) g.fillRect(52 * TILE + 7, y * TILE + 3, 2, 9);
  for (let x = 54; x < 80; x += 1) if (x % 2 === 0) g.fillRect(x * TILE + 3, 40 * TILE + 7, 9, 2);
  for (let y = 43; y < 57; y += 1) if (y % 2 === 0) g.fillRect(81 * TILE + 7, y * TILE + 3, 2, 9);
  for (let x = 28; x < 51; x += 1) if (x % 2 === 0) g.fillRect(x * TILE + 3, 19 * TILE - 1, 9, 2);
  for (let y = 0; y < 13; y += 1) if (y % 2 === 0) g.fillRect(17 * TILE - 1, y * TILE + 3, 2, 9);
  // zebra crossing on Stanley Village Road, from the market to the police station
  g.fillStyle = '#e8e4d8';
  for (let i = 0; i < 3; i += 1) for (let s = 0; s < 4; s += 1) g.fillRect((51 + i) * TILE + 1, 30 * TILE + s * 4, TILE - 2, 2);
  // bus bays
  g.fillStyle = '#e0c040';
  for (let i = 0; i < 2; i += 1) g.fillRect(56 * TILE, (14 + i * 3) * TILE, 7 * TILE, 1);
  // waterfront railing along Main Street, with a gap for the pier
  g.fillStyle = '#d8d8de';
  for (let x = 5; x < 50; x += 1) if (x < 18 || x > 19) g.fillRect(x * TILE, 36 * TILE - 2, TILE, 2);
  // the college field
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.strokeRect(61 * TILE + 0.5, 50 * TILE + 0.5, 15 * TILE, 5 * TILE);
  // the military cemetery: rows of white headstones
  g.fillStyle = '#e8e8e0';
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 7; c += 1) g.fillRect((61 + c) * TILE + 5, (59 + r) * TILE + 4, 5, 7);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 7; c += 1) g.fillRect((61 + c) * TILE + 5, (59 + r) * TILE + 11, 5, 1);

  for (const b of [...BUILDINGS].sort((p, q) => p.y - q.y)) drawBuilding(g, b, text);

  // trees last so canopies overlap what is behind them
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    if (ground[y][x] !== 't') continue;
    const px = x * TILE, py = y * TILE;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 2, py + 12, 14, 4);
    g.fillStyle = '#5a3e26'; g.fillRect(px + 7, py + 9, 3, 6);
    g.fillStyle = '#2f5e34'; g.fillRect(px + 1, py - 3, 15, 13);
    g.fillStyle = '#3e7442'; g.fillRect(px + 3, py - 5, 11, 12);
    g.fillStyle = '#5a9a54'; g.fillRect(px + 4, py - 4, 5, 4);
  }

  // the notice board in the market lane: a cork board on two legs
  {
    const bx = 36 * TILE + 2, by = 23 * TILE + 4;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 2, by + 16, 26, 3);
    g.fillStyle = '#4a3226'; g.fillRect(bx + 3, by + 10, 2, 8); g.fillRect(bx + 23, by + 10, 2, 8);
    g.fillStyle = '#5a3e2a'; g.fillRect(bx, by - 2, 28, 15);
    g.fillStyle = '#b8864a'; g.fillRect(bx + 2, by, 24, 11);
    const notes = ['#f2eee4', '#ffe28a', '#a8d8ff', '#f2eee4'];
    notes.forEach((c2, i) => { g.fillStyle = c2; g.fillRect(bx + 3 + i * 6, by + 2 + (i % 2) * 2, 4, 5); });
  }

  // street names, painted on the ground like a map
  const label = (t: string, x: number, y: number): void => text(g, t, x, y, 'rgba(30,32,40,0.55)');
  const vlabel = (t: string, x: number, y: number): void => {
    g.save(); g.translate(x, y); g.rotate(-Math.PI / 2); text(g, t, 0, 0, 'rgba(30,32,40,0.55)'); g.restore();
  };
  label('STANLEY MAIN ST', 26 * TILE, 35 * TILE + 4);
  label('STANLEY MARKET RD', 31 * TILE, 18 * TILE + 4);
  label('TUNG TAU WAN RD', 58 * TILE, 39 * TILE + 4);
  label('STANLEY BEACH RD', 55 * TILE + 2, 9 * TILE + 4);
  label('STANLEY NEW ST', 35 * TILE + 2, 21 * TILE + 4);
  vlabel('STANLEY VILLAGE RD', 51 * TILE + 4, 22 * TILE);
  vlabel('CARMEL RD', 16 * TILE + 4, 10 * TILE);
  text(g, 'STANLEY BAY', 26 * TILE, 52 * TILE, 'rgba(220,235,255,0.55)');
  text(g, 'TAI TAM BAY', 80 * TILE, 8 * TILE, 'rgba(220,235,255,0.55)');
  return c;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawBuilding(g: CanvasRenderingContext2D, b: Building, text: TextFn): void {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  // front wall: the bottom two tiles (one for stalls); the rest is roof seen from above
  const front = b.style === 'stall' ? TILE + 6 : TILE * 2;
  const roofH = h - front;

  // cast shadow, down and right
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x + 4, y + h, w, 4);
  g.fillRect(x + w, y + 6, 4, h - 2);

  // roof
  g.fillStyle = b.roof; g.fillRect(x, y, w, roofH);
  g.fillStyle = shade(b.roof, 1.18); g.fillRect(x, y, w, 2);
  g.fillStyle = shade(b.roof, 0.8); g.fillRect(x, y + roofH - 3, w, 3);

  if (b.style === 'stall') {
    // striped awning
    for (let i = 0; i < w; i += 8) { g.fillStyle = i % 16 ? '#f2eee4' : b.roof; g.fillRect(x + i, y, 8, roofH); }
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + roofH - 2, w, 2);
  } else if (b.style === 'temple') {
    g.fillStyle = '#2a5a40';
    for (let i = 0; i < w; i += 4) g.fillRect(x + i, y + 2, 2, roofH - 5);
    g.fillStyle = '#d8a83a'; g.fillRect(x - 2, y + roofH - 4, w + 4, 2);
  } else if (b.style === 'prison') {
    // a wall seen from above, with the yard inside and a watchtower
    g.fillStyle = '#4e5a48'; g.fillRect(x + 6, y + 6, w - 12, roofH - 12);
    g.fillStyle = '#8a8890'; g.fillRect(x + 10, y + 14, w - 20, 28);
    g.fillStyle = '#5a5860'; g.fillRect(x + 12, y + 16, w - 24, 24);
    g.fillStyle = '#3a3a40'; g.fillRect(x + 2, y + 2, 10, 10);
    g.fillStyle = '#c8c8cc';
    for (let i = 0; i < w; i += 3) g.fillRect(x + i, y, 1, 2);
  } else if (b.style === 'estate') {
    g.fillStyle = shade(b.roof, 0.85);
    for (let i = 6; i < w - 6; i += 12) g.fillRect(x + i, y + 6, 8, Math.max(4, roofH - 12));
  } else if (b.style === 'mall' || b.style === 'civic' || b.style === 'school') {
    // rooftop plant: a few units and a vent
    g.fillStyle = shade(b.roof, 0.85);
    g.fillRect(x + 8, y + 8, 18, 10);
    g.fillRect(x + w - 30, y + 10, 20, 8);
    g.fillStyle = shade(b.roof, 1.1); g.fillRect(x + 10, y + 10, 14, 2);
  } else if (b.style === 'colonial') {
    // pitched roof ridge
    g.fillStyle = shade(b.roof, 1.1); g.fillRect(x, y + Math.floor(roofH / 2) - 1, w, 2);
    g.fillStyle = shade(b.roof, 0.9);
    for (let i = 4; i < w; i += 6) g.fillRect(x + i, y + 3, 1, roofH - 6);
  }

  // front wall
  const fy = y + roofH;
  g.fillStyle = b.wall; g.fillRect(x, fy, w, front);
  g.fillStyle = shade(b.wall, 0.82); g.fillRect(x, fy + front - 3, w, 3);

  if (b.style === 'stall') {
    // goods on a counter
    const cols = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac08a', '#c05ae0'];
    for (let i = 4; i < w - 4; i += 6) { g.fillStyle = cols[(i / 6 + b.x) % cols.length | 0]; g.fillRect(x + i, fy + 4, 4, 6); }
    g.fillStyle = '#4a3226'; g.fillRect(x, fy + 11, w, 4);
    if (b.sign) text(g, b.sign, x + Math.max(2, Math.floor((w - b.sign.length * 6) / 2)), y + 3, '#2a2420');
    return;
  }

  // windows
  if (b.style === 'colonial') {
    for (let i = 6; i < w - 6; i += 12) {
      g.fillStyle = '#5a6a7a'; g.fillRect(x + i, fy + 8, 6, 14);
      g.fillStyle = '#3a6a4a'; g.fillRect(x + i - 2, fy + 8, 2, 14); g.fillRect(x + i + 6, fy + 8, 2, 14);
      g.fillStyle = shade(b.wall, 0.9); g.fillRect(x + i - 1, fy + 6, 8, 2);
    }
  } else if (b.style === 'prison') {
    g.fillStyle = '#6e6c72';
    for (let i = 4; i < w; i += 8) g.fillRect(x + i, fy + 4, 1, front - 8);
  } else {
    const glass = b.style === 'mall' ? '#6aa0c0' : '#7aa8c0';
    for (let i = 6; i < w - 4; i += 14) {
      g.fillStyle = shade(glass, 0.7); g.fillRect(x + i, fy + 12, 10, 14);
      g.fillStyle = glass; g.fillRect(x + i, fy + 12, 10, 10);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + i + 1, fy + 13, 3, 4);
    }
  }
  // door, centred
  const dx = x + Math.floor(w / 2) - 5;
  g.fillStyle = '#3a2e26'; g.fillRect(dx, fy + front - 15, 10, 12);
  g.fillStyle = '#5a4636'; g.fillRect(dx + 1, fy + front - 14, 8, 1);

  // sign board above the windows
  if (b.sign) {
    const sw = Math.min(w - 4, b.sign.length * 6 + 6);
    const sx = x + Math.floor((w - sw) / 2);
    g.fillStyle = b.style === 'school' || b.style === 'temple' ? '#3a2420' : '#f8f6f0';
    g.fillRect(sx, fy + 2, sw, 9);
    text(g, b.sign, sx + 3, fy + 3, b.ink ?? '#202020');
  }
}
