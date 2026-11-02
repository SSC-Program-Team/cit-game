/**
 * The browser's side of the school server: one WebSocket to api/ws (docs/design/one-street.md). Every action goes through act(): online it goes to the server, which runs the rules and
 * sends back what happened and the save; solo (no server, or ?solo in the URL) the same rules run
 * here on a save in localStorage, which is not on the leaderboard.
 */
import { act as runRule, type Ev, type Result } from './rules.ts';
import { state, loadSolo, saveSolo, adopt } from './state.ts';
import type { ToClient, ToServer, NewsItem, Prisoner } from './protocol.ts';

export type Other = { name: string; coat: string; x: number; y: number; tx: number; ty: number; seen: number; frame: number; facing: number };

export const net = {
  mode: 'connecting' as 'connecting' | 'online' | 'solo',
  me: { id: '', name: '', cls: '', coat: '#7be0d0' },
  others: new Map<string, Other>(),
  board: { top: [] as Array<[string, number]>, you: [0, 0] as [number, number] },
  paused: false,
  /** the news stand: the past 12 hours, newest first (solo: what you did) */
  news: [] as NewsItem[],
  /** who is in Stanley Prison */
  prison: [] as Prisoner[],
  /** server clock minus ours */
  offset: 0,
  /** solo test hook: shift the wall clock forward (hours) */
  skew: 0,
};

/** the wall clock the rules run on: the server's when there is one */
export const serverNow = (): number => Date.now() + net.offset + net.skew;

type Handlers = { events: (e: Ev[]) => void; wire: (text: string) => void };
let on: Handlers = { events: () => {}, wire: () => {} };

let ws: WebSocket | null = null;
let seq = 0;
const waiting = new Map<number, (r: Result) => void>();

function token(): string {
  try {
    let t = localStorage.getItem('cit-token');
    if (!t) {
      const a = new Uint8Array(18);
      crypto.getRandomValues(a);
      t = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('cit-token', t);
    }
    return t;
  } catch {
    return 'nostorage-' + Math.random().toString(36).slice(2, 18);
  }
}

// ------------------------------------------------------------------ overlay ---
/** a plain DOM panel over the canvas, for the few things the pixel UI does not do: typing a name
 *  and class, and saying the server cannot be reached */
type Field = { placeholder: string; max: number };
function panel(title: string, text: string, buttons: Array<[string, (values: string[]) => void]>, fields: Field[] = []): () => void {
  const el = document.createElement('div');
  el.setAttribute('style', 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.82);z-index:10;font:15px/1.5 ui-monospace,Menlo,monospace;color:#e8e8f0');
  const box = document.createElement('div');
  box.setAttribute('style', 'background:#121722;border-top:2px solid #46e0e6;padding:22px 24px;max-width:440px;width:calc(100% - 48px)');
  const h = document.createElement('div');
  h.textContent = title;
  h.setAttribute('style', 'color:#ffc84a;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px');
  const p = document.createElement('div');
  p.textContent = text;
  p.setAttribute('style', 'color:#c8ccdc;margin-bottom:14px');
  box.append(h, p);
  const inputs = fields.map((f) => {
    const field = document.createElement('input');
    field.placeholder = f.placeholder;
    field.maxLength = f.max;
    field.autocapitalize = 'off';
    field.setAttribute('style', 'width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;background:#0b0d16;color:#fff;border:1px solid #3a4054;margin-bottom:12px');
    field.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && buttons[0]) buttons[0][1](inputs.map((i) => i.value)); });
    box.append(field);
    return field;
  });
  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:10px;flex-wrap:wrap');
  for (const [label, fn] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', 'font:inherit;padding:7px 14px;background:#1c2230;color:#46e0e6;border:1px solid #46e0e6;cursor:pointer');
    b.addEventListener('click', () => fn(inputs.map((i) => i.value)));
    row.append(b);
  }
  box.append(row);
  el.append(box);
  document.body.append(el);
  inputs[0]?.focus();
  return () => el.remove();
}

// ------------------------------------------------------------------ connect ---
/** connect to the school server, or fall back to solo. Resolves once the game can start */
export function startNet(h: Handlers): Promise<void> {
  on = h;
  if (/[?&]solo\b/.test(location.search)) { goSolo(); return Promise.resolve(); }
  return new Promise((resolve) => {
    let started = false;
    const ready = (): void => { if (!started) { started = true; resolve(); } };
    const offline = (): void => {
      const close = panel('school server', 'cannot reach the school server. play solo (saved on this device, not on the leaderboard or the news), or try again.', [
        ['try again', () => { close(); connect(); }],
        ['play solo', () => { close(); goSolo(); ready(); }],
      ]);
    };
    let name: string | undefined;
    let cls: string | undefined;
    const connect = (): void => {
      const url = new URL('api/ws', location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      let opened = false;
      const sock = new WebSocket(url);
      ws = sock;
      const timer = setTimeout(() => { if (!opened) sock.close(); }, 5000);
      sock.onopen = () => { opened = true; clearTimeout(timer); send({ t: 'hello', token: token(), name, cls }); };
      sock.onmessage = (e) => {
        let m: ToClient;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'need-name') {
          const both = m.ask.includes('name');
          const fields: Field[] = [
            ...(both ? [{ placeholder: 'your name', max: 12 }] : []),
            { placeholder: 'class and number, e.g. 5C01', max: 5 },
          ];
          const go = (v: string[]): void => {
            if (both) { name = v[0]; cls = v[1]; } else cls = v[0];
            close();
            send({ t: 'hello', token: token(), name, cls });
          };
          const close = panel(both ? 'who are you?' : 'your class',
            `${m.why ? m.why + '. ' : ''}${both ? 'pick a name for stanley (3-12 letters, digits or spaces): everyone on the server sees it. ' : ''}your class and class number (like 5C01) are only shown if you end up in stanley prison.`,
            [['start', go]], fields);
          return;
        }
        if (m.t === 'welcome') {
          net.mode = 'online';
          net.me = { id: m.id, name: m.name, cls: m.cls, coat: m.coat };
          net.offset = m.now - Date.now();
          adopt(m.save);
          ready();
          return;
        }
        receive(m);
      };
      sock.onclose = () => {
        clearTimeout(timer);
        for (const [, done] of waiting) done({ ok: false, err: 'lost the school server', events: [] });
        waiting.clear();
        if (!started) { offline(); return; }
        if (net.mode !== 'online') return;
        // keep playing: reconnect quietly in the background
        on.events([{ t: 'toast', text: 'lost the school server - reconnecting...', colour: '#ff9a6a', secs: 3 }]);
        setTimeout(connect, 2500);
      };
    };
    connect();
  });
}

function goSolo(): void {
  net.mode = 'solo';
  net.me = { id: 'solo', name: 'you', cls: '', coat: '#7be0d0' };
  loadSolo();
}

function send(m: ToServer): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function receive(m: ToClient): void {
  switch (m.t) {
    case 'res': {
      net.offset = m.now - Date.now();
      adopt(m.save);
      const done = waiting.get(m.id);
      waiting.delete(m.id);
      done?.({ ok: m.ok, err: m.err, events: m.events });
      return;
    }
    case 'push':
      net.offset = m.now - Date.now();
      adopt(m.save);
      on.events(m.events);
      return;
    case 'others': {
      const seen = new Set<string>();
      for (const [id, name, coat, x, y] of m.list) {
        seen.add(id);
        const o = net.others.get(id);
        if (o) { o.name = name; o.coat = coat; o.tx = x; o.ty = y; o.seen = Date.now(); }
        else net.others.set(id, { name, coat, x, y, tx: x, ty: y, seen: Date.now(), frame: 0, facing: 1 });
      }
      for (const id of net.others.keys()) if (!seen.has(id)) net.others.delete(id);
      return;
    }
    case 'wire':
      net.news.unshift([m.at, m.text]);
      on.wire(m.text);
      return;
    case 'news': net.news = m.list; return;
    case 'prison': net.prison = m.list; return;
    case 'board': net.board = { top: m.top, you: m.you }; return;
    case 'paused':
      net.paused = true;
      on.events([{ t: 'say', who: 'your teacher', text: 'your game is paused for now. ask your teacher.' }]);
      return;
    default: return;
  }
}

// ---------------------------------------------------------------------- act ---
/** do something that changes the save. The events come back in the result and also go to the
 *  handler, so the caller only has to deal with what is particular to it */
export function act(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  if (net.mode === 'solo') {
    const r = runRule(state, name, args, serverNow());
    saveSolo();
    on.events(r.events);
    return Promise.resolve(r);
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const r: Result = { ok: false, err: 'not connected to the school server', events: [{ t: 'toast', text: 'not connected to the school server', colour: '#ff9a6a' }] };
    on.events(r.events);
    return Promise.resolve(r);
  }
  const id = (seq += 1);
  return new Promise((resolve) => {
    waiting.set(id, (r) => { on.events(r.events); resolve(r); });
    send({ t: 'act', id, name, args });
    setTimeout(() => {
      const done = waiting.get(id);
      if (done) { waiting.delete(id); done({ ok: false, err: 'the school server did not answer', events: [{ t: 'toast', text: 'the school server did not answer', colour: '#ff9a6a' }] }); }
    }, 10000);
  });
}

let lastPos = 0, lastX = -1, lastY = -1, soloSaved = 0;
/** where you are: to the server a few times a second while you move; solo, into the save */
export function sendPos(x: number, y: number): void {
  state.x = x; state.y = y;
  const t = performance.now();
  if (net.mode === 'solo') {
    if (t - soloSaved > 2000) { soloSaved = t; saveSolo(); }
    return;
  }
  if (t - lastPos < 200 || (Math.abs(x - lastX) < 1 && Math.abs(y - lastY) < 1)) return;
  lastPos = t; lastX = x; lastY = y;
  send({ t: 'pos', x: Math.round(x), y: Math.round(y) });
}

/** ask for the news stand's paper again */
export function askNews(): void { send({ t: 'news?' }); }

/** ease other players towards where the server last saw them */
export function updateOthers(dt: number): void {
  for (const o of net.others.values()) {
    const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy);
    if (d > 400) { o.x = o.tx; o.y = o.ty; continue; }
    if (d < 0.5) { o.frame = 0; continue; }
    const step = Math.min(d, Math.max(40, d * 6) * dt);
    o.x += (dx / d) * step; o.y += (dy / d) * step;
    if (Math.abs(dx) > 0.5) o.facing = dx > 0 ? 1 : -1;
    o.frame += dt * 6;
  }
}
