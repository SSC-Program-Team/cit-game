/**
 * NETLIFE: HK — Tung Tau Wan Road, Stanley. v0.2 slice.
 *
 * The game owns its own requestAnimationFrame loop and draws to a 640x360 canvas;
 * Phaser's scene manager never stepped in this environment, and plain Canvas2D is
 * both smaller (14 kB vs 1.5 MB) and easier to reason about for pixel art.
 */
import { state, save, clock, load, addMoney, addMinutes, addMastery } from './state';
import { audio } from './audio';
import { JOBS, MISSIONS, OFFER, CHARSET, type JobDef, type Crime, type Prop } from './jobs';

const W = 640;
const H = 360;

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

// ----------------------------------------------------------------- images ---
function img(src: string): HTMLImageElement {
  const i = new Image();
  i.src = src;
  return i;
}
const mapImg = img('img/map.png?v=5');
const fontImg = img('img/font.png?v=4');

// ------------------------------------------------------------------ text ---
const CELL_W = 6;
const CELL_H = 8;
const COLS = 24;
const tinted = new Map<string, HTMLCanvasElement>();

function atlas(colour: string): HTMLCanvasElement {
  const hit = tinted.get(colour);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = fontImg.width || 144;
  c.height = fontImg.height || 24;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(fontImg, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  tinted.set(colour, c);
  return c;
}

function text(s: string, x: number, y: number, colour = '#e8e8f0', scale = 1): number {
  const a = atlas(colour);
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const i = CHARSET.indexOf(ch);
    if (i >= 0) {
      // whole pixels only: a fractional x samples the neighbouring glyph in the atlas
      ctx.drawImage(a, (i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H, CELL_W, CELL_H,
        Math.round(cx), Math.round(y), CELL_W * scale, CELL_H * scale);
    }
    cx += CELL_W * scale;
  }
  return cx;
}

const tw = (s: string, scale = 1): number => s.length * CELL_W * scale;

function textRight(s: string, right: number, y: number, colour: string): void {
  text(s, right - tw(s), y, colour);
}

function wrap(s: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    if (line && line.length + 1 + word.length > max) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
const inRect = (r: Rect, x: number, y: number, slop = 3): boolean =>
  x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop;

// answer rows on the job screen and the two buttons in a street choice; drawing and
// hit-testing share these so a tap lands on the row it looks like it lands on
const optRect = (i: number): Rect => ({ x: 262, y: 198 + i * 28, w: 344, h: 24 });
const dlgRect = (i: number): Rect => ({ x: 30 + i * 296, y: 284, w: 284, h: 26 });

// ------------------------------------------------------------------ state ---
type Spot = {
  id: string; x: number; y: number; my: number; r: number; title: string; line: string;
  job?: JobDef; mission?: boolean; offer?: boolean; shut?: boolean;
};

const MISSION_WINDOW = 90;
const MISSION_PAY = 2;
const NO_SHOW_FEE = 100;
const JAIL_MS = 30 * 60 * 1000;

// the road band, measured off map.png: asphalt sits at y 184-212
const WALK = { minX: 16, maxX: 624, minY: 187, maxY: 209 };

const WIRE = [
  'MEI LING SOLD HER FLAT IN SHAU KEI WAN - $5.1M',
  'CAT6 DRUM UP 12% AT GOLDEN ARCADE - NOW $680',
  'STANLEY MARKET STALLS SHUT TONIGHT - TYPHOON 3',
  'A STUDENT PASSED THE NETWORK SPECIALIST PAPER',
  'THE 6 BUS IS DIVERTED VIA STANLEY VILLAGE',
  'PRISON LAUNDRY TENDER WENT TO A KOWLOON FIRM',
];

let spots: Spot[] = [];
let player = { x: state.x, y: state.y, frame: 0, walked: 0, facing: 1 };
let target: { x: number; y: number } | null = null;
let near: Spot | null = null;
let wireIndex = 0;
let wireX = W;
let wireTimer = 0;
let wireText = WIRE[0];
let wireAlert = false;
/** what the player did this session, newest first: the wire carries it */
const news: string[] = [];
type DlgOption = { label: string; act: () => void };
let dialogue: { title: string; line: string; shown: number; options?: DlgOption[] } | null = null;
let job: Job | null = null;
let stepTimer = 0;
let nextMission = 60;
let declined = false;
let toast: { text: string; colour: string; t: number } | null = null;
let frames = 0;

// ------------------------------------------------------------- ambience ---
type Drop = { x: number; y: number; len: number; v: number };
const rain: Drop[] = Array.from({ length: 110 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  len: 3 + Math.random() * 5,
  v: 210 + Math.random() * 260,
}));

type Walker = { x: number; dir: number; v: number; coat: string; umbrella: boolean; phase: number };
const walkers: Walker[] = [
  { x: 120, dir: 1, v: 26, coat: '#3b4a6b', umbrella: true, phase: 0 },
  { x: 300, dir: -1, v: 21, coat: '#5a4a3b', umbrella: false, phase: 1.7 },
  { x: 470, dir: 1, v: 30, coat: '#6b3b4a', umbrella: true, phase: 3.1 },
  { x: 560, dir: -1, v: 18, coat: '#3b5a4a', umbrella: false, phase: 4.4 },
];

const car = { x: -80, v: 92, dir: 1, wait: 4 };

function lampGlow(x: number, y: number, r: number, colour: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// -------------------------------------------------------------------- job ---
type Step = 'typing' | 'ask' | 'paid';

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
    if (c.crime) { arrest(c.crime); return; }
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
    state.energy = Math.max(0, state.energy - 1);
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
    buildSpots();
    showWire(news[0], false);
  }
}

// ------------------------------------------------------------ consequence ---
function arrest(c: Crime): void {
  audio.play('bad');
  job = null;
  dialogue = null;
  target = null;
  keys.clear();
  state.mission = null;
  state.jail = { until: Date.now() + JAIL_MS, ...c };
  news.unshift('a stanley technician was detained tonight');
  save();
  buildSpots();
}

const jailed = (): boolean => !!state.jail && Date.now() < state.jail.until;

function release(): void {
  state.jail = null;
  player.x = 600;
  player.y = 196;
  state.x = player.x;
  state.y = player.y;
  nextMission = 90;
  save();
  buildSpots();
  dialogue = { title: 'stanley prison 99', line: 'released. the gate shuts behind you. nobody waves.', shown: 0 };
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
  buildSpots();
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
  toast = { text: `${what} - no-show fee -$${NO_SHOW_FEE}`, colour: '#ff6a6a', t: 4 };
  audio.play('bad');
  save();
  buildSpots();
  showWire(news[0], false);
}

// ------------------------------------------------------------------ world ---
function buildSpots(): void {
  const done = (id: string): boolean => state.done.includes(id);
  const sore = (client: string): boolean => (state.rep[client] ?? 0) < 0;
  spots = [
    { id: 'chantai', x: 52, y: 196, my: 148, r: 26, title: 'chan tai',
      line: done('chantai') ? 'you fixed the till. she gives you buns now.' : 'the till cannot reach the internet. she is not calm.' },
    { id: 'restaurant', x: 142, y: 196, my: 148, r: 22, title: 'stanley restaurant', shut: true, line: 'shut for the night. the wifi password is on a laminated card by the door.' },
    { id: 'store', x: 214, y: 196, my: 148, r: 20, title: 'the store', shut: !done('m.store'),
      line: done('m.store') ? 'the card machine beeps. the owner nods at you.'
        : sore('the store') ? 'they called ah ming last time. the shutter stays down.'
          : 'the shutter is half down. someone is watching a drama on a phone.' },
    { id: 'market', x: 320, y: 196, my: 148, r: 26, title: 'stanley market', shut: !done('m.market'),
      line: done('m.market') ? 'the stall tablets glow. someone saved you a fish ball.'
        : sore('stall holders') ? 'the stall holders remember you did not come.'
          : 'stalls folded. a cat owns the walkway now.' },
    { id: 'bakery', x: 402, y: 196, my: 152, r: 22, title: 'bakery',
      line: done('bakery') ? 'receipts print. she waves you in for coffee.' : 'the new receipt printer prints nothing. she is cross.' },
    { id: 'college', x: 484, y: 196, my: 160, r: 24, title: 'college gate 22', line: 'mr lau is not in. the field lights are still on.' },
    { id: 'prison', x: 600, y: 196, my: 150, r: 24, title: 'stanley prison 99', line: 'a wall, wire, and the mosque the prisoners built in 1937.' },
    { id: 'fort', x: 630, y: 196, my: 156, r: 16, title: 'stanley fort', line: 'no entry. the road ends here for you.' },
    { id: 'murray', x: 60, y: 206, my: 262, r: 26, title: 'murray house', line: 'dismantled in central, rebuilt here stone by stone.' },
    { id: 'plaza', x: 186, y: 206, my: 268, r: 26, title: 'stanley plaza', shut: true, line: 'the mall wifi works. the mall itself is asleep.' },
    { id: 'terminus', x: 268, y: 206, my: 264, r: 22, title: 'bus terminus', offer: !declined,
      line: 'the 6, the 40, the n40. one of them will come.' },
    { id: 'beach', x: 372, y: 206, my: 252, r: 24, title: "st stephen's beach", line: 'rain on the sand. nobody swimming.' },
  ];
  const m = missionDef();
  for (const s of spots) {
    const j = JOBS.find((d) => d.spot === s.id && !done(d.id));
    if (j) { s.job = j; s.shut = false; }
    if (m && m.spot === s.id) { s.job = m; s.mission = true; s.shut = false; }
  }
}

/** walking reaches a spot by its road anchor; a tap also counts on its shopfront marker */
function spotAt(x: number, y: number, tap = false): Spot | null {
  for (const s of spots) if (Math.hypot(x - s.x, y - s.y) <= s.r) return s;
  if (tap) for (const s of spots) if (s.job && Math.hypot(x - s.x, y - (s.my - 6)) <= 14) return s;
  return null;
}

function activate(s: Spot): void {
  audio.play(s.shut ? 'door' : 'ui');
  if (s.job) {
    if (s.mission) { state.mission = null; nextMission = 150 + Math.random() * 90; }
    job = new Job(s.job, !!s.mission);
    target = null;
    save();
    return;
  }
  if (s.offer) {
    dialogue = {
      title: OFFER.who, line: OFFER.line, shown: 0,
      options: [
        { label: OFFER.walk, act: () => {
          declined = true;
          dialogue = null;
          buildSpots();
          toast = { text: 'he shrugs and lights a cigarette', colour: '#9aa0b8', t: 3 };
        } },
        { label: OFFER.take, act: () => arrest(OFFER.crime) },
      ],
    };
    return;
  }
  dialogue = { title: s.title, line: s.line, shown: 0 };
}

const exitRect: Rect = { x: 500, y: 326, w: 106, h: 24 };

/** Walk out of a job. A mission asks twice: leaving it is a no-show. */
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
  else {
    toast = { text: `left ${left.def.client}. the job is still there`, colour: '#9aa0b8', t: 3 };
    buildSpots();
  }
}

// ------------------------------------------------------------------ input ---
function toGame(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

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
  if (dialogue) {
    if (dialogue.options) {
      const idx = dialogue.options.findIndex((_, i) => inRect(dlgRect(i), x, y));
      if (idx >= 0) dialogue.options[idx].act();
      return;
    }
    dialogue = null;
    return;
  }
  const hit = spotAt(x, y, true);
  if (hit) { activate(hit); return; }
  target = {
    x: Math.min(WALK.maxX, Math.max(WALK.minX, x)),
    y: Math.min(WALK.maxY, Math.max(WALK.minY, y)),
  };
});

const keys = new Set<string>();

window.addEventListener('keydown', (ev) => {
  audio.unlock();
  if (ev.key === 'm' || ev.key === 'M') { audio.toggleMute(); return; }
  if (state.jail) return;
  if (job) {
    if (ev.key === 'Escape') { leaveJob(); ev.preventDefault(); return; }
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (job.step === 'paid') job.advance();
      else if (job.step === 'typing') { job.timer = 99; job.update(1); }
      ev.preventDefault();
      return;
    }
    const n = ['1', '2', '3'].indexOf(ev.key);
    if (n >= 0 && job.options[n]) job.choose(n);
    return;
  }
  if (dialogue?.options) {
    const n = ['1', '2'].indexOf(ev.key);
    if (n >= 0 && dialogue.options[n]) dialogue.options[n].act();
    else if (ev.key === 'Escape') dialogue.options[0].act();
    return;
  }
  if (ev.key === 'e' || ev.key === 'E') { if (dialogue) dialogue = null; else if (near) activate(near); return; }
  if (ev.key === 'Escape' || ev.key === ' ') { if (dialogue) { dialogue = null; ev.preventDefault(); return; } }
  keys.add(ev.key.toLowerCase());
});

window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));

// ----------------------------------------------------------------- update ---
function update(dt: number): void {
  for (const d of rain) {
    d.y += d.v * dt;
    d.x -= 40 * dt;
    if (d.y > H) { d.y = -8; d.x = Math.random() * W; }
    if (d.x < -4) d.x = W + 4;
  }

  for (const w of walkers) {
    w.x += w.dir * w.v * dt;
    w.phase += dt * 6;
    if (w.x > 640) w.x = -10;
    if (w.x < -10) w.x = 640;
  }

  car.wait -= dt;
  if (car.wait <= 0) {
    car.x += car.v * dt;
    if (car.x > W + 100) { car.x = -100; car.wait = 5 + Math.random() * 6; }
  }

  if (state.jail) {
    if (!jailed()) release();
    return;
  }

  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

  if (job) { job.update(dt); return; }

  tickMissions(dt);
  wireTimer += dt;
  if (wireTimer > 6.5) {
    // an open callout takes every other slot on the wire until it is answered or missed
    if (state.mission && !wireAlert) showWire(undefined, true);
    else {
      const list = [...news.slice(0, 4), ...WIRE];
      wireIndex = (wireIndex + 1) % list.length;
      showWire(list[wireIndex], false);
    }
  }
  if (wireX > 40) wireX = Math.max(40, wireX - (wireTimer < 0.9 ? 900 : 130) * dt);

  if (dialogue) { dialogue.shown = Math.min(dialogue.line.length, dialogue.shown + dt * 54); return; }

  let vx = 0;
  let vy = 0;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup')) vy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vy += 1;

  if (vx === 0 && vy === 0 && target) {
    const d = Math.hypot(target.x - player.x, target.y - player.y);
    if (d < 3) target = null;
    else { vx = (target.x - player.x) / d; vy = (target.y - player.y) / d; }
  }

  const speed = 98;
  if (vx !== 0 || vy !== 0) {
    const len = Math.hypot(vx, vy) || 1;
    player.x = Math.min(WALK.maxX, Math.max(WALK.minX, player.x + (vx / len) * speed * dt));
    player.y = Math.min(WALK.maxY, Math.max(WALK.minY, player.y + (vy / len) * speed * dt));
    state.x = player.x;
    state.y = player.y;
    if (vx !== 0) player.facing = vx > 0 ? 1 : -1;
    player.walked += speed * dt;
    player.frame = Math.floor(player.walked / 22) % 4;
    stepTimer += dt;
    if (stepTimer > 0.36) { stepTimer = 0; audio.play('step'); }
  } else {
    player.frame = 0;
  }

  near = spotAt(player.x, player.y);
}

// ------------------------------------------------------------------- draw ---
function drawFigure(x: number, y: number, coat: string, frame: number, umbrella: boolean, facing = 1): void {
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  const swing = [0, 1, 0, -1][frame % 4];
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
  ctx.fillRect(-5, 13, 11, 2); ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a2b3a'; ctx.fillRect(-3, -13, 6, 4);
  ctx.fillStyle = '#e8b58a'; ctx.fillRect(-3, -9, 6, 3);
  ctx.fillStyle = coat; ctx.fillRect(-4, -6, 8, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-4, -6, 2, 9);
  ctx.fillStyle = '#232436';
  ctx.fillRect(-4, 3, 3, 5 - Math.max(0, swing));
  ctx.fillRect(1, 3, 3, 5 + Math.max(0, swing));
  if (umbrella) {
    ctx.fillStyle = '#20222e'; ctx.fillRect(0, -20, 1, 8);
    ctx.fillStyle = '#d8465f'; ctx.fillRect(-7, -21, 15, 2);
    ctx.fillRect(-5, -22, 11, 1);
  }
  ctx.restore();
}

function drawPlayer(): void {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  ctx.save();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y + 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.translate(x, y);
  if (player.facing < 0) ctx.scale(-1, 1);
  const swing = [0, 1, 0, -1][player.frame];
  ctx.fillStyle = '#141520'; ctx.fillRect(-4, -19, 8, 3);
  ctx.fillStyle = '#161726'; ctx.fillRect(-4, -17, 8, 5);
  ctx.fillStyle = '#f2bd8d'; ctx.fillRect(-4, -13, 8, 4);
  ctx.fillStyle = '#141520'; ctx.fillRect(-1, -12, 1, 1); ctx.fillRect(2, -12, 1, 1);
  ctx.fillStyle = '#4fa3ff'; ctx.fillRect(-4, -9, 9, 8);
  ctx.fillStyle = '#2f6fb5'; ctx.fillRect(2, -9, 3, 8);
  ctx.fillStyle = '#1d3f6b'; ctx.fillRect(-4, -2, 9, 1);
  ctx.fillStyle = '#343a54';
  ctx.fillRect(-3, -1, 3, 4 - Math.max(0, swing));
  ctx.fillRect(1, -1, 3, 4 + Math.max(0, swing));
  ctx.fillStyle = '#141520';
  ctx.fillRect(-4 + (swing > 0 ? 1 : 0), 3, 4, 2);
  ctx.fillRect(1 - (swing > 0 ? 1 : 0), 3, 4, 2);
  // slung bag
  ctx.fillStyle = '#c8a24a'; ctx.fillRect(-6, -6, 3, 4);
  ctx.restore();
}

function drawHud(): void {
  // wire
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

  // status bar
  ctx.fillStyle = 'rgba(8,10,18,0.72)'; ctx.fillRect(0, 15, W, 20);
  const night = state.minutes >= 1080 || state.minutes < 400;
  text(night ? 'tung tau wan rd - night' : 'tung tau wan rd - evening', 8, 21, '#9aa0b8');
  ctx.fillStyle = '#232a3a'; ctx.fillRect(196, 18, 1, 14);

  const t = clock();
  textRight(t, 468, 21, '#ffffff');

  ctx.fillStyle = '#ffc84a'; ctx.fillRect(478, 22, 5, 5);
  ctx.fillStyle = '#b98b1e'; ctx.fillRect(479, 21, 3, 1);
  text(`$${state.money}`, 490, 21, '#ffc84a');

  ctx.fillStyle = '#232a3a'; ctx.fillRect(562, 18, 1, 14);
  const pips = Math.max(0, Math.min(5, Math.round(state.energy)));
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < pips ? '#5ce08a' : '#243026';
    ctx.fillRect(570 + i * 8, 23, 6, 6);
  }
  text(audio.muted ? 'muted' : '', 606, 21, '#6f7688');
}

function drawCity(): void {
  ctx.drawImage(mapImg, 0, 0);

  // car
  if (car.wait <= 0) {
    const cx = Math.round(car.x);
    ctx.fillStyle = 'rgba(255,240,200,0.10)';
    ctx.beginPath();
    ctx.moveTo(cx + 22, 196);
    ctx.lineTo(cx + 120, 188);
    ctx.lineTo(cx + 120, 206);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b8382f'; ctx.fillRect(cx, 194, 26, 9);
    ctx.fillStyle = '#8d2a24'; ctx.fillRect(cx, 199, 26, 4);
    ctx.fillStyle = '#1a1c26'; ctx.fillRect(cx + 4, 191, 18, 4);
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(cx + 24, 196, 3, 2);
    ctx.fillStyle = '#141520'; ctx.fillRect(cx + 4, 203, 5, 2); ctx.fillRect(cx + 17, 203, 5, 2);
  }

  // pedestrians on the near pavement
  for (const w of walkers) {
    drawFigure(Math.round(w.x), 228, w.coat, Math.floor(w.phase) % 4, w.umbrella, w.dir);
  }

  // the man at the terminus, until you have heard him out
  if (!declined) {
    drawFigure(258, 228, '#2c2e36', 0, false, 1);
    ctx.fillStyle = '#1a1b22'; ctx.fillRect(254, 215, 8, 2);
  }

  drawPlayer();

  // job markers; a callout is red and counts down
  const bob = Math.sin(performance.now() / 320) * 2;
  for (const s of spots) {
    if (!s.job) continue;
    const colour = s.mission ? '#ff4a5f' : '#ffc84a';
    const pulse = s.mission ? Math.sin(performance.now() / 90) * 0.5 + 0.5 : 0;
    ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fillRect(s.x - 5, s.my - 12 + bob, 11, 12);
    ctx.fillStyle = colour; ctx.fillRect(s.x - 5, s.my - 1 + bob, 11, 1);
    if (pulse > 0.5) { ctx.strokeStyle = colour; ctx.strokeRect(s.x - 6.5, s.my - 13.5 + bob, 14, 14); }
    text('!', s.x - 2, s.my - 11 + bob, colour);
    if (s.mission && state.mission) {
      const secs = `${Math.ceil(state.mission.left)}`;
      ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fillRect(s.x - tw(secs) / 2 - 2, s.my + 1 + bob, tw(secs) + 4, 10);
      text(secs, s.x - tw(secs) / 2, s.my + 2 + bob, colour);
    }
  }

  // rain
  ctx.strokeStyle = 'rgba(186,210,235,0.34)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of rain) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - 1.5, d.y + d.len);
  }
  ctx.stroke();

  // night grade
  const nightG = ctx.createLinearGradient(0, 0, 0, H);
  nightG.addColorStop(0, 'rgba(12,18,42,0.30)');
  nightG.addColorStop(0.7, 'rgba(12,18,42,0.11)');
  nightG.addColorStop(1, 'rgba(12,18,42,0.24)');
  ctx.fillStyle = nightG;
  ctx.fillRect(0, 15, W, H - 15);

  // --- light pass: neon, shopfronts and street lamps sit above the grade ---
  const t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flicker = 0.5 + 0.5 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 1.7));
  lampGlow(52, 168, 46, 'rgba(70,224,230,0.34)', 0.95);
  lampGlow(142, 168, 44, 'rgba(255,72,96,0.34)', flicker);
  lampGlow(214, 170, 30, 'rgba(120,255,170,0.22)', 0.9);
  lampGlow(320, 168, 44, 'rgba(255,96,64,0.30)', 0.95);
  lampGlow(402, 172, 30, 'rgba(255,196,80,0.24)', 0.9);
  for (const s of spots) {
    if (s.shut) lampGlow(s.x, s.my + 4, 46, 'rgba(255,178,88,0.20)', 0.8);
  }
  // lamp heads over the road
  for (const lx of [96, 292, 500]) {
    lampGlow(lx, 199, 58, 'rgba(255,214,150,0.10)', 0.85);
  }
  ctx.restore();

  // wet asphalt: vertical smears of the neon above
  const smears: Array<[number, string]> = [
    [52, 'rgba(70,224,230,0.13)'], [142, 'rgba(255,72,96,0.12)'],
    [320, 'rgba(255,96,64,0.12)'], [402, 'rgba(255,196,80,0.10)'],
  ];
  for (const [sx, colour] of smears) {
    const g = ctx.createLinearGradient(0, 184, 0, 216);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 14, 184, 28, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i += 1) ctx.fillRect(sx - 12 + i * 9, 188 + i * 6, 6, 1);
  }

  drawHud();

  // prompt
  ctx.fillStyle = 'rgba(8,10,18,0.86)'; ctx.fillRect(0, 332, W, 28);
  ctx.fillStyle = '#232a3a'; ctx.fillRect(0, 332, W, 1);
  if (near) {
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(8, 339, 13, 14);
    text('e', 12, 342, '#08110c');
    text(near.title, 27, 342, '#ffffff');
    const after = 27 + tw(near.title) + 6;
    if (near.mission && state.mission) text(`(callout $${near.job!.pay * MISSION_PAY} - ${Math.ceil(state.mission.left)}s)`, after, 342, '#ff4a5f');
    else if (near.job) text(`(job $${near.job.pay})`, after, 342, '#ffc84a');
    else if (near.offer) text('(a man in a cap)', after, 342, '#9aa0b8');
    else if (near.shut) text('(shut)', after, 342, '#6f7688');
  } else {
    text('wasd / tap to walk    e interact    m mute', 8, 342, '#6f7688');
  }

  if (toast && !dialogue) {
    const w = tw(toast.text) + 20;
    ctx.globalAlpha = Math.min(1, toast.t * 2);
    ctx.fillStyle = 'rgba(8,10,18,0.95)'; ctx.fillRect((W - w) / 2, 306, w, 20);
    ctx.fillStyle = toast.colour; ctx.fillRect((W - w) / 2, 306, w, 1);
    text(toast.text, (W - w) / 2 + 10, 312, toast.colour);
    ctx.globalAlpha = 1;
  }

  if (dialogue?.options) {
    ctx.fillStyle = 'rgba(8,10,18,0.96)'; ctx.fillRect(20, 240, 600, 80);
    ctx.fillStyle = '#ff4a5f'; ctx.fillRect(20, 240, 600, 1);
    text(dialogue.title, 30, 248, '#ffc84a');
    text(dialogue.line.slice(0, Math.floor(dialogue.shown)), 30, 264, '#dfe4f2');
    dialogue.options.forEach((o, i) => {
      const r = dlgRect(i);
      ctx.fillStyle = 'rgba(20,24,34,0.96)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#3a4054'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      text(`[${i + 1}]`, r.x + 10, r.y + 9, '#46e0e6');
      text(o.label, r.x + 40, r.y + 9, '#e8e8f0');
    });
  } else if (dialogue) {
    ctx.fillStyle = 'rgba(8,10,18,0.95)'; ctx.fillRect(20, 288, 600, 40);
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(20, 288, 600, 1);
    text(dialogue.title, 30, 295, '#ffc84a');
    text(dialogue.line.slice(0, Math.floor(dialogue.shown)), 30, 311, '#dfe4f2');
    text('[space]', 574, 316, '#5b6379');
  }
}

function drawJob(): void {
  if (!job) return;
  ctx.fillStyle = '#171310'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(31,26,21,0.55)'; ctx.fillRect(0, y, W, 4); }

  // desk lamp pool
  const lamp = ctx.createRadialGradient(320, 30, 10, 320, 120, 320);
  lamp.addColorStop(0, 'rgba(255,196,110,0.20)');
  lamp.addColorStop(1, 'rgba(255,196,110,0)');
  ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, 300);

  // counter
  ctx.fillStyle = '#3a2a1e'; ctx.fillRect(0, 286, W, 74);
  ctx.fillStyle = '#6b4c33'; ctx.fillRect(0, 286, W, 3);
  ctx.fillStyle = 'rgba(20,14,10,0.55)';
  for (let x = 0; x < W; x += 26) ctx.fillRect(x, 290, 1, 70);

  // the thing that is actually broken, on the counter
  const rx = 36, ry = 246;
  drawProp(job.def.prop, rx, ry);
  // cable to the laptop
  ctx.strokeStyle = '#2a2f3c'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx + { router: 84, printer: 76, terminal: 62 }[job.def.prop], ry + 20);
  ctx.lineTo(196, ry + 24);
  ctx.lineTo(250, ry + 4);
  ctx.stroke();

  if (job.def.note) {
    // a paper slip: evidence that is not on the screen
    const nx = 132, ny = 236;
    ctx.fillStyle = '#efe9d8'; ctx.fillRect(nx, ny, 122, 42);
    ctx.fillStyle = '#c9c3b2'; ctx.fillRect(nx, ny + 41, 122, 1);
    job.def.note.forEach((l, i) => text(l, nx + 4, ny + 5 + i * 12, i === 0 ? '#6a675c' : '#20201d'));
  } else {
    // mug
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

  // what just happened reads first, then the question in front of you
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
    text('[enter] back to the road', bx + 24, by + 206, '#46e0e6');
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
    // receipt printer with a test page curling out of the slot
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
  // card terminal: a handset with a screen and a keypad
  ctx.fillStyle = '#26292f'; ctx.fillRect(rx + 22, ry - 12, 40, 38);
  ctx.fillStyle = '#353943'; ctx.fillRect(rx + 22, ry - 12, 40, 2);
  ctx.fillStyle = '#1b3a2c'; ctx.fillRect(rx + 27, ry - 8, 30, 11);
  ctx.fillStyle = blink === 1 ? '#ff6a6a' : '#7b2a2a'; ctx.fillRect(rx + 30, ry - 4, 24, 3);
  ctx.fillStyle = '#4a4f5c';
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) ctx.fillRect(rx + 29 + c * 9, ry + 6 + r * 6, 6, 4);
  text('card machine', rx, ry + 30, '#6f7688');
}

function drawPrison(): void {
  const j = state.jail;
  if (!j) return;
  // the cell: block wall, a high barred window, bars in front of everything
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

  // the case sheet is paper, so it gets an edge
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

  const left = Math.max(0, j.until - Date.now());
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  text('released in', lx, y, label); y += 14;
  text(`${mm}:${ss}`, lx, y, '#8a2c2c', 3); y += 32;
  text('real minutes. closing the tab does not', lx, y, '#4a473f'); y += 12;
  text('shorten it. no fine, no record: just time.', lx, y, '#4a473f');
}

// ------------------------------------------------------------------- loop ---
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames += 1;
  update(dt);
  if (state.jail) drawPrison();
  else if (job) drawJob();
  else drawCity();
  requestAnimationFrame(frame);
}

function start(): void {
  load();
  if (state.mission && !missionDef()) state.mission = null;
  buildSpots();
  if (state.mission) showWire(undefined, true);
  player = {
    x: Math.min(WALK.maxX, Math.max(WALK.minX, state.x)),
    y: Math.min(WALK.maxY, Math.max(WALK.minY, state.y)),
    frame: 0, walked: 0, facing: 1,
  };
  requestAnimationFrame(frame);
}

if (mapImg.complete && fontImg.complete) start();
else {
  let ready = 0;
  const done = (): void => { ready += 1; if (ready === 2) start(); };
  if (mapImg.complete) ready += 1; else mapImg.addEventListener('load', done);
  if (fontImg.complete) ready += 1; else fontImg.addEventListener('load', done);
  if (ready === 2) start();
}

(window as unknown as { __audio: typeof audio }).__audio = audio;
(window as unknown as { __job: () => unknown }).__job = () =>
  (job ? { id: job.def.id, step: job.step, stage: job.stage, shown: job.shown, opts: job.options, mission: job.mission } : null);
Object.defineProperty(window, '__frames', { get: () => frames });
/** test hook: open a callout now instead of waiting for the street timer */
(window as unknown as { __mission: () => void }).__mission = () => { nextMission = 0; };
