/**
 * The school server (docs/design/stanley-expansion.md §10). No packages: node:http, node:sqlite and
 * the small WebSocket in ws.ts.
 *
 *   npm run build && npm run server        (Node 22.6 or later)
 *
 * It owns every save in SQLite, holds quizzes (the browser never sees an answer before it picks),
 * keeps the real-time clock, ticks work tasks, sends each player the others near them five times a
 * second, keeps the leaderboard, serves the built game (dist/) and the teacher page (/admin).
 *
 * Environment:
 *   PORT       default 8787
 *   HOST       default 127.0.0.1 (Apache proxies to it; set 0.0.0.0 to serve directly)
 *   DB         default data/cit-game.sqlite
 *   STATIC     default dist (the built game; set to '' when Apache serves it)
 *   ADMIN_KEY  required for /admin; without it the teacher page is off
 *   BASE       URL path the game is served under, default /cit-game/ (also answers at /)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { accept, type Socket } from './ws.ts';
import { act, migrate, publicSave, quizView, netWorth, fresh, type Save, type Ev } from '../src/rules.ts';
import { checkName, coatFor, NEAR, type ToClient, type ToServer } from '../src/protocol.ts';
import { TOPIC_NAMES } from '../src/questions.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB = process.env.DB ?? 'data/cit-game.sqlite';
const STATIC = process.env.STATIC ?? 'dist';
const ADMIN_KEY = process.env.ADMIN_KEY ?? '';
const BASE = (process.env.BASE ?? '/cit-game/').replace(/\/?$/, '/');
const ROOT = new URL('..', import.meta.url).pathname;

// ----------------------------------------------------------------- storage ---
const DB_PATH = DB.startsWith('/') ? DB : join(ROOT, DB);
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  create table if not exists players (
    id text primary key, token text unique not null, name text unique not null, coat text not null,
    save text not null, created integer not null, seen integer not null, paused integer not null default 0,
    worth integer not null default 0
  );
  create table if not exists wire (at integer not null, text text not null);
  create table if not exists homes (id text primary key, owner text not null);
`);
const q = {
  byToken: db.prepare('select * from players where token = ?'),
  byName: db.prepare('select id from players where name = ?'),
  byId: db.prepare('select * from players where id = ?'),
  insert: db.prepare('insert into players (id, token, name, coat, save, created, seen, worth) values (?, ?, ?, ?, ?, ?, ?, ?)'),
  update: db.prepare('update players set save = ?, seen = ?, worth = ? where id = ?'),
  rename: db.prepare('update players set name = ? where id = ?'),
  pause: db.prepare('update players set paused = ? where id = ?'),
  all: db.prepare('select id, name, coat, save, created, seen, paused, worth from players order by worth desc'),
  top: db.prepare('select id, name, worth from players order by worth desc limit 10'),
  rank: db.prepare('select count(*) as n from players where worth > ?'),
  addWire: db.prepare('insert into wire (at, text) values (?, ?)'),
  lastWire: db.prepare('select text from wire order by at desc limit 8'),
  homesAll: db.prepare('select homes.id as id, homes.owner as owner, players.name as name from homes join players on players.id = homes.owner'),
  homeSet: db.prepare('insert or replace into homes (id, owner) values (?, ?)'),
  homeFree: db.prepare('delete from homes where id = ?'),
  homesOf: db.prepare('delete from homes where owner = ?'),
  saves: db.prepare('select id, name, coat, save from players'),
};

/** who owns each home on the server: one owner each (§11.1) */
const owner = new Map<string, { id: string; name: string }>();
for (const r of q.homesAll.all() as Array<{ id: string; owner: string; name: string }>) owner.set(r.id, { id: r.owner, name: r.name });
const world = (p: { id: string }) => ({ homeTaken: (id: string) => { const o = owner.get(id); return !!o && o.id !== p.id; } });

/** every player's car, parked or on the road */
type CarSpot = { name: string; coat: string; model: string; x: number; y: number; angle: number; driving: boolean };
const cars = new Map<string, CarSpot>();
for (const r of q.saves.all() as Array<{ id: string; name: string; coat: string; save: string }>) {
  const c = (JSON.parse(r.save) as Save).car;
  if (c) cars.set(r.id, { name: r.name, coat: r.coat, model: c.model, x: c.x, y: c.y, angle: c.angle, driving: false });
}
function syncCar(p: { id: string; name: string; coat: string; save: Save }): void {
  const c = p.save.car;
  const was = cars.get(p.id);
  if (!c) { cars.delete(p.id); return; }
  if (was?.driving) { was.model = c.model; return; }
  cars.set(p.id, { name: p.name, coat: p.coat, model: c.model, x: c.x, y: c.y, angle: c.angle, driving: false });
}

type Row = { id: string; token: string; name: string; coat: string; save: string; created: number; seen: number; paused: number; worth: number };

// --------------------------------------------------------------- players ---
type Player = {
  id: string; name: string; coat: string; save: Save; paused: boolean;
  sock: Socket; x: number; y: number; moved: number; dirty: boolean;
  /** messages in the last second, to stop a runaway client */
  rate: number;
};
const online = new Map<string, Player>();

function store(p: Player): void {
  q.update.run(JSON.stringify(p.save), Date.now(), netWorth(p.save), p.id);
  p.dirty = false;
}

const send = (sock: Socket, m: ToClient): void => sock.send(JSON.stringify(m));

/** a public line on everyone's wire: "ka ho was paid $770 by tide restaurant" */
function wire(text: string): void {
  q.addWire.run(Date.now(), text);
  for (const p of online.values()) send(p.sock, { t: 'wire', text });
}

function deliver(p: Player, events: Ev[]): void {
  const changed: Array<[string, string]> = [];
  for (const e of events) {
    if (e.t === 'news' && e.public) wire(`${p.name} ${e.public}`);
    if (e.t === 'homeChange') {
      if (e.sold) { owner.set(e.id, { id: p.id, name: p.name }); q.homeSet.run(e.id, p.id); changed.push([e.id, p.name]); }
      else { owner.delete(e.id); q.homeFree.run(e.id); changed.push([e.id, '']); }
    }
    if (e.t === 'carChange') syncCar(p);
  }
  if (changed.length) for (const o of online.values()) send(o.sock, { t: 'homes', owners: changed });
}

let boardDirty = true;
function sendBoard(p?: Player): void {
  const top = (q.top.all() as Array<{ name: string; worth: number }>).map((r) => [r.name, r.worth] as [string, number]);
  const targets = p ? [p] : [...online.values()];
  for (const t of targets) {
    const worth = netWorth(t.save);
    const ahead = (q.rank.get(worth) as { n: number }).n;
    send(t.sock, { t: 'board', top, you: [ahead + 1, worth] });
  }
}

function hello(sock: Socket, m: Extract<ToServer, { t: 'hello' }>): Player | null {
  if (typeof m.token !== 'string' || m.token.length < 16 || m.token.length > 64) { sock.close(1008); return null; }
  let row = q.byToken.get(m.token) as Row | undefined;
  if (!row) {
    if (!m.name) { send(sock, { t: 'need-name' }); return null; }
    const c = checkName(m.name);
    if ('err' in c) { send(sock, { t: 'need-name', why: c.err }); return null; }
    if (q.byName.get(c.name)) { send(sock, { t: 'need-name', why: 'someone has that name already' }); return null; }
    const id = randomBytes(6).toString('hex');
    const save = fresh();
    q.insert.run(id, m.token, c.name, coatFor(id), JSON.stringify(save), Date.now(), Date.now(), netWorth(save));
    row = q.byToken.get(m.token) as Row;
    wire(`${c.name} got off the bus in stanley`);
    boardDirty = true;
  }
  const old = online.get(row.id);
  if (old) { old.sock.close(4000); online.delete(row.id); }
  const save = migrate(JSON.parse(row.save));
  const p: Player = { id: row.id, name: row.name, coat: row.coat, save, paused: !!row.paused, sock, x: save.x, y: save.y, moved: 0, dirty: false, rate: 0 };
  online.set(p.id, p);
  // what happened while they were away (tasks, firing, release)
  const r = act(save, 'tick', {}, Date.now());
  deliver(p, r.events);
  store(p);
  send(sock, { t: 'welcome', id: p.id, name: p.name, coat: p.coat, save: publicSave(save), now: Date.now() });
  if (r.events.length) send(sock, { t: 'push', events: r.events, save: publicSave(save), now: Date.now() });
  if (save.quiz && !save.quiz.over) send(sock, { t: 'push', events: [{ t: 'quiz', view: quizView(save.quiz) }], save: publicSave(save), now: Date.now() });
  for (const w of (q.lastWire.all() as Array<{ text: string }>).reverse()) send(sock, { t: 'wire', text: w.text });
  send(sock, { t: 'homes', owners: [...owner].map(([id, o]) => [id, o.name] as [string, string]) });
  syncCar(p);
  sendBoard(p);
  if (p.paused) send(sock, { t: 'paused' });
  return p;
}

function onMessage(p: Player, m: ToServer): void {
  if (m.t === 'pos') {
    if (Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.y >= 0 && m.x < 1408 * 16 && m.y < 1280 * 16) {
      p.x = m.x; p.y = m.y; p.save.x = m.x; p.save.y = m.y; p.save.mapv = 2; p.moved = Date.now(); p.dirty = true;
      // driving: the car is where you are; it stays there until you park it properly
      const c = cars.get(p.id);
      if (c && p.save.car) {
        c.driving = typeof m.drive === 'number' && Number.isFinite(m.drive);
        if (c.driving) { c.x = m.x; c.y = m.y; c.angle = m.drive!; }
      }
    }
    return;
  }
  if (m.t === 'quiz?') {
    if (p.save.quiz && !p.save.quiz.over) send(p.sock, { t: 'push', events: [{ t: 'quiz', view: quizView(p.save.quiz) }], save: publicSave(p.save), now: Date.now() });
    return;
  }
  if (m.t === 'act') {
    if (p.paused) { send(p.sock, { t: 'res', id: m.id, ok: false, err: 'paused by your teacher', events: [], save: publicSave(p.save), now: Date.now() }); return; }
    const before = netWorth(p.save);
    const r = act(p.save, String(m.name), m.args && typeof m.args === 'object' ? m.args : {}, Date.now(), world(p));
    if (m.name === 'car.park' && r.ok) { const c = cars.get(p.id); if (c) c.driving = false; syncCar(p); }
    deliver(p, r.events);
    store(p);
    if (netWorth(p.save) !== before) boardDirty = true;
    send(p.sock, { t: 'res', id: m.id, ok: r.ok, err: r.err, events: r.events, save: publicSave(p.save), now: Date.now() });
  }
}

// ------------------------------------------------------------------ timers ---
// others near you, five times a second; players in prison are not shown
setInterval(() => {
  const list = [...online.values()].filter((p) => p.x >= 0 && !p.save.jail);
  for (const me of online.values()) {
    const near = list.filter((o) => o !== me && Math.abs(o.x - me.x) < NEAR && Math.abs(o.y - me.y) < NEAR)
      .map((o) => [o.id, o.name, o.coat, Math.round(o.x), Math.round(o.y)] as [string, string, string, number, number]);
    send(me.sock, { t: 'others', list: near });
    const nearCars: Array<[string, string, string, string, number, number, number, number]> = [];
    for (const [id, c] of cars) {
      if (Math.abs(c.x - me.x) < NEAR && Math.abs(c.y - me.y) < NEAR) nearCars.push([id, c.name, c.coat, c.model, Math.round(c.x), Math.round(c.y), Math.round(c.angle * 100) / 100, c.driving ? 1 : 0]);
    }
    send(me.sock, { t: 'cars', list: nearCars });
    me.rate = 0;
  }
}, 200);

// real time: work tasks, warnings, firing, release, missed callouts
setInterval(() => {
  for (const p of online.values()) {
    const r = act(p.save, 'tick', {}, Date.now());
    if (r.events.length) {
      deliver(p, r.events);
      store(p);
      boardDirty = true;
      send(p.sock, { t: 'push', events: r.events, save: publicSave(p.save), now: Date.now() });
    }
  }
}, 5000);

// positions and the leaderboard
setInterval(() => {
  for (const p of online.values()) if (p.dirty) store(p);
  if (boardDirty) { boardDirty = false; sendBoard(); }
}, 10000);

// ------------------------------------------------------------- the teacher ---
function adminOk(req: IncomingMessage, url: URL): boolean {
  if (!ADMIN_KEY) return false;
  const k = url.searchParams.get('key') ?? req.headers['x-admin-key'] ?? '';
  const a = Buffer.from(String(k)), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

function adminPlayers(): unknown[] {
  return (q.all.all() as Row[]).map((r) => {
    const s = migrate(JSON.parse(r.save));
    const live = online.get(r.id);
    const cur = live ? live.save : s;
    return {
      id: r.id, name: r.name, coat: r.coat, online: !!live, paused: !!r.paused, created: r.created, seen: live ? Date.now() : r.seen,
      worth: netWorth(cur), money: cur.money, earned: cur.earned, day: cur.day, answered: cur.answered, right: cur.right,
      mastery: Object.fromEntries(Object.keys(TOPIC_NAMES).map((t) => [t, cur.mastery[t] ?? 0])),
      record: cur.record, work: cur.work?.id ?? null, jailed: !!cur.jail, certs: cur.certs,
    };
  });
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 10000) break; }
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

async function admin(req: IncomingMessage, res: ServerResponse, url: URL, path: string): Promise<void> {
  if (path === 'admin' || path === 'admin/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(join(ROOT, 'server/admin.html')));
    return;
  }
  if (!adminOk(req, url)) { json(res, 403, { err: ADMIN_KEY ? 'wrong key' : 'set ADMIN_KEY to use the teacher page' }); return; }
  if (path === 'api/admin/players') { json(res, 200, adminPlayers()); return; }
  if (req.method !== 'POST') { json(res, 405, { err: 'post' }); return; }
  const b = await body(req);
  const id = String(b.id ?? '');
  const row = q.byId.get(id) as Row | undefined;
  if (!row) { json(res, 404, { err: 'no such player' }); return; }
  const live = online.get(id);
  if (path === 'api/admin/rename') {
    const c = checkName(String(b.name ?? ''));
    if ('err' in c) { json(res, 400, c); return; }
    if (q.byName.get(c.name)) { json(res, 400, { err: 'name taken' }); return; }
    q.rename.run(c.name, id);
    if (live) { live.name = c.name; live.sock.close(4001); }
    for (const o of owner.values()) if (o.id === id) o.name = c.name;
    const cs = cars.get(id);
    if (cs) cs.name = c.name;
    boardDirty = true;
    json(res, 200, { ok: true });
    return;
  }
  if (path === 'api/admin/pause') {
    const on = !!b.paused;
    q.pause.run(on ? 1 : 0, id);
    if (live) { live.paused = on; if (on) send(live.sock, { t: 'paused' }); else live.sock.close(4002); }
    json(res, 200, { ok: true });
    return;
  }
  if (path === 'api/admin/reset') {
    const s = fresh();
    if (live) { live.save = s; live.sock.close(4003); }
    q.update.run(JSON.stringify(s), Date.now(), netWorth(s), id);
    // their homes go back on the market, their car goes
    const freed: Array<[string, string]> = [];
    for (const [hid, o] of owner) if (o.id === id) { owner.delete(hid); freed.push([hid, '']); }
    q.homesOf.run(id);
    cars.delete(id);
    if (freed.length) for (const o of online.values()) send(o.sock, { t: 'homes', owners: freed });
    boardDirty = true;
    json(res, 200, { ok: true });
    return;
  }
  json(res, 404, { err: 'no such action' });
}

// ------------------------------------------------------------------- http ---
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};
const json = (res: ServerResponse, code: number, v: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(v));
};

/** the path under BASE (or under /, so it works with or without Apache's prefix) */
function local(pathname: string): string {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\/+/, '');
  return decodeURIComponent(p);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = local(url.pathname);
  if (path === 'api/health') { json(res, 200, { ok: true, online: online.size }); return; }
  if (path === 'api/leaderboard') {
    json(res, 200, (q.top.all() as Array<{ name: string; worth: number }>).map((r) => ({ name: r.name, worth: r.worth })));
    return;
  }
  if (path === 'admin' || path === 'admin/' || path.startsWith('api/admin/')) { admin(req, res, url, path).catch(() => json(res, 500, { err: 'error' })); return; }
  if (!STATIC) { res.writeHead(404); res.end(); return; }
  const dir = STATIC.startsWith('/') ? STATIC : join(ROOT, STATIC);
  let file = normalize(join(dir, path || 'index.html'));
  if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
  res.end(readFileSync(file));
});

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (local(url.pathname) !== 'api/ws') { sock.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  const ws = accept(req, sock);
  if (!ws) return;
  let me: Player | null = null;
  ws.on('message', (text) => {
    let m: ToServer;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!me) {
      if (m.t === 'hello') me = hello(ws, m);
      return;
    }
    if ((me.rate += 1) > 60) return; // more than 60 a fifth of a second: dropped
    onMessage(me, m);
  });
  ws.on('close', () => {
    if (me && online.get(me.id) === me) {
      store(me);
      online.delete(me.id);
      // a car left mid-drive stays where it stopped
      const c = cars.get(me.id);
      if (c?.driving && me.save.car) { c.driving = false; me.save.car.x = c.x; me.save.car.y = c.y; me.save.car.angle = c.angle; store(me); }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`cit-game server on http://${HOST}:${PORT}${BASE} (db ${DB}${STATIC ? `, serving ${STATIC}/` : ''}${ADMIN_KEY ? ', /admin on' : ', /admin off: set ADMIN_KEY'})`);
});

const stop = (): void => { for (const p of online.values()) store(p); db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
