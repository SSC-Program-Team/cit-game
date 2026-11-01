/**
 * NETLIFE: HK — Stanley village. v0.5 slice.
 *
 * The game owns its own requestAnimationFrame loop and draws to a 640x360 canvas.
 * Modes, in priority order: prison > console job > MC quiz > menu > the village.
 * See docs/design/stanley-expansion.md for what each system is for.
 */
import { state, clock, resetSolo } from './state';
import { net, act, startNet, sendPos, serverNow, updateOthers, soloOwners } from './net';
import { HOMES, home, HOMES_AT, type Home } from './homes';
import { CARS, car as carModel, CAR_BUYBACK } from './cars';
import { CROSSINGS, crossingLight, vehicleAspect, walkAspect, rulesOfTheRoad, type Vehicle } from './traffic';
import { ROADS } from './stanley-roads';
import {
  has, coverFor, payBoost, condition, licenceLive, repairCost, netWorth, ago, employer, MISSION_PAY, NO_SHOW_FEE,
  SLEEP_FARE, RENT, RENEW_WINDOW, HOME_FEES, TENANT_PER_REAL_DAY, HOME_SELL, tenantsOwe, taxiFare, roadMetres, type Ev, type QuizView,
} from './rules';
import { audio } from './audio';
import { JOBS, MISSIONS, OFFER, type JobDef, type Crime, type Prop } from './jobs';
import { GLYPHS } from './font';
import {
  TILE, MAP_W, MAP_H, PLACES, START, RELEASE, drawWorld, setWorldText, renderOverview, solidAt, solidTile,
  walkableTile, findPath, isSea, areaNear, ROAD_LINES, walkDistance, roadRoute, BUILDING_LABELS, ESCALATORS,
  escalatorAt, setBuildingPhotos, MARKET_POINTS, PLAZA_POINTS, buildingsNear, behindBuilding, drawBuildingOver, type Place,
  drivableTile, driveRoute, nearestOnNetwork, nearestDrivable, fenceAudit,
} from './world';
import { ROUTES, routesAt, type Route, type Stop } from './minibus';
import { TOPIC_NAMES, type Tier, type Topic } from './questions';
import {
  ITEMS, item, SHOP_STOCK, PIRATE_STOCK, NEED_NAMES, COURSES, COURSE_QUESTIONS, COURSE_PASS,
  EMPLOYERS, TASK_EVERY, TASK_QUESTIONS, fireAfter, DAY, boardFor, gigRate, OFFENCES, type Employer, type Gig,
} from './economy';

const W = 640;
const H = 360;

/**
 * Zoom: world pixels to canvas pixels. 0.5 (the default) shows 80 x 45 m, four times what 1
 * shows; the ground art pixels land one-to-one on canvas pixels, so it stays crisp. Z toggles.
 */
let zoom = (() => { try { return localStorage.getItem('cit-zoom') === '1' ? 1 : 0.5; } catch { return 0.5; } })();
const viewW = (): number => W / zoom;
const viewH = (): number => H / zoom;
/** people are drawn a little larger when zoomed out, so they still read */
const figScale = (): number => (zoom < 1 ? 2 : 1.5);
function toggleZoom(): void {
  zoom = zoom < 1 ? 1 : 0.5;
  try { localStorage.setItem('cit-zoom', String(zoom)); } catch { /* private mode */ }
  audio.play('ui');
}

(window as unknown as { __cit: typeof state; __net: typeof net }).__cit = state;
(window as unknown as { __net: typeof net }).__net = net;

// buildings' real looks (from the Lands Department 3D map): the map draws without them until loaded
{
  const img = new Image();
  img.onload = () => setBuildingPhotos(img);
  img.src = 'img/buildings.webp';
}

// ---------------------------------------------------------------- canvas ---
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
document.getElementById('app')!.appendChild(canvas);
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

/**
 * The game is laid out on a 640x360 grid, but the canvas has as many real pixels as the screen
 * shows it at (up to 4 per grid unit), so nothing is blown up: the art and text stay sharp.
 */
let PXR = 1;
function resize(): void {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
  const want = Math.max(1, Math.min(4, Math.round(s * (window.devicePixelRatio || 1))));
  if (want !== PXR || canvas.width !== W * want) {
    PXR = want;
    canvas.width = W * PXR;
    canvas.height = H * PXR;
  }
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ text ---
const CELL_W = 6;
const CELL_H = 9;
const ATLAS_COLS = 32;
const GLYPH_KEYS = Object.keys(GLYPHS);
const GLYPH_INDEX = new Map(GLYPH_KEYS.map((k, i) => [k, i]));

const baseAtlas = ((): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = ATLAS_COLS * CELL_W;
  c.height = Math.ceil(GLYPH_KEYS.length / ATLAS_COLS) * CELL_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  GLYPH_KEYS.forEach((k, i) => {
    const gx = (i % ATLAS_COLS) * CELL_W;
    const gy = Math.floor(i / ATLAS_COLS) * CELL_H;
    GLYPHS[k].forEach((row, ry) => {
      for (let rx = 0; rx < 5; rx += 1) if (row & (1 << (4 - rx))) g.fillRect(gx + rx, gy + ry, 1, 1);
    });
  });
  return c;
})();

const tinted = new Map<string, HTMLCanvasElement>();
function atlas(colour: string): HTMLCanvasElement {
  const hit = tinted.get(colour);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = baseAtlas.width;
  c.height = baseAtlas.height;
  const g = c.getContext('2d')!;
  g.drawImage(baseAtlas, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  tinted.set(colour, c);
  return c;
}

function glyphs(g: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string, scale = 1): number {
  const a = atlas(colour);
  let cx = x;
  for (const ch of s) {
    const i = GLYPH_INDEX.get(ch) ?? GLYPH_INDEX.get(ch.toUpperCase());
    if (i !== undefined) {
      g.drawImage(a, (i % ATLAS_COLS) * CELL_W, Math.floor(i / ATLAS_COLS) * CELL_H, CELL_W, CELL_H,
        Math.round(cx), Math.round(y), CELL_W * scale, CELL_H * scale);
    }
    cx += CELL_W * scale;
  }
  return cx;
}

/** headline text: always capitals, like the signage */
const text = (s: string, x: number, y: number, colour = '#e8e8f0', scale = 1): number =>
  glyphs(ctx, s.toUpperCase(), x, y, colour, scale);
/** reading text: mixed case, for questions and explanations */
const prose = (s: string, x: number, y: number, colour = '#e8e8f0'): number => glyphs(ctx, s, x, y, colour);

const tw = (s: string, scale = 1): number => s.length * CELL_W * scale;

function textRight(s: string, right: number, y: number, colour: string): void {
  text(s, right - tw(s), y, colour);
}

function wrap(s: string, max: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    if (para.startsWith(' ') || para.length <= max) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > max) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
const inRect = (r: Rect, x: number, y: number, slop = 2): boolean =>
  x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop;

const money = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;

// ------------------------------------------------------------- the clock ---
/** the wall clock work tasks and prison run on: the school server's when there is one */
const now = serverNow;

// ------------------------------------------------------------------ state ---
/**
 * Walking pace in px/s. The map is 1 m per 16 px tile and the walk from Stanley Plaza to the SSC
 * back gate is about 600 m, which the owner wants to take about five minutes: 600 * 16 / 300.
 * Running (Shift, or the run button) is RUN times faster.
 */
const SPEED = 64;
const RUN = 2;
let running = false;

const WIRE = [
  'STANLEY MARKET STALLS OPEN TILL 7PM - TYPHOON SIGNAL 1 HOISTED',
  'CAT6 DRUM UP 12% AT GOLDEN ARCADE - NOW $680',
  'FERRY TO PO TOI LEAVES BLAKE PIER AT 11:00 ON SUNDAYS',
  'A STUDENT PASSED THE IT SUPPORT CERTIFICATE AT STANLEY PLAZA',
  'POLICE WARN OF PIRATED SOFTWARE SOLD IN STANLEY MARKET',
  'TIDE RESTAURANT IS HIRING - ASK FOR MR CHEUNG',
  'BAYVIEW CAFE NEEDS HELP WITH ITS WI-FI AND INSTAGRAM',
];

type Walker = { x: number; y: number; path: Array<{ x: number; y: number }>; coat: string; frame: number; facing: number; wait: number; shopper?: boolean; spots?: Array<{ x: number; y: number }> };

let player = { x: 0, y: 0, frame: 0, walked: 0, facing: 1 };
let path: Array<{ x: number; y: number }> = [];
let pending: Place | null = null;
let near: Place | null = null;
let cam = { x: 0, y: 0 };
let wireIndex = 0;
let wireX = W;
let wireTimer = 0;
let wireText = WIRE[0];
let wireAlert = false;
const news: string[] = [];
let dialogue: { title: string; lines: string[]; shown: number; total: number } | null = null;
let job: Job | null = null;
let quiz: Quiz | null = null;
let menu: Menu | null = null;
let stepTimer = 0;
let nextMission = 75;
let toast: { text: string; colour: string; t: number } | null = null;
let frames = 0;
let tickTimer = 0;
const walkers: Walker[] = [];
/**
 * Traffic (§11.3): cars drive 150-900 m routes over the real road network in the left-hand lane,
 * slow for bends, and brake for a car ahead in their lane, for you, and for anyone in the road.
 * Anyone who wanders more than about 600 m away comes back in out of sight, so the streets near
 * you stay busy.
 */
type Car = { x: number; y: number; angle: number; speed: number; route: Array<{ x: number; y: number }>; colour: string; model: string; wait: number; stuck: number };
const CAR_COLOURS = ['#c8382f', '#e0e0e8', '#3a6ac8', '#3aa86a', '#e8c23a', '#2a2a30', '#d86a3a', '#6a6a72', '#e0e0e8', '#3a6ac8', '#c8382f', '#2a2a30', '#9aa0a8', '#f2eee4'];
const NPC_MODELS = ['hatch', 'saloon', 'saloon', 'suv', 'ev', 'hatch', 'saloon'];
const cars: Car[] = CAR_COLOURS.map((colour, i) => ({ x: -1, y: -1, angle: 0, speed: 0, route: [], colour, model: NPC_MODELS[i % NPC_MODELS.length], wait: i * 0.4, stuck: 0 }));

/** a random tile of the road network between lo and hi metres from a point */
function networkTileNear(mx: number, my: number, lo: number, hi: number): { tx: number; ty: number } | null {
  for (let tries = 0; tries < 60; tries += 1) {
    const r = lo + Math.random() * (hi - lo), a = Math.random() * Math.PI * 2;
    const t = nearestOnNetwork(mx + Math.cos(a) * r, my + Math.sin(a) * r, 12);
    if (t && Math.hypot(t.tx - mx, t.ty - my) >= lo * 0.7) return t;
  }
  return null;
}

/** shift a route into the left-hand lane: about 1.6 m left of the middle on main roads, less on lanes */
function keepLeft(r: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  return r.map((p, i) => {
    const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const main = drivableTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) && nearestOnNetwork(p.x / TILE, p.y / TILE, 0) !== null;
    const off = (main ? 1.6 : 0.9) * TILE;
    return { x: p.x + (dy / d) * off, y: p.y - (dx / d) * off };
  });
}

function newRoute(c: Car, near: { x: number; y: number }): void {
  const from = c.x < 0 || Math.hypot(c.x - near.x, c.y - near.y) > 600 * TILE
    ? networkTileNear(near.x / TILE, near.y / TILE, 120, 360)
    : { tx: Math.floor(c.x / TILE), ty: Math.floor(c.y / TILE) };
  if (!from) return;
  const to = networkTileNear(from.tx, from.ty, 150, 900);
  if (!to) return;
  const r = driveRoute(from.tx * TILE + 8, from.ty * TILE + 8, to.tx * TILE + 8, to.ty * TILE + 8);
  if (r.length < 4) { c.wait = 2; return; }
  const left = keepLeft(r);
  if (c.x < 0 || Math.hypot(c.x - near.x, c.y - near.y) > 600 * TILE) {
    // placed facing along the road, not east
    c.x = left[0].x; c.y = left[0].y; c.speed = 0; c.angle = headingOf(left);
  }
  c.route = left; c.stuck = 0;
}

/** which way a route sets off: from its start to the first point a couple of metres on */
function headingOf(r: Array<{ x: number; y: number }>): number {
  const a = r[0];
  const b = r.find((p) => Math.hypot(p.x - a.x, p.y - a.y) > 2 * TILE) ?? r[r.length - 1];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

let carRoutes = 0;
/** the traffic-light clock, in seconds */
let clockSecs = 0;
/** every vehicle that obeys the rules this frame (NPC cars, minibuses, the taxi), and the ones they
 *  must not hit (your car, other players' cars) */
let ruled: Vehicle[] = [];
function gatherVehicles(): void {
  ruled = [...cars.filter((c) => c.x >= 0), ...shuttles];
  if (ride) ruled.push(ride);
  if (taxi) ruled.push(taxi);
  const obstacle = (x: number, y: number, angle: number, speed: number): Vehicle => ({ x, y, angle, speed, rank: 9 });
  if (drive) ruled.push(obstacle(drive.x, drive.y, drive.angle, Math.abs(drive.speed)));
  else if (state.car) ruled.push(obstacle(state.car.x, state.car.y, state.car.angle, 0));
  for (const [id, o] of net.cars) if (id !== net.me.id) ruled.push(obstacle(o.x, o.y, o.angle, o.driving ? 60 : 0));
}
function updateCars(dt: number): void {
  clockSecs += dt;
  gatherVehicles();
  const me = drive ? { x: drive.x, y: drive.y } : { x: player.x, y: player.y };
  carRoutes = 0;
  for (const c of cars) {
    if (c.wait > 0) { c.wait -= dt; continue; }
    if (!c.route.length) {
      // one new route a frame: they cost a search of the road network
      if (carRoutes < 1) { carRoutes += 1; newRoute(c, me); c.wait = c.route.length ? 0 : 1; }
      continue;
    }
    const m = carModel(c.model) ?? CARS[0];
    const vmax = (Math.min(30, m.speed) / 3.6) * TILE;
    const t0 = c.route[0], t1 = c.route[1] ?? t0;
    const bend = Math.abs(Math.atan2(Math.sin(Math.atan2(t1.y - t0.y, t1.x - t0.x) - c.angle), Math.cos(Math.atan2(t1.y - t0.y, t1.x - t0.x) - c.angle)));
    let target = vmax * (bend > 0.5 ? 0.45 : 1);
    // brake for anything just ahead in the lane: other cars, you, other players, people in the road
    const ahead = (x: number, y: number, len: number): void => {
      const dx = x - c.x, dy = y - c.y;
      const along = dx * Math.cos(c.angle) + dy * Math.sin(c.angle), across = -dx * Math.sin(c.angle) + dy * Math.cos(c.angle);
      if (along > 0 && along < len && Math.abs(across) < 1.6 * TILE) target = Math.min(target, Math.max(0, (along - 4 * TILE) * 1.5));
    };
    // signals, junctions, giving way and keeping a distance from other vehicles (traffic.ts)
    target = Math.min(target, rulesOfTheRoad(c, ruled, clockSecs, dt));
    if (drive) ahead(drive.x, drive.y, 10 * TILE);
    else if (drivableTile(Math.floor(player.x / TILE), Math.floor(player.y / TILE))) ahead(player.x, player.y, 7 * TILE);
    if (state.car && !drive) ahead(state.car.x, state.car.y, 9 * TILE);
    for (const o of net.cars.values()) ahead(o.x, o.y, 10 * TILE);
    for (const o of net.others.values()) if (drivableTile(Math.floor(o.x / TILE), Math.floor(o.y / TILE))) ahead(o.x, o.y, 7 * TILE);
    for (const w of walkers) if (Math.abs(w.x - c.x) < 120 && Math.abs(w.y - c.y) < 120 && drivableTile(Math.floor(w.x / TILE), Math.floor(w.y / TILE))) ahead(w.x, w.y, 6 * TILE);
    c.speed = c.speed < target ? Math.min(target, c.speed + 50 * dt) : Math.max(target, c.speed - 160 * dt);
    let dist = c.speed * dt;
    while (dist > 0 && c.route.length) {
      const t = c.route[0];
      const dd = Math.hypot(t.x - c.x, t.y - c.y);
      if (dd > 0.5) {
        const want = Math.atan2(t.y - c.y, t.x - c.x);
        c.angle += Math.atan2(Math.sin(want - c.angle), Math.cos(want - c.angle)) * Math.min(1, 14 * dt);
      }
      if (dd <= dist) { c.x = t.x; c.y = t.y; c.route.shift(); dist -= dd; } else { c.x += ((t.x - c.x) / dd) * dist; c.y += ((t.y - c.y) / dd) * dist; dist = 0; }
    }
    if (!c.route.length) c.wait = 1 + Math.random() * 3;
    // held still for 12 s out of sight (a jam the rules cannot clear): take it off; it comes back elsewhere
    c.stuck = c.speed < 2 ? c.stuck + dt : 0;
    if (c.stuck > 12 && !onScreen(c.x, c.y, 60)) { c.x = -1; c.y = -1; c.route = []; c.stuck = 0; c.wait = 1; }
  }
}

/** where the bus at the terminus stands: in a bay near the stop at least 3 m wide and 12 m long,
 *  lying along it (worked out once) */
let bay: { x: number; y: number; angle: number } | null | undefined;
function terminusBay(): { x: number; y: number; angle: number } | null {
  if (bay !== undefined) return bay;
  const stop = PLACES.find((p) => p.id === 'bus')!;
  const run = (x: number, y: number, a: number, max: number): number => {
    let n = 0; while (n < max && drivableTile(Math.floor(x + Math.cos(a) * (n + 1) / 2), Math.floor(y + Math.sin(a) * (n + 1) / 2))) n += 1; return n / 2;
  };
  let best: { x: number; y: number; angle: number; score: number } | null = null;
  for (let dy = -6; dy <= 6; dy += 1) for (let dx = -6; dx <= 6; dx += 1) {
    const tx = stop.tx + dx, ty = stop.ty + dy;
    if (!drivableTile(tx, ty)) continue;
    const cx = tx + 0.5, cy = ty + 0.5;
    for (let deg = 0; deg < 180; deg += 6) {
      const a = (deg * Math.PI) / 180;
      const f = run(cx, cy, a, 16), b = run(cx, cy, a + Math.PI, 16);
      if (f < 5 || b < 5) continue; // 10 m of road either way of the middle
      const l = run(cx, cy, a - Math.PI / 2, 8), r = run(cx, cy, a + Math.PI / 2, 8);
      if (l < 1 || r < 1) continue; // and room either side for most of a 2.5 m bus
      const score = -Math.abs(l - r) - Math.hypot(dx, dy) * 0.6;
      if (!best || score > best.score) best = { x: cx * TILE, y: cy * TILE, angle: a, score };
    }
  }
  return (bay = best && { x: best.x, y: best.y, angle: best.angle });
}

function onScreen(x: number, y: number, margin: number): boolean {
  const sx = x - cam.x, sy = y - cam.y;
  return sx > -margin && sy > -margin && sx < viewW() + margin && sy < viewH() + margin;
}

function say(title: string, line: string): void {
  const lines = wrap(line, 96);
  dialogue = { title, lines, shown: 0, total: lines.join('').length };
}

function flash(s: string, colour = '#9aa0b8', t = 3.5): void {
  toast = { text: s, colour, t };
}

// -------------------------------------------------------------- the menu ---
type MenuItem = {
  label: string;
  /** right-aligned, e.g. a price */
  right?: string;
  /** a grey line under the label */
  sub?: string;
  act?: () => void;
  /** greyed out; picking it does nothing (or shows `why`) */
  off?: boolean;
  why?: string;
  colour?: string;
};

type Menu = { title: string; line: string; items: MenuItem[]; back?: () => void };

const MENU_X = 40;
const MENU_W = 560;
function menuLayout(m: Menu): { top: number; rows: Rect[] } {
  const lineCount = wrap(m.line, 88).length;
  const heights = m.items.map((it) => (it.sub ? 30 : 22));
  const total = 40 + lineCount * 10 + heights.reduce((a, b) => a + b + 4, 0) + 26;
  const top = Math.max(42, Math.round((H - total) / 2));
  let y = top + 34 + lineCount * 10;
  const rows = heights.map((h) => { const r = { x: MENU_X + 12, y, w: MENU_W - 24, h }; y += h + 4; return r; });
  return { top, rows };
}

function openMenu(m: Menu): void {
  menu = m;
  dialogue = null;
  path = [];
  pending = null;
  audio.play('ui');
}

function closeMenu(): void {
  const back = menu?.back;
  menu = null;
  if (back) back();
}

function pickMenu(i: number): void {
  if (!menu) return;
  const it = menu.items[i];
  if (!it) return;
  if (it.off) { audio.play('bad'); if (it.why) flash(it.why, '#ff9a6a'); return; }
  audio.play('ui');
  if (it.act) it.act();
}

// --------------------------------------------------------------- the quiz ---
const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A quiz the server is holding. We get the questions with their options shuffled, never the
 * answers: picking one asks the server, which says right or wrong, which letter was right, and why.
 */
class Quiz {
  i: number;
  picked: number | null = null;
  /** the right option for the question just answered */
  answer = -1;
  why = '';
  right = 0;
  /** waiting for the server's verdict */
  busy = false;
  /** the end screen, once the last answer is in */
  final: { lines: string[]; colour: string } | null = null;
  summary: string[] | null = null;
  summaryColour = '#7be08a';

  constructor(readonly view: QuizView) { this.i = view.i; }

  get title(): string { return this.view.title; }
  get sub(): string { return this.view.sub; }
  get tier(): Tier { return this.view.tier; }
  get qs(): QuizView['qs'] { return this.view.qs; }
  get current(): QuizView['qs'][number] { return this.view.qs[this.i]; }

  pick(i: number): void {
    if (this.summary || this.picked !== null || this.busy || i < 0 || i > 3) return;
    this.busy = true;
    const at = this.i;
    act('quiz.answer', { q: at, i }).then((r) => {
      this.busy = false;
      const a = r.events.find((e): e is Extract<Ev, { t: 'answer' }> => e.t === 'answer');
      if (!r.ok || !a || this.i !== at) return;
      this.picked = i;
      this.answer = a.answer;
      this.why = a.why;
      if (a.ok) this.right += 1;
    });
  }

  next(): void {
    if (this.summary) {
      quiz = null;
      act('quiz.end');
      return;
    }
    if (this.picked === null) return;
    if (this.i + 1 >= this.qs.length) {
      if (!this.final) return; // the end screen is on its way
      this.summary = this.final.lines;
      this.summaryColour = this.final.colour;
      return;
    }
    this.picked = null;
    this.i += 1;
  }
}

function startQuiz(kind: string, args: Record<string, unknown> = {}): void {
  act('quiz.start', { kind, ...args });
}

// -------------------------------------------------------------------- job ---
type Step = 'typing' | 'ask' | 'paid';

const optRect = (i: number): Rect => ({ x: 262, y: 198 + i * 28, w: 344, h: 24 });
const exitRect: Rect = { x: 500, y: 326, w: 106, h: 24 };

class Job {
  step: Step = 'typing';
  stage = 0;
  shown = 0;
  timer = 0;
  hint = '';
  feedback = '';
  feedbackColour = '#ffc84a';
  options: string[] = [];
  confirmLeave = false;

  constructor(readonly def: JobDef, readonly mission: boolean) {}

  get pay(): number {
    return this.def.pay * (this.mission ? MISSION_PAY : 1);
  }

  update(dt: number): void {
    if (this.step !== 'typing') return;
    const lines = this.def.console;
    this.timer += dt;
    const n = Math.min(lines.length, Math.floor(this.timer / 0.32));
    if (n > this.shown) {
      this.shown = n;
      audio.play('ui');
      if (this.shown === lines.length) {
        this.step = 'ask';
        this.ask();
      }
    }
  }

  private ask(): void {
    const st = this.def.stages[this.stage];
    this.hint = st.prompt;
    this.options = st.choices.map((c) => c.label);
  }

  choose(i: number): void {
    if (this.step !== 'ask') return;
    const st = this.def.stages[this.stage];
    const c = st.choices[i];
    if (!c) return;
    this.confirmLeave = false;
    if (c.crime) { const id = this.def.id; job = null; act('job.crime', { id }); return; }
    if (c.ok) {
      this.stage += 1;
      if (this.stage >= this.def.stages.length) { this.settle(); return; }
      audio.play('ok');
      this.feedback = st.right ?? '';
      this.feedbackColour = '#7be08a';
      this.ask();
      return;
    }
    audio.play('bad');
    this.feedbackColour = '#ff6a6a';
    if (st.free) { this.feedback = c.hint ?? ''; return; }
    act('job.wrong', { id: this.def.id });
    this.feedback = 'wrong - four minutes gone';
    this.hint = c.hint ?? st.prompt;
  }

  private settle(): void {
    act('job.done', { id: this.def.id });
    this.step = 'paid';
    this.options = [];
  }

  advance(): void {
    if (this.step !== 'paid') return;
    job = null;
    showWire(news[0], false);
  }
}

// ---------------------------------------------------------------- the law ---
/** the police: a warning (first minor offence) shows what happened and what it cost */
function showWarning(w: Extract<Ev, { t: 'warning' }>): void {
  openMenu({
    title: 'police warning',
    line: `an officer from stanley police station is waiting outside. ${w.act} this is a warning: next time it is a cell.`,
    items: [
      { label: w.law, sub: w.offence, off: true, colour: '#ffc84a' },
      { label: `fine paid: ${money(w.fine)}`, sub: w.taken.length ? `confiscated: ${w.taken.join(', ')}` : 'nothing to confiscate', off: true },
      { label: 'what would have stopped it', sub: w.fix, off: true },
      { label: 'understood', act: () => { menu = null; } },
    ],
  });
}

const jailed = (): boolean => !!state.jail && now() < state.jail.until;

// ------------------------------------------------------------- employment ---
function workStatus(): string {
  const w = state.work;
  if (!w) return 'no job';
  const e = employer(w.id)!;
  if (!w.tasks.length) return `${e.name}: all done. next task in ${ago(w.last + TASK_EVERY - now())}`;
  const age = now() - w.tasks[0];
  return `${e.name}: ${w.tasks.length} task${w.tasks.length > 1 ? 's' : ''} waiting, oldest ${ago(age)}, fired at ${e.strict ? 3 : 5}d`;
}

function openEmployer(e: Employer): void {
  const w = state.work;
  if (w && w.id === e.id) {
    const age = w.tasks.length ? now() - w.tasks[0] : 0;
    openMenu({
      title: `${e.name} - ${e.boss}`,
      line: w.tasks.length
        ? `${w.tasks.length} task${w.tasks.length > 1 ? 's' : ''} waiting. the oldest is ${ago(age)} old. ${e.strict ? 'strict' : 'relaxed'} boss: fired when one reaches ${e.strict ? 3 : 5} days.`
        : `nothing waiting. the next task lands in ${ago(w.last + TASK_EVERY - now())}. ${w.done} done so far.`,
      items: [
        { label: 'do a work task', right: money(e.wage), sub: `${TASK_QUESTIONS} questions - ${e.tier === 'dse' ? 'dse' : 'junior'} - paid whatever you score`,
          off: !w.tasks.length, why: 'no tasks waiting yet', act: () => startQuiz('work') },
        { label: 'quit this job', sub: 'no penalty, but the tasks stop', act: () => { menu = null; act('work.quit'); } },
        { label: 'leave', act: () => { menu = null; } },
      ],
    });
    return;
  }
  const blockers: string[] = [];
  if (w) blockers.push(`you already work at ${employer(w.id)!.name}`);
  const back = state.fired[e.id] ?? 0;
  if (back > now()) blockers.push(`you were fired. reapply in ${ago(back - now())}`);
  for (const n of e.needs) {
    if (!state.certs.includes(n)) blockers.push(`needs the ${COURSES.find((c) => c.id === n)?.name ?? n}`);
  }
  if (e.cleanDays && state.record.some((r) => r.day > state.day - e.cleanDays)) {
    blockers.push(`no offences in the last ${e.cleanDays} days`);
  }
  openMenu({
    title: `${e.name} - ${e.boss}`,
    line: `"${e.pitch}" wage ${money(e.wage)} per task. a task every 5 real hours. ${e.strict ? 'strict: fired if a task waits 3 days.' : 'relaxed: fired if a task waits 5 days.'}`,
    items: [
      { label: 'apply for the job', sub: blockers.length ? blockers.join(' - ') : `${e.tier === 'dse' ? 'dse' : 'junior'} level work`,
        off: blockers.length > 0, why: blockers[0], act: () => { menu = null; act('work.apply', { id: e.id }); } },
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

// -------------------------------------------------------------------- gigs ---
function openBoard(): void {
  const gigs = boardFor(state.day);
  openMenu({
    title: `notice board - day ${state.day}`,
    line: 'freelance gigs. one-off, and you bring your own gear. each right answer pays by its level: f1 work pays least, f6 most. new gigs every day.',
    items: [
      ...gigs.map((g): MenuItem => {
        const done = state.gigs.includes(`${state.day}:${g.id}`);
        const missing = g.needs.filter((n) => !has(state, n));
        const top = Math.round((gigRate(g) * g.questions * payBoost(state)) / 10) * 10;
        const pirated = g.needs.some((n) => item(coverFor(state, n) ?? '')?.kind === 'pirated');
        return {
          label: `[${g.tier === 'dse' ? 'dse' : 'junior'}] ${g.title}`,
          right: done ? 'done' : `about ${money(top)}`,
          sub: `${g.client}, ${g.place} - f${g.forms[0]}-${g.forms[1]}, ${g.questions} qs - ${g.needs.length ? `needs ${g.needs.map((n) => NEED_NAMES[n] ?? n).join(', ')}${pirated ? ' (yours is pirated)' : ''}` : 'no gear needed'}`,
          colour: g.tier === 'dse' ? '#ffc84a' : '#7be0d0',
          off: done || missing.length > 0 || state.energy <= 0,
          why: done ? 'already done today' : missing.length ? `you need: ${missing.map((n) => needWhy(n)).join(', ')}` : 'too tired. take the bus home and sleep',
          act: () => startQuiz('gig', { id: g.id }),
        };
      }),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

/** why a need is not met: you do not have it, or yours is broken or ran out */
function needWhy(n: string): string {
  const owned = state.inv.find((id) => item(id)?.provides === n);
  const name = NEED_NAMES[n] ?? n;
  if (!owned) return name;
  const it = item(owned)!;
  if (it.kind === 'licence' && !licenceLive(state, owned)) return `${name} (licence ran out)`;
  if (condition(state, owned) <= 0) return `${name} (broken)`;
  return name;
}

// ------------------------------------------------------------------- shops ---
const SHOP_SHELVES: Array<{ name: string; kinds: string[]; sub: string }> = [
  { name: 'laptops', kinds: ['laptop'], sub: 'a better laptop pays more on every gig, and some gigs need one' },
  { name: 'tools', kinds: ['tool'], sub: 'cable tester, camera, label printer' },
  { name: 'software licences', kinds: ['licence'], sub: 'office, photo and accounting software, with real keys. 30 days each' },
];

function openShop(shelf?: number): void {
  if (shelf === undefined) {
    const worn = state.inv.filter((id) => (item(id)?.kind === 'laptop' || item(id)?.kind === 'tool') && id !== 'laptop1' && condition(state, id) < 100);
    openMenu({
      title: 'pixel fix - ah yan',
      line: '"everything here is legit. the receipt has a licence key on it." gear wears with every gig; ah yan repairs it.',
      items: [
        ...SHOP_SHELVES.map((s, i): MenuItem => ({ label: s.name, sub: s.sub, act: () => openShop(i) })),
        { label: 'repairs', sub: worn.length ? worn.map((id) => `${item(id)!.name} ${condition(state, id)}%`).join(', ') : 'nothing of yours needs fixing',
          off: !worn.length, why: 'nothing needs fixing', act: () => openRepairs() },
        { label: 'leave', act: () => { menu = null; } },
      ],
    });
    return;
  }
  const kinds = SHOP_SHELVES[shelf].kinds;
  openMenu({
    title: `pixel fix - ${SHOP_SHELVES[shelf].name}`,
    line: `you have ${money(state.money)}.`,
    back: () => openShop(),
    items: [
      ...SHOP_STOCK.filter((id) => kinds.includes(item(id)!.kind)).map((id): MenuItem => {
        const it = item(id)!;
        const owned = state.inv.includes(id);
        if (owned && it.kind === 'licence') {
          const left = (state.lic[id] ?? 0) - state.day;
          const canRenew = left <= RENEW_WINDOW;
          return {
            label: it.name, right: left > 0 ? `${left} days left` : 'ran out',
            sub: canRenew ? `renew for ${money(it.price)}: 30 more days` : `renewal opens ${RENEW_WINDOW} days before it runs out`,
            off: !canRenew || state.money < it.price, why: canRenew ? 'not enough money' : 'too early to renew',
            act: () => { act('renew', { id }).then(() => openShop(shelf)); },
          };
        }
        return {
          label: it.name, right: owned ? `owned ${condition(state, id)}%` : money(it.price), sub: it.blurb,
          off: owned || state.money < it.price, why: owned ? 'you have one' : 'not enough money',
          act: () => { act('buy', { id }).then(() => openShop(shelf)); },
        };
      }),
      { label: 'back', act: () => openShop() },
    ],
  });
}

function openRepairs(): void {
  const worn = state.inv.filter((id) => (item(id)?.kind === 'laptop' || item(id)?.kind === 'tool') && id !== 'laptop1' && condition(state, id) < 100);
  openMenu({
    title: 'pixel fix - repairs',
    line: `ah yan fixes anything back to 100% for 60% of the value the wear took off. at 0% it does not count for gigs. you have ${money(state.money)}.`,
    back: () => openShop(),
    items: [
      ...worn.map((id): MenuItem => ({
        label: item(id)!.name, right: money(repairCost(state, id)), sub: `${condition(state, id)}%${condition(state, id) <= 0 ? ' - broken' : ''}`,
        off: state.money < repairCost(state, id), why: 'not enough money',
        act: () => { act('repair', { id }).then(() => openRepairs()); },
      })),
      { label: 'back', act: () => openShop() },
    ],
  });
}

function openPirate(): void {
  openMenu({
    title: 'the phone stall',
    line: '"same software, fifteen percent of the price. nobody checks. and it never runs out." he also has two side jobs, if you are interested.',
    items: [
      ...PIRATE_STOCK.map((id): MenuItem => {
        const it = item(id)!;
        const owned = state.inv.includes(id);
        return {
          label: it.name, right: owned ? 'owned' : money(it.price), sub: it.blurb, colour: '#ff9a6a',
          off: owned || state.money < it.price, why: owned ? 'you have one' : 'not enough money',
          act: () => { act('buy', { id }).then(() => openPirate()); },
        };
      }),
      { label: 'sell discs for him', right: '$800', sub: 'stand at the stall for an afternoon', colour: '#ff6a6a',
        act: () => { menu = null; act('crime', { id: 'piracySell' }); } },
      { label: "copy the stall holders' customer list", right: '$600', sub: 'he says it is for a lucky draw', colour: '#ff6a6a',
        act: () => { menu = null; act('crime', { id: 'dataLeak' }); } },
      { label: 'walk away', act: () => { menu = null; } },
    ],
  });
}

// ----------------------------------------------------------------- courses ---
function openCourses(): void {
  openMenu({
    title: 'stanley plaza - training centre',
    line: `short courses. pay, sit a ${COURSE_QUESTIONS}-question exam, pass with ${COURSE_PASS}. a certificate opens jobs. fail and you pay again.`,
    items: [
      ...COURSES.map((c): MenuItem => {
        const passed = state.certs.includes(c.id);
        return {
          label: `[${c.tier === 'dse' ? 'dse' : 'junior'}] ${c.name}`, right: passed ? 'passed' : money(c.price),
          sub: `${c.blurb} topics: ${c.topics.map((t) => TOPIC_NAMES[t].toLowerCase()).join(', ')}`,
          colour: c.tier === 'dse' ? '#ffc84a' : '#7be0d0',
          off: passed || state.money < c.price, why: passed ? 'you have this certificate' : 'not enough money',
          act: () => startQuiz('course', { id: c.id }),
        };
      }),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

// ----------------------------------------------------------------- library ---
function openLibrary(tier?: Tier): void {
  if (!tier) {
    openMenu({
      title: 'stanley public library',
      line: 'study for free. five questions with full explanations. nothing to lose, nothing to earn - except getting better.',
      items: [
        { label: 'junior (f1-3)', sub: 'computer basics, digital citizenship, coding, ai', colour: '#7be0d0', act: () => openLibrary('junior') },
        { label: 'dse (f4-6)', sub: 'the five compulsory modules a-e', colour: '#ffc84a', act: () => openLibrary('dse') },
        { label: 'leave', act: () => { menu = null; } },
      ],
    });
    return;
  }
  const topics = (Object.keys(TOPIC_NAMES) as Topic[]).filter((t) => (tier === 'junior') === t.startsWith('J'));
  openMenu({
    title: `library - ${tier === 'dse' ? 'dse' : 'junior'}`,
    line: 'pick a topic. your mastery goes up with each right answer.',
    back: () => openLibrary(),
    items: [
      ...topics.map((t): MenuItem => ({
        label: `${t} ${TOPIC_NAMES[t]}`, right: `mastery ${state.mastery[t] ?? 0}`,
        act: () => startQuiz('study', { topic: t }),
      })),
      { label: 'back', act: () => openLibrary() },
    ],
  });
}

// ------------------------------------------------------------- the police ---
function openPolice(): void {
  const lines: MenuItem[] = state.record.length
    ? state.record.slice(-4).map((r) => ({
      label: OFFENCES[r.id]?.law ?? 'crimes ordinance (cap. 200) s.161',
      sub: `day ${r.day} - ${r.jailed ? 'detained at stanley prison' : 'warning and fine'}`, off: true, colour: '#ff9a6a',
    }))
    : [{ label: 'clean record', sub: 'keep it that way', off: true, colour: '#7be08a' }];
  openMenu({
    title: 'stanley police station',
    line: 'the duty officer pulls up your file. a first minor offence gets a warning; anything after that, or anything serious, gets a cell.',
    items: [...lines, { label: 'leave', act: () => { menu = null; } }],
  });
}

// ---------------------------------------------------------------- the bus ---
function openBus(): void {
  openMenu({
    title: 'bus shelter',
    line: `take the bus home and sleep. it is day ${state.day}, ${clock()}. you wake on day ${state.day + 1} at 08:00 with full energy and a new notice board. rent is ${money(RENT)} a day. real-time work tasks keep coming either way.`,
    items: [
      { label: 'go home and sleep', right: money(SLEEP_FARE + RENT), sub: `bus ${money(SLEEP_FARE)} + rent ${money(RENT)}`, act: () => { menu = null; act('sleep'); } },
      { label: 'not yet', act: () => { menu = null; } },
    ],
  });
}

// ------------------------------------------------------------------ homes ---
/** a long list in the pixel menu: seven rows a page, then 'more' */
function paged(items: MenuItem[], page: number, reopen: (page: number) => void, back: MenuItem): MenuItem[] {
  const per = 7;
  const rows = items.slice(page * per, page * per + per);
  if (items.length > (page + 1) * per) rows.push({ label: `more (${page + 2} of ${Math.ceil(items.length / per)})`, act: () => reopen(page + 1) });
  else if (page > 0) rows.push({ label: 'first page', act: () => reopen(0) });
  rows.push(back);
  return rows;
}

const ownerOf = (id: string): string => net.owners.get(id) ?? '';
const mine = (id: string): boolean => !!state.homes[id];
function homeStatus(h: Home): string {
  if (mine(h.id)) return state.residence === h.id ? 'yours - you live here' : `yours - let, about ${money(Math.round(h.price * TENANT_PER_REAL_DAY))} a real day`;
  const o = ownerOf(h.id);
  return o ? `sold to ${o}` : 'for sale';
}

const BANDS: Array<[number, number, string]> = [
  [0, 20000, 'under $20,000'], [20000, 50000, '$20,000 - $50,000'], [50000, 100000, '$50,000 - $100,000'],
  [100000, 250000, '$100,000 - $250,000'], [250000, Infinity, 'over $250,000'],
];

function openAgency(): void {
  const owned = Object.keys(state.homes).map((id) => home(id)!).filter(Boolean);
  openMenu({
    title: 'bayside property agency - mr lam',
    line: `"every home in stanley, by price." your first home is where you live: no rent, just fees of ${HOME_FEES * 100}% of its price a day, and you sleep at your own door. any others are let: tenants pay ${TENANT_PER_REAL_DAY * 100}% a real day. selling gets you ${HOME_SELL * 100}% of what you paid. you have ${money(state.money)}.`,
    items: [
      ...BANDS.map(([lo, hi, label]): MenuItem => {
        const list = HOMES.filter((h) => h.price >= lo && h.price < hi);
        const free = list.filter((h) => !ownerOf(h.id) && !mine(h.id)).length;
        return { label, right: `${free} for sale`, sub: `${list.length} homes`, act: () => openBand(lo, hi, label, 0) };
      }),
      { label: 'your homes', right: `${owned.length}`, sub: owned.length ? owned.map((h) => h.name).join(', ') : 'none yet', off: !owned.length, why: 'you do not own a home yet',
        act: () => openHomeList(owned, 'your homes', 0, () => openAgency()) },
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

/** one row per building: a house, or a block of flats with its flats inside */
function openBand(lo: number, hi: number, label: string, page: number): void {
  const byB = new Map<number, Home[]>();
  for (const h of HOMES) if (h.price >= lo && h.price < hi) byB.set(h.b, [...(byB.get(h.b) ?? []), h]);
  const rows = [...byB.values()].sort((a, b) => a[0].price - b[0].price).map((hs): MenuItem => {
    const h = hs[0];
    if (hs.length === 1) return { label: h.name, right: money(h.price), sub: `${h.kind === 'house' ? 'house' : 'flat'}, ${h.area} m2 - ${homeStatus(h)}`, colour: mine(h.id) ? '#ffc84a' : ownerOf(h.id) ? '#8a90a8' : undefined, act: () => openHome(h, () => openBand(lo, hi, label, page)) };
    const free = hs.filter((x) => !ownerOf(x.id) && !mine(x.id)).length;
    const block = h.name.replace(/^flat [0-9]+[a-f], /, '');
    return { label: block, right: `from ${money(h.price)}`, sub: `${hs.length} flats here, ${free} for sale`, act: () => openHomeList(hs, block, 0, () => openBand(lo, hi, label, page)) };
  });
  openMenu({ title: `homes ${label}`, line: 'tap a home to see it, buy it or find it.', back: () => openAgency(), items: paged(rows, page, (n) => openBand(lo, hi, label, n), { label: 'back', act: () => openAgency() }) });
}

function openHomeList(hs: Home[], title: string, page: number, back: () => void): void {
  const rows = hs.map((h): MenuItem => ({ label: h.name, right: money(h.price), sub: `${h.area} m2 - ${homeStatus(h)}`, colour: mine(h.id) ? '#ffc84a' : ownerOf(h.id) ? '#8a90a8' : undefined, act: () => openHome(h, () => openHomeList(hs, title, page, back)) }));
  openMenu({ title, line: `you have ${money(state.money)}.`, back, items: paged(rows, page, (n) => openHomeList(hs, title, n, back), { label: 'back', act: back }) });
}

function openHome(h: Home, back: () => void): void {
  const yours = mine(h.id), o = ownerOf(h.id);
  const here = Math.hypot(player.x / TILE - h.tx, player.y / TILE - h.ty) < 6;
  const fees = Math.max(1, Math.round(h.price * HOME_FEES));
  const items: MenuItem[] = [];
  if (!yours && !o) {
    items.push({ label: 'buy it', right: money(h.price), sub: state.residence ? `let to tenants: about ${money(Math.round(h.price * TENANT_PER_REAL_DAY))} a real day` : `you would live here: fees ${money(fees)} a day instead of ${money(RENT)} rent`,
      off: state.money < h.price, why: 'not enough money', act: () => { act('home.buy', { id: h.id }).then(() => openHome(h, back)); } });
  }
  if (yours && state.residence === h.id && here) items.push({ label: 'sleep here', sub: 'wake at 08:00 tomorrow, at your own door', act: () => { menu = null; act('sleep', { at: 'home' }); } });
  if (yours && state.residence !== h.id) items.push({ label: 'live here', sub: 'move in: the old home gets tenants instead', act: () => { act('home.live', { id: h.id }).then(() => openHome(h, back)); } });
  if (yours) items.push({ label: 'sell it', right: money(Math.round(state.homes[h.id].paid * HOME_SELL)), sub: 'back through the agent: 90% of what you paid', act: () => { act('home.sell', { id: h.id }).then(() => openHome(h, back)); } });
  if (!here) items.push({ label: 'show me the way', sub: 'an arrow to its front door', act: () => { guide = { x: h.tx * TILE + 8, y: h.ty * TILE + 8, label: h.name }; menu = null; } });
  items.push({ label: 'back', act: back });
  openMenu({
    title: h.name,
    line: `${h.kind === 'house' ? 'a house' : `a flat on the ${h.floor}/f`}, ${h.area} m2. ${money(h.price)}. ${homeStatus(h)}.`,
    back, items,
  });
}

/** the board by a building's front door: what is for sale there */
function openHomeBoard(b: number): void {
  const hs = HOMES_AT.get(b) ?? [];
  if (hs.length === 1) { openHome(hs[0], () => { menu = null; }); return; }
  openHomeList(hs, hs[0].name.replace(/^flat [0-9]+[a-f], /, ''), 0, () => { menu = null; });
}

/** a building's home board near the player, if any (and no place is nearer) */
function homeBoardNear(): number | null {
  let best: number | null = null, bd = 1.6;
  for (const [b, hs] of HOMES_AT) {
    const d = Math.hypot(player.x / TILE - (hs[0].tx + 0.5), player.y / TILE - (hs[0].ty + 0.5));
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** walking to a home board you tapped */
let boardPending: number | null = null;
/** 'show me the way': an arrow to somewhere */
let guide: { x: number; y: number; label: string } | null = null;

// ------------------------------------------------------------------- cars ---
function openMotors(): void {
  const mineCar = state.car ? carModel(state.car.model) : undefined;
  const trade = state.car ? Math.round(state.car.value * CAR_BUYBACK) : 0;
  openMenu({
    title: 'stanley motors',
    line: `a car loses 1% of its price each day, down to 40%, and costs parking and fuel every day. we buy back at 80% of what it is worth${mineCar ? `: yours, ${money(trade)}` : ''}. you have ${money(state.money)}.`,
    items: [
      ...CARS.map((m): MenuItem => {
        const has_ = state.car?.model === m.id;
        const pay = m.price - trade;
        return {
          label: m.name, right: has_ ? 'yours' : money(m.price), sub: `${m.blurb} ${money(m.daily)} a day.${trade && !has_ ? ` with yours in part exchange: ${money(pay)}` : ''}`,
          off: has_ || state.money < pay, why: has_ ? 'you have one' : 'not enough money',
          act: () => {
            const spot = PLACES.find((p) => p.id === 'motors')!;
            const at = parkingNear(spot.tx * TILE + 8, spot.ty * TILE + 8);
            act('car.buy', { model: m.id, x: at.x, y: at.y, angle: 0 }).then((r) => { if (r.ok) menu = null; });
          },
        };
      }),
      ...(mineCar ? [{ label: 'sell your car', right: money(trade), sub: `your ${mineCar.name}, worth ${money(state.car!.value)} now`, act: () => { act('car.sell').then(() => openMotors()); } }] : []),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

/** a kerbside spot near a point (world pixels): the nearest drivable tile */
function parkingNear(x: number, y: number): { x: number; y: number } {
  const t = nearestOnNetwork(x / TILE, y / TILE, 60);
  return t ? { x: t.tx * TILE + 8, y: t.ty * TILE + 8 } : { x, y };
}

/** a taxi you called (v0.10): declared here so the traffic rules can see it */
type Taxi = { x: number; y: number; angle: number; speed: number; route: Pt[]; state: 'coming' | 'waiting' | 'riding' | 'leaving'; to: Place | null; waitUntil: number; from: { x: number; y: number }; wait: number };
let taxi: Taxi | null = null;

type Drive = { x: number; y: number; angle: number; speed: number; route: Array<{ x: number; y: number }>; then: Place | null };
/** you, driving your car */
let drive: Drive | null = null;

const nearMyCar = (): boolean => !!state.car && Math.hypot(player.x - state.car.x, player.y - state.car.y) < 3.5 * TILE;

function startDrive(): void {
  const c = state.car;
  if (!c || drive) return;
  drive = { x: c.x, y: c.y, angle: c.angle, speed: 0, route: [], then: null };
  path = []; pending = null;
  audio.play('door');
  flash('arrows to drive, or tap where to go. c to park.', '#7be08a');
}

/** park where you are and step out onto the pavement beside the car */
function stopDrive(): void {
  const d = drive;
  if (!d) return;
  drive = null;
  act('car.park', { x: Math.round(d.x), y: Math.round(d.y), angle: Math.round(d.angle * 100) / 100 });
  if (state.car) { state.car.x = d.x; state.car.y = d.y; state.car.angle = d.angle; }
  let best = { x: d.x, y: d.y }, bd = Infinity;
  for (let dy = -5; dy <= 5; dy += 1) for (let dx = -5; dx <= 5; dx += 1) {
    const tx = Math.floor(d.x / TILE) + dx, ty = Math.floor(d.y / TILE) + dy;
    if (!walkableTile(tx, ty) || drivableTile(tx, ty)) continue;
    const dd = Math.hypot(dx, dy);
    if (dd < bd) { bd = dd; best = { x: tx * TILE + 8, y: ty * TILE + 12 }; }
  }
  player.x = best.x; player.y = best.y;
  sendPos(player.x, player.y);
  audio.play('door');
  if (d.then) { pending = d.then; path = findPath(player.x, player.y, placeX(d.then), placeY(d.then)); if (!path.length) { const p = pending; pending = null; activate(p); } }
}

/** drive somewhere by the roads; a place: as near as the roads go, then park and walk in */
function driveTo(x: number, y: number, then: Place | null): void {
  if (!drive) return;
  const r = driveRoute(drive.x, drive.y, x, y);
  if (!r.length) { flash('no road goes there', '#ff9a6a'); return; }
  drive.route = r;
  // pull out facing the way to go
  if (Math.abs(drive.speed) < 5) drive.angle = Math.atan2(r[0].y - drive.y, r[0].x - drive.x);
  drive.then = then;
}

function updateDrive(dt: number): void {
  const d = drive!;
  const m = carModel(state.car?.model ?? 'hatch')!;
  const vmax = (m.speed / 3.6) * TILE, acc = 70 * m.pep;
  let steer = 0, gas = 0;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  if (keys.has('arrowup') || keys.has('w')) gas += 1;
  if (keys.has('arrowdown') || keys.has('s')) gas -= 1;
  if (steer || gas) d.route = [];
  if (!steer && !gas && d.route.length) {
    // on a route: run along it like the minibus does, speeding up and slowing for bends and the end
    let left = 0;
    for (let i = 0, px = d.x, py = d.y; i < d.route.length; i += 1) { left += Math.hypot(d.route[i].x - px, d.route[i].y - py); px = d.route[i].x; py = d.route[i].y; }
    const t0 = d.route[0];
    const next = d.route[1] ?? t0;
    const bend = Math.abs(Math.atan2(next.y - t0.y, next.x - t0.x) - Math.atan2(t0.y - d.y, t0.x - d.x));
    const target = Math.min(vmax * 0.85, Math.max(25, left * 1.1)) * (bend > 0.6 && bend < 5.7 ? 0.55 : 1);
    d.speed = d.speed < target ? Math.min(target, d.speed + acc * dt) : Math.max(target, d.speed - acc * 2 * dt);
    let dist = d.speed * dt;
    while (dist > 0 && d.route.length) {
      const t = d.route[0];
      const dd = Math.hypot(t.x - d.x, t.y - d.y);
      if (dd > 0.01) {
        const want = Math.atan2(t.y - d.y, t.x - d.x);
        let diff = want - d.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        d.angle += diff * Math.min(1, 10 * dt);
      }
      if (dd <= dist) { d.x = t.x; d.y = t.y; d.route.shift(); dist -= dd; } else { d.x += ((t.x - d.x) / dd) * dist; d.y += ((t.y - d.y) / dd) * dist; dist = 0; }
    }
    player.x = d.x; player.y = d.y;
    sendPos(d.x, d.y, d.angle);
    if (!d.route.length) { d.speed = 0; if (d.then) stopDrive(); }
    return;
  }
  if (gas > 0) d.speed = Math.min(vmax, d.speed + acc * gas * dt);
  else if (gas < 0) d.speed = Math.max(-vmax * 0.3, d.speed + acc * 1.6 * gas * dt);
  else d.speed *= Math.max(0, 1 - 1.8 * dt);
  if (Math.abs(d.speed) > 2) d.angle += steer * 2.2 * dt * Math.sign(d.speed) * Math.min(1, Math.abs(d.speed) / 60);
  const nx = d.x + Math.cos(d.angle) * d.speed * dt, ny = d.y + Math.sin(d.angle) * d.speed * dt;
  // driving yourself, the nose must stay on something a car can use; on a route the car is steered
  // along drivable tiles already, so only its middle is checked
  const half = (m.len / 2) * TILE * Math.sign(d.speed || 1);
  const fx = nx + Math.cos(d.angle) * half, fy = ny + Math.sin(d.angle) * half;
  const routed = d.route.length > 0;
  if (drivableTile(Math.floor(nx / TILE), Math.floor(ny / TILE)) && (routed || drivableTile(Math.floor(fx / TILE), Math.floor(fy / TILE)))) { d.x = nx; d.y = ny; }
  else if (routed) { d.speed = 0; const t = d.route[0]; d.angle = Math.atan2(t.y - d.y, t.x - d.x); }
  else d.speed = 0;
  player.x = d.x; player.y = d.y;
  sendPos(d.x, d.y, d.angle);
}

/** a car from above: body in its owner's coat colour, glass, roof */
function drawCar(x: number, y: number, angle: number, model: string, coat: string): void {
  const m = carModel(model) ?? CARS[0];
  const L = m.len * TILE, Wd = m.wid * TILE;
  const sx = Math.round(x - cam.x), sy = Math.round(y - cam.y);
  if (sx < -100 || sy < -100 || sx > viewW() + 100 || sy > viewH() + 100) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.save(); ctx.translate(3, 4); ctx.rotate(angle); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-L / 2, -Wd / 2, L, Wd); ctx.restore();
  ctx.rotate(angle);
  ctx.fillStyle = coat; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-L / 2, -Wd / 2, L, 3);
  ctx.fillStyle = '#1c2a3a'; ctx.fillRect(L * 0.08, -Wd / 2 + 3, L * 0.16, Wd - 6); // windscreen
  ctx.fillRect(-L * 0.36, -Wd / 2 + 3, L * 0.1, Wd - 6); // rear window
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-L * 0.26, -Wd / 2 + 3, L * 0.34, Wd - 6); // roof
  ctx.fillStyle = '#f2eec8'; ctx.fillRect(L / 2 - 2, -Wd / 2 + 2, 2, 4); ctx.fillRect(L / 2 - 2, Wd / 2 - 6, 2, 4);
  ctx.fillStyle = '#c8323c'; ctx.fillRect(-L / 2, -Wd / 2 + 2, 2, 4); ctx.fillRect(-L / 2, Wd / 2 - 6, 2, 4);
  if (m.id === 'coupe') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-L / 2, -2, L, 4); }
  ctx.restore();
}

// ----------------------------------------------------------- map and taxis ---
/** the whole of Stanley, a pixel per 4 m (the map) and per 2 m (the minimap), drawn once */
let mapArt: HTMLCanvasElement | null = null;
let miniArt: HTMLCanvasElement | null = null;

/** somewhere worth going: a place, or one of your homes */
type Dest = { id: string; name: string; tx: number; ty: number; colour: string };
function destinations(): Dest[] {
  const skip = new Set(['lift', 'minibus']);
  const out: Dest[] = PLACES.filter((p) => !skip.has(p.kind) && p.id !== 'escalator' && p.id !== 'bus')
    .map((p) => ({ id: p.id, name: p.name, tx: p.tx, ty: p.ty, colour: KIND_COLOUR[p.kind] ?? '#e8e4d8' }));
  for (const id of Object.keys(state.homes)) { const h = home(id); if (h) out.push({ id: h.id, name: `${state.residence === id ? 'home: ' : ''}${h.name}`, tx: h.tx, ty: h.ty, colour: '#3a8ae8' }); }
  return out;
}

let mapView: { sel: number; list: Dest[]; fare: number; fareFor: string } | null = null;
function openMap(): void {
  if (!mapArt) mapArt = renderOverview(4);
  const list = destinations();
  // start on whatever is nearest
  let sel = 0, bd = Infinity;
  list.forEach((d, i) => { const dd = Math.hypot(d.tx - player.x / TILE, d.ty - player.y / TILE); if (dd < bd) { bd = dd; sel = i; } });
  mapView = { sel, list, fare: 0, fareFor: '' };
  menu = null; dialogue = null; path = [];
  audio.play('ui');
}
const MAP_X = 18, MAP_Y = 20;
const mapRects = { taxi: { x: 392, y: 150, w: 230, h: 24 }, way: { x: 392, y: 180, w: 230, h: 24 }, cancel: { x: 392, y: 210, w: 230, h: 24 }, close: { x: 392, y: 300, w: 230, h: 22 } };

/** the selected destination's fare, by road from where a taxi would pick you up */
function mapFare(): number {
  const mv = mapView!;
  const d = mv.list[mv.sel];
  if (mv.fareFor !== d.id) {
    const m = roadMetres(player.x, player.y, d.tx * TILE + 8, d.ty * TILE + 8);
    mv.fare = m < 0 ? -1 : taxiFare(m);
    mv.fareFor = d.id;
  }
  return mv.fare;
}

function mapPick(what: 'taxi' | 'way' | 'cancel'): void {
  const mv = mapView;
  if (!mv) return;
  const d = mv.list[mv.sel];
  if (what === 'way') { guide = { x: d.tx * TILE + 8, y: d.ty * TILE + 8, label: d.name }; mapView = null; audio.play('ui'); return; }
  if (what === 'cancel') { if (taxi && taxi.state !== 'riding') { taxi.state = 'leaving'; taxiAway(); flash('taxi cancelled'); } return; }
  if (mapFare() < 0) { flash('no road goes there', '#ff9a6a'); return; }
  if (taxi && taxi.state === 'riding') return;
  if (Math.hypot(d.tx - player.x / TILE, d.ty - player.y / TILE) < 25) { flash('you are nearly there: walk', '#9aa0b8'); return; }
  callTaxi(d);
  mapView = null;
}

function drawMap(): void {
  const mv = mapView!;
  ctx.fillStyle = '#0b0d16'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(mapArt!, MAP_X, MAP_Y);
  ctx.strokeStyle = '#3a4054'; ctx.strokeRect(MAP_X - 0.5, MAP_Y - 0.5, mapArt!.width + 1, mapArt!.height + 1);
  const mx = (x: number): number => MAP_X + x / 4, my = (y: number): number => MAP_Y + y / 4;
  mv.list.forEach((d, i) => {
    ctx.fillStyle = '#0b0d16'; ctx.fillRect(Math.round(mx(d.tx)) - 2, Math.round(my(d.ty)) - 2, 5, 5);
    ctx.fillStyle = i === mv.sel ? '#ffffff' : d.colour; ctx.fillRect(Math.round(mx(d.tx)) - 1, Math.round(my(d.ty)) - 1, 3, 3);
  });
  for (const o of net.others.values()) { ctx.fillStyle = o.coat; ctx.fillRect(Math.round(mx(o.x / TILE)) - 1, Math.round(my(o.y / TILE)) - 1, 2, 2); }
  if (state.car) { ctx.fillStyle = net.me.coat; ctx.fillRect(Math.round(mx(state.car.x / TILE)) - 2, Math.round(my(state.car.y / TILE)) - 1, 4, 3); }
  if (taxi) { ctx.fillStyle = '#e8463a'; ctx.fillRect(Math.round(mx(taxi.x / TILE)) - 2, Math.round(my(taxi.y / TILE)) - 1, 4, 3); }
  // you: a blinking cross
  const px = Math.round(mx(player.x / TILE)), py = Math.round(my(player.y / TILE));
  if (Math.floor(performance.now() / 400) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 3, py, 7, 1); ctx.fillRect(px, py - 3, 1, 7); }
  const d = mv.list[mv.sel];
  // the selected place
  const sx = Math.round(mx(d.tx)), sy = Math.round(my(d.ty));
  ctx.strokeStyle = '#ffc84a'; ctx.strokeRect(sx - 5.5, sy - 5.5, 11, 11);
  text('map of stanley', 392, 24, '#ffc84a');
  prose(`${mv.sel + 1} of ${mv.list.length} - tab or tap a dot`, 392, 38, '#6f7688');
  wrap(d.name, 38).forEach((l, i) => text(l, 392, 60 + i * 12, d.colour));
  const dist = Math.round(Math.hypot(d.tx - player.x / TILE, d.ty - player.y / TILE));
  prose(`${dist} m as the crow flies`, 392, 96, '#c8ccdc');
  const fare = mapFare();
  prose(fare < 0 ? 'no road goes there' : `taxi about ${money(fare)} on the meter`, 392, 110, '#c8ccdc');
  const button = (r: Rect, label: string, on: boolean, colour = '#46e0e6'): void => {
    ctx.globalAlpha = on ? 1 : 0.4;
    ctx.fillStyle = 'rgba(28,34,48,0.98)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = colour; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(label, r.x + 8, r.y + 8, colour);
    ctx.globalAlpha = 1;
  };
  button(mapRects.taxi, taxi && taxi.state !== 'leaving' ? '1 call a taxi here instead' : '1 call a taxi', fare >= 0 && !(taxi?.state === 'riding'), '#ffc84a');
  button(mapRects.way, '2 show me the way', true);
  if (taxi && (taxi.state === 'coming' || taxi.state === 'waiting')) button(mapRects.cancel, '3 cancel your taxi', true, '#ff9a6a');
  button(mapRects.close, 'esc close', true, '#6f7688');
  wrap('a red taxi comes to the road nearest you; walk up to it to get in. it obeys the rules of the road like everyone else.', 38)
    .forEach((l, i) => prose(l, 392, 244 + i * 11, '#6f7688'));
}

function mapTap(x: number, y: number): void {
  const mv = mapView!;
  if (inRect(mapRects.taxi, x, y)) { mapPick('taxi'); return; }
  if (inRect(mapRects.way, x, y)) { mapPick('way'); return; }
  if (inRect(mapRects.cancel, x, y)) { mapPick('cancel'); return; }
  if (inRect(mapRects.close, x, y)) { mapView = null; return; }
  // a dot
  let best = -1, bd = 10;
  mv.list.forEach((d, i) => { const dd = Math.hypot(MAP_X + d.tx / 4 - x, MAP_Y + d.ty / 4 - y); if (dd < bd) { bd = dd; best = i; } });
  if (best >= 0) { mv.sel = best; audio.play('ui'); }
}

/** the minimap, top right: about 245 x 185 m round you */
function drawMinimap(): void {
  if (!miniArt) miniArt = renderOverview(2);
  const r = minimapRect;
  const cx = (drive ? drive.x : taxi?.state === 'riding' ? taxi.x : player.x) / TILE, cy = (drive ? drive.y : taxi?.state === 'riding' ? taxi.y : player.y) / TILE;
  const wm = 245, hm = 185;
  ctx.fillStyle = 'rgba(8,10,18,0.9)'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(miniArt, (cx - wm / 2) / 2, (cy - hm / 2) / 2, wm / 2, hm / 2, r.x, r.y, r.w, r.h);
  const k = r.w / wm;
  const at = (mx: number, my: number): [number, number] => [Math.round(r.x + (mx - cx + wm / 2) * k), Math.round(r.y + (my - cy + hm / 2) * k)];
  for (const p of PLACES) {
    if (p.kind === 'lift') continue;
    const [x, y] = at(p.tx, p.ty);
    ctx.fillStyle = KIND_COLOUR[p.kind] ?? '#e8e4d8'; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  for (const id of Object.keys(state.homes)) { const h = home(id); if (h) { const [x, y] = at(h.tx, h.ty); ctx.fillStyle = '#3a8ae8'; ctx.fillRect(x - 1, y - 1, 3, 3); } }
  for (const o of net.others.values()) { const [x, y] = at(o.x / TILE, o.y / TILE); ctx.fillStyle = o.coat; ctx.fillRect(x - 1, y - 1, 2, 2); }
  if (state.car && !drive) { const [x, y] = at(state.car.x / TILE, state.car.y / TILE); ctx.fillStyle = net.me.coat; ctx.fillRect(x - 2, y - 1, 4, 3); }
  if (taxi) { const [x, y] = at(taxi.x / TILE, taxi.y / TILE); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(x - 2, y - 1, 4, 3); }
  if (guide) { const [x, y] = at(guide.x / TILE, guide.y / TILE); ctx.strokeStyle = '#ffc84a'; ctx.strokeRect(x - 2.5, y - 2.5, 5, 5); }
  const [ux, uy] = at(cx, cy);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(ux - 1, uy - 1, 3, 3);
  ctx.restore();
  ctx.strokeStyle = '#3a4054'; ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
  text('m map', r.x + 2, r.y + r.h + 4, '#6f7688');
}
const minimapRect: Rect = { x: W - 106, y: 40, w: 100, h: 76 };

// ------------------------------------------------------------------ taxis ---
const TAXI_EMPTY_KMH = 45, TAXI_FULL_KMH = 50, TAXI_WAIT_MS = 150000;
let taxiPicked = 0;
function callTaxi(d: Dest): void {
  const me = { x: player.x / TILE, y: player.y / TILE };
  const pick = nearestOnNetwork(me.x, me.y, 60);
  if (!pick) { flash('no road near you for a taxi', '#ff9a6a'); return; }
  // it sets off from a road 60-160 m away, just out of sight
  let start: { tx: number; ty: number } | null = null;
  for (let i = 0; i < 12 && !start; i += 1) {
    const t = networkTileNear(pick.tx, pick.ty, 60, 160);
    if (t && Math.abs(t.tx * TILE - player.x) * zoom > W / 2 + 40 || t && Math.abs(t.ty * TILE - player.y) * zoom > H / 2 + 40) start = t;
  }
  start ??= networkTileNear(pick.tx, pick.ty, 60, 160);
  if (!start) { flash('no taxis about', '#ff9a6a'); return; }
  const route = keepLeft(driveRoute(start.tx * TILE + 8, start.ty * TILE + 8, pick.tx * TILE + 8, pick.ty * TILE + 8));
  if (route.length < 2) { flash('no taxis can get to you here', '#ff9a6a'); return; }
  const place = PLACES.find((p) => p.id === d.id) ?? null;
  taxi = { x: route[0].x, y: route[0].y, angle: headingOf(route), speed: 0, route, state: 'coming', to: place ?? ({ id: d.id, tx: d.tx, ty: d.ty, name: d.name, kind: 'flavour', line: '' } as Place), waitUntil: 0, from: { x: 0, y: 0 }, wait: 0 };
  audio.play('ui');
  flash(`a taxi is on its way to ${d.name}... the nearest road to you`, '#ffc84a', 4);
}

function taxiAway(): void {
  if (!taxi) return;
  const t = networkTileNear(taxi.x / TILE, taxi.y / TILE, 150, 400);
  taxi.route = t ? keepLeft(driveRoute(taxi.x, taxi.y, t.tx * TILE + 8, t.ty * TILE + 8)) : [];
  taxi.state = 'leaving';
  if (guide?.label === 'your taxi') guide = null;
}

function arriveTaxi(): void {
  const tx = taxi!;
  const to = tx.to!;
  // the server has you where the taxi stopped; it charges, then you step out at the door
  sendPos(tx.x, tx.y);
  act('taxi.ride', { x: Math.round(tx.from.x), y: Math.round(tx.from.y), to: to.id });
  placePlayer(to.tx, to.ty);
  audio.play('door');
  taxiAway();
}

function updateTaxi(dt: number): void {
  const tx = taxi;
  if (!tx) return;
  if (tx.state === 'waiting') {
    if (guide?.label === 'your taxi') { guide.x = tx.x; guide.y = tx.y; }
    if (!drive && Math.hypot(player.x - tx.x, player.y - tx.y) < 2.8 * TILE) {
      // in you get: the meter starts here
      const to = tx.to!;
      const r = keepLeft(driveRoute(tx.x, tx.y, to.tx * TILE + 8, to.ty * TILE + 8));
      if (r.length < 2) { flash('the driver shakes his head: no road goes there', '#ff9a6a'); taxiAway(); return; }
      tx.route = r; tx.state = 'riding'; tx.from = { x: tx.x, y: tx.y }; taxiPicked = 0;
      path = []; pending = null;
      if (guide?.label === 'your taxi') guide = null;
      audio.play('door');
      return;
    }
    if (Date.now() > tx.waitUntil) { flash('your taxi gave up waiting', '#ff9a6a'); taxiAway(); }
    return;
  }
  const kmh = tx.state === 'riding' ? TAXI_FULL_KMH : TAXI_EMPTY_KMH;
  if (!tx.route.length) {
    if (tx.state === 'coming') {
      tx.state = 'waiting'; tx.waitUntil = Date.now() + TAXI_WAIT_MS; tx.speed = 0;
      guide = { x: tx.x, y: tx.y, label: 'your taxi' };
      audio.play('alert');
      flash('your taxi is here: walk up to it', '#ffc84a', 4);
    } else if (tx.state === 'riding') arriveTaxi();
    else taxi = null;
    return;
  }
  const sp = minibusSpeed(tx, kmh, dt);
  const before = { x: tx.x, y: tx.y };
  let dist = sp * dt;
  while (dist > 0 && tx.route.length) {
    const t = tx.route[0];
    const dd = Math.hypot(t.x - tx.x, t.y - tx.y);
    if (dd > 0.5) { const want = Math.atan2(t.y - tx.y, t.x - tx.x); tx.angle += Math.atan2(Math.sin(want - tx.angle), Math.cos(want - tx.angle)) * Math.min(1, 8 * dt); }
    if (dd <= dist) { tx.x = t.x; tx.y = t.y; tx.route.shift(); dist -= dd; } else { tx.x += ((t.x - tx.x) / dd) * dist; tx.y += ((t.y - tx.y) / dd) * dist; dist = 0; }
  }
  if (tx.state === 'riding') { taxiPicked += Math.hypot(tx.x - before.x, tx.y - before.y) / TILE; player.x = tx.x; player.y = tx.y; sendPos(tx.x, tx.y); }
  if (tx.state === 'leaving' && Math.hypot(tx.x - player.x, tx.y - player.y) > 250 * TILE) taxi = null;
}

/** a Hong Kong urban taxi: red body, silver roof, the roof sign lit when it is for hire */
function drawTaxi(t: Taxi): void {
  const sx = Math.round(t.x - cam.x), sy = Math.round(t.y - cam.y);
  if (sx < -100 || sy < -100 || sx > viewW() + 100 || sy > viewH() + 100) return;
  const L = 4.6 * TILE, Wd = 1.75 * TILE;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.save(); ctx.translate(3, 4); ctx.rotate(t.angle); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-L / 2, -Wd / 2, L, Wd); ctx.restore();
  ctx.rotate(t.angle);
  ctx.fillStyle = '#d22a2a'; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
  ctx.fillStyle = '#c8ccd4'; ctx.fillRect(-L * 0.26, -Wd / 2 + 3, L * 0.34, Wd - 6);
  ctx.fillStyle = '#1c2a3a'; ctx.fillRect(L * 0.08, -Wd / 2 + 3, L * 0.16, Wd - 6); ctx.fillRect(-L * 0.36, -Wd / 2 + 3, L * 0.1, Wd - 6);
  ctx.fillStyle = '#f2eec8'; ctx.fillRect(L / 2 - 2, -Wd / 2 + 2, 2, 4); ctx.fillRect(L / 2 - 2, Wd / 2 - 6, 2, 4);
  ctx.restore();
  // the roof sign stays upright so it reads; lit while it is for hire
  const hire = t.state === 'coming' || t.state === 'leaving';
  ctx.fillStyle = hire ? '#fff2a0' : '#8a8670'; ctx.fillRect(sx - 9, sy - 5, 18, 8);
  ctx.fillStyle = '#d22a2a'; ctx.fillRect(sx - 7, sy - 3, 14, 1);
}

// ---------------------------------------------------------------- status ---
function openStatus(): void {
  const gear = state.inv.map((id) => {
    const it = item(id);
    if (!it) return id;
    if (it.kind === 'licence') return `${it.name} ${licenceLive(state, id) ? `(to day ${state.lic[id]})` : '(ran out)'}`;
    if ((it.kind === 'laptop' || it.kind === 'tool') && id !== 'laptop1') return `${it.name} ${condition(state, id)}%`;
    return it.name;
  });
  const acc = state.answered ? Math.round((100 * state.right) / state.answered) : 0;
  const online = net.mode === 'online';
  openMenu({
    title: online ? net.me.name : 'you (solo)',
    line: `day ${state.day}, ${clock()}. ${money(state.money)} cash, net worth ${money(netWorth(state))}. ${state.answered} questions answered, ${acc}% right.`,
    items: [
      { label: 'richest on the server', right: online ? `you are #${net.board.you[0]}` : 'solo',
        sub: online ? net.board.top.slice(0, 3).map(([n, w], i) => `${i + 1}. ${n} ${money(w)}`).join('   ') : 'play on the school server to be on the leaderboard',
        off: !online, why: 'solo games are not on the leaderboard', act: () => openBoardTop(), colour: '#ffc84a' },
      { label: 'work', sub: workStatus(), off: true, colour: '#7ab8ff' },
      { label: 'homes', sub: Object.keys(state.homes).length ? Object.keys(state.homes).map((id) => `${home(id)?.name ?? id}${state.residence === id ? ' (home)' : ''}`).join(', ') + (net.mode ? ` - tenants due ${money(Math.round(tenantsOwe(state, now())))}` : '') : 'none: you rent. see bayside property agency',
        off: !Object.keys(state.homes).length, why: 'you do not own a home', act: () => openHomeList(Object.keys(state.homes).map((id) => home(id)!).filter(Boolean), 'your homes', 0, () => openStatus()) },
      { label: 'car', sub: state.car ? `${carModel(state.car.model)?.name}, worth ${money(state.car.value)}` : 'none. stanley motors, by the terminus', off: true },
      { label: 'gear', sub: gear.join(', ') || 'nothing', off: true },
      { label: 'certificates', sub: state.certs.map((c) => COURSES.find((x) => x.id === c)?.name ?? c).join(', ') || 'none yet', off: true },
      { label: 'record', sub: state.record.length ? `${state.record.length} offence(s). see stanley police station` : 'clean', off: true,
        colour: state.record.length ? '#ff9a6a' : '#7be08a' },
      { label: 'map data', sub: '(c) openstreetmap contributors (odbl). 3d map, ib1000 map and pedestrian network: lands department. road markings: transport department, hksar government', off: true, colour: '#6f7688' },
      { label: 'close', act: () => { menu = null; } },
    ],
  });
}

/** the leaderboard: net worth, cash plus gear at what it is worth now */
function openBoardTop(): void {
  const [rank, worth] = net.board.you;
  openMenu({
    title: 'richest in stanley',
    line: `net worth is cash plus your gear and licences at what they are worth now. you are #${rank} with ${money(worth)}. it never resets.`,
    back: () => openStatus(),
    items: [
      ...net.board.top.map(([n, w], i): MenuItem => ({ label: `${i + 1}. ${n}`, right: money(w), off: true, colour: n === net.me.name ? '#ffc84a' : undefined })),
      { label: 'back', act: () => openStatus() },
    ],
  });
}

// --------------------------------------------------------------- missions ---
const missionDef = (): JobDef | undefined =>
  state.mission ? MISSIONS.find((d) => d.id === state.mission!.id) : undefined;

function showWire(s: string | undefined, alert: boolean): void {
  wireAlert = alert;
  if (s) wireText = s;
  wireX = W;
  wireTimer = 0;
}

function missionHeadline(): string {
  const d = missionDef();
  if (!d || !state.mission) return '';
  return `${d.client}: ${d.symptom} - $${d.pay * MISSION_PAY} double pay - ${Math.max(0, Math.ceil((state.mission.until - now()) / 1000))}s`;
}

let missionAsk = false;
function tickMissions(dt: number): void {
  if (state.mission) {
    // closed and not taken: the rules charge the no-show fee on the next tick
    if (now() > state.mission.until + 500 && state.missionTaken !== state.mission.id && !missionAsk) {
      missionAsk = true;
      act('tick').then(() => { missionAsk = false; });
    }
    return;
  }
  nextMission -= dt;
  if (nextMission > 0 || missionAsk) return;
  if (MISSIONS.every((d) => state.done.includes(d.id))) { nextMission = Infinity; return; }
  missionAsk = true;
  nextMission = 150 + Math.random() * 90;
  act('mission.new').then(() => { missionAsk = false; });
}

// --------------------------------------------------------------- minibus ---
type Pt = { x: number; y: number };
/** road routes between consecutive stops, worked out once */
const legCache = new Map<string, Pt[]>();
function leg(a: Stop, b: Stop): Pt[] {
  const key = `${a.id}>${b.id}`;
  let p = legCache.get(key);
  if (!p) { p = roadRoute(a.x, a.y, b.x, b.y); legCache.set(key, p); }
  return p;
}
function journey(r: Route, from: string, to: string): Pt[] {
  const i = r.stops.findIndex((s) => s.id === from), j = r.stops.findIndex((s) => s.id === to);
  if (i < 0 || j < 0 || i === j) return [];
  const step = j > i ? 1 : -1;
  const out: Pt[] = [];
  for (let k = i; k !== j; k += step) out.push(...leg(r.stops[k], r.stops[k + step]));
  return out;
}

type Ride = { route: Route; to: Stop; path: Pt[]; i: number; x: number; y: number; angle: number; speed: number };
let ride: Ride | null = null;
/** minibuses running up and down their routes for the look of the place */
type Shuttle = { route: Route; path: Pt[]; i: number; dir: 1 | -1; x: number; y: number; angle: number; wait: number; speed: number; there: Pt[]; back: Pt[] };
const shuttles: Shuttle[] = [];

function startShuttles(): void {
  for (const r of ROUTES) {
    const path = journey(r, r.stops[0].id, r.stops[r.stops.length - 1].id);
    if (path.length < 2) continue;
    for (let n = 0; n < 2; n += 1) {
      const i = Math.floor((n * path.length) / 2);
      // each way in its own left-hand lane, 1.6 m left of the middle
      const there = keepLeft(path), back = keepLeft([...path].reverse());
      const run = n ? back : there;
      shuttles.push({ route: r, path: run, i, dir: 1, x: run[i].x, y: run[i].y, angle: 0, wait: 0, speed: 0, there, back });
    }
  }
}

function openMinibus(p: Place): void {
  const items: MenuItem[] = [];
  for (const r of routesAt(p.id)) {
    for (const st of r.stops) {
      if (st.id === p.id) continue;
      items.push({
        label: `gmb ${r.no} to ${st.name}`, right: money(r.fare),
        sub: `green minibus ${r.no}. pay as you board.`,
        off: state.money < r.fare, why: 'not enough money for the fare',
        act: () => board(r, p.id, st),
      });
    }
  }
  items.push({ label: 'not now', act: () => { menu = null; } });
  openMenu({ title: p.name, line: 'green minibuses stop here. pay as you board; the fare is the same however far you go in stanley.', items });
}

function board(r: Route, from: string, to: Stop): void {
  const path = journey(r, from, to.id);
  menu = null;
  if (path.length < 2) { flash('the minibus is not running that way right now', '#ff9a6a'); return; }
  act('fare', { route: r.no }).then((res) => {
    if (res.ok) { const lane = keepLeft(path); ride = { route: r, to, path: lane, i: 0, x: lane[0].x, y: lane[0].y, angle: 0, speed: 0 }; }
  });
}

function endRide(): void {
  if (!ride) return;
  const r = ride;
  ride = null;
  const p = PLACES.find((x) => x.id === r.to.id);
  if (p) placePlayer(p.tx, p.ty);
  // in-game time: about 25 km/h through the village, at least two minutes
  act('ride.end', { minutes: Math.max(2, Math.round((r.path.length * 3) / 400)) });
  audio.play('door');
}

function moveAlong(v: { path: Pt[]; i: number; x: number; y: number; angle: number }, dir: 1 | -1, dist: number): boolean {
  while (dist > 0) {
    const n = v.i + dir;
    if (n < 0 || n >= v.path.length) return false;
    const t = v.path[n];
    const d = Math.hypot(t.x - v.x, t.y - v.y);
    if (d > 0.01) v.angle = Math.atan2(t.y - v.y, t.x - v.x);
    if (d <= dist) { v.x = t.x; v.y = t.y; v.i = n; dist -= d; } else { v.x += ((t.x - v.x) / d) * dist; v.y += ((t.y - v.y) / d) * dist; dist = 0; }
  }
  return true;
}

/** speed up gently to a limit, and slow down for whatever the rules say */
function minibusSpeed(v: { speed: number; x: number; y: number; angle: number }, kmh: number, dt: number): number {
  const target = Math.min((kmh / 3.6) * TILE, rulesOfTheRoad(v, ruled, clockSecs, dt));
  v.speed = v.speed < target ? Math.min(target, v.speed + 45 * dt) : Math.max(target, v.speed - 160 * dt);
  return v.speed;
}
function updateMinibuses(dt: number): void {
  for (const sh of shuttles) {
    if (sh.wait > 0) { sh.wait -= dt; continue; }
    // on their rounds, up to 45 km/h; at the end of the route, turn round into the other lane
    if (!moveAlong(sh, 1, minibusSpeed(sh, 45, dt) * dt)) {
      sh.path = sh.path === sh.there ? sh.back : sh.there;
      sh.i = 0; sh.x = sh.path[0].x; sh.y = sh.path[0].y; sh.speed = 0; sh.wait = 6;
    }
  }
  // the one you ride: up to the 50 km/h limit, and it stops for the same things
  if (ride && !moveAlong(ride, 1, minibusSpeed(ride, 50, dt) * dt)) endRide();
}

function drawMinibus(x: number, y: number, angle: number, no: string): void {
  const sx = Math.round(x - cam.x), sy = Math.round(y - cam.y);
  if (sx < -120 || sy < -120 || sx > viewW() + 120 || sy > viewH() + 120) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.save(); ctx.translate(4, 5); ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-56, -18, 112, 36);
  ctx.restore();
  ctx.rotate(angle);
  // a Hong Kong green minibus: cream body, green roof, red route number on the front sign
  ctx.fillStyle = '#efe9d6'; ctx.fillRect(-56, -18, 112, 36);
  ctx.fillStyle = '#2f8a4a'; ctx.fillRect(-48, -14, 92, 28);
  ctx.fillStyle = '#3aa25a'; ctx.fillRect(-48, -14, 92, 4);
  ctx.fillStyle = '#2a3a4a'; ctx.fillRect(40, -15, 12, 30);
  ctx.fillStyle = '#f2eee0'; ctx.fillRect(-46, -8, 26, 16);
  ctx.restore();
  // the route number stays upright so it can be read
  ctx.fillStyle = '#f2eee0'; ctx.fillRect(sx - 14, sy - 6, 28, 12);
  text(no, sx - tw(no) / 2, sy - 4, '#c8323c');
}

// ------------------------------------------------------------------ places ---
/** what a place offers right now: a console job, a callout, or nothing */
function jobAt(p: Place): { def: JobDef; mission: boolean } | null {
  const m = missionDef();
  if (m && m.spot === p.id) return { def: m, mission: true };
  const j = JOBS.find((d) => d.spot === p.id && !state.done.includes(d.id));
  return j ? { def: j, mission: false } : null;
}

type Marker = { colour: string; label: string } | null;

/** a small tag over every place you can use, so a new player can see where to go */

function markerFor(p: Place): Marker {
  const j = jobAt(p);
  if (j) return j.mission ? { colour: '#ff4a5f', label: '!' } : { colour: '#ffc84a', label: '!' };
  if (p.kind === 'board') {
    const open = boardFor(state.day).some((g) => !state.gigs.includes(`${state.day}:${g.id}`));
    return open ? { colour: '#ffc84a', label: '?' } : null;
  }
  if (p.kind === 'employer') {
    const e = EMPLOYERS.find((x) => x.place === p.id);
    if (e && state.work?.id === e.id && state.work.tasks.length) return { colour: '#7ab8ff', label: `${state.work.tasks.length}` };
  }
  if (p.kind === 'offer' && state.declined) return null;
  return null;
}

function activate(p: Place): void {
  pending = null;
  path = [];
  const j = jobAt(p);
  if (j) {
    if (j.mission) {
      act('mission.take', { id: j.def.id }).then((r) => {
        if (!r.ok) return;
        nextMission = 150 + Math.random() * 90;
        job = new Job(j.def, true);
        audio.play('ui');
      });
      return;
    }
    job = new Job(j.def, false);
    audio.play('ui');
    return;
  }
  switch (p.kind) {
    case 'board': openBoard(); return;
    case 'shop': openShop(); return;
    case 'pirate': openPirate(); return;
    case 'course': openCourses(); return;
    case 'library': openLibrary(); return;
    case 'police': openPolice(); return;
    case 'bus': openBus(); return;
    case 'minibus': openMinibus(p); return;
    case 'agency': openAgency(); return;
    case 'motors': openMotors(); return;
    case 'lift': {
      // Stanley Plaza's lift: pick a floor, the doors close, and you step out there
      const here = Number(p.id.slice(4));
      const stops = PLACES.filter((q) => q.kind === 'lift');
      openMenu({
        title: 'stanley plaza lift', line: 'which floor?',
        items: stops.filter((q) => q !== p).map((q) => ({
          label: q.name.replace('lift ', '') + (Number(q.id.slice(4)) > here ? '  up' : '  down'),
          act: () => { menu = null; placePlayer(q.tx, q.ty); audio.play('door'); flash(`stanley plaza, ${q.name.replace('lift ', '')}`); },
        })),
      });
      return;
    }
    case 'employer': {
      const e = EMPLOYERS.find((x) => x.place === p.id);
      if (e) { openEmployer(e); return; }
      break;
    }
    case 'offer':
      if (!state.declined) {
        openMenu({
          title: OFFER.who, line: OFFER.line,
          items: [
            { label: OFFER.walk, act: () => { menu = null; act('offer.decline'); flash('he shrugs and lights a cigarette'); } },
            { label: OFFER.take, colour: '#ff6a6a', act: () => { menu = null; act('crime', { id: 'offer' }); } },
          ],
        });
        return;
      }
      break;
    case 'job': {
      const done = JOBS.some((d) => d.spot === p.id && state.done.includes(d.id)) || MISSIONS.some((d) => d.spot === p.id && state.done.includes(d.id));
      say(p.name, done ? 'everything works. they wave at you through the window.' : p.line);
      audio.play('door');
      return;
    }
    default: break;
  }
  audio.play('door');
  say(p.name, p.line);
}

const placeX = (p: Place): number => p.tx * TILE + TILE / 2;
const placeY = (p: Place): number => p.ty * TILE + TILE / 2 + 4;

function placePlayer(tx: number, ty: number): void {
  player.x = tx * TILE + TILE / 2;
  player.y = ty * TILE + TILE / 2 + 4;
  sendPos(player.x, player.y);
  path = [];
}

function nearestPlace(): Place | null {
  let best: Place | null = null;
  let bd = 20;
  for (const p of PLACES) {
    const d = Math.hypot(player.x - placeX(p), player.y - placeY(p));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function areaName(): string {
  return areaNear(player.x / TILE, player.y / TILE);
}

// ------------------------------------------------------------------ input ---
function toGame(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

const statusRect: Rect = { x: 560, y: 15, w: 80, h: 20 };
const runRect: Rect = { x: 574, y: 335, w: 58, h: 21 };
const zoomRect: Rect = { x: 510, y: 335, w: 58, h: 21 };

function quizOptionRect(i: number): Rect {
  return { x: 24, y: quizLayout().optTop + i * 30, w: 592, h: 26 };
}

const quizNextRect: Rect = { x: 470, y: 328, w: 146, h: 24 };

canvas.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  const { x, y } = toGame(ev);
  if (state.jail) return;
  if (job) {
    if (job.step === 'paid') { job.advance(); return; }
    if (inRect(exitRect, x, y)) { leaveJob(); return; }
    if (job.step === 'typing') { job.timer = 99; job.update(1); return; }
    const idx = job.options.findIndex((_, i) => inRect(optRect(i), x, y));
    if (idx >= 0) job.choose(idx);
    return;
  }
  if (ride) { endRide(); return; }
  if (mapView) { mapTap(x, y); return; }
  // in a taxi: a tap skips to the end of the ride
  if (taxi?.state === 'riding') { taxi.x = taxi.route[taxi.route.length - 1]?.x ?? taxi.x; taxi.y = taxi.route[taxi.route.length - 1]?.y ?? taxi.y; taxiPicked += taxi.route.length * 3; taxi.route = []; return; }
  if (quiz) {
    if (quiz.summary || quiz.picked !== null) { quiz.next(); return; }
    for (let i = 0; i < 4; i += 1) if (inRect(quizOptionRect(i), x, y)) { quiz.pick(i); return; }
    return;
  }
  if (menu) {
    const { rows } = menuLayout(menu);
    const idx = rows.findIndex((r) => inRect(r, x, y));
    if (idx >= 0) pickMenu(idx);
    return;
  }
  if (dialogue) { dialogue = null; return; }
  if (inRect(statusRect, x, y)) { openStatus(); return; }
  if (inRect(minimapRect, x, y)) { openMap(); return; }
  if (inRect(runRect, x, y, 0)) { running = !running; audio.play('ui'); return; }
  if (inRect(zoomRect, x, y, 0)) { toggleZoom(); return; }
  const wx = x / zoom + cam.x, wy = y / zoom + cam.y;
  if (drive) {
    // driving: a tap on a place drives as near as the roads go, parks and walks you in
    const p = PLACES.find((q) => Math.hypot(wx - placeX(q), wy - (placeY(q) - 16)) <= 12 / zoom);
    driveTo(p ? placeX(p) : wx, p ? placeY(p) : wy, p ?? null);
    return;
  }
  // a tap on a home board walks there and shows what is for sale
  for (const [b, hs] of HOMES_AT) {
    const bx = hs[0].tx * TILE + 8 + 14, by = hs[0].ty * TILE - 6;
    if (Math.abs(wx - bx) <= 9 / zoom && Math.abs(wy - by) <= 9 / zoom) {
      pending = null;
      path = findPath(player.x, player.y, hs[0].tx * TILE + 8, hs[0].ty * TILE + 12);
      boardPending = b;
      if (!path.length) { boardPending = null; openHomeBoard(b); }
      return;
    }
  }
  boardPending = null;
  // a tap on a place (or its label) walks there and opens it
  for (const p of PLACES) {
    if (Math.hypot(wx - placeX(p), wy - (placeY(p) - 16)) <= 12 / zoom) {
      path = findPath(player.x, player.y, placeX(p), placeY(p));
      pending = p;
      if (!path.length) activate(p);
      return;
    }
  }
  pending = null;
  path = findPath(player.x, player.y, wx, wy);
});

const keys = new Set<string>();

function leaveJob(): void {
  if (!job) return;
  if (job.step === 'paid') { job.advance(); return; }
  if (job.mission && !job.confirmLeave) {
    job.confirmLeave = true;
    job.feedback = `walk out? they call ah ming. -$${NO_SHOW_FEE}`;
    job.feedbackColour = '#ff6a6a';
    audio.play('bad');
    return;
  }
  const left = job;
  job = null;
  audio.play('door');
  if (left.mission) act('mission.leave');
  else flash(`left ${left.def.client}. the job is still there`);
}

window.addEventListener('keydown', (ev) => {
  audio.unlock();
  const k = ev.key;
  if (k === 'u' || k === 'U') { audio.toggleMute(); return; }
  if (mapView) {
    const mv = mapView;
    if (k === 'Escape' || k === 'm' || k === 'M') mapView = null;
    else if (k === 'Tab' || k === 'ArrowRight' || k === 'ArrowDown') { mv.sel = (mv.sel + 1) % mv.list.length; audio.play('ui'); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { mv.sel = (mv.sel - 1 + mv.list.length) % mv.list.length; audio.play('ui'); }
    else if (k === '1' || k === 'Enter') mapPick('taxi');
    else if (k === '2') mapPick('way');
    else if (k === '3') mapPick('cancel');
    ev.preventDefault();
    return;
  }
  if (state.jail) return;
  if (job) {
    if (k === 'Escape') { leaveJob(); ev.preventDefault(); return; }
    if (k === 'Enter' || k === ' ') {
      if (job.step === 'paid') job.advance();
      else if (job.step === 'typing') { job.timer = 99; job.update(1); }
      ev.preventDefault();
      return;
    }
    const n = ['1', '2', '3'].indexOf(k);
    if (n >= 0 && job.options[n]) job.choose(n);
    return;
  }
  if (ride) { if (k === 'Enter' || k === ' ' || k === 'Escape') { endRide(); ev.preventDefault(); } return; }
  if (quiz) {
    if (k === 'Enter' || k === ' ') { quiz.next(); ev.preventDefault(); return; }
    let n = ['1', '2', '3', '4'].indexOf(k);
    if (n < 0) n = ['a', 'b', 'c', 'd'].indexOf(k.toLowerCase());
    if (n >= 0) quiz.pick(n);
    return;
  }
  if (menu) {
    if (k === 'Escape') { closeMenu(); return; }
    const n = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(k);
    if (n >= 0) pickMenu(n);
    return;
  }
  if ((k === 'm' || k === 'M') && !menu && !quiz && !job && !ride && taxi?.state !== 'riding') { openMap(); return; }
  if (k === 'c' || k === 'C') {
    if (drive) stopDrive();
    else if (nearMyCar()) startDrive();
    else if (state.car) flash('your car is not here. walk to it first', '#9aa0b8');
    return;
  }
  if (drive && (k === 'e' || k === 'E' || k === 'Enter')) { stopDrive(); return; }
  if (k === 'e' || k === 'E' || k === 'Enter') {
    if (dialogue) dialogue = null;
    else if (near) activate(near);
    else { const b = homeBoardNear(); if (b !== null) openHomeBoard(b); }
    return;
  }
  if (k === 'Escape' || k === ' ') { if (dialogue) { dialogue = null; ev.preventDefault(); } return; }
  if (k === 'i' || k === 'I' || k === 'Tab') { openStatus(); ev.preventDefault(); return; }
  if (k === 'z' || k === 'Z') { toggleZoom(); return; }
  keys.add(k.toLowerCase());
  if (k.startsWith('Arrow')) ev.preventDefault();
});

window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));

// ----------------------------------------------------------------- update ---
function walkable(x: number, y: number): boolean { return !solidAt(x, y); }

function move(dx: number, dy: number): boolean {
  let moved = false;
  if (dx) {
    if (walkable(player.x + dx, player.y)) { player.x += dx; moved = true; }
    else if (!dy) moved = slide(dx, 0);
  }
  if (dy) {
    if (walkable(player.x, player.y + dy)) { player.y += dy; moved = true; }
    else if (!dx) moved = slide(0, dy) || moved;
  }
  return moved;
}

/**
 * Blocked walking straight at a corner or a door frame: if the way is open a few pixels to one
 * side, ease that way instead of stopping dead. This is what stops people snagging on edges.
 */
function slide(dx: number, dy: number): boolean {
  const step = Math.abs(dx || dy);
  for (let o = 1; o <= 9; o += 1) {
    for (const sgn of [1, -1]) {
      const ox = dy ? sgn * o : 0, oy = dx ? sgn * o : 0;
      if (!walkable(player.x + ox + dx, player.y + oy + dy)) continue;
      const mx = Math.sign(ox) * Math.min(step, o), my = Math.sign(oy) * Math.min(step, o);
      if (!walkable(player.x + mx, player.y + my)) continue;
      player.x += mx; player.y += my;
      return true;
    }
  }
  return false;
}

/** people stroll near the places that matter: the promenade, the market, the plaza, the college */
const WAYPOINTS: Array<[number, number]> = PLACES.map((p) => [p.tx, p.ty]);

function spawnWalkers(): void {
  const coats = ['#3b4a6b', '#6b3b4a', '#3b5a4a', '#8a6a3a', '#5a4a7a', '#7a7a7a', '#a84a3a'];
  for (let i = 0; i < 52; i += 1) {
    const [tx, ty] = WAYPOINTS[i % WAYPOINTS.length];
    walkers.push({ x: (tx + (i % 5) - 2) * TILE + 8, y: (ty + (i % 3) - 1) * TILE + 12, path: [], coat: coats[i % coats.length], frame: 0, facing: 1, wait: i * 0.7 });
  }
  // shoppers: they browse up and down the market lanes and stay there
  const bright = ['#e86a6a', '#f2c84a', '#6ab0e8', '#f2eee4', '#7ad08a', '#c08ae8', '#e8a060', '#4a4a5a'];
  for (let i = 0; i < 30 && MARKET_POINTS.length; i += 1) {
    const p = MARKET_POINTS[(i * 37) % MARKET_POINTS.length];
    walkers.push({ x: p.x, y: p.y + 6, path: [], coat: bright[i % bright.length], frame: 0, facing: i % 2 ? 1 : -1, wait: i * 0.4, shopper: true });
  }
  // Stanley Plaza: people on every floor, going between the shops and up and down the escalators
  for (let i = 0; i < 22 && PLAZA_POINTS.length; i += 1) {
    const p = PLAZA_POINTS[(i * 7) % PLAZA_POINTS.length];
    walkers.push({ x: p.x, y: p.y, path: [], coat: bright[(i + 3) % bright.length], frame: 0, facing: i % 2 ? 1 : -1, wait: i * 0.5, shopper: true, spots: PLAZA_POINTS });
  }
}

function updateWalkers(dt: number): void {
  for (const w of walkers) {
    if (!w.path.length) {
      w.wait -= dt;
      if (w.wait > 0) continue;
      // a short wander from where they stand (shoppers: to another stall nearby)
      let tx = 0, ty = 0;
      if (w.shopper) {
        const spots = w.spots ?? MARKET_POINTS;
        const near = w.spots ? spots : spots.filter((p) => Math.hypot(p.x - w.x, p.y - w.y) < 30 * TILE);
        const p = near[Math.floor(Math.random() * near.length)] ?? spots[0];
        w.path = findPath(w.x, w.y, p.x + (Math.random() - 0.5) * 24, p.y + (w.spots ? 0 : 6)).slice(0, w.spots ? 200 : 80);
        w.wait = 1.5 + Math.random() * 6; // stopping to look at the stalls
        continue;
      }
      // somewhere 40-300 m away, along the real footpaths; anyone far from you comes back near you
      const far = Math.hypot(w.x - player.x, w.y - player.y) > 600 * TILE;
      const ox = far ? player.x / TILE : w.x / TILE, oy = far ? player.y / TILE : w.y / TILE;
      for (let tries = 0; tries < 10; tries += 1) {
        const r = far ? 80 + Math.random() * 120 : 40 + Math.random() * 260, a = Math.random() * Math.PI * 2;
        tx = Math.floor(ox + Math.cos(a) * r);
        ty = Math.floor(oy + Math.sin(a) * r);
        if (walkableTile(tx, ty) && !drivableTile(tx, ty)) break;
      }
      if (far) { w.x = tx * TILE + 8; w.y = ty * TILE + 8; w.wait = 1; continue; }
      w.path = findPath(w.x, w.y, tx * TILE + 8, ty * TILE + 8);
      w.wait = 2 + Math.random() * 5;
      continue;
    }
    const t = w.path[0];
    const d = Math.hypot(t.x - w.x, t.y - w.y);
    if (d < 2) { w.path.shift(); continue; }
    const v = 34 * dt;
    w.x += ((t.x - w.x) / d) * v;
    w.y += ((t.y - w.y) / d) * v;
    if (Math.abs(t.x - w.x) > 0.5) w.facing = t.x > w.x ? 1 : -1;
    w.frame += dt * 6;
  }
}

let releaseAsk = false;
function update(dt: number): void {
  if (state.jail) {
    // the sentence is over: the rules let you out on the next tick (the server does it every few seconds)
    if (!jailed() && !releaseAsk) { releaseAsk = true; act('tick').then(() => { releaseAsk = false; }); }
    return;
  }
  // real time: solo, the rules run here every second; online, the school server ticks and pushes
  tickTimer += dt;
  if (tickTimer > 1) { tickTimer = 0; if (net.mode === 'solo') act('tick'); }
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

  updateWalkers(dt);
  updateOthers(dt);
  updateCars(dt);
  updateMinibuses(dt);
  updateTaxi(dt);
  if (ride) return;
  if (mapView) return;
  if (taxi?.state === 'riding') { near = null; return; }
  if (drive && !menu && !quiz && !job) { updateDrive(dt); near = null; return; }

  if (job) { job.update(dt); return; }
  if (quiz || menu) return;

  tickMissions(dt);
  wireTimer += dt;
  if (wireTimer > 6.5) {
    if (state.mission && !wireAlert) showWire(undefined, true);
    else {
      const list = [...news.slice(0, 4), ...WIRE];
      wireIndex = (wireIndex + 1) % list.length;
      showWire(list[wireIndex], false);
    }
  }
  if (wireX > 40) wireX = Math.max(40, wireX - (wireTimer < 0.9 ? 900 : 130) * dt);

  if (dialogue) { dialogue.shown = Math.min(dialogue.total, dialogue.shown + dt * 70); return; }

  let vx = 0;
  let vy = 0;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup')) vy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vy += 1;
  if (vx || vy) { path = []; pending = null; }

  if (!vx && !vy && path.length) {
    const t = path[0];
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    if (d < 2) {
      path.shift();
      if (!path.length && pending) { const p = pending; pending = null; activate(p); }
      if (!path.length && boardPending !== null) { const b = boardPending; boardPending = null; openHomeBoard(b); }
    } else { vx = (t.x - player.x) / d; vy = (t.y - player.y) / d; }
  }

  // on an escalator the steps carry you, whether or not you walk too (about 1.5 m/s, like a real one)
  const carry = escalatorAt(player.x, player.y);
  if (carry) {
    move(0, carry * 24 * dt);
    sendPos(player.x, player.y);
  }

  if (vx || vy) {
    const len = Math.hypot(vx, vy) || 1;
    const step = SPEED * (running || keys.has('shift') ? RUN : 1) * dt;
    let moved = move((vx / len) * step, (vy / len) * step);
    if (!moved && path.length) {
      // snagged on a corner while following a path: snap to the waypoint
      player.x = path[0].x; player.y = path[0].y; moved = true;
    }
    sendPos(player.x, player.y);
    if (vx) player.facing = vx > 0 ? 1 : -1;
    if (moved) {
      player.walked += step;
      player.frame = Math.floor(player.walked / 10) % 4;
      stepTimer += dt;
      if (stepTimer > 0.34) { stepTimer = 0; audio.play('step'); }
    }
  } else {
    player.frame = 0;
  }

  near = nearestPlace();
  if (guide && Math.hypot(player.x - guide.x, player.y - guide.y) < 3 * TILE) { flash(`you are at ${guide.label}`, '#7be08a'); guide = null; }
}

// ------------------------------------------------------------------- draw ---
function drawFigure(x: number, y: number, coat: string, frame: number, facing = 1): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const fs = figScale();
  ctx.scale(facing < 0 ? -fs : fs, fs);
  const swing = [0, 1, 0, -1][Math.floor(frame) % 4];
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
  ctx.fillRect(-5, 1, 11, 3); ctx.globalAlpha = 1;
  ctx.fillStyle = '#232436';
  ctx.fillRect(-3, -4, 3, 5 - Math.max(0, swing));
  ctx.fillRect(1, -4, 3, 5 + Math.min(0, swing));
  ctx.fillStyle = coat; ctx.fillRect(-4, -12, 8, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-4, -12, 2, 9);
  ctx.fillStyle = '#e8b58a'; ctx.fillRect(-3, -17, 6, 5);
  ctx.fillStyle = '#2a2b3a'; ctx.fillRect(-3, -18, 6, 2);
  ctx.restore();
}

function drawPlayer(alpha = 1): void {
  const x = Math.round(player.x - cam.x);
  const y = Math.round(player.y - cam.y);
  ctx.save();
  const fs = figScale();
  ctx.globalAlpha = 0.45 * alpha; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y + 1, 7 * fs / 1.5, 3 * fs / 1.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(player.facing < 0 ? -fs : fs, fs);
  const swing = [0, 1, 0, -1][player.frame];
  ctx.fillStyle = '#343a54';
  ctx.fillRect(-3, -5, 3, 5 - Math.max(0, swing));
  ctx.fillRect(1, -5, 3, 5 + Math.min(0, swing));
  // your coat: the colour everyone else on the server sees you in
  ctx.fillStyle = net.me.coat; ctx.fillRect(-4, -13, 9, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2, -13, 3, 9);
  ctx.fillStyle = '#f2bd8d'; ctx.fillRect(-4, -18, 8, 5);
  ctx.fillStyle = '#141520'; ctx.fillRect(-4, -20, 8, 3);
  ctx.fillRect(1, -16, 1, 1);
  ctx.fillStyle = '#c8a24a'; ctx.fillRect(-6, -11, 3, 5);
  ctx.restore();
}

function drawMarker(x: number, y: number, m: NonNullable<Marker>): void {
  const bob = Math.round(Math.sin(performance.now() / 320) * 2);
  const w = Math.max(11, tw(m.label) + 5);
  ctx.fillStyle = 'rgba(8,10,18,0.9)'; ctx.fillRect(x - w / 2, y - 12 + bob, w, 12);
  ctx.fillStyle = m.colour; ctx.fillRect(x - w / 2, y - 1 + bob, w, 1);
  text(m.label, x - tw(m.label) / 2 + 0.5, y - 10 + bob, m.colour);
}

function drawHud(): void {
  ctx.fillStyle = 'rgba(8,10,18,0.92)'; ctx.fillRect(0, 0, W, 15);
  const alert = wireAlert && !!state.mission;
  const tag = alert ? '#ff4a5f' : '#5ce08a';
  ctx.fillStyle = tag; ctx.fillRect(0, 14, W, 1);
  ctx.fillStyle = tag; ctx.fillRect(0, 0, 34, 14);
  text(alert ? 'alert' : 'wire', alert ? 2 : 6, 3, '#08110c');
  ctx.save();
  ctx.beginPath(); ctx.rect(36, 0, W - 44, 15); ctx.clip();
  text(alert ? missionHeadline() : wireText, wireX, 3, alert ? '#ffb3bc' : '#dfe4f2');
  ctx.restore();

  ctx.fillStyle = 'rgba(8,10,18,0.78)'; ctx.fillRect(0, 15, W, 20);
  text(areaName(), 8, 21, '#9aa0b8');
  const w = state.work;
  if (w && w.tasks.length) {
    const e = employer(w.id)!;
    const age = now() - w.tasks[0];
    const danger = age >= fireAfter(e) / 2;
    text(`work ${w.tasks.length}`, 196, 21, danger ? '#ff6a6a' : '#7ab8ff');
  }
  textRight(`day ${state.day} ${clock()}`, 462, 21, '#ffffff');
  ctx.fillStyle = '#ffc84a'; ctx.fillRect(472, 22, 5, 5);
  text(money(state.money), 482, 21, '#ffc84a');
  const pips = Math.max(0, Math.min(5, Math.round(state.energy)));
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < pips ? '#5ce08a' : '#243026';
    ctx.fillRect(570 + i * 8, 23, 6, 6);
  }
  ctx.fillStyle = '#232a3a'; ctx.fillRect(618, 18, 16, 14);
  text('i', 623, 21, '#46e0e6');
  if (audio.muted) text('u', 560, 21, '#6f7688');
}

/** 'show me the way': an arrow at the edge of the screen pointing to the target, with the distance */
function drawGuide(): void {
  if (!guide) return;
  const sx = (guide.x - cam.x) * zoom, sy = (guide.y - cam.y) * zoom;
  const px = ((drive ? drive.x : player.x) - cam.x) * zoom, py = ((drive ? drive.y : player.y) - cam.y) * zoom;
  const ang = Math.atan2(sy - py, sx - px);
  const m = Math.round(Math.hypot(guide.x - player.x, guide.y - player.y) / TILE);
  const onScreen = sx > 20 && sx < W - 20 && sy > 50 && sy < H - 40;
  const ax = onScreen ? sx : Math.max(30, Math.min(W - 30, px + Math.cos(ang) * 400));
  const ay = onScreen ? sy - 18 : Math.max(60, Math.min(H - 50, py + Math.sin(ang) * 400));
  ctx.save();
  ctx.translate(Math.round(ax), Math.round(ay));
  ctx.rotate(onScreen ? Math.PI / 2 : ang);
  ctx.fillStyle = '#ffc84a';
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
  const label = `${guide.label} ${m} m`;
  const lx = Math.max(4, Math.min(W - tw(label) - 4, Math.round(ax - tw(label) / 2)));
  ctx.fillStyle = 'rgba(8,10,18,0.85)'; ctx.fillRect(lx - 3, Math.round(ay) + 11, tw(label) + 6, 11);
  text(label, lx, Math.round(ay) + 12, '#ffc84a');
}

/** colour per kind of place, for the entrance pads and labels */
const KIND_COLOUR: Partial<Record<Place['kind'], string>> = {
  job: '#ffc84a', employer: '#ffc84a', shop: '#7be08a', pirate: '#d8a0ff', minibus: '#46d07a', bus: '#ff9a4a',
  library: '#9ad0ff', course: '#c8a0ff', police: '#6aa0ff', prison: '#ff6a6a', board: '#ffe28a', offer: '#d8a0ff',
  flavour: '#e8e4d8', lift: '#7ab0d8', agency: '#7be0b0', motors: '#ffb07a',
};
const KIND_ICON: Partial<Record<Place['kind'], string>> = {
  job: '!', employer: 'w', shop: '$', pirate: '?', minibus: 'm', bus: 'b', library: '#', course: '+', police: 'p',
  prison: 'x', board: 'n', offer: '?', flavour: 'i', lift: 'l', agency: 'h', motors: 'c',
};

/** a green minibus stop: a pole and the green-and-white sign with its route numbers */
function drawStopSign(p: Place): void {
  const x = Math.round(placeX(p) - cam.x) + 14, y = Math.round(placeY(p) - cam.y);
  const nos = routesAt(p.id).map((r) => r.no).join(' ');
  const w = Math.max(18, tw(nos) + 6);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 1, y - 1, 6, 3);
  ctx.fillStyle = '#c8ccd4'; ctx.fillRect(x, y - 30, 2, 30);
  ctx.fillStyle = '#1f6e3a'; ctx.fillRect(x - w / 2 + 1, y - 46, w, 16);
  ctx.fillStyle = '#f2eee4'; ctx.fillRect(x - w / 2 + 2, y - 45, w - 2, 5);
  ctx.fillStyle = '#1f6e3a'; ctx.fillRect(x - w / 2 + 4, y - 44, w - 6, 3);
  text(nos, x + 1 - tw(nos) / 2, y - 39, '#ffffff');
}

function drawCity(): void {
  const VW = viewW(), VH = viewH();
  const inTaxi = taxi?.state === 'riding';
  const fx = ride ? ride.x : drive ? drive.x : inTaxi ? taxi!.x : player.x, fy = ride ? ride.y : drive ? drive.y : inTaxi ? taxi!.y : player.y;
  cam.x = Math.max(0, Math.min(MAP_W * TILE - VW, Math.round(fx - VW / 2)));
  cam.y = Math.max(-35 / zoom, Math.min(MAP_H * TILE - VH + 28 / zoom, Math.round(fy - VH / 2)));
  // keep the camera on whole canvas pixels so the art does not shimmer
  cam.x = Math.round(cam.x * zoom * PXR) / (zoom * PXR); cam.y = Math.round(cam.y * zoom * PXR) / (zoom * PXR);
  ctx.fillStyle = '#2a5f86'; ctx.fillRect(0, 0, W, H);
  const t = performance.now() / 1000;

  // ---- everything in world pixels, scaled by the zoom
  ctx.save();
  ctx.scale(zoom, zoom);
  drawWorld(ctx, cam.x, cam.y, VW, VH);

  // sea glints, stable for half a second at a time so they twinkle rather than flicker
  const tick = Math.floor(t * 2);
  ctx.fillStyle = 'rgba(230,245,255,0.55)';
  for (let i = 0; i < 140; i += 1) {
    const h = ((i * 7919 + tick * 104729) % 100003) / 100003;
    const h2 = ((i * 15485863 + tick * 32452843) % 100019) / 100019;
    const wx = cam.x + h * VW, wy = cam.y + h2 * VH;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (isSea(tx, ty)) ctx.fillRect(Math.round(wx - cam.x), Math.round(wy - cam.y), 6, 2);
  }

  // escalator steps, moving: down on the west lane, up on the east
  for (const e of ESCALATORS) {
    const ex = e.x * TILE - cam.x, top = (e.y0 + 1.2) * TILE - cam.y, bot = (e.y1 - 1.2) * TILE - cam.y;
    if (ex < -100 || ex > VW + 100 || bot < -50 || top > VH + 50) continue;
    const lw = (e.w / 2 - 0.75) * TILE;
    const lanes: Array<[number, number]> = [[(e.x - e.w / 2 + 0.45) * TILE - cam.x, 1], [(e.x + 0.3) * TILE - cam.x, -1]];
    const off = (t * 24) % 6.4;
    for (const [lx, dir] of lanes) {
      ctx.fillStyle = 'rgba(40,44,54,0.8)';
      for (let y = top + (dir > 0 ? off : 6.4 - off); y < bot; y += 6.4) ctx.fillRect(Math.round(lx + 2), Math.round(y), Math.round(lw - 4), 2);
    }
  }

  // the bus at the terminus
  const bay = terminusBay();
  if (bay) {
    ctx.save(); ctx.translate(Math.round(bay.x - cam.x), Math.round(bay.y - cam.y)); ctx.rotate(bay.angle);
    // a double-decker from above (12 m x 2.5 m): yellow body, white roof, front to +x
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-91, -15, 192, 40);
    ctx.fillStyle = '#b8901a'; ctx.fillRect(-96, -20, 192, 40); // body edge
    ctx.fillStyle = '#e8c23a'; ctx.fillRect(-95, -19, 190, 38);
    ctx.fillStyle = '#c8323c'; ctx.fillRect(-95, -19, 190, 2); ctx.fillRect(-95, 17, 190, 2); // red side band, just showing
    ctx.fillStyle = '#f2eee2'; ctx.fillRect(-88, -15, 170, 30); // roof
    ctx.fillStyle = '#dcd8cc'; ctx.fillRect(-88, -15, 170, 2);
    ctx.fillStyle = '#1c2a3a'; ctx.fillRect(82, -17, 12, 34); // front windscreen, top deck curving down
    ctx.fillStyle = '#3a5a7a'; ctx.fillRect(84, -14, 3, 28);
    ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-82, -11, 22, 22); // air conditioning pod at the back
    ctx.fillStyle = '#7a8088'; for (let i = -80; i < -62; i += 4) ctx.fillRect(i, -9, 2, 18);
    ctx.fillStyle = '#c8c4b8'; ctx.fillRect(-30, -6, 12, 12); ctx.fillRect(30, -6, 12, 12); // roof hatches
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(-96, -14, 2, 28); // rear
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(90, -23, 4, 3); ctx.fillRect(90, 20, 4, 3); // mirrors
    ctx.restore();
    // the route number on the roof, upright so it reads, like the minibuses'
    const bsx = Math.round(bay.x - cam.x), bsy = Math.round(bay.y - cam.y);
    ctx.fillStyle = '#e8c23a'; ctx.fillRect(bsx - 10, bsy - 6, 20, 12);
    text('6', bsx - tw('6') / 2, bsy - 4, '#c8323c');
  }

  for (const c of cars) if (c.x >= 0) drawCar(c.x, c.y, c.angle, c.model, c.colour);

  // players' cars: yours where you parked it (or under you), everyone else's from the server
  for (const [id, c] of net.cars) if (id !== net.me.id) drawCar(c.x, c.y, c.angle, c.model, c.coat);
  if (state.car && !drive) drawCar(state.car.x, state.car.y, state.car.angle, state.car.model, net.me.coat);
  if (drive && state.car) drawCar(drive.x, drive.y, drive.angle, state.car.model, net.me.coat);

  // home boards by the front doors: green for sale, blue yours, grey sold
  for (const hs of HOMES_AT.values()) {
    const h0 = hs[0];
    const x = h0.tx * TILE + 8 + 14 - cam.x, y = h0.ty * TILE - cam.y;
    if (x < -20 || y < -30 || x > VW + 20 || y > VH + 20) continue;
    const yours = hs.some((h) => mine(h.id)), free = hs.some((h) => !mine(h.id) && !ownerOf(h.id));
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(x) + 1, Math.round(y) - 1, 4, 2);
    ctx.fillStyle = '#6a6f78'; ctx.fillRect(Math.round(x), Math.round(y) - 12, 2, 12);
    ctx.fillStyle = yours ? '#3a8ae8' : free ? '#2f9a52' : '#7a7f88'; ctx.fillRect(Math.round(x) - 6, Math.round(y) - 20, 14, 9);
    ctx.fillStyle = '#f2eee4'; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 17, 10, 1); ctx.fillRect(Math.round(x) - 4, Math.round(y) - 15, 7, 1);
  }

  // signal heads at the three signal-controlled crossings: red, amber, green for vehicles; the red
  // and green man for people
  for (const c of CROSSINGS) {
    if (c.x * TILE < cam.x - 60 || c.x * TILE > cam.x + VW + 60 || c.y * TILE < cam.y - 60 || c.y * TILE > cam.y + VH + 60) continue;
    const light = vehicleAspect(c, clockSecs), wa = walkAspect(c, clockSecs);
    const walk = wa === 'walk' || (wa === 'flash' && Math.floor(clockSecs * 2.5) % 2 === 0);
    for (const [ref, lx, ly] of c.lights) {
      const x = Math.round(lx * TILE - cam.x), y = Math.round(ly * TILE - cam.y);
      if (ref === 'PBUTT') { ctx.fillStyle = '#2d3136'; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = '#e8c23a'; ctx.fillRect(x - 1, y - 1, 2, 2); continue; }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 2, y + 2, 6, 3);
      ctx.fillStyle = '#5e646a'; ctx.fillRect(x - 1, y - 16, 2, 16);
      if (ref.startsWith('S')) {
        ctx.fillStyle = '#1e2226'; ctx.fillRect(x - 4, y - 30, 8, 18);
        ctx.fillStyle = '#e8c23a'; ctx.fillRect(x - 5, y - 31, 10, 1); ctx.fillRect(x - 5, y - 13, 10, 1); // the yellow edge of the backing board
        ctx.fillStyle = light === 'red' || light === 'redamber' ? '#ff3a2a' : '#4a1a16'; ctx.fillRect(x - 2, y - 28, 4, 4);
        ctx.fillStyle = light === 'amber' || light === 'redamber' ? '#ffb020' : '#4a3a16'; ctx.fillRect(x - 2, y - 23, 4, 4);
        ctx.fillStyle = light === 'green' ? '#3aff6a' : '#163a20'; ctx.fillRect(x - 2, y - 18, 4, 4);
      } else {
        ctx.fillStyle = '#1e2226'; ctx.fillRect(x - 4, y - 26, 8, 12);
        ctx.fillStyle = wa === 'stop' ? '#ff3a2a' : walk ? '#3aff6a' : '#163a20';
        // a little figure: walking when green, standing when red
        ctx.fillRect(x - 1, y - 24, 2, 2); ctx.fillRect(x - 1, y - 22, 2, 4);
        if (wa !== 'stop') { ctx.fillRect(x - 2, y - 18, 1, 2); ctx.fillRect(x + 1, y - 18, 1, 2); } else ctx.fillRect(x - 1, y - 18, 2, 2);
      }
    }
  }
  // a zebra's beacons: a yellow globe on a black-and-white post, flashing about once a second
  const beaconOn = Math.floor(clockSecs * 1.6) % 2 === 0;
  for (const [bx, by] of ROADS.beacons) {
    const x = Math.round(bx * TILE - cam.x), y = Math.round(by * TILE - cam.y);
    if (x < -30 || y < -40 || x > VW + 30 || y > VH + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 1, y + 1, 6, 3);
    for (let i = 0; i < 6; i += 1) { ctx.fillStyle = i % 2 ? '#f2f2ee' : '#1e2226'; ctx.fillRect(x - 1, y - 3 - i * 3, 3, 3); }
    if (beaconOn) { ctx.fillStyle = 'rgba(255,200,40,0.28)'; ctx.fillRect(x - 6, y - 32, 13, 13); }
    ctx.fillStyle = beaconOn ? '#ffc21e' : '#b8861a'; ctx.fillRect(x - 3, y - 30, 7, 9); ctx.fillRect(x - 4, y - 28, 9, 5);
    ctx.fillStyle = beaconOn ? '#fff2b0' : '#d8a840'; ctx.fillRect(x - 2, y - 29, 2, 2);
  }

  for (const sh of shuttles) drawMinibus(sh.x, sh.y, sh.angle, sh.route.no);
  if (taxi) drawTaxi(taxi);
  if (ride) drawMinibus(ride.x, ride.y, ride.angle, ride.route.no);

  // entrances: a glowing pad on the ground at every place you can use, pulsing gently
  const pulse = 0.55 + 0.25 * Math.sin(t * 3);
  for (const p of PLACES) {
    const x = Math.round(placeX(p) - cam.x), y = Math.round(placeY(p) - cam.y);
    if (x < -40 || y < -40 || x > VW + 40 || y > VH + 40) continue;
    const col = KIND_COLOUR[p.kind] ?? '#e8e4d8';
    ctx.globalAlpha = 0.28 * pulse; ctx.fillStyle = col; ctx.fillRect(x - 14, y - 8, 28, 12);
    ctx.globalAlpha = pulse; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x - 13, y - 7, 26, 10);
    // a chevron pointing in, towards the door
    ctx.fillStyle = col;
    ctx.fillRect(x - 4, y - 14, 2, 2); ctx.fillRect(x + 2, y - 14, 2, 2); ctx.fillRect(x - 2, y - 16, 4, 2);
    ctx.globalAlpha = 1;
    if (p.kind === 'minibus') drawStopSign(p);
  }

  // the notice board in the market bazaar
  {
    const b = PLACES.find((p) => p.id === 'board')!;
    const bx2 = Math.round(placeX(b) - cam.x) - 20, by2 = Math.round(placeY(b) - cam.y) - 44;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx2 + 3, by2 + 34, 42, 4);
    ctx.fillStyle = '#4a3226'; ctx.fillRect(bx2 + 4, by2 + 22, 3, 14); ctx.fillRect(bx2 + 33, by2 + 22, 3, 14);
    ctx.fillStyle = '#5a3e2a'; ctx.fillRect(bx2, by2, 40, 24);
    ctx.fillStyle = '#b8864a'; ctx.fillRect(bx2 + 2, by2 + 2, 36, 19);
    ['#f2eee4', '#ffe28a', '#a8d8ff', '#f2eee4', '#ffb0b0'].forEach((c2, i) => { ctx.fillStyle = c2; ctx.fillRect(bx2 + 4 + i * 7, by2 + 4 + (i % 2) * 4, 5, 7); });
  }

  // people, sorted by depth with the player
  type Sprite = { y: number; draw: () => void };
  const sprites: Sprite[] = walkers
    .filter((w) => w.x > cam.x - 60 && w.x < cam.x + VW + 60 && w.y > cam.y - 60 && w.y < cam.y + VH + 60)
    .map((w) => ({ y: w.y, draw: () => drawFigure(w.x - cam.x, w.y - cam.y, w.coat, w.frame, w.facing) }));
  for (const p of PLACES) {
    if (!p.person || (p.kind === 'offer' && state.declined)) continue;
    sprites.push({ y: placeY(p) - 10, draw: () => drawFigure(placeX(p) - cam.x + 10, placeY(p) - cam.y - 10, p.person!, 0, -1) });
  }
  // other players, in their own coat colour, with their name over them
  for (const [id, o] of net.others) {
    if (net.cars.get(id)?.driving) continue; // in their car
    if (o.x < cam.x - 60 || o.x > cam.x + VW + 60 || o.y < cam.y - 60 || o.y > cam.y + VH + 60) continue;
    sprites.push({ y: o.y, draw: () => drawFigure(o.x - cam.x, o.y - cam.y, o.coat, o.frame, o.facing) });
  }
  if (!ride && !drive && !inTaxi) sprites.push({ y: player.y, draw: () => drawPlayer() });
  // anyone standing behind a building (on the ground its picture covers) is hidden by it: the
  // building joins the depth sort at its front edge, so people in front still stand in front
  const feet: Array<[number, number]> = walkers.map((w) => [w.x, w.y]);
  if (!ride) feet.push([player.x, player.y]);
  const over = new Set<ReturnType<typeof buildingsNear>[number]>();
  let playerBehind = false;
  const nearB = buildingsNear(cam.x - 40, cam.y - 40, cam.x + VW + 40, cam.y + VH + 200);
  for (const [fx, fy] of feet) {
    if (fx < cam.x - 40 || fx > cam.x + VW + 40 || fy < cam.y - 40 || fy > cam.y + VH + 200) continue;
    for (const B of nearB) {
      if (behindBuilding(B, fx, fy)) { over.add(B); if (fx === player.x && fy === player.y) playerBehind = true; }
    }
  }
  for (const B of over) {
    sprites.push({ y: B.y1 * TILE - 0.5, draw: () => { ctx.save(); ctx.translate(-cam.x, -cam.y); drawBuildingOver(ctx, B); ctx.restore(); } });
  }
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());
  // behind a building, you still see yourself: a faint outline through it
  if (playerBehind && !ride) { drawPlayer(0.4); ctx.globalAlpha = 1; }

  if (path.length) {
    const last = path[path.length - 1];
    ctx.strokeStyle = 'rgba(70,224,230,0.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(last.x - cam.x) - 9, Math.round(last.y - cam.y) - 9, 18, 12);
  }
  ctx.restore();

  // ---- labels at screen size, so they stay readable however far out we are
  const S = (wx: number): number => Math.round((wx - cam.x) * zoom);
  const T = (wy: number): number => Math.round((wy - cam.y) * zoom);
  const taken: Rect[] = [];
  const free = (r: Rect): boolean => !taken.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
  for (const [id, o] of net.others) {
    if (net.cars.get(id)?.driving) continue;
    const x = S(o.x), y = T(o.y) - Math.round(28 * figScale() * zoom) - 4;
    if (x < -40 || x > W + 40 || y < -10 || y > H + 10) continue;
    const w = tw(o.name) + 6;
    ctx.fillStyle = 'rgba(8,10,18,0.8)'; ctx.fillRect(x - w / 2, y - 1, w, 10);
    ctx.fillStyle = o.coat; ctx.fillRect(x - w / 2, y + 9, w, 1);
    text(o.name, x - w / 2 + 3, y + 1, '#ffffff');
    taken.push({ x: x - w / 2, y: y - 1, w, h: 11 });
  }
  // places first: a chip with the icon and the name, in the place's colour
  for (const p of PLACES) {
    const x = S(placeX(p)), y = T(placeY(p)) - Math.round(20 * zoom) - 12;
    if (x < -60 || y < -20 || x > W + 60 || y > H + 20) continue;
    const m = markerFor(p);
    if (m) { drawMarker(x, y - 2, m); taken.push({ x: x - 8, y: y - 14, w: 16, h: 14 }); continue; }
    const col = KIND_COLOUR[p.kind] ?? '#e8e4d8';
    const label = zoom < 1 && p.name.length > 22 ? `${p.name.slice(0, 21)}.` : p.name;
    const w = tw(label) + 18;
    const r = { x: x - w / 2, y: y - 10, w, h: 11 };
    if (!free(r)) {
      // crowded: just the icon
      const ri = { x: x - 5, y: y - 10, w: 11, h: 11 };
      if (!free(ri)) continue;
      ctx.fillStyle = 'rgba(8,10,18,0.85)'; ctx.fillRect(ri.x, ri.y, ri.w, ri.h);
      text(KIND_ICON[p.kind] ?? 'i', ri.x + 3, ri.y + 2, col);
      taken.push(ri);
      continue;
    }
    ctx.fillStyle = 'rgba(8,10,18,0.85)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = col; ctx.fillRect(r.x, r.y, 11, r.h);
    text(KIND_ICON[p.kind] ?? 'i', r.x + 3, r.y + 2, '#08110c');
    text(label, r.x + 14, r.y + 2, '#f2eee4');
    taken.push(r);
  }
  // then landmark name plates, where there is room
  for (const l of BUILDING_LABELS) {
    const x = S(l.x * TILE), y = T(l.y * TILE);
    if (x < -80 || y < -10 || x > W + 80 || y > H + 10) continue;
    const w = tw(l.text) + 8;
    const r = { x: x - w / 2, y: y - 5, w, h: 10 };
    if (!free(r)) continue;
    ctx.fillStyle = '#2a2420'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    ctx.fillStyle = '#f8f4e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
    text(l.text, r.x + 4, r.y + 2, '#2a2a30');
    taken.push(r);
  }

  // evening and night: a cool grade, deeper after dark
  const m = state.minutes;
  const dark = m >= 19 * 60 || m < 6 * 60 ? 0.38 : m >= 17 * 60 ? ((m - 17 * 60) / 120) * 0.38 : 0;
  if (dark > 0) { ctx.fillStyle = `rgba(14,20,52,${dark.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }

  drawHud();
  drawMinimap();
  drawGuide();

  // prompt line
  ctx.fillStyle = '#0a0c14'; ctx.fillRect(0, 332, W, 28);
  ctx.fillStyle = '#232a3a'; ctx.fillRect(0, 332, W, 1);
  const board = !ride && !drive && !near ? homeBoardNear() : null;
  if (ride) {
    text(`on the gmb ${ride.route.no} to ${ride.to.name}`, 8, 342, '#7be08a');
    text('tap to get off at your stop', 330, 342, '#6f7688');
  } else if (taxi?.state === 'riding') {
    text(`taxi to ${taxi.to?.name ?? ''}`, 8, 342, '#ffc84a');
    textRight(`meter ${money(taxiFare(taxiPicked))}  ${(taxiPicked / 1000).toFixed(1)} km`, 500, 342, '#ffc84a');
  } else if (drive) {
    const kmh = Math.round((Math.abs(drive.speed) / TILE) * 3.6);
    text(`driving - ${kmh} km/h`, 8, 342, '#7be08a');
    text('arrows steer   tap to go somewhere   c park', 190, 342, '#6f7688');
  } else if (board !== null) {
    const hs = HOMES_AT.get(board)!;
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(8, 339, 13, 14);
    text('e', 12, 342, '#08110c');
    const label = hs.length > 1 ? hs[0].name.replace(/^flat [0-9]+[a-f], /, '') : hs[0].name;
    text(label, 27, 342, '#ffffff');
    const free = hs.filter((h) => !mine(h.id) && !ownerOf(h.id)).length;
    text(`(${hs.some((h) => mine(h.id)) ? 'yours' : free ? `${free} for sale from ${money(hs.find((h) => !mine(h.id) && !ownerOf(h.id))!.price)}` : 'sold'})`, 33 + tw(label), 342, '#9aa0b8');
  } else if (near) {
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(8, 339, 13, 14);
    text('e', 12, 342, '#08110c');
    text(near.name, 27, 342, '#ffffff');
    const after = 27 + tw(near.name) + 6;
    const j = jobAt(near);
    if (j?.mission && state.mission) text(`(callout $${j.def.pay * MISSION_PAY} - ${Math.max(0, Math.ceil((state.mission.until - now()) / 1000))}s)`, after, 342, '#ff4a5f');
    else if (j) text(`(job $${j.def.pay})`, after, 342, '#ffc84a');
    else text(`(${({ minibus: 'ride', board: 'gigs', shop: 'buy gear', pirate: 'a man with discs', employer: 'work', library: 'study', course: 'courses', police: 'your record', prison: 'stay out', flavour: 'look', offer: 'a man in a cap', bus: 'go home', job: 'shop', lift: 'pick a floor', agency: 'homes for sale', motors: 'cars' } as Record<string, string>)[near.kind]})`, after, 342, '#9aa0b8');
  } else {
    text(nearMyCar() ? 'c drive your car   wasd / tap to walk   e use   m map' : 'wasd / tap to walk   shift run   e use   i status   m map', 8, 342, nearMyCar() ? '#7be08a' : '#6f7688');
  }
  ctx.fillStyle = '#232a3a'; ctx.fillRect(zoomRect.x, zoomRect.y, zoomRect.w, zoomRect.h);
  const zl = zoom < 1 ? 'zoom in' : 'zoom out';
  text(zl, zoomRect.x + (zoomRect.w - tw(zl)) / 2, zoomRect.y + 7, '#9aa0b8');
  ctx.fillStyle = running ? '#46e0e6' : '#232a3a'; ctx.fillRect(runRect.x, runRect.y, runRect.w, runRect.h);
  text(running ? 'running' : 'walk', runRect.x + (runRect.w - tw(running ? 'running' : 'walk')) / 2, runRect.y + 7, running ? '#08110c' : '#9aa0b8');

  if (toast && !dialogue) {
    const w = Math.min(W - 20, tw(toast.text) + 20);
    ctx.globalAlpha = Math.min(1, toast.t * 2);
    ctx.fillStyle = 'rgba(8,10,18,0.95)'; ctx.fillRect((W - w) / 2, 304, w, 20);
    ctx.fillStyle = toast.colour; ctx.fillRect((W - w) / 2, 304, w, 1);
    text(toast.text, (W - w) / 2 + 10, 310, toast.colour);
    ctx.globalAlpha = 1;
  }

  if (dialogue) {
    const h = 26 + dialogue.lines.length * 12;
    const y0 = 326 - h;
    ctx.fillStyle = 'rgba(8,10,18,0.95)'; ctx.fillRect(16, y0, 608, h);
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(16, y0, 608, 1);
    text(dialogue.title, 26, y0 + 7, '#ffc84a');
    let left = Math.floor(dialogue.shown);
    dialogue.lines.forEach((l, i) => {
      text(l.slice(0, Math.max(0, left)), 26, y0 + 21 + i * 12, '#dfe4f2');
      left -= l.length;
    });
  }
}

function drawMenu(): void {
  if (!menu) return;
  ctx.fillStyle = 'rgba(6,8,14,0.72)'; ctx.fillRect(0, 0, W, H);
  const { top, rows } = menuLayout(menu);
  const bottom = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h + 22 : top + 60;
  ctx.fillStyle = '#121722'; ctx.fillRect(MENU_X, top, MENU_W, bottom - top);
  ctx.fillStyle = '#46e0e6'; ctx.fillRect(MENU_X, top, MENU_W, 1);
  text(menu.title, MENU_X + 12, top + 10, '#ffc84a');
  wrap(menu.line, 88).forEach((l, i) => prose(l, MENU_X + 12, top + 26 + i * 10, '#c8ccdc'));
  menu.items.forEach((it, i) => {
    const r = rows[i];
    ctx.globalAlpha = it.off && it.act ? 0.5 : 1;
    ctx.fillStyle = it.off ? 'rgba(18,20,28,0.9)' : 'rgba(28,34,48,0.98)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (!it.off) { ctx.strokeStyle = '#3a4054'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
    const labelColour = it.off && !it.colour ? '#6f7688' : it.colour ?? '#e8e8f0';
    if (!it.off || it.act) text(`${i + 1}`, r.x + 8, r.y + 7, '#46e0e6');
    text(it.label, r.x + 24, r.y + 7, labelColour);
    if (it.right) textRight(it.right, r.x + r.w - 8, r.y + 7, it.off ? '#6f7688' : '#ffc84a');
    if (it.sub) prose(it.sub.length > 92 ? `${it.sub.slice(0, 89)}...` : it.sub, r.x + 24, r.y + 18, '#8a90a8');
    ctx.globalAlpha = 1;
  });
  text('esc / tap a row', MENU_X + 12, bottom - 14, '#5b6379');
}

function quizLayout(): { qLines: string[]; optTop: number } {
  const p = quiz!.current;
  const qLines = wrap(p.q, 96);
  return { qLines, optTop: Math.max(112, 58 + qLines.length * 11 + 10) };
}

function drawQuiz(): void {
  const qz = quiz!;
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#121722'; ctx.fillRect(0, 0, W, 38);
  ctx.fillStyle = qz.tier === 'dse' ? '#ffc84a' : '#7be0d0'; ctx.fillRect(0, 37, W, 1);
  const badge = qz.tier === 'dse' ? 'dse' : 'junior';
  ctx.fillStyle = qz.tier === 'dse' ? '#ffc84a' : '#7be0d0'; ctx.fillRect(12, 8, tw(badge) + 8, 12);
  text(badge, 16, 10, '#0d1018');
  text(qz.title, 24 + tw(badge), 10, '#ffffff');
  prose(qz.sub, 12, 25, '#8a90a8');

  if (qz.summary) {
    text('done', 24, 70, qz.summaryColour, 3);
    qz.summary.forEach((l, i) => prose(l, 24, 118 + i * 16, i === 0 ? '#ffffff' : '#c8ccdc'));
    ctx.fillStyle = '#232a3a'; ctx.fillRect(24, 300, 592, 1);
    text('[enter] or tap to continue', 24, 314, '#46e0e6');
    return;
  }

  const p = qz.current;
  textRight(`${qz.i + 1} / ${qz.qs.length}`, 628, 10, '#9aa0b8');
  textRight(`f${p.form} - ${TOPIC_NAMES[p.topic]}`, 628, 25, '#6f7688');
  const { qLines, optTop } = quizLayout();
  qLines.forEach((l, i) => prose(l, 24, 50 + i * 11, l.startsWith(' ') ? '#7be08a' : '#ffffff'));

  p.options.forEach((o, i) => {
    const r = quizOptionRect(i);
    let fill = 'rgba(28,34,48,0.98)';
    let edge = '#3a4054';
    if (qz.picked !== null) {
      if (i === qz.answer) { fill = 'rgba(30,70,44,0.98)'; edge = '#7be08a'; }
      else if (i === qz.picked) { fill = 'rgba(80,28,32,0.98)'; edge = '#ff6a6a'; }
    }
    ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = edge; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(LETTERS[i], r.x + 9, r.y + 9, '#46e0e6');
    prose(o, r.x + 26, r.y + 9, '#e8e8f0');
  });

  if (qz.picked !== null) {
    const ok = qz.picked === qz.answer;
    const y = optTop + 4 * 30 + 6;
    text(ok ? 'right' : `wrong - the answer is ${LETTERS[qz.answer]}`, 24, y, ok ? '#7be08a' : '#ff6a6a');
    wrap(qz.why, 98).forEach((l, i) => prose(l, 24, y + 14 + i * 11, '#c8ccdc'));
    const r = quizNextRect;
    ctx.fillStyle = 'rgba(28,34,48,0.98)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#46e0e6'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    const label = qz.i + 1 < qz.qs.length ? '[enter] next' : '[enter] finish';
    text(label, r.x + (r.w - tw(label)) / 2, r.y + 8, '#46e0e6');
  } else {
    text('a-d or 1-4 to answer, or tap', 24, 336, '#6f7688');
  }
}

function drawJob(): void {
  if (!job) return;
  ctx.fillStyle = '#171310'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(31,26,21,0.55)'; ctx.fillRect(0, y, W, 4); }

  const lamp = ctx.createRadialGradient(320, 30, 10, 320, 120, 320);
  lamp.addColorStop(0, 'rgba(255,196,110,0.20)');
  lamp.addColorStop(1, 'rgba(255,196,110,0)');
  ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, 300);

  ctx.fillStyle = '#3a2a1e'; ctx.fillRect(0, 286, W, 74);
  ctx.fillStyle = '#6b4c33'; ctx.fillRect(0, 286, W, 3);
  ctx.fillStyle = 'rgba(20,14,10,0.55)';
  for (let x = 0; x < W; x += 26) ctx.fillRect(x, 290, 1, 70);

  const rx = 36, ry = 246;
  drawProp(job.def.prop, rx, ry);
  ctx.strokeStyle = '#2a2f3c'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx + { router: 84, printer: 76, terminal: 62 }[job.def.prop], ry + 20);
  ctx.lineTo(196, ry + 24);
  ctx.lineTo(250, ry + 4);
  ctx.stroke();
  ctx.lineWidth = 1;

  if (job.def.note) {
    const nx = 132, ny = 236;
    ctx.fillStyle = '#efe9d8'; ctx.fillRect(nx, ny, 122, 42);
    ctx.fillStyle = '#c9c3b2'; ctx.fillRect(nx, ny + 41, 122, 1);
    job.def.note.forEach((l, i) => text(l, nx + 4, ny + 5 + i * 12, i === 0 ? '#6a675c' : '#20201d'));
  } else {
    ctx.fillStyle = '#d9d2c0'; ctx.fillRect(150, 258, 18, 20);
    ctx.fillStyle = '#b3ab98'; ctx.fillRect(150, 274, 18, 4);
    ctx.fillStyle = '#d9d2c0'; ctx.fillRect(168, 263, 4, 8);
    ctx.fillStyle = '#8a7f6a'; ctx.fillRect(154, 262, 10, 1);
  }

  const d = job.def;
  ctx.fillStyle = '#c9c3b2'; ctx.fillRect(36, 46, 204, 140);
  ctx.fillStyle = '#efe9d8'; ctx.fillRect(36, 46, 204, 2);
  ctx.fillStyle = '#b3ad9d'; ctx.fillRect(36, 184, 204, 1);
  text(d.ticket, 46, 56, job.mission ? '#a8323c' : '#6a675c');
  text(d.client, 46, 76, '#20201d');
  text(d.place, 46, 96, '#4a473f');
  ctx.fillStyle = '#b3ad9d'; ctx.fillRect(46, 110, 184, 1);
  text(job.mission ? `pay $${job.pay} (x${MISSION_PAY})` : `pay $${job.pay}`, 46, 120, '#3c3a34');
  text(d.symptom, 46, 142, '#8a2c2c');
  text(`check ${Math.min(job.stage + 1, d.stages.length)} of ${d.stages.length}`, 46, 162, '#4a473f');

  ctx.fillStyle = '#2a2c36'; ctx.fillRect(262, 26, 344, 164);
  ctx.fillStyle = '#0a0c12'; ctx.fillRect(268, 32, 332, 152);
  ctx.fillStyle = '#555a70'; ctx.fillRect(262, 26, 344, 2);

  const lines = d.console;
  const lh = lines.length > 9 ? 14 : 16;
  for (let i = 0; i < job.shown && i < lines.length; i += 1) {
    const line = lines[i];
    const colour = /timed out|unable|50 of 50/.test(line) ? '#ff6a6a'
      : line.includes('reply') ? '#7be08a'
        : /^(C:|router>)/.test(line) ? '#ffffff' : '#a8aec8';
    text(line, 278, 42 + i * lh, colour);
  }

  if (job.step === 'typing' && Math.floor(performance.now() / 400) % 2 === 0) {
    ctx.fillStyle = '#7be08a';
    ctx.fillRect(278, 48 + Math.max(0, job.shown - 1) * lh, 5, 1);
  }

  if (job.feedback) {
    text(job.feedback, 36, 200, job.feedbackColour);
    text(job.hint, 36, 218, '#9aa0b8');
  } else {
    text(job.hint, 36, 200, '#9aa0b8');
  }

  job.options.forEach((label, i) => {
    const r = optRect(i);
    ctx.fillStyle = 'rgba(20,24,34,0.96)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#3a4054'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(`[${i + 1}]`, r.x + 10, r.y + 8, '#46e0e6');
    text(label, r.x + 40, r.y + 8, '#e8e8f0');
  });

  text(job.options.length === 2 ? '1-2 choose' : job.options.length ? '1-3 choose' : 'tap or enter to skip', 36, 336, '#6f7688');

  const xr = exitRect;
  const leave = job.confirmLeave ? `again: -$${NO_SHOW_FEE}` : '[esc] leave';
  ctx.fillStyle = job.confirmLeave ? 'rgba(90,20,28,0.96)' : 'rgba(20,24,34,0.96)';
  ctx.fillRect(xr.x, xr.y, xr.w, xr.h);
  ctx.strokeStyle = job.confirmLeave ? '#ff6a6a' : '#3a4054';
  ctx.strokeRect(xr.x + 0.5, xr.y + 0.5, xr.w - 1, xr.h - 1);
  text(leave, xr.x + (xr.w - tw(leave)) / 2, xr.y + 8, job.confirmLeave ? '#ffd0d0' : '#c8ccdc');

  if (job.step === 'paid') {
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, W, H);
    const bx = 96, by = 56, bw = 448, bh = 248;
    ctx.fillStyle = '#121722'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(bx, by, bw, 1);
    ctx.fillStyle = '#232a3a'; ctx.fillRect(bx, by + bh - 1, bw, 1);
    text(`${d.ticket} - closed`, bx + 24, by + 18, '#6f7688');
    text('paid', bx + 24, by + 44, '#7be08a', 3);
    text(`+ $${job.pay}`, bx + 24, by + 84, '#ffc84a', 2);
    text(d.paid, bx + 24, by + 126, '#e8e8f0');
    text(`mastery: ${d.mastery[0]} +${d.mastery[1]}`, bx + 24, by + 146, '#9aa0b8');
    text(job.mission ? 'double pay: you beat the clock' : 'the wire carries your name for an hour', bx + 24, by + 166, '#9aa0b8');
    ctx.fillStyle = '#232a3a'; ctx.fillRect(bx + 24, by + 190, bw - 48, 1);
    text('[enter] back to the street', bx + 24, by + 206, '#46e0e6');
  }
}

function drawProp(kind: Prop, rx: number, ry: number): void {
  const blink = Math.floor(performance.now() / 420) % 3;
  if (kind === 'router') {
    ctx.fillStyle = '#20242e'; ctx.fillRect(rx, ry, 84, 26);
    ctx.fillStyle = '#2c3140'; ctx.fillRect(rx, ry, 84, 3);
    ctx.fillStyle = '#12151c'; ctx.fillRect(rx + 6, ry + 8, 30, 5);
    const leds: Array<[number, string]> = [[78, '#5ce08a'], [86, '#5ce08a'], [94, blink === 1 ? '#ffb200' : '#4a3a12'], [102, '#a83232']];
    for (const [lx, colour] of leds) {
      ctx.fillStyle = colour;
      ctx.fillRect(rx + lx - 32, ry + 17, 3, 3);
    }
    text('router', rx, ry + 30, '#6f7688');
    return;
  }
  if (kind === 'printer') {
    ctx.fillStyle = '#d6d1c4'; ctx.fillRect(rx + 8, ry, 68, 26);
    ctx.fillStyle = '#ebe7dc'; ctx.fillRect(rx + 8, ry, 68, 3);
    ctx.fillStyle = '#9d988a'; ctx.fillRect(rx + 8, ry + 22, 68, 4);
    ctx.fillStyle = '#2a2b30'; ctx.fillRect(rx + 18, ry + 5, 48, 2);
    ctx.fillStyle = '#f6f3ea'; ctx.fillRect(rx + 24, ry - 14, 36, 19);
    ctx.fillStyle = '#b8b2a2';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(rx + 28, ry - 11 + i * 4, 20 + (i % 2) * 6, 1);
    ctx.fillStyle = blink === 1 ? '#ffb200' : '#5ce08a'; ctx.fillRect(rx + 68, ry + 12, 3, 3);
    text('printer', rx, ry + 30, '#6f7688');
    return;
  }
  ctx.fillStyle = '#26292f'; ctx.fillRect(rx + 22, ry - 12, 40, 38);
  ctx.fillStyle = '#353943'; ctx.fillRect(rx + 22, ry - 12, 40, 2);
  ctx.fillStyle = '#1b3a2c'; ctx.fillRect(rx + 27, ry - 8, 30, 11);
  ctx.fillStyle = blink === 1 ? '#ff6a6a' : '#7b2a2a'; ctx.fillRect(rx + 30, ry - 4, 24, 3);
  ctx.fillStyle = '#4a4f5c';
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) ctx.fillRect(rx + 29 + c * 9, ry + 6 + r * 6, 6, 4);
  text('card machine', rx, ry + 30, '#6f7688');
}

function lampGlow(x: number, y: number, r: number, colour: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function drawPrison(): void {
  const j = state.jail;
  if (!j) return;
  ctx.fillStyle = '#14161f'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 12) {
    for (let x = (y / 12) % 2 ? -14 : 0; x < 236; x += 28) {
      ctx.fillStyle = '#1b1e29'; ctx.fillRect(x + 1, y + 1, 26, 10);
    }
  }
  ctx.fillStyle = '#26324f'; ctx.fillRect(72, 50, 92, 56);
  lampGlow(118, 78, 60, 'rgba(150,180,255,0.18)', 1);
  ctx.fillStyle = '#3a3f52';
  for (let x = 72; x <= 164; x += 13) ctx.fillRect(x, 50, 3, 56);
  ctx.fillStyle = '#2a2d3a'; ctx.fillRect(30, 250, 170, 14);
  ctx.fillStyle = '#4a4d5c'; ctx.fillRect(30, 246, 170, 4);
  ctx.fillStyle = '#353846';
  for (let x = 6; x < 236; x += 22) {
    ctx.fillRect(x, 0, 5, H);
    ctx.fillStyle = '#4d5165'; ctx.fillRect(x, 0, 1, H); ctx.fillStyle = '#353846';
  }
  text('stanley prison', 20, 300, '#dfe4f2', 2);
  text('99 tung tau wan road', 20, 322, '#6f7688');

  const act = wrap(j.act, 56);
  const offence = wrap(j.offence, 56);
  const fix = wrap(j.fix, 56);
  const sx = 254, sw = 362;
  const sh = 196 + 12 * (act.length + offence.length + fix.length);
  const sy = Math.round((H - sh) / 2);
  ctx.fillStyle = '#c9c3b2'; ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = '#efe9d8'; ctx.fillRect(sx, sy, sw, 2);
  ctx.fillStyle = '#b3ad9d'; ctx.fillRect(sx, sy + sh - 1, sw, 1);
  const lx = sx + 14;
  const ink = '#20201d';
  const label = '#6a675c';
  let y = sy + 12;
  text('case sheet', lx, y, '#8a2c2c'); y += 20;
  text('what you did', lx, y, label); y += 12;
  for (const l of act) { text(l, lx, y, ink); y += 12; }
  y += 8;
  text('the law', lx, y, label); y += 12;
  text(j.law, lx, y, ink); y += 12;
  for (const l of offence) { text(l, lx, y, '#4a473f'); y += 12; }
  y += 8;
  text('what would have stopped it', lx, y, label); y += 12;
  for (const l of fix) { text(l, lx, y, ink); y += 12; }
  y += 8;
  ctx.fillStyle = '#b3ad9d'; ctx.fillRect(lx, y, sw - 28, 1); y += 10;

  const left = Math.max(0, j.until - now());
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  text('released in', lx, y, label); y += 14;
  text(`${mm}:${ss}`, lx, y, '#8a2c2c', 3); y += 32;
  text('real minutes. closing the tab does not', lx, y, '#4a473f'); y += 12;
  text('shorten it. it stays on your record.', lx, y, '#4a473f');
}

// ------------------------------------------------------------------- loop ---
let last = performance.now();
/** test hook only: run the game this many steps per frame */
let timeScale = 1;
/** the street draws while we connect; nothing moves until the save is in */
let ready = false;
function frame(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  frames += 1;
  if (ready) for (let i = 0; i < timeScale; i += 1) update(dt);
  // everything is drawn in 640x360 units; the canvas has PXR real pixels per unit
  ctx.setTransform(PXR, 0, 0, PXR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (state.jail) drawPrison();
  else if (job) drawJob();
  else if (quiz) drawQuiz();
  else if (mapView) drawMap();
  else { drawCity(); drawMenu(); }
  requestAnimationFrame(frame);
}

/** everything the rules say happened: sounds, toasts, the quiz, the police, the wire */
function handle(events: Ev[]): void {
  for (const e of events) {
    switch (e.t) {
      case 'sound': audio.play(e.s); break;
      case 'toast': flash(e.text, e.colour, e.secs); break;
      case 'say': say(e.who, e.text); break;
      case 'news': news.unshift(e.text); break;
      case 'quiz':
        quiz = new Quiz(e.view);
        menu = null; dialogue = null; path = [];
        break;
      case 'summary':
        if (quiz) quiz.final = { lines: e.lines, colour: e.colour };
        break;
      case 'warning': showWarning(e); break;
      case 'arrest':
        job = null; quiz = null; menu = null; dialogue = null; path = []; pending = null; ride = null;
        keys.clear();
        break;
      case 'released':
        placePlayer(RELEASE.tx, RELEASE.ty);
        nextMission = 90;
        say('stanley prison', 'released. the gate shuts behind you. tung tau wan road is quiet.');
        break;
      case 'sleep': {
        const h = e.home ? home(e.home) : undefined;
        if (h) { placePlayer(h.tx, h.ty); say(`day ${e.day}`, `you wake up at ${h.name}. 08:00.`); }
        else { placePlayer(START.tx, START.ty); say(`day ${e.day}`, 'the 6 drops you at stanley again. the board in the market has new gigs.'); }
        break;
      }
      case 'homeChange': soloOwners(); break;
      case 'mission': showWire(undefined, true); break;
      case 'missionGone':
        nextMission = 150 + Math.random() * 90;
        if (job?.mission) job = null;
        showWire(news[0], false);
        break;
      default: break;
    }
  }
}

async function start(): Promise<void> {
  setWorldText((g, s, x, y, colour) => { glyphs(g, s.toUpperCase(), x, y, colour); });
  spawnWalkers();
  setTimeout(startShuttles, 50);
  requestAnimationFrame(frame);
  await startNet({
    events: handle,
    wire: (t) => { news.unshift(t); showWire(t, false); },
  });
  if (state.mission && !missionDef()) state.mission = null;
  const tx = Math.floor(state.x / TILE), ty = Math.floor(state.y / TILE);
  // saves from the 8 m map have positions on a different scale
  if (state.x < 0 || state.mapv !== 2 || solidTile(tx, ty)) placePlayer(START.tx, START.ty);
  else { player.x = state.x; player.y = state.y; sendPos(player.x, player.y); }
  ready = true;
  if (net.mode === 'solo') { soloOwners(); await act('tick'); }
  if (state.mission) showWire(undefined, true);
  if (!state.jail && !dialogue) {
    if (state.work?.tasks.length) say('welcome back', workStatus());
    else if (state.answered === 0) {
      say('stanley', `${net.mode === 'online' ? `welcome, ${net.me.name}. ` : ''}you get off the 6 at stanley with a used laptop and $1,280. the notice board in the market has gigs; the library is free; cafes are hiring. rent is $150 a day, so keep earning. tap or use wasd to walk, e to use.`);
    }
  }
}

start();

// ------------------------------------------------------------- test hooks ---
const hooks = window as unknown as Record<string, unknown>;
hooks.__audio = audio;
hooks.__job = () => (job ? { id: job.def.id, step: job.step, stage: job.stage, shown: job.shown, opts: job.options, mission: job.mission } : null);
hooks.__quiz = () => (quiz ? { title: quiz.title, i: quiz.i, n: quiz.qs.length, answer: quiz.answer, picked: quiz.picked, right: quiz.right, summary: quiz.summary, busy: quiz.busy } : null);
hooks.__menu = () => (menu ? { title: menu.title, items: menu.items.map((i) => ({ label: i.label, off: !!i.off, sub: i.sub })) } : null);
hooks.__dialogue = () => dialogue;
Object.defineProperty(window, '__frames', { get: () => frames });
/** open a callout now instead of waiting for the street timer */
hooks.__mission = () => { nextMission = 0; };
/** jump the wall clock forward to test real-time work */
hooks.__skip = (hours: number) => { if (net.mode === 'solo') { net.skew += hours * 3600000; act('tick'); } };
/** stand at a place and use it */
hooks.__goto = (id: string) => { const p = PLACES.find((x) => x.id === id); if (p) { placePlayer(p.tx, p.ty); activate(p); } };
hooks.__reset = () => { if (net.mode === 'solo') { resetSolo(); location.reload(); } };
hooks.__tp = (x: number, y: number) => placePlayer(x, y);
hooks.__speed = (n: number) => { timeScale = Math.max(1, Math.min(40, Math.round(n))); };
hooks.__route = (tx: number, ty: number) => { pending = null; path = findPath(player.x, player.y, tx * TILE + 8, ty * TILE + 12); return path.length; };
hooks.__pos = () => ({ x: player.x, y: player.y, moving: path.length > 0 });
hooks.__items = ITEMS.map((i) => i.id);
/** run an action as if from the game (tests) */
hooks.__act = act;
hooks.__home = home;
hooks.__homesList = HOMES;
hooks.__lights = () => CROSSINGS.map((c) => [Math.round(c.x), Math.round(c.y), crossingLight(c, clockSecs)]);
hooks.__taxi = () => (taxi ? { state: taxi.state, x: Math.round(taxi.x / TILE), y: Math.round(taxi.y / TILE), kmh: Math.round((taxi.speed / TILE) * 3.6), left: taxi.route.length } : null);
hooks.__mapView = () => (mapView ? mapView.list[mapView.sel].name : null);
hooks.__cars = () => cars.map((c) => ({ x: Math.round(c.x / TILE), y: Math.round(c.y / TILE), kmh: Math.round((c.speed / TILE) * 3.6), left: c.route.length }));
hooks.__drive = () => (drive ? { x: Math.round(drive.x / TILE), y: Math.round(drive.y / TILE), kmh: Math.round((Math.abs(drive.speed) / TILE) * 3.6), left: drive.route.length } : null);
hooks.__driveTo = (id: string) => { const p = PLACES.find((q) => q.id === id); if (!p || !drive) return false; driveTo(placeX(p), placeY(p), p); return drive.route.length; };
hooks.__day = DAY;
/** the whole map as a PNG data URL, for checking the layout */
hooks.__world = (scale = 2) => renderOverview(scale).toDataURL();
/** metres on foot between two places, by id */
hooks.__walk = (a: string, b: string) => {
  const pa = PLACES.find((p) => p.id === a), pb = PLACES.find((p) => p.id === b);
  return pa && pb ? walkDistance(pa, pb) : -1;
};
hooks.__fences = () => { const a = fenceAudit(); return { blocked: a.blocked.length, narrowOnWays: a.narrow.filter((n) => n[4]).length, strips: a.strips.length }; };
