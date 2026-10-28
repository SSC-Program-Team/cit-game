/**
 * NETLIFE: HK — Tung Tau Wan Road, Stanley. v0.2 slice.
 *
 * The game owns its own requestAnimationFrame loop and draws to a 640x360 canvas;
 * Phaser's scene manager never stepped in this environment, and plain Canvas2D is
 * both smaller (14 kB vs 1.5 MB) and easier to reason about for pixel art.
 */
import { state, save, clock, load, addMoney, addMinutes, addMastery } from './state';
import { audio } from './audio';

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
const mapImg = img('img/map.png');
const fontImg = img('img/font.png');

// ------------------------------------------------------------------ text ---
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;-/$%+!?[]()*#'<>=";
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
      ctx.drawImage(a, (i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H, CELL_W, CELL_H,
        cx, y, CELL_W * scale, CELL_H * scale);
    }
    cx += CELL_W * scale;
  }
  return cx;
}

const tw = (s: string, scale = 1): number => s.length * CELL_W * scale;

function textRight(s: string, right: number, y: number, colour: string): void {
  text(s, right - tw(s), y, colour);
}

// ------------------------------------------------------------------ state ---
type Spot = { x: number; y: number; my: number; r: number; title: string; line: string; job?: boolean; shut?: boolean };

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
let dialogue: { title: string; line: string; shown: number } | null = null;
let job: Job | null = null;
let stepTimer = 0;

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
const CONSOLE_LINES = [
  'C:\\> ipconfig',
  '  ipv4 ..... 192.168.18.77',
  '  mask ..... 255.255.255.0',
  '  gateway .. 192.168.18.254',
  'C:\\> ping 192.168.18.50',
  '  reply 1ms  ttl=64',
  'C:\\> ping 8.8.8.8',
  '  request timed out.',
];

type Step = 'typing' | 'diagnose' | 'explain' | 'paid';

class Job {
  step: Step = 'typing';
  shown = 0;
  timer = 0;
  hint = '';
  feedback = '';
  feedbackColour = '#ffc84a';
  options: string[] = [];

  update(dt: number): void {
    if (this.step !== 'typing') return;
    this.timer += dt;
    const n = Math.min(CONSOLE_LINES.length, Math.floor(this.timer / 0.32));
    if (n > this.shown) {
      this.shown = n;
      audio.play('ui');
      if (this.shown === CONSOLE_LINES.length) {
        this.step = 'diagnose';
        this.hint = 'what is wrong?';
        this.options = ['wrong subnet mask', 'not forwarding', 'printer offline'];
      }
    }
  }

  choose(i: number): void {
    if (this.step === 'diagnose') {
      if (i === 1) {
        audio.play('ok');
        this.step = 'explain';
        this.hint = 'correct. now tell her';
        this.feedback = 'the gateway was never set';
        this.feedbackColour = '#7be08a';
        this.options = ['the router was not passing traffic', 'the printer firmware corrupted'];
        return;
      }
      audio.play('bad');
      addMinutes(4);
      state.energy = Math.max(0, state.energy - 1);
      save();
      this.feedback = 'wrong - four minutes gone';
      this.feedbackColour = '#ff6a6a';
      this.hint = i === 0 ? 'a /24 with a peer answering is fine' : 'the printer is idle';
      return;
    }
    if (this.step === 'explain') {
      if (i === 0) {
        audio.play('cash');
        addMoney(450);
        addMastery('gateway', 40);
        if (!state.done.includes('chantai')) state.done.push('chantai');
        addMinutes(20);
        save();
        this.step = 'paid';
        this.options = [];
        return;
      }
      audio.play('bad');
      this.feedback = 'she does not believe you';
      this.feedbackColour = '#ff6a6a';
    }
  }

  advance(): void {
    if (this.step !== 'paid') return;
    job = null;
    buildSpots();
  }
}

// ------------------------------------------------------------------ world ---
function buildSpots(): void {
  const done = state.done.includes('chantai');
  spots = [
    { x: 52, y: 196, my: 148, r: 26, title: 'chan tai', job: !done,
      line: done ? 'you fixed the till. she gives you buns now.' : 'the till cannot reach the internet. she is not calm.' },
    { x: 142, y: 196, my: 148, r: 22, title: 'stanley restaurant', shut: true, line: 'shut for the night. the wifi password is on a laminated card by the door.' },
    { x: 214, y: 196, my: 148, r: 20, title: 'the store', shut: true, line: 'the shutter is half down. someone is watching a drama on a phone.' },
    { x: 320, y: 196, my: 148, r: 26, title: 'stanley market', shut: true, line: 'stalls folded. a cat owns the walkway now.' },
    { x: 402, y: 196, my: 152, r: 22, title: 'bakery', shut: true, line: 'the last batch went at seven. the till is still on.' },
    { x: 484, y: 196, my: 160, r: 24, title: 'college gate 22', line: 'mr lau is not in. the field lights are still on.' },
    { x: 600, y: 196, my: 150, r: 24, title: 'stanley prison 99', line: 'a wall, wire, and the mosque the prisoners built in 1937.' },
    { x: 630, y: 196, my: 156, r: 16, title: 'stanley fort', line: 'no entry. the road ends here for you.' },
    { x: 60, y: 206, my: 262, r: 26, title: 'murray house', line: 'dismantled in central, rebuilt here stone by stone.' },
    { x: 186, y: 206, my: 268, r: 26, title: 'stanley plaza', shut: true, line: 'the mall wifi works. the mall itself is asleep.' },
    { x: 268, y: 206, my: 264, r: 22, title: 'bus terminus', line: 'the 6, the 40, the n40. one of them will come.' },
    { x: 372, y: 206, my: 252, r: 24, title: "st stephen's beach", line: 'rain on the sand. nobody swimming.' },
  ];
}

function spotAt(x: number, y: number): Spot | null {
  for (const s of spots) if (Math.hypot(x - s.x, y - s.y) <= s.r) return s;
  return null;
}

function activate(s: Spot): void {
  audio.play(s.shut ? 'door' : 'ui');
  if (s.job) { job = new Job(); return; }
  dialogue = { title: s.title, line: s.line, shown: 0 };
}

// ------------------------------------------------------------------ input ---
function toGame(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

canvas.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  const { x, y } = toGame(ev);
  if (job) {
    if (job.step === 'paid') { job.advance(); return; }
    if (job.step === 'typing') { job.timer = 99; job.update(1); return; }
    const idx = job.options.findIndex((_, i) => y >= 258 + i * 30 && y <= 284 + i * 30 && x >= 262 && x <= 606);
    if (idx >= 0) job.choose(idx);
    return;
  }
  if (dialogue) { dialogue = null; return; }
  const hit = spotAt(x, y);
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
  if (job) {
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

  if (job) { job.update(dt); return; }

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

  wireTimer += dt;
  if (wireTimer > 6.5) { wireTimer = 0; wireIndex = (wireIndex + 1) % WIRE.length; wireX = W; }
  if (wireX > 8) wireX = Math.max(8, wireX - (wireTimer < 0.9 ? 900 : 130) * dt);
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
  ctx.fillStyle = '#5ce08a'; ctx.fillRect(0, 14, W, 1);
  ctx.fillStyle = '#5ce08a'; ctx.fillRect(0, 0, 34, 14);
  text('wire', 6, 3, '#08110c');
  ctx.save();
  ctx.beginPath(); ctx.rect(36, 0, W - 44, 15); ctx.clip();
  text(WIRE[wireIndex], wireX, 3, '#dfe4f2');
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

  drawPlayer();

  // job markers
  const bob = Math.sin(performance.now() / 320) * 2;
  for (const s of spots) {
  if (!s.job) continue;
  ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fillRect(s.x - 5, s.my - 12 + bob, 11, 12);
  ctx.fillStyle = '#ffc84a'; ctx.fillRect(s.x - 5, s.my - 1 + bob, 11, 1);
  text('!', s.x - 2, s.my - 11 + bob, '#ffc84a');
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
    if (near.shut) text('(shut)', 27 + tw(near.title) + 6, 342, '#6f7688');
    else if (near.job) text('(job)', 27 + tw(near.title) + 6, 342, '#ffc84a');
  } else {
    text('wasd / tap to walk    e interact    m mute', 8, 342, '#6f7688');
  }

  if (dialogue) {
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

  // router on the counter, the thing that is actually broken
  const rx = 36, ry = 246;
  ctx.fillStyle = '#20242e'; ctx.fillRect(rx, ry, 84, 26);
  ctx.fillStyle = '#2c3140'; ctx.fillRect(rx, ry, 84, 3);
  ctx.fillStyle = '#12151c'; ctx.fillRect(rx + 6, ry + 8, 30, 5);
  const blink = Math.floor(performance.now() / 420) % 3;
  const leds: Array<[number, string]> = [[78, '#5ce08a'], [86, '#5ce08a'], [94, blink === 1 ? '#ffb200' : '#4a3a12'], [102, '#a83232']];
  for (const [lx, colour] of leds) {
    ctx.fillStyle = colour;
    ctx.fillRect(rx + lx, ry + 17, 3, 3);
  }
  text('router', rx, ry + 30, '#6f7688');
  // cable to the laptop
  ctx.strokeStyle = '#2a2f3c'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx + 84, ry + 20);
  ctx.lineTo(196, ry + 24);
  ctx.lineTo(250, ry + 4);
  ctx.stroke();
  // mug
  ctx.fillStyle = '#d9d2c0'; ctx.fillRect(150, 258, 18, 20);
  ctx.fillStyle = '#b3ab98'; ctx.fillRect(150, 274, 18, 4);
  ctx.fillStyle = '#d9d2c0'; ctx.fillRect(168, 263, 4, 8);
  text('tea', 153, 265, '#6b6355');

  ctx.fillStyle = '#c9c3b2'; ctx.fillRect(36, 46, 204, 140);
  ctx.fillStyle = '#efe9d8'; ctx.fillRect(36, 46, 204, 2);
  ctx.fillStyle = '#b3ad9d'; ctx.fillRect(36, 184, 204, 1);
  text('job 4471', 46, 56, '#6a675c');
  text('chan tai', 46, 76, '#20201d');
  text('tea shop', 46, 96, '#4a473f');
  ctx.fillStyle = '#b3ad9d'; ctx.fillRect(46, 110, 184, 1);
  text('pay $450', 46, 120, '#3c3a34');
  text('no internet', 46, 142, '#8a2c2c');
  text('1 of 3 checks', 46, 162, '#4a473f');

  ctx.fillStyle = '#2a2c36'; ctx.fillRect(262, 26, 344, 164);
  ctx.fillStyle = '#0a0c12'; ctx.fillRect(268, 32, 332, 152);
  ctx.fillStyle = '#555a70'; ctx.fillRect(262, 26, 344, 2);

  for (let i = 0; i < job.shown && i < CONSOLE_LINES.length; i += 1) {
    const line = CONSOLE_LINES[i];
    const colour = line.includes('timed out') ? '#ff6a6a'
      : line.includes('reply') ? '#7be08a'
      : line.startsWith('C:') ? '#ffffff' : '#a8aec8';
    text(line, 278, 46 + i * 18, colour);
  }

  if (job.step === 'typing' && Math.floor(performance.now() / 400) % 2 === 0) {
    ctx.fillStyle = '#7be08a';
    ctx.fillRect(278, 52 + Math.max(0, job.shown - 1) * 18, 5, 1);
  }

  text(job.hint, 36, 200, '#9aa0b8');
  if (job.feedback) text(job.feedback, 36, 218, job.feedbackColour);

  job.options.forEach((label, i) => {
    const y = 198 + i * 28;
    ctx.fillStyle = 'rgba(20,24,34,0.96)'; ctx.fillRect(262, y, 344, 24);
    ctx.strokeStyle = '#3a4054'; ctx.strokeRect(262.5, y + 0.5, 343, 23);
    text(`[${i + 1}]`, 272, y + 5, '#46e0e6');
    text(label, 312, y + 5, '#e8e8f0');
  });

  text('1-3 choose    enter', 36, 336, '#6f7688');

  if (job.step === 'paid') {
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, W, H);
    const bx = 96, by = 56, bw = 448, bh = 248;
    ctx.fillStyle = '#121722'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#46e0e6'; ctx.fillRect(bx, by, bw, 1);
    ctx.fillStyle = '#232a3a'; ctx.fillRect(bx, by + bh - 1, bw, 1);

    text('job 4471 - closed', bx + 24, by + 18, '#6f7688');
    text('paid', bx + 24, by + 44, '#7be08a', 3);
    text('+ $450', bx + 24, by + 84, '#ffc84a', 2);

    text('she pays in cash and gives you buns', bx + 24, by + 126, '#e8e8f0');
    text('mastery: gateway +40', bx + 24, by + 146, '#9aa0b8');
    text('the wire carries your name for an hour', bx + 24, by + 166, '#9aa0b8');

    ctx.fillStyle = '#232a3a'; ctx.fillRect(bx + 24, by + 190, bw - 48, 1);
    text('[enter] back to the road', bx + 24, by + 206, '#46e0e6');
  }
}

// ------------------------------------------------------------------- loop ---
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  if (job) drawJob();
  else drawCity();
  requestAnimationFrame(frame);
}

function start(): void {
  load();
  buildSpots();
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
  (job ? { step: job.step, shown: job.shown, opts: job.options } : null);
