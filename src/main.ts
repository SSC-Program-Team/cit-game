/**
 * NETLIFE: HK — Tung Tau Wan Road, Stanley. The one-street game (v0.11).
 *
 * The game owns its requestAnimationFrame loop and draws to a 640x360 canvas over map.png.
 * North side, left to right: Stanley Plaza (all work), Stanley Restaurant (shut for now), the news
 * stand, Stanley Public Library (notes), St Stephen's College (exams) and Stanley Prison.
 * Modes, in priority order: your own prison sentence > a quiz > a page of text > a menu > the street.
 * See docs/design/one-street.md.
 */
import { state } from './state';
import { net, act, startNet, sendPos, serverNow, updateOthers, askNews } from './net';
import { ago, employer, exam, encounter, missing, money, recentRecord, type Ev, type QuizView } from './rules';
import { audio } from './audio';
import { GLYPHS } from './font';
import { QUESTIONS, TOPIC_NAMES, type Tier, type Topic } from './questions';
import { NOTES } from './notes';
import { ANSWER_MAX } from './marking';
import {
  EMPLOYERS, EXAMS, GIGS, TASK_EVERY, fireAfter, boardFor, slotOf, gigRate, essayRate, BOARD_EVERY, REP,
  EXPENSES_PER_HOUR, PASS_SHARE, ESSAY_POINTS, type Employer, type Gig,
} from './economy';

const W = 640;
const H = 360;

// ---------------------------------------------------------------- canvas ---
const canvas = document.createElement('canvas');
document.getElementById('app')!.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

/** laid out on a 640x360 grid; the canvas has as many real pixels as the screen shows (up to 4 per
 *  grid unit), so text stays sharp */
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

const mapImg = new Image();
mapImg.src = 'img/map.png?v=11';

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

function glyphs(s: string, x: number, y: number, colour: string, scale = 1): number {
  const a = atlas(colour);
  let cx = x;
  for (const ch of s) {
    const i = GLYPH_INDEX.get(ch) ?? GLYPH_INDEX.get(ch.toUpperCase());
    if (i !== undefined) {
      ctx.drawImage(a, (i % ATLAS_COLS) * CELL_W, Math.floor(i / ATLAS_COLS) * CELL_H, CELL_W, CELL_H,
        Math.round(cx), Math.round(y), CELL_W * scale, CELL_H * scale);
    }
    cx += CELL_W * scale;
  }
  return cx;
}

/** headline text: always capitals, like the signage */
const text = (s: string, x: number, y: number, colour = '#e8e8f0', scale = 1): number => glyphs(s.toUpperCase(), x, y, colour, scale);
/** reading text: mixed case, for questions, notes and explanations */
const prose = (s: string, x: number, y: number, colour = '#e8e8f0'): number => glyphs(s, x, y, colour);
const tw = (s: string, scale = 1): number => s.length * CELL_W * scale;
const textRight = (s: string, right: number, y: number, colour: string): void => { text(s, right - tw(s), y, colour); };
const textMid = (s: string, mid: number, y: number, colour: string, scale = 1): void => { text(s, mid - tw(s, scale) / 2, y, colour, scale); };

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

function button(r: Rect, label: string, colour = '#46e0e6', fill = 'rgba(28,34,48,0.98)'): void {
  ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = colour; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  textMid(label, r.x + r.w / 2, r.y + Math.round((r.h - 7) / 2), colour);
}

const now = serverNow;
const HK = (t: number): string => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' });
const hkHour = (): number => Number(new Date(now()).toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hour12: false }));

// ------------------------------------------------------------- the street ---
/** where you can walk: the north pavement and the road, measured off map.png */
const WALK = { minX: 10, maxX: 630, minY: 170, maxY: 214 };
const SPEED = 96;

type Spot = { id: string; x: number; title: string; tag: string; colour: string };
/** the doors, left to right: walk up to one, or tap its building */
const SPOTS: Spot[] = [
  { id: 'plaza', x: 72, title: 'stanley plaza', tag: 'work', colour: '#46e0e6' },
  { id: 'restaurant', x: 190, title: 'stanley restaurant', tag: 'shut', colour: '#6f7688' },
  { id: 'news', x: 269, title: 'news stand', tag: 'news', colour: '#5ce08a' },
  { id: 'library', x: 359, title: 'stanley public library', tag: 'notes', colour: '#ffc84a' },
  { id: 'college', x: 472, title: "st stephen's college", tag: 'exams', colour: '#c8a0ff' },
  { id: 'prison', x: 589, title: 'stanley prison', tag: 'inmates', colour: '#ff6a6a' },
];
/** the buildings' outlines on map.png, for taps */
const FRONTS: Record<string, Rect> = {
  plaza: { x: 6, y: 40, w: 132, h: 128 }, restaurant: { x: 144, y: 50, w: 92, h: 118 }, news: { x: 238, y: 66, w: 62, h: 102 },
  library: { x: 304, y: 54, w: 110, h: 114 }, college: { x: 418, y: 46, w: 124, h: 104 }, prison: { x: 546, y: 44, w: 90, h: 106 },
};
const DOOR_Y = 176;
const REACH = 26;

let player = { x: state.x, y: state.y, frame: 0, walked: 0, facing: 1 };
let target: { x: number; y: number; then?: Spot } | null = null;
let near: Spot | null = null;
let stepTimer = 0;
let frames = 0;
let toast: { text: string; colour: string; t: number } | null = null;
const flash = (s: string, colour = '#9aa0b8', t = 3.5): void => { toast = { text: s, colour, t }; };

// the ticker along the top: news as it happens
const TICKER_IDLE = [
  'rain tonight on tung tau wan road',
  'stanley plaza has work: freelance gigs and company jobs',
  'exams at st stephen\'s college open every day',
  'stanley restaurant: closed until further notice',
  'living costs in stanley: $2 an hour',
];
let tickerText = TICKER_IDLE[0];
let tickerX = W;
let tickerTimer = 0;
let tickerIndex = 0;
let tickerFresh = false;
function ticker(s: string, fresh = false): void { tickerText = s; tickerX = W; tickerTimer = 0; tickerFresh = fresh; }

// ------------------------------------------------------------- ambience ---
type Drop = { x: number; y: number; len: number; v: number };
const rain: Drop[] = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, len: 3 + Math.random() * 5, v: 210 + Math.random() * 260 }));
type Walker = { x: number; y: number; dir: number; v: number; coat: string; umbrella: boolean; phase: number };
const walkers: Walker[] = [
  { x: 120, y: 228, dir: 1, v: 26, coat: '#3b4a6b', umbrella: true, phase: 0 },
  { x: 300, y: 230, dir: -1, v: 21, coat: '#5a4a3b', umbrella: false, phase: 1.7 },
  { x: 470, y: 228, dir: 1, v: 30, coat: '#6b3b4a', umbrella: true, phase: 3.1 },
  { x: 560, y: 174, dir: -1, v: 18, coat: '#3b5a4a', umbrella: false, phase: 4.4 },
  { x: 220, y: 172, dir: 1, v: 22, coat: '#4a4a5a', umbrella: true, phase: 2.2 },
];
const car = { x: -80, v: 92, wait: 4, colour: '#b8382f' };

function lampGlow(x: number, y: number, r: number, colour: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------- people stopping you ---
/** someone who has walked up to you: drawn next to you, with their question */
let stranger: { id: string; until: number; x: number } | null = null;
/** seconds of street time before asking whether anyone wants you */
let strangerTimer = 45;

// ------------------------------------------------------------- dialogue ---
type Option = { label: string; act: () => void; colour?: string };
let dialogue: { title: string; lines: string[]; shown: number; total: number; options?: Option[] } | null = null;
function say(title: string, line: string, options?: Option[]): void {
  const lines = wrap(line, 96);
  dialogue = { title, lines, shown: 0, total: lines.join('').length, options };
}
const dlgRect = (i: number, n: number): Rect => {
  const w = n === 1 ? 300 : 284;
  return { x: n === 1 ? 170 : 30 + i * 296, y: 300, w, h: 24 };
};

// ----------------------------------------------------------------- menus ---
type MenuItem = { label: string; right?: string; sub?: string; act?: () => void; off?: boolean; why?: string; colour?: string };
type Menu = { title: string; line: string; items: MenuItem[]; back?: () => void };
let menu: Menu | null = null;

const MENU_X = 40;
const MENU_W = 560;
function menuLayout(m: Menu): { top: number; rows: Rect[] } {
  const lineCount = wrap(m.line, 88).length;
  const heights = m.items.map((it) => (it.sub ? 30 : 22));
  const total = 40 + lineCount * 10 + heights.reduce((a, b) => a + b + 4, 0) + 26;
  const top = Math.max(40, Math.round((H - total) / 2));
  let y = top + 34 + lineCount * 10;
  const rows = heights.map((h) => { const r = { x: MENU_X + 12, y, w: MENU_W - 24, h }; y += h + 4; return r; });
  return { top, rows };
}
function openMenu(m: Menu): void { menu = m; dialogue = null; target = null; audio.play('ui'); }
function closeMenu(): void { const back = menu?.back; menu = null; if (back) back(); }
function pickMenu(i: number): void {
  if (!menu) return;
  const it = menu.items[i];
  if (!it) return;
  if (it.off) { audio.play('bad'); if (it.why) flash(it.why, '#ff9a6a'); return; }
  audio.play('ui');
  it.act?.();
}

// -------------------------------------------------------- pages of text ---
/** news, notes, the prison list: a page of lines you can turn */
type Line = [string, string] | null;
let page: { title: string; sub: string; lines: Line[]; at: number; back?: () => void } | null = null;
const PAGE_LINES = 25;
function openPage(title: string, sub: string, lines: Line[], back?: () => void): void {
  page = { title, sub, lines, at: 0, back };
  menu = null; dialogue = null; target = null;
  audio.play('ui');
}
function closePage(): void { const back = page?.back; page = null; if (back) back(); }
function turnPage(d: number): void {
  if (!page) return;
  const at = page.at + d * PAGE_LINES;
  if (at < 0 || at >= page.lines.length) return;
  page.at = at;
  audio.play('ui');
}
/** prose wrapped to the page, one colour */
const para = (s: string, colour = '#dfe4f2', width = 96): Line[] => wrap(s, width).map((l) => [l, l.startsWith('  ') ? '#7be08a' : colour] as [string, string]);

const pagePrev: Rect = { x: 380, y: 330, w: 70, h: 20 };
const pageNext: Rect = { x: 456, y: 330, w: 70, h: 20 };
const pageBack: Rect = { x: 532, y: 330, w: 84, h: 20 };

// -------------------------------------------------------------- the quiz ---
const LETTERS = ['A', 'B', 'C', 'D'];

/** a quiz the server is holding: questions with shuffled options, never the answers */
class Quiz {
  i: number;
  picked: number | null = null;
  answer = -1;
  why = '';
  busy = false;
  /** a written answer: what was sent, and its mark */
  essayText = '';
  marked: Extract<Ev, { t: 'marked' }> | null = null;
  final: { lines: string[]; colour: string } | null = null;
  summary: string[] | null = null;
  summaryColour = '#7be08a';

  constructor(readonly view: QuizView) { this.i = view.i; }
  get current(): QuizView['qs'][number] { return this.view.qs[this.i]; }
  get answered(): boolean { return this.picked !== null || this.marked !== null; }

  pick(i: number): void {
    if (this.summary || this.answered || this.busy || this.current.kind !== 'mc' || i < 0 || i > 3) return;
    this.busy = true;
    const at = this.i;
    act('quiz.answer', { q: at, i }).then((r) => {
      this.busy = false;
      const a = r.events.find((e): e is Extract<Ev, { t: 'answer' }> => e.t === 'answer');
      if (!r.ok || !a || this.i !== at) return;
      this.picked = i;
      this.answer = a.answer;
      this.why = a.why;
    });
  }

  write(): void {
    if (this.summary || this.answered || this.busy || this.current.kind !== 'essay') return;
    const at = this.i;
    essayBox(this.current.q, this.essayText, (t) => {
      this.essayText = t;
      this.busy = true;
      act('quiz.essay', { q: at, text: t }).then((r) => {
        this.busy = false;
        const m = r.events.find((e): e is Extract<Ev, { t: 'marked' }> => e.t === 'marked');
        if (r.ok && m && this.i === at) this.marked = m;
      });
    }, (t) => { this.essayText = t; });
  }

  next(): void {
    if (this.summary) { quiz = null; act('quiz.end'); return; }
    if (!this.answered) { if (this.current.kind === 'essay') this.write(); return; }
    if (this.i + 1 >= this.view.qs.length) {
      if (!this.final) return; // the end screen is on its way
      this.summary = this.final.lines;
      this.summaryColour = this.final.colour;
      return;
    }
    this.picked = null;
    this.marked = null;
    this.essayText = '';
    this.i += 1;
  }
}
let quiz: Quiz | null = null;
const startQuiz = (kind: string, args: Record<string, unknown> = {}): void => { act('quiz.start', { kind, ...args }); };

/** a DOM box to type a written answer in: the pixel UI does not do typing */
let essayOpen = false;
function essayBox(question: string, start: string, submit: (t: string) => void, cancel: (t: string) => void): void {
  if (essayOpen) return;
  essayOpen = true;
  const el = document.createElement('div');
  el.setAttribute('style', 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.86);z-index:10;font:15px/1.5 ui-monospace,Menlo,monospace;color:#e8e8f0');
  const box = document.createElement('div');
  box.setAttribute('style', 'background:#121722;border-top:2px solid #ffc84a;padding:18px 20px;max-width:640px;width:calc(100% - 40px)');
  const q = document.createElement('div');
  q.textContent = question;
  q.setAttribute('style', 'color:#fff;margin-bottom:10px');
  const ta = document.createElement('textarea');
  ta.value = start;
  ta.maxLength = ANSWER_MAX;
  ta.rows = 7;
  ta.placeholder = 'write your answer in full sentences';
  ta.setAttribute('style', 'width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;background:#0b0d16;color:#fff;border:1px solid #3a4054;resize:vertical');
  const count = document.createElement('div');
  count.setAttribute('style', 'color:#6f7688;font-size:12px;margin:4px 0 10px');
  const upd = (): void => { count.textContent = `${ta.value.length} / ${ANSWER_MAX} - marked by the school ai against the marking points`; };
  upd();
  ta.addEventListener('input', upd);
  ta.addEventListener('keydown', (e) => e.stopPropagation());
  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:10px');
  const close = (): void => { el.remove(); essayOpen = false; };
  const mk = (label: string, fn: () => void, colour: string): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', `font:inherit;padding:7px 14px;background:#1c2230;color:${colour};border:1px solid ${colour};cursor:pointer`);
    b.addEventListener('click', fn);
    row.append(b);
  };
  mk('hand it in', () => { close(); submit(ta.value); }, '#ffc84a');
  mk('not yet', () => { close(); cancel(ta.value); }, '#9aa0b8');
  box.append(q, ta, count, row);
  el.append(box);
  document.body.append(el);
  ta.focus();
}

// --------------------------------------------------------------- events ---
function handle(events: Ev[]): void {
  for (const e of events) {
    switch (e.t) {
      case 'sound': audio.play(e.s); break;
      case 'toast': flash(e.text, e.colour ?? '#9aa0b8', e.secs ?? 3.5); break;
      case 'say': say(e.who, e.text); break;
      case 'news':
        if (net.mode === 'solo') { net.news.unshift([now(), `you ${e.public ?? e.text}`]); ticker(`you ${e.public ?? e.text}`, true); }
        break;
      case 'quiz': quiz = new Quiz(e.view); menu = null; page = null; dialogue = null; target = null; break;
      case 'summary': if (quiz) quiz.final = { lines: e.lines, colour: e.colour }; break;
      case 'warning':
        quiz = null; menu = null; page = null;
        say('police warning', `${e.act}. that breaks the ${e.law}: ${e.offence}. this time it is a written warning and a ${money(e.fine)} fine. it is on your record: next time is prison. ${e.fix}.`);
        break;
      case 'arrest': quiz = null; menu = null; page = null; dialogue = null; target = null; stranger = null; break;
      case 'released':
        player.x = SPOTS[5].x; player.y = DOOR_Y + 6;
        say('stanley prison', 'released. the gate shuts behind you. nobody waves.');
        break;
      case 'encounter': stranger = { id: e.id, until: e.until, x: player.x + (player.x > 560 ? -24 : 24) }; showStranger(); break;
      case 'encounterGone': stranger = null; if (dialogue?.title.startsWith('?')) dialogue = null; break;
      default: break;
    }
  }
}

function showStranger(): void {
  const e = stranger && encounter(stranger.id);
  if (!e) return;
  audio.play('alert');
  say(`? ${e.who}`, e.line, [
    { label: e.accept, act: () => { dialogue = null; act('encounter.answer', { yes: true }); }, colour: '#ffc84a' },
    { label: e.decline, act: () => { dialogue = null; act('encounter.answer', { yes: false }); } },
  ]);
}

// ------------------------------------------------------------- buildings ---
function activate(s: Spot): void {
  audio.play('door');
  target = null;
  near = s;
  switch (s.id) {
    case 'plaza': openPlaza(); break;
    case 'restaurant': say('stanley restaurant', 'the shutters are down. a notice taped to them says: closed for renovation. opening soon.'); break;
    case 'news': openNews(); break;
    case 'library': openLibrary(); break;
    case 'college': openCollege(); break;
    case 'prison': openPrison(); break;
    default: break;
  }
}

const workTasks = (): number => state.work?.tasks.length ?? 0;

function openPlaza(): void {
  const w = state.work, e = w && employer(w.id);
  openMenu({
    title: 'stanley plaza',
    line: 'the job centre on the ground floor. freelance gigs are one-off and pay by your answers; a company job pays a steady wage for every task, and tasks arrive every 5 hours, even while you are away.',
    items: [
      { label: 'freelance board', right: `${boardFor(slotOf(now())).filter((g) => !doneGig(g)).length} up`, sub: 'one-off gigs: paid by your answers, and they build your reputation', act: openBoard },
      { label: 'companies hiring', right: `${EMPLOYERS.length}`, sub: 'interview for a steady job (one company at a time)', act: openCompanies },
      ...(e ? [{
        label: `your job: ${e.name}`, right: workTasks() ? `${workTasks()} task${workTasks() > 1 ? 's' : ''}` : 'no tasks',
        colour: workTasks() ? '#ffc84a' : undefined, sub: workStatus(), act: () => openCompany(e),
      }] : []),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

const doneGig = (g: Gig): boolean => state.gigs.includes(`${slotOf(now())}:${g.id}`);

function gigPay(g: Gig): number {
  const avgForm = Math.round((g.forms[0] + g.forms[1]) / 2) as 1 | 2 | 3 | 4 | 5 | 6;
  return Math.round((gigRate(g) * g.mcs + (g.essay ? essayRate(avgForm) * g.mult : 0)) / 10) * 10;
}

function openBoard(): void {
  const slot = slotOf(now());
  const left = (slot + 1) * BOARD_EVERY - now();
  openMenu({
    title: 'freelance board',
    line: `new gigs in ${ago(left)}. pay is for every answer right: up to the amount shown. a gig with a written question is marked by the school ai. reputation ${state.rep}.`,
    back: openPlaza,
    items: boardFor(slot).map((g) => {
      const why = missing(state, g.needs, g.rep);
      const done = doneGig(g);
      return {
        label: g.title, right: done ? 'done' : `up to ${money(gigPay(g))}`,
        sub: `${g.client} - ${g.tier === 'dse' ? 'dse' : 'junior'} f${g.forms[0]}-${g.forms[1]} - ${g.mcs} mc${g.essay ? ' + 1 written' : ''}${why ? ` - ${why}` : ''}`,
        off: done || !!why, why: done ? 'done: a new board comes every 3 hours' : why,
        act: () => { menu = null; startQuiz('gig', { id: g.id }); },
      };
    }),
  });
}

function workStatus(): string {
  const w = state.work, e = w && employer(w.id);
  if (!w || !e) return '';
  if (!w.tasks.length) return `next task in ${ago(w.last + TASK_EVERY - now())}`;
  const age = now() - w.tasks[0];
  return `oldest task waiting ${ago(age)} - ${e.strict ? 'strict' : 'relaxed'} boss fires at ${e.strict ? 3 : 5} days (${ago(Math.max(0, fireAfter(e) - age))} left)`;
}

function openCompanies(): void {
  openMenu({
    title: 'companies hiring',
    line: `an interview is ${3} questions on what the company does; get 2 right and you start. fail and they see you again in an hour. reputation ${state.rep}.`,
    back: openPlaza,
    items: EMPLOYERS.map((e) => {
      const mine = state.work?.id === e.id;
      const why = mine ? '' : companyBar(e);
      return {
        label: e.name, right: `${money(e.wage)} a task`, colour: mine ? '#7be08a' : undefined,
        sub: mine ? `you work here - ${workStatus()}` : `${e.pitch}${why ? ` - ${why}` : ''}`,
        act: () => openCompany(e),
      };
    }),
  });
}

function companyBar(e: Employer): string {
  if (state.work && state.work.id !== e.id) return `you work for ${employer(state.work.id)?.name}`;
  const back = state.wait[e.id] ?? 0;
  if (back > now()) return `come back in ${ago(back - now())}`;
  const why = missing(state, e.needs, e.rep);
  if (why) return why;
  if (e.cleanDays && recentRecord(state, e.cleanDays, now())) return `no offences in the last ${e.cleanDays} days`;
  return '';
}

function openCompany(e: Employer): void {
  const mine = state.work?.id === e.id;
  const items: MenuItem[] = [];
  if (mine) {
    items.push({ label: 'do a work task', right: `${workTasks()} waiting`, sub: `3 questions. the wage is paid whatever the score`,
      off: !workTasks(), why: 'no tasks waiting yet', act: () => { menu = null; startQuiz('work'); } });
    items.push({ label: 'quit', sub: 'no penalty: you can apply somewhere else', colour: '#ff9a6a', act: () => { menu = null; act('work.quit'); } });
  } else {
    const why = companyBar(e);
    items.push({ label: 'interview', sub: why || `${e.boss} will ask 3 questions`, off: !!why, why, act: () => { menu = null; startQuiz('interview', { id: e.id }); } });
  }
  items.push({ label: 'back', act: openCompanies });
  openMenu({
    title: e.name,
    line: `${e.boss}: "${e.pitch}" ${money(e.wage)} for every task done. ${e.strict ? 'strict: a task left 3 days and you are fired.' : 'relaxed: a task left 5 days and you are fired.'}${e.needs.length ? ` needs: ${e.needs.map((n) => exam(n)?.name).join(', ')}.` : ''}${e.rep ? ` reputation ${e.rep}+.` : ''}`,
    back: openCompanies,
    items,
  });
}

function openNews(): void {
  if (net.mode === 'online') askNews();
  const lines: Line[] = [];
  lines.push(['the richest in stanley', '#ffc84a']);
  const top = net.board.top.slice(0, 5);
  if (!top.length) lines.push([net.mode === 'solo' ? 'solo play is not on the leaderboard' : 'nobody yet', '#6f7688']);
  top.forEach(([n, w], i) => lines.push([`${i + 1}. ${n.padEnd(14)} ${money(w)}`, i === 0 ? '#ffffff' : '#c8ccdc']));
  if (net.mode === 'online' && net.board.you[0]) lines.push([`you: ${net.board.you[0]}. with ${money(net.board.you[1])}`, '#46e0e6']);
  lines.push(null);
  lines.push(['the past 12 hours', '#ffc84a']);
  const cut = now() - 12 * 60 * 60 * 1000;
  const news = net.news.filter(([at]) => at > cut);
  if (!news.length) lines.push(['quiet day in stanley.', '#6f7688']);
  for (const [at, t] of news) for (const [i, l] of wrap(t, 86).entries()) lines.push([`${i ? '      ' : HK(at)} ${l}`, '#dfe4f2']);
  openPage('news stand', 'hires, firings, arrests and the richest in stanley', lines);
}

function openLibrary(): void {
  const topics = Object.keys(TOPIC_NAMES) as Topic[];
  openMenu({
    title: 'stanley public library',
    line: 'notes on everything asked in interviews, freelance gigs, work tasks and exams, shelf by shelf.',
    items: [
      ...topics.map((t) => {
        const n = NOTES.filter((x) => x.topic === t).length;
        return { label: `${t} ${TOPIC_NAMES[t]}`, right: n ? `${n} note${n > 1 ? 's' : ''}` : 'cards', act: () => openShelf(t) };
      }),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

function openShelf(t: Topic): void {
  const notes = NOTES.filter((x) => x.topic === t);
  const lines: Line[] = [];
  if (notes.length) {
    for (const n of notes) {
      lines.push([n.title, '#ffc84a']);
      for (const p of n.body.split('\n\n')) { lines.push(...para(p)); lines.push(null); }
    }
  } else {
    lines.push(['no notes on this shelf yet: revision cards from the question bank', '#6f7688']);
    lines.push(null);
    for (const q of QUESTIONS.filter((x) => x.topic === t)) {
      lines.push(...para(q.q.split('\n')[0], '#ffffff'));
      lines.push(...para(`answer: ${q.options[q.answer]}. ${q.why}`, '#c8ccdc'));
      lines.push(null);
    }
  }
  openPage(`${t} ${TOPIC_NAMES[t]}`, 'stanley public library', lines, openLibrary);
}

function openCollege(): void {
  openMenu({
    title: "st stephen's college",
    line: `exams for the jobs that ask for them: ${'multiple choice'} and one written answer marked by the school ai. pass with ${Math.round(PASS_SHARE * 100)}%. the first pass of each earns reputation +${REP.exam}.`,
    items: [
      ...EXAMS.map((x) => {
        const passed = state.certs.includes(x.id);
        return {
          label: x.name, right: passed ? 'passed' : money(x.fee), colour: passed ? '#7be08a' : undefined,
          sub: `${x.blurb} ${x.mcs} mc + 1 written (${x.mcs + ESSAY_POINTS} points)`,
          off: state.money < x.fee, why: `the fee is ${money(x.fee)}`,
          act: () => { menu = null; startQuiz('exam', { id: x.id }); },
        };
      }),
      { label: 'leave', act: () => { menu = null; } },
    ],
  });
}

function prisoners(): Array<[string, string, number]> {
  if (net.mode === 'online') return net.prison.filter((p) => p[2] > now());
  return state.jail && state.jail.until > now() ? [['you', state.jail.offence, state.jail.until]] : [];
}

function openPrison(): void {
  const list = prisoners();
  const lines: Line[] = [[`${list.length} inside`, '#ffc84a'], null];
  if (!list.length) lines.push(['the cells are empty tonight.', '#6f7688']);
  for (const [cls, offence, until] of list) {
    lines.push([`${cls.padEnd(6)} out in ${ago(until - now()).padEnd(4)}`, '#ffffff']);
    for (const l of wrap(offence, 80)) lines.push([`       ${l}`, '#c8ccdc']);
  }
  lines.push(null);
  lines.push(...para('visitors see class and number only. every offence here is something a player chose to do.', '#6f7688'));
  openPage('stanley prison', '99 tung tau wan road', lines);
}

// ------------------------------------------------------------------ input ---
function toGame(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

const jailed = (): boolean => !!state.jail && now() < state.jail.until;

function quizOptionRect(i: number): Rect {
  const { optTop } = quizLayout();
  return { x: 24, y: optTop + i * 30, w: 592, h: 26 };
}
const quizNextRect: Rect = { x: 470, y: 326, w: 146, h: 24 };
const essayWriteRect: Rect = { x: 24, y: 200, w: 220, h: 26 };

canvas.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  if (essayOpen) return;
  const { x, y } = toGame(ev);
  if (jailed()) { if (y > 300) openPrison(); return; }
  if (quiz) {
    const qz = quiz;
    if (qz.summary || qz.answered) { if (inRect(quizNextRect, x, y) || qz.summary) qz.next(); return; }
    if (qz.current.kind === 'essay') { if (inRect(essayWriteRect, x, y)) qz.write(); return; }
    for (let i = 0; i < 4; i += 1) if (inRect(quizOptionRect(i), x, y)) { qz.pick(i); return; }
    return;
  }
  if (page) {
    if (inRect(pagePrev, x, y)) turnPage(-1);
    else if (inRect(pageNext, x, y)) turnPage(1);
    else if (inRect(pageBack, x, y)) closePage();
    return;
  }
  if (menu) {
    const { rows } = menuLayout(menu);
    const i = rows.findIndex((r) => inRect(r, x, y));
    if (i >= 0) pickMenu(i); else closeMenu();
    return;
  }
  if (dialogue) {
    if (dialogue.options) {
      const i = dialogueRects().findIndex((r) => inRect(r, x, y));
      if (i >= 0) dialogue.options[i].act();
      return;
    }
    dialogue = null;
    return;
  }
  if (stranger && Math.hypot(x - stranger.x, y - (player.y - 8)) < 16) { showStranger(); return; }
  if (inRect(hudBoardRect, x, y)) { openNews(); return; }
  for (const s of SPOTS) {
    if (inRect(FRONTS[s.id], x, y, 0)) {
      if (Math.abs(player.x - s.x) < REACH) activate(s);
      else target = { x: s.x, y: DOOR_Y + 4, then: s };
      return;
    }
  }
  target = { x: Math.min(WALK.maxX, Math.max(WALK.minX, x)), y: Math.min(WALK.maxY, Math.max(WALK.minY, y)) };
});

const keys = new Set<string>();
window.addEventListener('keydown', (ev) => {
  audio.unlock();
  if (essayOpen) return;
  const k = ev.key;
  if (k === 'u' || k === 'U') { audio.toggleMute(); return; }
  if (jailed()) { if (k === 'p' || k === 'P') openPrison(); return; }
  if (quiz) {
    const qz = quiz;
    if (k === 'Enter' || k === ' ') { qz.next(); ev.preventDefault(); return; }
    const i = ['a', 'b', 'c', 'd'].indexOf(k.toLowerCase());
    const n = ['1', '2', '3', '4'].indexOf(k);
    if (i >= 0) qz.pick(i); else if (n >= 0) qz.pick(n);
    return;
  }
  if (page) {
    if (k === 'Escape' || k === 'e' || k === 'E') closePage();
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown') turnPage(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') turnPage(-1);
    ev.preventDefault();
    return;
  }
  if (menu) {
    if (k === 'Escape') { closeMenu(); return; }
    const n = Number(k);
    if (n >= 1 && n <= 9) pickMenu(n - 1);
    return;
  }
  if (dialogue) {
    if (dialogue.options) {
      const n = ['1', '2'].indexOf(k);
      if (n >= 0 && dialogue.options[n]) dialogue.options[n].act();
      return;
    }
    if (k === 'Escape' || k === ' ' || k === 'e' || k === 'E' || k === 'Enter') { dialogue = null; ev.preventDefault(); }
    return;
  }
  if (k === 'e' || k === 'E') {
    if (stranger && Math.abs(stranger.x - player.x) < 40) showStranger();
    else if (near) activate(near);
    return;
  }
  if (k === 'l' || k === 'L') { openNews(); return; }
  keys.add(k.toLowerCase());
});
window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// ----------------------------------------------------------------- update ---
function update(dt: number): void {
  for (const d of rain) {
    d.y += d.v * dt; d.x -= 40 * dt;
    if (d.y > H) { d.y = -8; d.x = Math.random() * W; }
    if (d.x < -4) d.x = W + 4;
  }
  for (const w of walkers) {
    w.x += w.dir * w.v * dt; w.phase += dt * 6;
    if (w.x > W + 10) w.x = -10;
    if (w.x < -10) w.x = W + 10;
  }
  car.wait -= dt;
  if (car.wait <= 0) {
    car.x += car.v * dt;
    if (car.x > W + 100) { car.x = -100; car.wait = 5 + Math.random() * 6; car.colour = ['#b8382f', '#e0e0e8', '#3a6ac8', '#2a2a30', '#e8c23a'][Math.floor(Math.random() * 5)]; }
  }
  updateOthers(dt);
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

  tickerTimer += dt;
  if (tickerTimer > 7) {
    tickerIndex += 1;
    const recent = net.news.slice(0, 4).map(([, t]) => t);
    const list = [...recent, ...TICKER_IDLE];
    ticker(list[tickerIndex % list.length]);
  }
  if (tickerX > 40) tickerX = Math.max(40, tickerX - (tickerTimer < 0.9 ? 900 : 130) * dt);

  if (jailed()) return;
  if (stranger && now() > stranger.until) stranger = null;
  if (quiz || page || menu) return;
  if (dialogue) { dialogue.shown = Math.min(dialogue.total, dialogue.shown + dt * 60); return; }

  // someone may stop you: the server decides who and when
  strangerTimer -= dt;
  if (strangerTimer <= 0) {
    strangerTimer = 50 + Math.random() * 40;
    if (!stranger) act('encounter.new');
  }

  let vx = 0, vy = 0;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup')) vy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vy += 1;
  if (vx || vy) target = null;
  else if (target) {
    const d = Math.hypot(target.x - player.x, target.y - player.y);
    if (d < 3) {
      const then = target.then;
      target = null;
      if (then) activate(then);
    } else { vx = (target.x - player.x) / d; vy = (target.y - player.y) / d; }
  }
  if (vx || vy) {
    const len = Math.hypot(vx, vy) || 1;
    player.x = Math.min(WALK.maxX, Math.max(WALK.minX, player.x + (vx / len) * SPEED * dt));
    player.y = Math.min(WALK.maxY, Math.max(WALK.minY, player.y + (vy / len) * SPEED * dt));
    if (vx) player.facing = vx > 0 ? 1 : -1;
    player.walked += SPEED * dt;
    player.frame = Math.floor(player.walked / 22) % 4;
    stepTimer += dt;
    if (stepTimer > 0.36) { stepTimer = 0; audio.play('step'); }
    sendPos(player.x, player.y);
    if (stranger) stranger.x += (player.x + (player.x > 560 ? -24 : 24) - stranger.x) * Math.min(1, dt * 2);
  } else player.frame = 0;
  near = SPOTS.find((s) => Math.abs(player.x - s.x) < REACH && player.y < DOOR_Y + 22) ?? null;
}

// ------------------------------------------------------------------- draw ---
function drawFigure(x: number, y: number, coat: string, frame: number, umbrella: boolean, facing = 1): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) ctx.scale(-1, 1);
  const swing = [0, 1, 0, -1][Math.floor(frame) % 4];
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.fillRect(-5, 13, 11, 2); ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a2b3a'; ctx.fillRect(-3, -13, 6, 4);
  ctx.fillStyle = '#e8b58a'; ctx.fillRect(-3, -9, 6, 3);
  ctx.fillStyle = coat; ctx.fillRect(-4, -6, 8, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-4, -6, 2, 9);
  ctx.fillStyle = '#232436';
  ctx.fillRect(-4, 3, 3, 5 - Math.max(0, swing));
  ctx.fillRect(1, 3, 3, 5 + Math.max(0, swing));
  if (umbrella) {
    ctx.fillStyle = '#20222e'; ctx.fillRect(0, -20, 1, 8);
    ctx.fillStyle = '#d8465f'; ctx.fillRect(-7, -21, 15, 2); ctx.fillRect(-5, -22, 11, 1);
  }
  ctx.restore();
}

function drawPlayer(x: number, y: number, coat: string, frame: number, facing: number): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  if (facing < 0) ctx.scale(-1, 1);
  const swing = [0, 1, 0, -1][Math.floor(frame) % 4];
  ctx.fillStyle = '#141520'; ctx.fillRect(-4, -19, 8, 3);
  ctx.fillStyle = '#161726'; ctx.fillRect(-4, -17, 8, 5);
  ctx.fillStyle = '#f2bd8d'; ctx.fillRect(-4, -13, 8, 4);
  ctx.fillStyle = '#141520'; ctx.fillRect(-1, -12, 1, 1); ctx.fillRect(2, -12, 1, 1);
  ctx.fillStyle = coat; ctx.fillRect(-4, -9, 9, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(2, -9, 3, 8);
  ctx.fillStyle = '#343a54';
  ctx.fillRect(-3, -1, 3, 4 - Math.max(0, swing));
  ctx.fillRect(1, -1, 3, 4 + Math.max(0, swing));
  ctx.fillStyle = '#141520';
  ctx.fillRect(-4 + (swing > 0 ? 1 : 0), 3, 4, 2);
  ctx.fillRect(1 - (swing > 0 ? 1 : 0), 3, 4, 2);
  ctx.fillStyle = '#c8a24a'; ctx.fillRect(-6, -6, 3, 4);
  ctx.restore();
}

function nameTag(name: string, x: number, y: number, colour: string): void {
  const w = tw(name) + 6;
  ctx.fillStyle = 'rgba(8,10,18,0.78)'; ctx.fillRect(Math.round(x - w / 2), y, w, 11);
  ctx.fillStyle = colour; ctx.fillRect(Math.round(x - w / 2), y + 10, w, 1);
  textMid(name, x, y + 2, '#e8e8f0');
}

const hudBoardRect: Rect = { x: 404, y: 16, w: 80, h: 18 };

function drawHud(): void {
  ctx.fillStyle = 'rgba(8,10,18,0.92)'; ctx.fillRect(0, 0, W, 15);
  const tag = tickerFresh ? '#ffc84a' : '#5ce08a';
  ctx.fillStyle = tag; ctx.fillRect(0, 14, W, 1); ctx.fillRect(0, 0, 34, 14);
  text('news', 6, 3, '#08110c');
  ctx.save();
  ctx.beginPath(); ctx.rect(36, 0, W - 44, 15); ctx.clip();
  prose(tickerText, tickerX, 3, '#dfe4f2');
  ctx.restore();

  ctx.fillStyle = 'rgba(8,10,18,0.72)'; ctx.fillRect(0, 15, W, 20);
  text(`tung tau wan rd ${HK(now())}`, 8, 21, '#9aa0b8');
  // money and reputation
  ctx.fillStyle = '#ffc84a'; ctx.fillRect(220, 22, 5, 5);
  text(money(state.money), 230, 21, '#ffc84a');
  text(`rep ${state.rep}`, 318, 21, '#7be0d0');
  // your place on the leaderboard
  const rank = net.mode === 'online' && net.board.you[0] ? `#${net.board.you[0]} richest` : net.mode === 'solo' ? 'solo' : '';
  if (rank) text(rank, hudBoardRect.x + 4, 21, '#c8ccdc');
  if (workTasks()) { ctx.fillStyle = '#ffc84a'; ctx.fillRect(496, 19, 62, 13); text(`${workTasks()} task${workTasks() > 1 ? 's' : ''}`, 500, 21, '#0d1018'); }
  textRight(audio.muted ? 'muted' : `${net.others.size + 1} here`, 632, 21, '#6f7688');
}

function drawStreet(): void {
  ctx.drawImage(mapImg, 0, 0, W, H);

  if (car.wait <= 0) {
    const cx = Math.round(car.x);
    ctx.fillStyle = 'rgba(255,240,200,0.10)';
    ctx.beginPath(); ctx.moveTo(cx + 22, 196); ctx.lineTo(cx + 120, 188); ctx.lineTo(cx + 120, 206); ctx.closePath(); ctx.fill();
    ctx.fillStyle = car.colour; ctx.fillRect(cx, 194, 26, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx, 199, 26, 4);
    ctx.fillStyle = '#1a1c26'; ctx.fillRect(cx + 4, 191, 18, 4);
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(cx + 24, 196, 3, 2);
    ctx.fillStyle = '#141520'; ctx.fillRect(cx + 4, 203, 5, 2); ctx.fillRect(cx + 17, 203, 5, 2);
  }

  // everyone on the street, back to front
  type Body = { y: number; draw: () => void };
  const bodies: Body[] = walkers.map((w) => ({ y: w.y, draw: () => drawFigure(w.x, w.y, w.coat, w.phase, w.umbrella, w.dir) }));
  for (const o of net.others.values()) {
    bodies.push({ y: o.y, draw: () => { drawPlayer(o.x, o.y, o.coat, o.frame, o.facing); nameTag(o.name, o.x, o.y - 33, o.coat); } });
  }
  if (!jailed()) bodies.push({ y: player.y, draw: () => { drawPlayer(player.x, player.y, net.me.coat, player.frame, player.facing); if (net.mode === 'online') nameTag(net.me.name, player.x, player.y - 33, '#46e0e6'); } });
  if (stranger) {
    const sx = stranger.x, sy = player.y;
    bodies.push({ y: sy - 0.5, draw: () => {
      drawFigure(sx, sy, encounter(stranger!.id)?.kind === 'trap' ? '#2c2e36' : '#6a5a3a', 0, false, sx > player.x ? -1 : 1);
      const bob = Math.sin(performance.now() / 200) * 2;
      ctx.fillStyle = 'rgba(8,10,18,0.9)'; ctx.fillRect(sx - 5, sy - 48 + bob, 11, 12);
      ctx.fillStyle = '#ffc84a'; ctx.fillRect(sx - 5, sy - 37 + bob, 11, 1);
      text('?', sx - 2, sy - 46 + bob, '#ffc84a');
    } });
  }
  bodies.sort((a, b) => a.y - b.y).forEach((b) => b.draw());

  // rain and the night
  ctx.strokeStyle = 'rgba(186,210,235,0.34)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of rain) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1.5, d.y + d.len); }
  ctx.stroke();
  const h = hkHour();
  const dark = h >= 19 || h < 6 ? 1 : h >= 17 || h < 8 ? 0.6 : 0.3;
  const grade = ctx.createLinearGradient(0, 0, 0, H);
  grade.addColorStop(0, `rgba(12,18,42,${0.3 * dark})`);
  grade.addColorStop(0.7, `rgba(12,18,42,${0.11 * dark})`);
  grade.addColorStop(1, `rgba(12,18,42,${0.24 * dark})`);
  ctx.fillStyle = grade; ctx.fillRect(0, 15, W, H - 15);

  const t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  lampGlow(72, 150, 52, 'rgba(70,224,230,0.30)', 0.95);
  lampGlow(269, 150, 34, 'rgba(120,255,170,0.26)', 0.9);
  lampGlow(359, 150, 40, 'rgba(255,196,110,0.24)', 0.9);
  lampGlow(472, 130, 30, 'rgba(255,214,150,0.18)', 0.8);
  lampGlow(589, 112, 30, 'rgba(255,90,90,0.16)', 0.6 + 0.4 * Math.abs(Math.sin(t * 1.3)));
  for (const lx of [140, 246, 348, 452, 556]) lampGlow(lx + 1, 166, 40, 'rgba(255,214,150,0.12)', 0.85);
  ctx.restore();

  // what each door is for, and the prison's count on top
  for (const s of SPOTS) {
    const f = FRONTS[s.id];
    const label = s.id === 'prison' ? `${prisoners().length} inside` : s.tag;
    const w = tw(label) + 8;
    // the plaza's own sign fills its roofline: its tag hangs over the entrance instead
    const x = Math.round(s.x - w / 2), y = s.id === 'plaza' ? 124 : Math.max(38, f.y - 4);
    ctx.fillStyle = 'rgba(8,10,18,0.82)'; ctx.fillRect(x, y, w, 11);
    ctx.fillStyle = s.colour; ctx.fillRect(x, y + 10, w, 1);
    text(label, x + 4, y + 2, s.colour);
  }
  if (workTasks()) {
    const bob = Math.sin(performance.now() / 320) * 2;
    ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fillRect(66, 132 + bob, 13, 13);
    ctx.fillStyle = '#ffc84a'; ctx.fillRect(66, 144 + bob, 13, 1);
    text('!', 70, 134 + bob, '#ffc84a');
  }

  drawHud();

  // the prompt bar
  ctx.fillStyle = 'rgba(8,10,18,0.86)'; ctx.fillRect(0, 332, W, 28);
  ctx.fillStyle = '#232a3a'; ctx.fillRect(0, 332, W, 1);
  if (near) {
    ctx.fillStyle = near.colour; ctx.fillRect(8, 339, 13, 14);
    text('e', 12, 342, '#08110c');
    text(near.title, 27, 342, '#ffffff');
    text(`(${near.tag})`, 33 + tw(near.title), 342, near.colour);
  } else if (stranger) {
    text('someone wants a word - e or tap them', 8, 342, '#ffc84a');
  } else {
    text('wasd / tap to walk   e enter   l news   u mute', 8, 342, '#6f7688');
  }
  if (toast && !dialogue) {
    const w = tw(toast.text) + 20;
    ctx.globalAlpha = Math.min(1, toast.t * 2);
    ctx.fillStyle = 'rgba(8,10,18,0.95)'; ctx.fillRect((W - w) / 2, 306, w, 20);
    ctx.fillStyle = toast.colour; ctx.fillRect((W - w) / 2, 306, w, 1);
    text(toast.text, (W - w) / 2 + 10, 312, toast.colour);
    ctx.globalAlpha = 1;
  }
  if (dialogue) drawDialogue();
}

function drawDialogue(): void {
  const d = dialogue!;
  const opts = d.options ?? [];
  const h = 26 + d.lines.length * 11 + (opts.length ? 34 : 14);
  const y = (opts.length ? 330 : 326) - h;
  ctx.fillStyle = 'rgba(8,10,18,0.96)'; ctx.fillRect(20, y, 600, h);
  ctx.fillStyle = opts.length ? '#ffc84a' : '#46e0e6'; ctx.fillRect(20, y, 600, 1);
  text(d.title.replace(/^\? /, ''), 30, y + 8, '#ffc84a');
  let left = Math.floor(d.shown);
  d.lines.forEach((l, i) => { prose(l.slice(0, Math.max(0, left)), 30, y + 22 + i * 11, '#dfe4f2'); left -= l.length; });
  if (opts.length) {
    if (stranger && d.title.startsWith('?')) textRight(`${Math.max(0, Math.ceil((stranger.until - now()) / 1000))}s`, 610, y + 8, '#6f7688');
    opts.forEach((o, i) => {
      const r = { ...dlgRect(i, opts.length), y: y + h - 30 };
      ctx.fillStyle = 'rgba(20,24,34,0.96)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#3a4054'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      text(`[${i + 1}]`, r.x + 10, r.y + 8, '#46e0e6');
      text(o.label, r.x + 40, r.y + 8, o.colour ?? '#e8e8f0');
    });
  } else text('[space]', 574, y + h - 12, '#5b6379');
}

/** dialogue option rects follow the box, which depends on its height: hit-test the same way */
function dialogueRects(): Rect[] {
  const d = dialogue!;
  const opts = d.options ?? [];
  const h = 26 + d.lines.length * 11 + 34;
  const y = 330 - h;
  return opts.map((_, i) => ({ ...dlgRect(i, opts.length), y: y + h - 30 }));
}

function drawMenu(): void {
  const m = menu!;
  ctx.fillStyle = 'rgba(6,8,14,0.72)'; ctx.fillRect(0, 0, W, H);
  const { top, rows } = menuLayout(m);
  const bottom = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h + 22 : top + 60;
  ctx.fillStyle = '#121722'; ctx.fillRect(MENU_X, top, MENU_W, bottom - top);
  ctx.fillStyle = '#46e0e6'; ctx.fillRect(MENU_X, top, MENU_W, 1);
  text(m.title, MENU_X + 12, top + 10, '#ffc84a');
  textRight(`${money(state.money)}  rep ${state.rep}`, MENU_X + MENU_W - 12, top + 10, '#6f7688');
  wrap(m.line, 88).forEach((l, i) => prose(l, MENU_X + 12, top + 26 + i * 10, '#c8ccdc'));
  m.items.forEach((it, i) => {
    const r = rows[i];
    ctx.globalAlpha = it.off ? 0.55 : 1;
    ctx.fillStyle = it.off ? 'rgba(18,20,28,0.9)' : 'rgba(28,34,48,0.98)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (!it.off) { ctx.strokeStyle = '#3a4054'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
    text(`${i + 1}`, r.x + 8, r.y + 7, '#46e0e6');
    text(it.label.length > 52 ? `${it.label.slice(0, 50)}..` : it.label, r.x + 24, r.y + 7, it.off && !it.colour ? '#8a90a8' : it.colour ?? '#e8e8f0');
    if (it.right) textRight(it.right, r.x + r.w - 8, r.y + 7, it.off ? '#6f7688' : '#ffc84a');
    if (it.sub) prose(it.sub.length > 88 ? `${it.sub.slice(0, 86)}..` : it.sub, r.x + 24, r.y + 18, '#8a90a8');
    ctx.globalAlpha = 1;
  });
  text('esc / tap outside to go back', MENU_X + 12, bottom - 14, '#5b6379');
}

function drawPage(): void {
  const p = page!;
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#121722'; ctx.fillRect(0, 0, W, 38);
  ctx.fillStyle = '#ffc84a'; ctx.fillRect(0, 37, W, 1);
  text(p.title, 12, 10, '#ffffff');
  prose(p.sub, 12, 25, '#8a90a8');
  const pages = Math.max(1, Math.ceil(p.lines.length / PAGE_LINES));
  textRight(`${Math.floor(p.at / PAGE_LINES) + 1} / ${pages}`, 628, 10, '#9aa0b8');
  p.lines.slice(p.at, p.at + PAGE_LINES).forEach((l, i) => { if (l) prose(l[0], 24, 46 + i * 11, l[1]); });
  if (p.at > 0) button(pagePrev, '< prev');
  if (p.at + PAGE_LINES < p.lines.length) button(pageNext, 'next >');
  button(pageBack, 'esc back', '#9aa0b8');
}

function quizLayout(): { qLines: string[]; optTop: number } {
  const qLines = wrap(quiz!.current.q, 96);
  return { qLines, optTop: Math.max(112, 58 + qLines.length * 11 + 10) };
}

function drawQuiz(): void {
  const qz = quiz!;
  const tier: Tier = qz.view.tier;
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#121722'; ctx.fillRect(0, 0, W, 38);
  const tc = tier === 'dse' ? '#ffc84a' : '#7be0d0';
  ctx.fillStyle = tc; ctx.fillRect(0, 37, W, 1);
  const badge = tier === 'dse' ? 'dse' : 'junior';
  ctx.fillStyle = tc; ctx.fillRect(12, 8, tw(badge) + 8, 12);
  text(badge, 16, 10, '#0d1018');
  text(qz.view.title, 24 + tw(badge), 10, '#ffffff');
  prose(qz.view.sub, 12, 25, '#8a90a8');

  if (qz.summary) {
    text('done', 24, 70, qz.summaryColour, 3);
    qz.summary.forEach((l, i) => prose(l, 24, 118 + i * 16, i === 0 ? '#ffffff' : '#c8ccdc'));
    ctx.fillStyle = '#232a3a'; ctx.fillRect(24, 300, 592, 1);
    text('[enter] or tap to continue', 24, 314, '#46e0e6');
    return;
  }

  const p = qz.current;
  textRight(`${qz.i + 1} / ${qz.view.qs.length}`, 628, 10, '#9aa0b8');
  textRight(`f${p.form} - ${TOPIC_NAMES[p.topic]}`, 628, 25, '#6f7688');
  const { qLines, optTop } = quizLayout();
  qLines.forEach((l, i) => prose(l, 24, 50 + i * 11, l.startsWith(' ') ? '#7be08a' : '#ffffff'));

  if (p.kind === 'essay') {
    if (qz.marked) {
      const m = qz.marked;
      const good = m.score / m.marks >= 0.5;
      let y = optTop - 8;
      text(`${m.score} / ${m.marks} marks`, 24, y, good ? '#7be08a' : '#ff6a6a', 2); y += 24;
      prose(m.by === 'ai' ? 'marked by the school ai' : 'marked by the keyword check (the school ai was not available)', 24, y, '#6f7688'); y += 14;
      for (const l of wrap(m.feedback, 98).slice(0, 5)) { prose(l, 24, y, '#dfe4f2'); y += 11; }
      y += 6;
      text('a full-mark answer', 24, y, '#ffc84a'); y += 12;
      for (const l of wrap(m.model, 98).slice(0, 6)) { prose(l, 24, y, '#c8ccdc'); y += 11; }
      button(quizNextRect, qz.i + 1 < qz.view.qs.length ? '[enter] next' : '[enter] finish');
      return;
    }
    if (qz.busy) {
      const dots = '.'.repeat(1 + (Math.floor(performance.now() / 400) % 3));
      text(`marking${dots}`, 24, optTop + 4, '#ffc84a', 2);
      prose('the school ai is reading your answer', 24, optTop + 30, '#6f7688');
      return;
    }
    text(`written answer - ${p.marks} marks`, 24, optTop - 6, '#ffc84a');
    const r = { ...essayWriteRect, y: optTop + 8 };
    essayWriteRect.y = r.y;
    button(r, qz.essayText ? '[enter] carry on writing' : '[enter] write your answer', '#ffc84a');
    if (qz.essayText) for (const [i, l] of wrap(qz.essayText, 96).slice(0, 8).entries()) prose(l, 24, r.y + 36 + i * 11, '#8a90a8');
    return;
  }

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
    button(quizNextRect, qz.i + 1 < qz.view.qs.length ? '[enter] next' : '[enter] finish');
  } else text('a-d or 1-4 to answer, or tap', 24, 336, '#6f7688');
}

function drawJail(): void {
  const j = state.jail!;
  ctx.fillStyle = '#14161f'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 12) for (let x = (y / 12) % 2 ? -14 : 0; x < 236; x += 28) { ctx.fillStyle = '#1b1e29'; ctx.fillRect(x + 1, y + 1, 26, 10); }
  ctx.fillStyle = '#26324f'; ctx.fillRect(72, 50, 92, 56);
  lampGlow(118, 78, 60, 'rgba(150,180,255,0.18)', 1);
  ctx.fillStyle = '#3a3f52';
  for (let x = 72; x <= 164; x += 13) ctx.fillRect(x, 50, 3, 56);
  ctx.fillStyle = '#2a2d3a'; ctx.fillRect(30, 250, 170, 14);
  ctx.fillStyle = '#4a4d5c'; ctx.fillRect(30, 246, 170, 4);
  for (let x = 6; x < 236; x += 22) { ctx.fillStyle = '#353846'; ctx.fillRect(x, 0, 5, H); ctx.fillStyle = '#4d5165'; ctx.fillRect(x, 0, 1, H); }
  text('stanley prison', 20, 290, '#dfe4f2', 2);
  text('99 tung tau wan road', 20, 312, '#6f7688');
  text(`${prisoners().length} inside - [p] or tap the case sheet's foot to see who`, 20, 326, '#ff6a6a');

  const act_ = wrap(j.act, 56), offence = wrap(j.offence, 56), fix = wrap(j.fix, 56);
  const sx = 254, sw = 362;
  const sh = 196 + 12 * (act_.length + offence.length + fix.length);
  const sy = Math.round((H - sh) / 2);
  ctx.fillStyle = '#c9c3b2'; ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = '#efe9d8'; ctx.fillRect(sx, sy, sw, 2);
  const lx = sx + 14, ink = '#20201d', label = '#6a675c';
  let y = sy + 12;
  text('case sheet', lx, y, '#8a2c2c'); textRight(net.me.cls || '', sx + sw - 14, y, '#8a2c2c'); y += 20;
  text('what you did', lx, y, label); y += 12;
  for (const l of act_) { text(l, lx, y, ink); y += 12; }
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
  text(`real minutes. reputation -${-REP.arrested}.`, lx, y, '#4a473f'); y += 12;
  text(`living costs still run: $${EXPENSES_PER_HOUR} an hour.`, lx, y, '#4a473f');
}

// ------------------------------------------------------------------- loop ---
let last = performance.now();
function frame(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  frames += 1;
  update(dt);
  ctx.setTransform(PXR, 0, 0, PXR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (page) drawPage();
  else if (jailed()) drawJail();
  else if (quiz) drawQuiz();
  else { drawStreet(); if (menu) drawMenu(); }
  requestAnimationFrame(frame);
}

async function start(): Promise<void> {
  await startNet({
    events: handle,
    wire: (s) => { ticker(s, true); audio.play('ui'); },
  });
  player = {
    x: Math.min(WALK.maxX, Math.max(WALK.minX, state.x)),
    y: Math.min(WALK.maxY, Math.max(WALK.minY, state.y)),
    frame: 0, walked: 0, facing: 1,
  };
  // the tick says what happened while you were away (solo: online, the server already sent it)
  if (net.mode === 'solo') act('tick');
  requestAnimationFrame(frame);
}

if (mapImg.complete) start(); else mapImg.addEventListener('load', () => { start(); }, { once: true });

// ------------------------------------------------------------- test hooks ---
const hooks = window as unknown as Record<string, unknown>;
hooks.__cit = state;
hooks.__net = net;
Object.defineProperty(window, '__frames', { get: () => frames });
/** stand at a door and use it */
hooks.__goto = (id: string): void => { const s = SPOTS.find((x) => x.id === id); if (s) { player.x = s.x; player.y = DOOR_Y + 4; sendPos(player.x, player.y); activate(s); } };
hooks.__menu = (): unknown => (menu ? { title: menu.title, items: menu.items.map((i) => i.label) } : page ? { page: page.title, lines: page.lines.length } : null);
hooks.__pick = (i: number): void => pickMenu(i);
hooks.__quiz = (): unknown => (quiz ? { i: quiz.i, kind: quiz.current.kind, n: quiz.view.qs.length, summary: quiz.summary, marked: quiz.marked, answered: quiz.answered } : null);
hooks.__stranger = (): void => { strangerTimer = 0; };
hooks.__gigs = (): unknown => GIGS.length;
