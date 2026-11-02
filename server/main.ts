/**
 * The school server (docs/design/one-street.md). No packages: node:http, node:sqlite and the small
 * WebSocket in ws.ts.
 *
 *   npm run build && npm run server        (Node 22.6 or later)
 *
 * It owns every save in SQLite, holds quizzes (the browser never sees an answer before it picks),
 * marks written answers with the school AI, keeps the real-time clock (living expenses, work tasks,
 * prison), sends everyone the other players on the street five times a second, keeps the wealth
 * leaderboard, the news and the prison list, and serves the built game (dist/) and the teacher
 * page (/admin).
 *
 * Environment:
 *   PORT           default 8787
 *   HOST           default 127.0.0.1 (Apache proxies to it; set 0.0.0.0 to serve directly)
 *   DB             default data/cit-game.sqlite
 *   STATIC         default dist (the built game; set to '' when Apache serves it)
 *   ADMIN_KEY      required for /admin; without it the teacher page is off
 *   BASE           URL path the game is served under, default /cit-game/ (also answers at /)
 *   SPARK_URL      the school AI, default https://ai.ssc.edu.hk/spark/v1 (OpenAI-compatible)
 *   SPARK_API_KEY  its key. Without it, written answers are marked by the keyword check
 *   SPARK_MODEL    optional; by default the first model the endpoint lists
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { accept, type Socket } from './ws.ts';
import { act, migrate, publicSave, quizView, netWorth, fresh, essayOf, type Save, type Ev } from '../src/rules.ts';
import { aiMessages, parseAi, type Mark } from '../src/marking.ts';
import { checkName, checkClass, coatFor, NEWS_HOURS, type ToClient, type ToServer, type Prisoner, type NewsItem } from '../src/protocol.ts';
import { TOPIC_NAMES } from '../src/questions.ts';
import { HOUR } from '../src/economy.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB = process.env.DB ?? 'data/cit-game.sqlite';
const STATIC = process.env.STATIC ?? 'dist';
const ADMIN_KEY = process.env.ADMIN_KEY ?? '';
const BASE = (process.env.BASE ?? '/cit-game/').replace(/\/?$/, '/');
const SPARK_URL = (process.env.SPARK_URL ?? 'https://ai.ssc.edu.hk/spark/v1').replace(/\/+$/, '');
const SPARK_KEY = process.env.SPARK_API_KEY ?? '';
let sparkModel = process.env.SPARK_MODEL ?? '';
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
  create table if not exists meta (k text primary key, v text not null);
`);
// v0.11: class and number (5C01), for the prison list
if (!(db.prepare('pragma table_info(players)').all() as Array<{ name: string }>).some((c) => c.name === 'cls')) {
  db.exec("alter table players add column cls text not null default ''");
}
const q = {
  byToken: db.prepare('select * from players where token = ?'),
  byName: db.prepare('select id from players where name = ?'),
  byId: db.prepare('select * from players where id = ?'),
  insert: db.prepare('insert into players (id, token, name, cls, coat, save, created, seen, worth) values (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  update: db.prepare('update players set save = ?, seen = ?, worth = ? where id = ?'),
  rename: db.prepare('update players set name = ? where id = ?'),
  setCls: db.prepare('update players set cls = ? where id = ?'),
  pause: db.prepare('update players set paused = ? where id = ?'),
  all: db.prepare('select id, name, cls, coat, save, created, seen, paused, worth from players order by worth desc'),
  top: db.prepare('select id, name, worth from players order by worth desc limit 10'),
  rank: db.prepare('select count(*) as n from players where worth > ?'),
  addWire: db.prepare('insert into wire (at, text) values (?, ?)'),
  news: db.prepare('select at, text from wire where at > ? order by at desc limit 120'),
  saves: db.prepare('select id, cls, save from players'),
  getMeta: db.prepare('select v from meta where k = ?'),
  setMeta: db.prepare('insert or replace into meta (k, v) values (?, ?)'),
};

type Row = { id: string; token: string; name: string; cls: string; coat: string; save: string; created: number; seen: number; paused: number; worth: number };

// --------------------------------------------------------------- players ---
type Player = {
  id: string; name: string; cls: string; coat: string; save: Save; paused: boolean;
  sock: Socket; x: number; y: number; dirty: boolean;
  /** messages in the last fifth of a second, to stop a runaway client */
  rate: number;
  /** a written answer is with the AI */
  marking: boolean;
};
const online = new Map<string, Player>();

function store(p: Player): void {
  q.update.run(JSON.stringify(p.save), Date.now(), netWorth(p.save), p.id);
  p.dirty = false;
}

const send = (sock: Socket, m: ToClient): void => sock.send(JSON.stringify(m));

/** a line on everyone's news: "ka ho was hired by bayview cafe" */
function wire(text: string): void {
  const at = Date.now();
  q.addWire.run(at, text);
  for (const p of online.values()) send(p.sock, { t: 'wire', at, text });
}

const newsList = (): NewsItem[] =>
  (q.news.all(Date.now() - NEWS_HOURS * HOUR) as Array<{ at: number; text: string }>).map((r) => [r.at, r.text]);

// -------------------------------------------------------------- the prison ---
/** who is inside: player id -> class number, offence, release time */
const jailed = new Map<string, Prisoner>();
for (const r of q.saves.all() as Array<{ id: string; cls: string; save: string }>) {
  const j = migrate(JSON.parse(r.save)).jail;
  if (j && j.until > Date.now()) jailed.set(r.id, [r.cls || '?', j.offence, j.until]);
}
const prisonList = (): Prisoner[] => [...jailed.values()].filter((p) => p[2] > Date.now()).sort((a, b) => a[2] - b[2]);
function sendPrison(): void {
  const list = prisonList();
  for (const p of online.values()) send(p.sock, { t: 'prison', list });
}
function syncJail(p: Player): void {
  const j = p.save.jail;
  const was = jailed.has(p.id);
  if (j && j.until > Date.now()) jailed.set(p.id, [p.cls || '?', j.offence, j.until]);
  else jailed.delete(p.id);
  if (was !== jailed.has(p.id)) sendPrison();
}

function deliver(p: Player, events: Ev[]): void {
  // the prison and its news name people by class and number only (5C01)
  for (const e of events) if (e.t === 'news' && e.public) wire(`${events.some((x) => x.t === 'arrest') ? p.cls || 'a student' : p.name} ${e.public}`);
  if (events.some((e) => e.t === 'arrest' || e.t === 'released')) syncJail(p);
}

// -------------------------------------------------------- the leaderboard ---
let boardDirty = true;
let richest = (q.getMeta.get('richest') as { v: string } | undefined)?.v ?? '';
function sendBoard(p?: Player): void {
  const rows = q.top.all() as Array<{ id: string; name: string; worth: number }>;
  // a new richest person makes the news
  if (!p && rows[0] && rows[0].id !== richest && rows[0].worth > 0 && (!rows[1] || rows[0].worth > rows[1].worth)) {
    if (richest) wire(`${rows[0].name} is now the richest person in stanley`);
    richest = rows[0].id;
    q.setMeta.run('richest', richest);
  }
  const top = rows.map((r) => [r.name, r.worth] as [string, number]);
  for (const t of p ? [p] : [...online.values()]) {
    const worth = netWorth(t.save);
    const ahead = (q.rank.get(worth) as { n: number }).n;
    send(t.sock, { t: 'board', top, you: [ahead + 1, worth] });
  }
}

// ------------------------------------------------------------ joining in ---
function hello(sock: Socket, m: Extract<ToServer, { t: 'hello' }>): Player | null {
  if (typeof m.token !== 'string' || m.token.length < 16 || m.token.length > 64) { sock.close(1008); return null; }
  let row = q.byToken.get(m.token) as Row | undefined;
  if (!row) {
    if (!m.name || !m.cls) { send(sock, { t: 'need-name', ask: ['name', 'cls'] }); return null; }
    const c = checkName(m.name);
    if ('err' in c) { send(sock, { t: 'need-name', why: c.err, ask: ['name', 'cls'] }); return null; }
    const k = checkClass(m.cls);
    if ('err' in k) { send(sock, { t: 'need-name', why: k.err, ask: ['name', 'cls'] }); return null; }
    if (q.byName.get(c.name)) { send(sock, { t: 'need-name', why: 'someone has that name already', ask: ['name', 'cls'] }); return null; }
    const id = randomBytes(6).toString('hex');
    const save = fresh();
    q.insert.run(id, m.token, c.name, k.cls, coatFor(id), JSON.stringify(save), Date.now(), Date.now(), netWorth(save));
    row = q.byToken.get(m.token) as Row;
    wire(`${c.name} arrived in stanley`);
    boardDirty = true;
  } else if (!row.cls) {
    // players from before class numbers: ask once
    const k = checkClass(m.cls ?? '');
    if ('err' in k) { send(sock, { t: 'need-name', why: m.cls ? k.err : undefined, ask: ['cls'] }); return null; }
    q.setCls.run(k.cls, row.id);
    row.cls = k.cls;
  }
  const old = online.get(row.id);
  if (old) { old.sock.close(4000); online.delete(row.id); }
  const save = migrate(JSON.parse(row.save));
  const p: Player = { id: row.id, name: row.name, cls: row.cls, coat: row.coat, save, paused: !!row.paused, sock, x: save.x, y: save.y, dirty: false, rate: 0, marking: false };
  online.set(p.id, p);
  // what happened while they were away: living expenses, tasks, firing, release
  const r = act(save, 'tick', {}, Date.now());
  deliver(p, r.events);
  syncJail(p);
  store(p);
  send(sock, { t: 'welcome', id: p.id, name: p.name, cls: p.cls, coat: p.coat, save: publicSave(save), now: Date.now() });
  if (r.events.length) send(sock, { t: 'push', events: r.events, save: publicSave(save), now: Date.now() });
  if (save.quiz && !save.quiz.over) send(sock, { t: 'push', events: [{ t: 'quiz', view: quizView(save.quiz) }], save: publicSave(save), now: Date.now() });
  send(sock, { t: 'news', list: newsList() });
  send(sock, { t: 'prison', list: prisonList() });
  sendBoard(p);
  if (p.paused) send(sock, { t: 'paused' });
  return p;
}

// --------------------------------------------------------------- the AI ---
async function sparkModelName(): Promise<string> {
  if (sparkModel) return sparkModel;
  const r = await fetch(`${SPARK_URL}/models`, { headers: { authorization: `Bearer ${SPARK_KEY}` }, signal: AbortSignal.timeout(10000) });
  const j = (await r.json()) as { data?: Array<{ id: string }> };
  sparkModel = j.data?.[0]?.id ?? '';
  if (sparkModel) console.log(`spark model: ${sparkModel}`);
  return sparkModel;
}

/** the school AI's mark for a written answer, or null (the rules then use the keyword check) */
async function markEssay(essayId: string, text: string): Promise<Mark | null> {
  const e = essayOf(essayId);
  if (!e || !SPARK_KEY) return null;
  try {
    const model = await sparkModelName();
    if (!model) return null;
    const r = await fetch(`${SPARK_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SPARK_KEY}` },
      body: JSON.stringify({ model, messages: aiMessages(e, text), temperature: 0, max_tokens: 300 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) { console.warn(`spark: http ${r.status}`); return null; }
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const mark = parseAi(e, j.choices?.[0]?.message?.content ?? '');
    if (!mark) console.warn('spark: reply was not a mark');
    return mark;
  } catch (err) {
    console.warn(`spark: ${(err as Error).message}`);
    return null;
  }
}

// --------------------------------------------------------------- messages ---
function runAct(p: Player, id: number, name: string, args: Record<string, unknown>): void {
  const before = netWorth(p.save);
  const r = act(p.save, name, args, Date.now());
  deliver(p, r.events);
  store(p);
  if (netWorth(p.save) !== before) boardDirty = true;
  send(p.sock, { t: 'res', id, ok: r.ok, err: r.err, events: r.events, save: publicSave(p.save), now: Date.now() });
}

function onMessage(p: Player, m: ToServer): void {
  if (m.t === 'pos') {
    if (Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.y >= 0 && m.x <= 640 && m.y <= 360) {
      p.x = m.x; p.y = m.y; p.save.x = m.x; p.save.y = m.y; p.dirty = true;
    }
    return;
  }
  if (m.t === 'news?') { send(p.sock, { t: 'news', list: newsList() }); return; }
  if (m.t === 'quiz?') {
    if (p.save.quiz && !p.save.quiz.over) send(p.sock, { t: 'push', events: [{ t: 'quiz', view: quizView(p.save.quiz) }], save: publicSave(p.save), now: Date.now() });
    return;
  }
  if (m.t === 'act') {
    const no = (err: string): void => send(p.sock, { t: 'res', id: m.id, ok: false, err, events: [], save: publicSave(p.save), now: Date.now() });
    if (p.paused) { no('paused by your teacher'); return; }
    if (p.marking) { no('your answer is being marked'); return; }
    const name = String(m.name);
    const args: Record<string, unknown> = m.args && typeof m.args === 'object' ? { ...m.args } : {};
    // only the server gives a mark
    delete args.mark;
    const z = p.save.quiz;
    if (name === 'quiz.essay' && z && !z.over && z.qs[z.i]?.essay && args.q === z.i) {
      p.marking = true;
      markEssay(z.qs[z.i].id, String(args.text ?? '')).then((mark) => {
        p.marking = false;
        if (mark) args.mark = mark;
        const now = online.get(p.id);
        if (now === p) { runAct(p, m.id, name, args); return; }
        // they reconnected (or left) while it was being marked: apply it to the save that is live now
        const t = now ?? p;
        const r = act(t.save, name, args, Date.now());
        deliver(t, r.events);
        store(t);
        if (now) send(now.sock, { t: 'push', events: r.events, save: publicSave(now.save), now: Date.now() });
      });
      return;
    }
    runAct(p, m.id, name, args);
  }
}

// ------------------------------------------------------------------ timers ---
// everyone on the street, five times a second; players in prison are not shown
setInterval(() => {
  const list = [...online.values()].filter((p) => !p.save.jail)
    .map((o) => [o.id, o.name, o.coat, Math.round(o.x), Math.round(o.y)] as [string, string, string, number, number]);
  for (const me of online.values()) {
    send(me.sock, { t: 'others', list: list.filter((o) => o[0] !== me.id) });
    me.rate = 0;
  }
}, 200);

// real time: living expenses, work tasks, warnings, firing, release
setInterval(() => {
  for (const p of online.values()) {
    if (p.marking) continue;
    const r = act(p.save, 'tick', {}, Date.now());
    if (r.events.length || p.dirty) {
      deliver(p, r.events);
      store(p);
      boardDirty = true;
      if (r.events.length) send(p.sock, { t: 'push', events: r.events, save: publicSave(p.save), now: Date.now() });
    }
  }
  // offline players' sentences end too
  const before = jailed.size;
  for (const [id, j] of jailed) if (j[2] <= Date.now()) jailed.delete(id);
  if (jailed.size !== before) sendPrison();
}, 5000);

// players who are away: living expenses come out every hour, and saves from the village (v0.10 and
// older) start again on the one street, so the leaderboard never shows old money
function refreshOffline(): void {
  for (const r of q.all.all() as Row[]) {
    if (online.has(r.id)) continue;
    const raw = JSON.parse(r.save) as { v?: number };
    const s = migrate(raw);
    act(s, 'tick', {}, Date.now());
    if (raw.v !== 4 || netWorth(s) !== r.worth || JSON.stringify(s) !== r.save) {
      q.update.run(JSON.stringify(s), r.seen, netWorth(s), r.id);
      boardDirty = true;
    }
  }
}
refreshOffline();
setInterval(refreshOffline, HOUR);

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
    const live = online.get(r.id);
    const cur = live ? live.save : migrate(JSON.parse(r.save));
    return {
      id: r.id, name: r.name, cls: r.cls, coat: r.coat, online: !!live, paused: !!r.paused, created: r.created, seen: live ? Date.now() : r.seen,
      worth: netWorth(cur), money: cur.money, rep: cur.rep, earned: cur.earned, spent: cur.spent, answered: cur.answered, right: cur.right,
      mastery: Object.fromEntries(Object.keys(TOPIC_NAMES).map((t) => [t, cur.mastery[t] ?? 0])),
      record: cur.record, work: cur.work?.id ?? null, jailed: !!cur.jail && cur.jail.until > Date.now(), certs: cur.certs,
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
    if (q.byName.get(c.name) && c.name !== row.name) { json(res, 400, { err: 'name taken' }); return; }
    q.rename.run(c.name, id);
    if (live) { live.name = c.name; live.sock.close(4001); }
    boardDirty = true;
    json(res, 200, { ok: true });
    return;
  }
  if (path === 'api/admin/class') {
    const k = checkClass(String(b.cls ?? ''));
    if ('err' in k) { json(res, 400, k); return; }
    q.setCls.run(k.cls, id);
    if (live) live.cls = k.cls;
    const j = jailed.get(id);
    if (j) { j[0] = k.cls; sendPrison(); }
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
    if (jailed.delete(id)) sendPrison();
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
  if (path === 'api/health') { json(res, 200, { ok: true, online: online.size, ai: !!SPARK_KEY }); return; }
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
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`cit-game server on http://${HOST}:${PORT}${BASE} (db ${DB}${STATIC ? `, serving ${STATIC}/` : ''}${ADMIN_KEY ? ', /admin on' : ', /admin off: set ADMIN_KEY'}${SPARK_KEY ? ', ai marking on' : ', ai marking off: set SPARK_API_KEY'})`);
});

const stop = (): void => { for (const p of online.values()) store(p); db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
