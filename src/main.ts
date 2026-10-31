/**
 * NETLIFE: HK — Stanley village. v0.5 slice.
 *
 * The game owns its own requestAnimationFrame loop and draws to a 640x360 canvas.
 * Modes, in priority order: prison > console job > MC quiz > menu > the village.
 * See docs/design/stanley-expansion.md for what each system is for.
 */
import { state, save, clock, load, reset, addMoney, addMinutes, addMastery } from './state';
import { audio } from './audio';
import { JOBS, MISSIONS, OFFER, type JobDef, type Crime, type Prop } from './jobs';
import { GLYPHS } from './font';
import {
  TILE, MAP_W, MAP_H, PLACES, START, RELEASE, drawWorld, setWorldText, renderOverview, solidAt, solidTile,
  walkableTile, findPath, isSea, areaNear, ROAD_LINES, walkDistance, roadRoute, BUILDING_LABELS, ESCALATORS,
  escalatorAt, type Place,
} from './world';
import { ROUTES, routesAt, type Route, type Stop } from './minibus';
import { QUESTIONS, TOPIC_NAMES, FORM_RATE, type Form, type Question, type Tier, type Topic } from './questions';
import {
  ITEMS, item, SHOP_STOCK, PIRATE_STOCK, NEED_NAMES, COURSES, COURSE_QUESTIONS, COURSE_PASS,
  EMPLOYERS, TASK_EVERY, TASK_CAP, TASK_QUESTIONS, REHIRE_WAIT, fireAfter, DAY, HOUR,
  boardFor, gigRate, OFFENCES, WARNING_FINE, type Employer, type Gig, type Offence,
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

(window as unknown as { __cit: typeof state }).__cit = state;

// ---------------------------------------------------------------- canvas ---
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
document.getElementById('app')!.appendChild(canvas);
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function resize(): void {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
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
/** wall clock, shiftable by the __skip test hook so real-time work can be tested */
let skew = 0;
const now = (): number => Date.now() + skew;

function ago(ms: number): string {
  const h = Math.floor(ms / HOUR);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ------------------------------------------------------------------ state ---
const MISSION_WINDOW = 90;
const MISSION_PAY = 2;
const NO_SHOW_FEE = 100;
const JAIL_MS = 30 * 60 * 1000;
/**
 * Walking pace in px/s. The map is 1 m per 16 px tile and the walk from Stanley Plaza to the SSC
 * back gate is about 600 m, which the owner wants to take about five minutes: 600 * 16 / 300.
 * Running (Shift, or the run button) is RUN times faster.
 */
const SPEED = 32;
const RUN = 2.4;
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

type Walker = { x: number; y: number; path: Array<{ x: number; y: number }>; coat: string; frame: number; facing: number; wait: number };

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
let declined = false;
let toast: { text: string; colour: string; t: number } | null = null;
let frames = 0;
let tickTimer = 0;
const walkers: Walker[] = [];
/** cars drive the real road lines from end to end, then turn onto whichever road meets them */
type Car = { x: number; y: number; line: number; i: number; dir: 1 | -1; colour: string; wait: number; dx: number; dy: number };
const lineEnds = ROAD_LINES.map((l) => [l[0], l[l.length - 1]]);
function nextLine(x: number, y: number, not: number): { line: number; dir: 1 | -1 } | null {
  const near: Array<{ line: number; dir: 1 | -1 }> = [];
  lineEnds.forEach(([a, b], i) => {
    if (i === not) return;
    if (Math.hypot(a.x - x, a.y - y) < 4 * TILE) near.push({ line: i, dir: 1 });
    if (Math.hypot(b.x - x, b.y - y) < 4 * TILE) near.push({ line: i, dir: -1 });
  });
  return near.length ? near[Math.floor(Math.random() * near.length)] : null;
}
const cars: Car[] = ['#c8382f', '#e0e0e8', '#3a6ac8', '#3aa86a', '#e8c23a', '#2a2a30', '#d86a3a', '#6a6a72',
  '#e0e0e8', '#3a6ac8', '#c8382f', '#2a2a30'].map((colour, i) => {
  const line = Math.floor((i / 12) * ROAD_LINES.length);
  const p = ROAD_LINES[line]?.[0] ?? { x: 0, y: 0 };
  return { x: p.x, y: p.y, line, i: 0, dir: 1, colour, wait: i * 0.5, dx: 1, dy: 0 };
});

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
type Prepared = { q: Question; options: string[]; answer: number };

const LETTERS = ['A', 'B', 'C', 'D'];

function prepare(q: Question): Prepared {
  // shuffle the options so a letter cannot be memorised; keep track of the right one
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return { q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

function drawQuestions(topics: Topic[], n: number, forms: [Form, Form] = [1, 6]): Prepared[] {
  const pool = QUESTIONS.filter((q) => topics.includes(q.topic) && q.form >= forms[0] && q.form <= forms[1]);
  const fresh = pool.filter((q) => !state.seen.includes(q.id)).sort(() => Math.random() - 0.5);
  const stale = pool.filter((q) => state.seen.includes(q.id)).sort(() => Math.random() - 0.5);
  return [...fresh, ...stale].slice(0, n).map(prepare);
}

class Quiz {
  i = 0;
  picked: number | null = null;
  right = 0;
  /** the form of each question answered right: gigs pay by it */
  rightForms: Form[] = [];
  summary: string[] | null = null;
  summaryColour = '#7be08a';

  constructor(
    readonly title: string,
    readonly sub: string,
    readonly tier: Tier,
    readonly qs: Prepared[],
    /** returns the lines of the end screen; may set summaryColour */
    readonly onDone: (right: number, n: number, quiz: Quiz) => string[],
    /** runs after the end screen is dismissed */
    readonly after?: () => void,
  ) {}

  get current(): Prepared { return this.qs[this.i]; }

  pick(i: number): void {
    if (this.summary || this.picked !== null || i < 0 || i > 3) return;
    this.picked = i;
    const p = this.current;
    const ok = i === p.answer;
    state.answered += 1;
    if (ok) { this.right += 1; this.rightForms.push(p.q.form); state.right += 1; audio.play('ok'); } else audio.play('bad');
    addMastery(p.q.topic, ok ? 4 : -2);
    state.seen = [p.q.id, ...state.seen.filter((s) => s !== p.q.id)].slice(0, 24);
    save();
  }

  next(): void {
    if (this.summary) {
      quiz = null;
      if (this.after) this.after();
      return;
    }
    if (this.picked === null) return;
    this.picked = null;
    this.i += 1;
    if (this.i >= this.qs.length) {
      this.summary = this.onDone(this.right, this.qs.length, this);
      save();
    }
  }
}

function startQuiz(qz: Quiz): void {
  if (!qz.qs.length) { flash('no questions for that topic yet', '#ff9a6a'); return; }
  quiz = qz;
  menu = null;
  dialogue = null;
  path = [];
  audio.play('door');
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
    if (c.crime) { job = null; arrest(c.crime, 's161'); return; }
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
    addMinutes(4);
    save();
    this.feedback = 'wrong - four minutes gone';
    this.hint = c.hint ?? st.prompt;
  }

  private settle(): void {
    audio.play('cash');
    addMoney(this.pay);
    addMastery(...this.def.mastery);
    if (!state.done.includes(this.def.id)) state.done.push(this.def.id);
    addMinutes(this.def.minutes);
    news.unshift(this.def.wire);
    save();
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
function arrest(c: Crime, id: string): void {
  audio.play('bad');
  job = null;
  quiz = null;
  menu = null;
  dialogue = null;
  path = [];
  pending = null;
  keys.clear();
  state.mission = null;
  state.record.push({ id, day: state.day, jailed: true });
  state.jail = { until: now() + JAIL_MS, ...c };
  news.unshift('a stanley technician was detained tonight');
  save();
}

/** warning first: a first minor offence is a fine and a confiscation; anything else is jail */
function commit(o: Offence): void {
  const prior = state.record.length;
  if (o.serious || prior > 0) {
    arrest({ act: o.act, law: o.law, offence: o.offence, fix: o.fix }, o.id);
    return;
  }
  const fine = Math.min(state.money, WARNING_FINE);
  addMoney(-fine);
  const taken = state.inv.filter((id) => item(id)?.kind === 'pirated');
  state.inv = state.inv.filter((id) => item(id)?.kind !== 'pirated');
  state.record.push({ id: o.id, day: state.day, jailed: false });
  news.unshift('police issue a warning over pirated software in stanley');
  save();
  audio.play('alert');
  openMenu({
    title: 'police warning',
    line: `an officer from stanley police station is waiting outside. ${o.act} this is a warning: next time it is a cell.`,
    items: [
      { label: o.law, sub: o.offence, off: true, colour: '#ffc84a' },
      { label: `fine paid: ${money(fine)}`, sub: taken.length ? `confiscated: ${taken.map((t) => item(t)!.name).join(', ')}` : 'nothing to confiscate', off: true },
      { label: 'what would have stopped it', sub: o.fix, off: true },
      { label: 'understood', act: () => { menu = null; } },
    ],
  });
}

const jailed = (): boolean => !!state.jail && now() < state.jail.until;

function release(): void {
  state.jail = null;
  placePlayer(RELEASE.tx, RELEASE.ty);
  nextMission = 90;
  save();
  say('stanley prison', 'released. the gate shuts behind you. tung tau wan road is quiet.');
}

// ------------------------------------------------------------- employment ---
const employer = (id: string): Employer | undefined => EMPLOYERS.find((e) => e.id === id);

/** issue tasks that fell due while we were away, then check for warnings and firing */
function tickWork(): void {
  const w = state.work;
  if (!w) return;
  const e = employer(w.id);
  if (!e) { state.work = null; return; }
  const t = now();
  let changed = false;
  while (t - w.last >= TASK_EVERY) {
    w.last += TASK_EVERY;
    if (w.tasks.length < TASK_CAP) { w.tasks.push(w.last); changed = true; }
  }
  const oldest = w.tasks[0];
  if (oldest !== undefined) {
    const age = t - oldest;
    if (age >= fireAfter(e)) { fire(e, age); return; }
    if (!w.warned && age >= fireAfter(e) / 2) {
      w.warned = true;
      changed = true;
      news.unshift(`${e.boss} at ${e.name} wants that work done`);
      flash(`${e.boss}: a task has waited ${ago(age)}. ${e.strict ? 'strict' : 'relaxed'} boss - fired at ${e.strict ? 3 : 5} days`, '#ff9a6a', 6);
      audio.play('alert');
    }
  }
  if (changed) save();
}

function fire(e: Employer, age: number): void {
  state.work = null;
  state.fired[e.id] = now() + REHIRE_WAIT;
  state.rep[e.name] = (state.rep[e.name] ?? 0) - 20;
  news.unshift(`${e.name} let its it helper go`);
  save();
  audio.play('bad');
  say(e.boss, `you left a task for ${ago(age)}. i cannot run ${e.name} like this. you are fired. come back in a week if you want to try again.`);
}

function hire(e: Employer): void {
  const t = now();
  state.work = { id: e.id, hired: t, last: t, tasks: [t], warned: false, done: 0 };
  news.unshift(`${e.name} hired a new it helper`);
  save();
  audio.play('cash');
  menu = null;
  say(e.boss, `you start now. a task lands every 5 hours, even when you are not here. ${e.strict ? 'leave one for 3 days and you are out.' : 'leave one for 5 days and we will have words - then you are out.'}`);
}

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
          off: !w.tasks.length, why: 'no tasks waiting yet', act: () => startWorkTask(e) },
        { label: 'quit this job', sub: 'no penalty, but the tasks stop', act: () => {
          state.work = null; save(); menu = null; say(e.boss, 'fair enough. the door is open if you change your mind.');
        } },
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
        off: blockers.length > 0, why: blockers[0], act: () => hire(e) },
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

function startWorkTask(e: Employer): void {
  startQuiz(new Quiz(`work task - ${e.name}`, `${e.boss} is watching`, e.tier, drawQuestions(e.topics, TASK_QUESTIONS, e.forms),
    (right, n) => {
      const w = state.work;
      addMoney(e.wage);
      audio.play('cash');
      state.rep[e.name] = (state.rep[e.name] ?? 0) + (right - 1);
      if (w) {
        w.tasks.shift();
        w.done += 1;
        w.warned = !!w.tasks.length && now() - w.tasks[0] >= fireAfter(e) / 2;
      }
      addMinutes(60);
      return [
        `${right} of ${n} right`,
        `wage paid: ${money(e.wage)}`,
        right === n ? `${e.boss} nods. from ${e.boss}, that is high praise.` : right ? `${e.boss}: "fine. check your work next time."` : `${e.boss}: "did you even read it?"`,
        state.work?.tasks.length ? `${state.work.tasks.length} more task(s) waiting` : 'nothing else waiting',
      ];
    }));
}

// -------------------------------------------------------------------- gigs ---
const owns = (provides: string): boolean => state.inv.some((id) => item(id)?.provides === provides);
const ownsLegit = (provides: string): boolean => state.inv.some((id) => item(id)?.provides === provides && item(id)?.kind !== 'pirated');

function payBoost(): number {
  return Math.max(...state.inv.map((id) => item(id)?.payBoost ?? 1));
}

function laptopCovers(need: string): boolean {
  // a better laptop covers a lesser laptop requirement
  const rank = (s: string): number => ({ laptop1: 1, laptop2: 2, laptop3: 3 } as Record<string, number>)[s] ?? 0;
  if (!rank(need)) return false;
  return state.inv.some((id) => rank(id) >= rank(need));
}

const has = (need: string): boolean => owns(need) || laptopCovers(need);

function openBoard(): void {
  const gigs = boardFor(state.day);
  openMenu({
    title: `notice board - day ${state.day}`,
    line: 'freelance gigs. one-off, and you bring your own gear. each right answer pays by its level: f1 work pays least, f6 most. new gigs every day.',
    items: [
      ...gigs.map((g): MenuItem => {
        const done = state.gigs.includes(`${state.day}:${g.id}`);
        const missing = g.needs.filter((n) => !has(n));
        const top = Math.round((gigRate(g) * g.questions * payBoost()) / 10) * 10;
        return {
          label: `[${g.tier === 'dse' ? 'dse' : 'junior'}] ${g.title}`,
          right: done ? 'done' : `about ${money(top)}`,
          sub: `${g.client}, ${g.place} - f${g.forms[0]}-${g.forms[1]}, ${g.questions} qs - ${g.needs.length ? `needs ${g.needs.map((n) => NEED_NAMES[n] ?? n).join(', ')}` : 'no gear needed'}`,
          colour: g.tier === 'dse' ? '#ffc84a' : '#7be0d0',
          off: done || missing.length > 0 || state.energy <= 0,
          why: done ? 'already done today' : missing.length ? `you need: ${missing.map((n) => NEED_NAMES[n] ?? n).join(', ')}` : 'too tired. take the bus home and sleep',
          act: () => startGig(g),
        };
      }),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

function startGig(g: Gig): void {
  const pirated = g.needs.some((n) => owns(n) && !ownsLegit(n) && !laptopCovers(n));
  startQuiz(new Quiz(`gig - ${g.title}`, `${g.client}, ${g.place}`, g.tier, drawQuestions(g.topics, g.questions, g.forms),
    (right, n, qz) => {
      const earned = qz.rightForms.reduce((sum, f) => sum + FORM_RATE[f], 0);
      const pay = Math.round((earned * g.mult * payBoost()) / 10) * 10;
      state.gigs = [...state.gigs.filter((k) => Number(k.split(':')[0]) >= state.day - 2), `${state.day}:${g.id}`];
      state.energy = Math.max(0, state.energy - 1);
      addMinutes(g.minutes);
      if (pay) { addMoney(pay); audio.play('cash'); news.unshift(`${g.client} paid a freelancer ${money(pay)}`); }
      else { state.rep[g.client] = (state.rep[g.client] ?? 0) - 2; qz.summaryColour = '#ff6a6a'; }
      return [
        `${right} of ${n} right`,
        pay ? `paid: ${money(pay)}` : 'not paid: nothing was usable',
        payBoost() > 1 ? `your laptop added ${Math.round((payBoost() - 1) * 100)}%` : 'a better laptop pays more',
        pirated ? 'the client is checking your software licence...' : `${g.client} will remember you`,
      ];
    },
    () => { if (pirated) commit(OFFENCES.piracyUse); }));
}

// ------------------------------------------------------------------- shops ---
const SHOP_SHELVES: Array<{ name: string; kinds: string[]; sub: string }> = [
  { name: 'laptops', kinds: ['laptop'], sub: 'a better laptop pays more on every gig, and some gigs need one' },
  { name: 'tools', kinds: ['tool'], sub: 'cable tester, camera, label printer' },
  { name: 'software licences', kinds: ['licence'], sub: 'office, photo and accounting software, with real keys' },
];

function openShop(shelf?: number): void {
  if (shelf === undefined) {
    openMenu({
      title: 'pixel fix - ah yan',
      line: '"everything here is legit. the receipt has a licence key on it."',
      items: [
        ...SHOP_SHELVES.map((s, i): MenuItem => ({ label: s.name, sub: s.sub, act: () => openShop(i) })),
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
        return {
          label: it.name, right: owned ? 'owned' : money(it.price), sub: it.blurb,
          off: owned || state.money < it.price, why: owned ? 'you have one' : 'not enough money',
          act: () => {
            addMoney(-it.price);
            state.inv.push(id);
            save();
            audio.play('cash');
            flash(`bought: ${it.name}`, '#7be08a');
            openShop(shelf);
          },
        };
      }),
      { label: 'back', act: () => openShop() },
    ],
  });
}

function openPirate(): void {
  openMenu({
    title: 'the phone stall',
    line: '"same software, fifteen percent of the price. nobody checks." he also has two side jobs, if you are interested.',
    items: [
      ...PIRATE_STOCK.map((id): MenuItem => {
        const it = item(id)!;
        const owned = state.inv.includes(id);
        return {
          label: it.name, right: owned ? 'owned' : money(it.price), sub: it.blurb, colour: '#ff9a6a',
          off: owned || state.money < it.price, why: owned ? 'you have one' : 'not enough money',
          act: () => {
            addMoney(-it.price);
            state.inv.push(id);
            save();
            flash(`bought: ${it.name}. it has no receipt.`, '#ff9a6a');
            openPirate();
          },
        };
      }),
      { label: 'sell discs for him', right: '$800', sub: 'stand at the stall for an afternoon', colour: '#ff6a6a',
        act: () => commit(OFFENCES.piracySell) },
      { label: "copy the stall holders' customer list", right: '$600', sub: 'he says it is for a lucky draw', colour: '#ff6a6a',
        act: () => commit(OFFENCES.dataLeak) },
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
          act: () => {
            addMoney(-c.price);
            startQuiz(new Quiz(`exam - ${c.name}`, 'stanley plaza training centre', c.tier, drawQuestions(c.topics, COURSE_QUESTIONS, c.forms),
              (right, n, qz) => {
                addMinutes(90);
                if (right >= COURSE_PASS) {
                  state.certs.push(c.id);
                  audio.play('cash');
                  news.unshift(`a stanley freelancer earned the ${c.name}`);
                  return [`${right} of ${n}: passed`, `certificate: ${c.name}`, 'employers can see it now'];
                }
                qz.summaryColour = '#ff6a6a';
                return [`${right} of ${n}: not passed (needs ${COURSE_PASS})`, 'study at the library, then try again', `retake fee: ${money(c.price)}`];
              }));
          },
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
        act: () => startQuiz(new Quiz(`study - ${TOPIC_NAMES[t]}`, 'stanley public library', tier, drawQuestions([t], 5),
          (right, n) => {
            addMinutes(30);
            return [`${right} of ${n} right`, `${TOPIC_NAMES[t]} mastery: ${state.mastery[t] ?? 0}`, right === n ? 'the librarian looks impressed' : 'read the explanations: they are the lesson'];
          })),
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
    line: `take the bus home and sleep. it is day ${state.day}, ${clock()}. you wake on day ${state.day + 1} at 08:00 with full energy and a new notice board. real-time work tasks keep coming either way.`,
    items: [
      { label: 'go home and sleep', right: '$12', act: () => {
        addMoney(-12);
        state.day += 1;
        state.minutes = 8 * 60;
        state.energy = 5;
        placePlayer(START.tx, START.ty);
        save();
        menu = null;
        audio.play('door');
        say(`day ${state.day}`, 'the 6 drops you at stanley again. the board in the market has new gigs.');
      } },
      { label: 'not yet', act: () => { menu = null; } },
    ],
  });
}

// ---------------------------------------------------------------- status ---
function openStatus(): void {
  const owned = state.inv.map((id) => item(id)?.name ?? id);
  const acc = state.answered ? Math.round((100 * state.right) / state.answered) : 0;
  openMenu({
    title: 'you',
    line: `day ${state.day}, ${clock()}. ${money(state.money)}. ${state.answered} questions answered, ${acc}% right.`,
    items: [
      { label: 'work', sub: workStatus(), off: true, colour: '#7ab8ff' },
      { label: 'gear', sub: owned.join(', ') || 'nothing', off: true },
      { label: 'certificates', sub: state.certs.map((c) => COURSES.find((x) => x.id === c)?.name ?? c).join(', ') || 'none yet', off: true },
      { label: 'record', sub: state.record.length ? `${state.record.length} offence(s). see stanley police station` : 'clean', off: true,
        colour: state.record.length ? '#ff9a6a' : '#7be08a' },
      { label: 'map data', sub: '(c) openstreetmap contributors (odbl). 3d map: lands department, hksar government', off: true, colour: '#6f7688' },
      { label: 'close', act: () => { menu = null; } },
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
  return `${d.client}: ${d.symptom} - $${d.pay * MISSION_PAY} double pay - ${Math.ceil(state.mission.left)}s`;
}

function tickMissions(dt: number): void {
  if (state.mission) {
    state.mission.left -= dt;
    if (state.mission.left <= 0) missMission();
    return;
  }
  nextMission -= dt;
  if (nextMission > 0) return;
  const open = MISSIONS.filter((d) => !state.done.includes(d.id));
  if (!open.length) { nextMission = Infinity; return; }
  const d = open[Math.floor(Math.random() * open.length)];
  state.mission = { id: d.id, left: MISSION_WINDOW };
  save();
  showWire(undefined, true);
  audio.play('alert');
}

function missMission(): void {
  const d = missionDef();
  state.mission = null;
  noShow(d, 'missed the callout');
}

function noShow(d: JobDef | undefined, what: string): void {
  nextMission = 150 + Math.random() * 90;
  if (d) {
    state.rep[d.client] = (state.rep[d.client] ?? 0) - 10;
    news.unshift(`${d.client} called ah ming instead`);
  }
  addMoney(-NO_SHOW_FEE);
  flash(`${what} - no-show fee -$${NO_SHOW_FEE}`, '#ff6a6a', 4);
  audio.play('bad');
  save();
  showWire(news[0], false);
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

type Ride = { route: Route; to: Stop; path: Pt[]; i: number; x: number; y: number; angle: number };
let ride: Ride | null = null;
/** minibuses running up and down their routes for the look of the place */
type Shuttle = { route: Route; path: Pt[]; i: number; dir: 1 | -1; x: number; y: number; angle: number; wait: number };
const shuttles: Shuttle[] = [];

function startShuttles(): void {
  for (const r of ROUTES) {
    const path = journey(r, r.stops[0].id, r.stops[r.stops.length - 1].id);
    if (path.length < 2) continue;
    for (let n = 0; n < 2; n += 1) {
      const i = Math.floor((n * path.length) / 2);
      shuttles.push({ route: r, path, i, dir: n ? -1 : 1, x: path[i].x, y: path[i].y, angle: 0, wait: 0 });
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
  addMoney(-r.fare);
  audio.play('cash');
  flash(`paid ${money(r.fare)} on the ${r.no}`, '#7be08a');
  ride = { route: r, to, path, i: 0, x: path[0].x, y: path[0].y, angle: 0 };
}

function endRide(): void {
  if (!ride) return;
  const r = ride;
  ride = null;
  const p = PLACES.find((x) => x.id === r.to.id);
  if (p) placePlayer(p.tx, p.ty);
  // in-game time: about 25 km/h through the village, at least two minutes
  addMinutes(Math.max(2, Math.round((r.path.length * 3) / 400)));
  audio.play('door');
  save();
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

function updateMinibuses(dt: number): void {
  for (const sh of shuttles) {
    if (sh.wait > 0) { sh.wait -= dt; continue; }
    if (!moveAlong(sh, sh.dir, 170 * dt)) { sh.dir = sh.dir === 1 ? -1 : 1; sh.wait = 6; }
  }
  if (ride && !moveAlong(ride, 1, 420 * dt)) endRide();
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
  if (p.kind === 'offer' && declined) return null;
  return null;
}

function activate(p: Place): void {
  pending = null;
  path = [];
  const j = jobAt(p);
  if (j) {
    if (j.mission) { state.mission = null; nextMission = 150 + Math.random() * 90; }
    job = new Job(j.def, j.mission);
    audio.play('ui');
    save();
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
    case 'employer': {
      const e = EMPLOYERS.find((x) => x.place === p.id);
      if (e) { openEmployer(e); return; }
      break;
    }
    case 'offer':
      if (!declined) {
        openMenu({
          title: OFFER.who, line: OFFER.line,
          items: [
            { label: OFFER.walk, act: () => { declined = true; menu = null; flash('he shrugs and lights a cigarette'); } },
            { label: OFFER.take, colour: '#ff6a6a', act: () => arrest(OFFER.crime, 's161') },
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
  state.x = player.x;
  state.y = player.y;
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
  if (inRect(runRect, x, y, 0)) { running = !running; audio.play('ui'); return; }
  if (inRect(zoomRect, x, y, 0)) { toggleZoom(); return; }
  const wx = x / zoom + cam.x, wy = y / zoom + cam.y;
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
  if (left.mission) noShow(left.def, 'walked out of the callout');
  else flash(`left ${left.def.client}. the job is still there`);
}

window.addEventListener('keydown', (ev) => {
  audio.unlock();
  const k = ev.key;
  if (k === 'm' || k === 'M') { audio.toggleMute(); return; }
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
  if (k === 'e' || k === 'E' || k === 'Enter') { if (dialogue) dialogue = null; else if (near) activate(near); return; }
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
  if (dx && walkable(player.x + dx, player.y)) { player.x += dx; moved = true; }
  if (dy && walkable(player.x, player.y + dy)) { player.y += dy; moved = true; }
  return moved;
}

/** people stroll near the places that matter: the promenade, the market, the plaza, the college */
const WAYPOINTS: Array<[number, number]> = PLACES.map((p) => [p.tx, p.ty]);

function spawnWalkers(): void {
  const coats = ['#3b4a6b', '#6b3b4a', '#3b5a4a', '#8a6a3a', '#5a4a7a', '#7a7a7a', '#a84a3a'];
  for (let i = 0; i < 52; i += 1) {
    const [tx, ty] = WAYPOINTS[i % WAYPOINTS.length];
    walkers.push({ x: (tx + (i % 5) - 2) * TILE + 8, y: (ty + (i % 3) - 1) * TILE + 12, path: [], coat: coats[i % coats.length], frame: 0, facing: 1, wait: i * 0.7 });
  }
}

function updateWalkers(dt: number): void {
  for (const w of walkers) {
    if (!w.path.length) {
      w.wait -= dt;
      if (w.wait > 0) continue;
      // a short wander from where they stand
      let tx = 0, ty = 0;
      for (let tries = 0; tries < 8; tries += 1) {
        tx = Math.floor(w.x / TILE) + Math.floor(Math.random() * 40) - 20;
        ty = Math.floor(w.y / TILE) + Math.floor(Math.random() * 30) - 15;
        if (walkableTile(tx, ty)) break;
      }
      w.path = findPath(w.x, w.y, tx * TILE + 8, ty * TILE + 8).slice(0, 80);
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

function updateCars(dt: number): void {
  for (const c of cars) {
    if (c.wait > 0) { c.wait -= dt; continue; }
    const line = ROAD_LINES[c.line];
    if (!line) continue;
    const ni = c.i + c.dir;
    if (ni < 0 || ni >= line.length) {
      const next = nextLine(c.x, c.y, c.line);
      if (next) { c.line = next.line; c.dir = next.dir; c.i = next.dir === 1 ? 0 : ROAD_LINES[next.line].length - 1; }
      else { c.dir = c.dir === 1 ? -1 : 1; c.wait = 2; }
      continue;
    }
    const t = line[ni];
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    if (d < 3) { c.i = ni; continue; }
    c.dx = (t.x - c.x) / d; c.dy = (t.y - c.y) / d;
    // drive on the left, as in Hong Kong
    c.x += c.dx * 110 * dt;
    c.y += c.dy * 110 * dt;
  }
}

function update(dt: number): void {
  if (state.jail) {
    if (!jailed()) release();
    return;
  }
  tickTimer += dt;
  if (tickTimer > 1) { tickTimer = 0; tickWork(); }
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

  updateWalkers(dt);
  updateCars(dt);
  updateMinibuses(dt);
  if (ride) return;

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
    } else { vx = (t.x - player.x) / d; vy = (t.y - player.y) / d; }
  }

  // on an escalator the steps carry you, whether or not you walk too (about 1.5 m/s, like a real one)
  const carry = escalatorAt(player.x, player.y);
  if (carry) {
    move(0, carry * 24 * dt);
    state.x = player.x; state.y = player.y;
  }

  if (vx || vy) {
    const len = Math.hypot(vx, vy) || 1;
    const step = SPEED * (running || keys.has('shift') ? RUN : 1) * dt;
    let moved = move((vx / len) * step, (vy / len) * step);
    if (!moved && path.length) {
      // snagged on a corner while following a path: snap to the waypoint
      player.x = path[0].x; player.y = path[0].y; moved = true;
    }
    state.x = player.x;
    state.y = player.y;
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

function drawPlayer(): void {
  const x = Math.round(player.x - cam.x);
  const y = Math.round(player.y - cam.y);
  ctx.save();
  const fs = figScale();
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y + 1, 7 * fs / 1.5, 3 * fs / 1.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.translate(x, y);
  ctx.scale(player.facing < 0 ? -fs : fs, fs);
  const swing = [0, 1, 0, -1][player.frame];
  ctx.fillStyle = '#343a54';
  ctx.fillRect(-3, -5, 3, 5 - Math.max(0, swing));
  ctx.fillRect(1, -5, 3, 5 + Math.min(0, swing));
  ctx.fillStyle = '#4fa3ff'; ctx.fillRect(-4, -13, 9, 9);
  ctx.fillStyle = '#2f6fb5'; ctx.fillRect(2, -13, 3, 9);
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
  if (audio.muted) text('m', 560, 21, '#6f7688');
}

/** colour per kind of place, for the entrance pads and labels */
const KIND_COLOUR: Partial<Record<Place['kind'], string>> = {
  job: '#ffc84a', employer: '#ffc84a', shop: '#7be08a', pirate: '#d8a0ff', minibus: '#46d07a', bus: '#ff9a4a',
  library: '#9ad0ff', course: '#c8a0ff', police: '#6aa0ff', prison: '#ff6a6a', board: '#ffe28a', offer: '#d8a0ff',
  flavour: '#e8e4d8',
};
const KIND_ICON: Partial<Record<Place['kind'], string>> = {
  job: '!', employer: 'w', shop: '$', pirate: '?', minibus: 'm', bus: 'b', library: '#', course: '+', police: 'p',
  prison: 'x', board: 'n', offer: '?', flavour: 'i',
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
  const fx = ride ? ride.x : player.x, fy = ride ? ride.y : player.y;
  cam.x = Math.max(0, Math.min(MAP_W * TILE - VW, Math.round(fx - VW / 2)));
  cam.y = Math.max(-35 / zoom, Math.min(MAP_H * TILE - VH + 28 / zoom, Math.round(fy - VH / 2)));
  // keep the camera on whole canvas pixels so the art does not shimmer
  cam.x = Math.round(cam.x * zoom) / zoom; cam.y = Math.round(cam.y * zoom) / zoom;
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
  const busStop = PLACES.find((p) => p.id === 'bus')!;
  const bx = busStop.tx * TILE - 96 - cam.x, by = busStop.ty * TILE - 70 - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 4, by + 4, 192, 40);
  ctx.fillStyle = '#e8c23a'; ctx.fillRect(bx, by, 192, 40);
  ctx.fillStyle = '#f2e6a0'; ctx.fillRect(bx, by, 192, 4);
  ctx.fillStyle = '#c84a2a'; ctx.fillRect(bx, by + 30, 192, 10);
  ctx.fillStyle = '#3a5a7a'; for (let i = 8; i < 180; i += 22) ctx.fillRect(bx + i, by + 8, 16, 14);

  for (const c of cars) {
    const cx = Math.round(c.x - c.dy * 28 - cam.x), cy = Math.round(c.y + c.dx * 28 - cam.y);
    if (cx < -80 || cy < -80 || cx > VW + 80 || cy > VH + 80) continue;
    const vertical = Math.abs(c.dy) > Math.abs(c.dx);
    const w = vertical ? 30 : 64, h = vertical ? 64 : 30;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w, h);
    ctx.fillStyle = c.colour; ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = '#1a2a3a';
    if (vertical) { ctx.fillRect(cx - w / 2 + 3, cy + (c.dy < 0 ? -h / 2 + 10 : h / 2 - 22), w - 6, 12); ctx.fillRect(cx - w / 2 + 3, cy + (c.dy < 0 ? h / 2 - 14 : -h / 2 + 6), w - 6, 8); }
    else { ctx.fillRect(cx + (c.dx < 0 ? -w / 2 + 10 : w / 2 - 22), cy - h / 2 + 3, 12, h - 6); ctx.fillRect(cx + (c.dx < 0 ? w / 2 - 14 : -w / 2 + 6), cy - h / 2 + 3, 8, h - 6); }
  }

  for (const sh of shuttles) drawMinibus(sh.x, sh.y, sh.angle, sh.route.no);
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
    if (!p.person || (p.kind === 'offer' && declined)) continue;
    sprites.push({ y: placeY(p) - 10, draw: () => drawFigure(placeX(p) - cam.x + 10, placeY(p) - cam.y - 10, p.person!, 0, -1) });
  }
  if (!ride) sprites.push({ y: player.y, draw: drawPlayer });
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

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
  text('6 central', S(bx + cam.x + 4), T(by + cam.y) - 9, '#e8e4d8');
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

  // prompt line
  ctx.fillStyle = '#0a0c14'; ctx.fillRect(0, 332, W, 28);
  ctx.fillStyle = '#232a3a'; ctx.fillRect(0, 332, W, 1);
  if (ride) {
    text(`on the gmb ${ride.route.no} to ${ride.to.name}`, 8, 342, '#7be08a');
    text('tap to get off at your stop', 330, 342, '#6f7688');
  } else if (near) {
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(8, 339, 13, 14);
    text('e', 12, 342, '#08110c');
    text(near.name, 27, 342, '#ffffff');
    const after = 27 + tw(near.name) + 6;
    const j = jobAt(near);
    if (j?.mission && state.mission) text(`(callout $${j.def.pay * MISSION_PAY} - ${Math.ceil(state.mission.left)}s)`, after, 342, '#ff4a5f');
    else if (j) text(`(job $${j.def.pay})`, after, 342, '#ffc84a');
    else text(`(${({ minibus: 'ride', board: 'gigs', shop: 'buy gear', pirate: 'a man with discs', employer: 'work', library: 'study', course: 'courses', police: 'your record', prison: 'stay out', flavour: 'look', offer: 'a man in a cap', bus: 'go home', job: 'shop' } as Record<string, string>)[near.kind]})`, after, 342, '#9aa0b8');
  } else {
    text('wasd / tap to walk   shift run   e use   i status   z zoom', 8, 342, '#6f7688');
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
  const qLines = wrap(p.q.q, 96);
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
  textRight(`f${p.q.form} - ${TOPIC_NAMES[p.q.topic]}`, 628, 25, '#6f7688');
  const { qLines, optTop } = quizLayout();
  qLines.forEach((l, i) => prose(l, 24, 50 + i * 11, l.startsWith(' ') ? '#7be08a' : '#ffffff'));

  p.options.forEach((o, i) => {
    const r = quizOptionRect(i);
    let fill = 'rgba(28,34,48,0.98)';
    let edge = '#3a4054';
    if (qz.picked !== null) {
      if (i === p.answer) { fill = 'rgba(30,70,44,0.98)'; edge = '#7be08a'; }
      else if (i === qz.picked) { fill = 'rgba(80,28,32,0.98)'; edge = '#ff6a6a'; }
    }
    ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = edge; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(LETTERS[i], r.x + 9, r.y + 9, '#46e0e6');
    prose(o, r.x + 26, r.y + 9, '#e8e8f0');
  });

  if (qz.picked !== null) {
    const ok = qz.picked === p.answer;
    const y = optTop + 4 * 30 + 6;
    text(ok ? 'right' : `wrong - the answer is ${LETTERS[p.answer]}`, 24, y, ok ? '#7be08a' : '#ff6a6a');
    wrap(p.q.why, 98).forEach((l, i) => prose(l, 24, y + 14 + i * 11, '#c8ccdc'));
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
function frame(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  frames += 1;
  update(dt);
  if (state.jail) drawPrison();
  else if (job) drawJob();
  else if (quiz) drawQuiz();
  else { drawCity(); drawMenu(); }
  requestAnimationFrame(frame);
}

function start(): void {
  load();
  if (state.mission && !missionDef()) state.mission = null;
  setWorldText((g, s, x, y, colour) => { glyphs(g, s.toUpperCase(), x, y, colour); });
  const tx = Math.floor(state.x / TILE), ty = Math.floor(state.y / TILE);
  // saves from the 8 m map have positions on a different scale
  if (state.x < 0 || state.mapv !== 2 || solidTile(tx, ty)) placePlayer(START.tx, START.ty);
  else { player.x = state.x; player.y = state.y; }
  state.mapv = 2;
  spawnWalkers();
  setTimeout(startShuttles, 50);
  tickWork();
  if (state.mission) showWire(undefined, true);
  if (!state.jail && !dialogue) {
    if (state.work?.tasks.length) say('welcome back', workStatus());
    else if (state.answered === 0) {
      say('stanley', 'you get off the 6 at stanley with a used laptop and $1,280. the notice board in the market has gigs; the library is free; cafes are hiring. tap or use wasd to walk, e to use.');
    }
  }
  save();
  requestAnimationFrame(frame);
}

start();

// ------------------------------------------------------------- test hooks ---
const hooks = window as unknown as Record<string, unknown>;
hooks.__audio = audio;
hooks.__job = () => (job ? { id: job.def.id, step: job.step, stage: job.stage, shown: job.shown, opts: job.options, mission: job.mission } : null);
hooks.__quiz = () => (quiz ? { title: quiz.title, i: quiz.i, n: quiz.qs.length, answer: quiz.summary ? -1 : quiz.current.answer, picked: quiz.picked, right: quiz.right, summary: quiz.summary } : null);
hooks.__menu = () => (menu ? { title: menu.title, items: menu.items.map((i) => ({ label: i.label, off: !!i.off, sub: i.sub })) } : null);
hooks.__dialogue = () => dialogue;
Object.defineProperty(window, '__frames', { get: () => frames });
/** open a callout now instead of waiting for the street timer */
hooks.__mission = () => { nextMission = 0; };
/** jump the wall clock forward to test real-time work */
hooks.__skip = (hours: number) => { skew += hours * HOUR; tickWork(); };
/** stand at a place and use it */
hooks.__goto = (id: string) => { const p = PLACES.find((x) => x.id === id); if (p) { placePlayer(p.tx, p.ty); activate(p); } };
hooks.__reset = () => { reset(); location.reload(); };
hooks.__tp = (x: number, y: number) => placePlayer(x, y);
hooks.__items = ITEMS.map((i) => i.id);
hooks.__day = DAY;
/** the whole map as a PNG data URL, for checking the layout */
hooks.__world = (scale = 2) => renderOverview(scale).toDataURL();
/** metres on foot between two places, by id */
hooks.__walk = (a: string, b: string) => {
  const pa = PLACES.find((p) => p.id === a), pb = PLACES.find((p) => p.id === b);
  return pa && pb ? walkDistance(pa, pb) : -1;
};
