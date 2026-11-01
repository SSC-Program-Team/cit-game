/**
 * The rules: every action that changes money, the clock, answers, gear or the record, as plain
 * functions on a save. The school server runs them (server/main.ts); solo play runs the same code
 * in the browser. Nothing here touches the DOM.
 *
 *   act(save, name, args, now) -> { ok, events, err }
 *
 * `now` is the real wall clock in ms (the server's, when there is one): work tasks, jail and
 * tenants run on it. The in-game clock (day, minutes) only moves when the player does something.
 * Events tell the client what to show and play; the save is changed in place.
 *
 * See docs/design/stanley-expansion.md §4-6 (work, upgrades, the law) and §10 (the server).
 */
import { QUESTIONS, FORM_RATE, TOPIC_NAMES, type Form, type Question, type Tier, type Topic } from './questions.ts';
import { JOBS, MISSIONS, OFFER, type Crime } from './jobs.ts';
import {
  ITEMS, item, SHOP_STOCK, PIRATE_STOCK, COURSES, COURSE_QUESTIONS, COURSE_PASS, EMPLOYERS, TASK_EVERY, TASK_CAP,
  TASK_QUESTIONS, REHIRE_WAIT, fireAfter, boardFor, OFFENCES, WARNING_FINE, GIGS, type Employer, type Gig, type Offence,
} from './economy.ts';
import { ROUTES } from './minibus.ts';
import { HOMES, home } from './homes.ts';
import { PLACES, driveRoute } from './world.ts';
import { car as carModel, CAR_LOSS_PER_DAY, CAR_FLOOR, CAR_BUYBACK } from './cars.ts';

// ------------------------------------------------------------------- save ---
export type Jail = { until: number; act: string; law: string; offence: string; fix: string };

/** an employer you work for. Times are wall-clock ms: tasks arrive in real time. */
export type Work = {
  id: string;
  hired: number;
  /** when the last task was issued */
  last: number;
  /** issue times of unfinished tasks, oldest first */
  tasks: number[];
  /** the boss has warned you about the oldest task */
  warned: boolean;
  done: number;
};

export type RecordEntry = { id: string; day: number; jailed: boolean };

/** a quiz in progress. Kept with the save on the server and never sent whole: the client gets the
 *  questions with shuffled options, not the answers */
export type HeldQuiz = {
  kind: 'gig' | 'work' | 'course' | 'study';
  ref: string;
  title: string;
  sub: string;
  tier: Tier;
  /** question id and the order its options are shown in */
  qs: Array<{ id: string; order: number[] }>;
  i: number;
  right: number;
  rightForms: Form[];
  /** the gig was done with a pirated licence: the police check comes after the summary */
  pirated?: boolean;
  /** finished: the summary has been sent */
  over?: boolean;
};

export type Save = {
  v: 3;
  money: number;
  energy: number;
  day: number;
  minutes: number;
  /** world position in pixels */
  x: number;
  y: number;
  /** map version the position belongs to (2 = the 1 m OSM map) */
  mapv?: number;
  done: string[];
  mastery: Record<string, number>;
  /** per client or employer: trust */
  rep: Record<string, number>;
  /** wall-clock release time, so closing the tab does not shorten the sentence */
  jail: Jail | null;
  /** an open callout on the street and the wall-clock time it closes */
  mission: { id: string; until: number } | null;
  /** the callout you walked into: paid when the job is done */
  missionTaken: string | null;
  /** item ids you own */
  inv: string[];
  /** gear condition, 0-100, by item id (laptops and tools wear; the used laptop never does) */
  cond: Record<string, number>;
  /** licences: the in-game day each one runs out */
  lic: Record<string, number>;
  /** course ids passed */
  certs: string[];
  work: Work | null;
  /** employer id -> wall-clock time you may reapply */
  fired: Record<string, number>;
  /** gigs done, as `${day}:${gigId}` */
  gigs: string[];
  record: RecordEntry[];
  /** the last few question ids, so the same one does not come straight back */
  seen: string[];
  /** questions answered / right, for the status screen */
  answered: number;
  right: number;
  /** everything ever earned, for the teacher page */
  earned: number;
  /** the street offer you walked away from */
  declined: boolean;
  quiz: HeldQuiz | null;
  /** homes you own: what you paid, and (let homes) the real time tenants last paid up to */
  homes: Record<string, { paid: number; rentTo: number }>;
  /** the home you live in: no rent, fees instead, and you sleep at its door */
  residence: string | null;
  /** your car, where it is parked (world pixels) and what it is worth now */
  car: { model: string; paid: number; value: number; x: number; y: number; angle: number } | null;
};

export const START_MONEY = 1280;

export const fresh = (): Save => ({
  v: 3, money: START_MONEY, energy: 5, day: 1, minutes: 9 * 60, x: -1, y: -1, done: [], mastery: {}, rep: {},
  jail: null, mission: null, missionTaken: null, inv: ['laptop1'], cond: {}, lic: {}, certs: [], work: null,
  fired: {}, gigs: [], record: [], seen: [], answered: 0, right: 0, earned: 0, declined: false, quiz: null,
  homes: {}, residence: null, car: null,
});

/** bring an older or partial save up to date */
export function migrate(raw: unknown): Save {
  const s = fresh();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Save> & { v?: number; mission?: unknown };
  Object.assign(s, r, { v: 3 });
  // v2 kept the callout as seconds left on the street: drop it, a new one comes along
  if (r.v !== 3) { s.mission = null; s.missionTaken = null; s.quiz = null; }
  for (const k of ['cond', 'lic', 'mastery', 'rep', 'fired', 'homes'] as const) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  for (const id of Object.keys(s.homes)) if (!home(id)) delete s.homes[id];
  if (s.residence && !s.homes[s.residence]) s.residence = null;
  if (s.car && !carModel(s.car.model)) s.car = null;
  for (const k of ['inv', 'certs', 'gigs', 'record', 'seen', 'done'] as const) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.inv.includes('laptop1')) s.inv.unshift('laptop1');
  // licences bought before they ran out: give them their 30 days from now
  for (const id of s.inv) if (item(id)?.kind === 'licence' && s.lic[id] === undefined) s.lic[id] = s.day + LICENCE_DAYS;
  return s;
}

/** what the client may see: the save without the answers to a quiz in progress */
export function publicSave(s: Save): Omit<Save, 'quiz'> & { quiz: null } {
  return { ...s, quiz: null };
}

// ------------------------------------------------------------- constants ---
export const HOUR = 60 * 60 * 1000;
export const MISSION_WINDOW = 90 * 1000;
export const MISSION_PAY = 2;
export const NO_SHOW_FEE = 100;
export const JAIL_MS = 30 * 60 * 1000;
export const SLEEP_FARE = 12;
/** §10: money has to drain out, or the leaderboard is just a record of the past */
export const RENT = 150;
export const LICENCE_DAYS = 30;
export const RENEW_WINDOW = 7;
/** homes (§11.1): living in one costs fees instead of rent; others are let to tenants, paid by the
 *  real hour so sleeping over and over cannot farm it; selling returns 90% */
export const HOME_FEES = 0.0003;
export const TENANT_PER_REAL_DAY = 0.003;
export const HOME_SELL = 0.9;
/**
 * The red taxi meter (Transport Department, from 14 July 2024): $29 for the first 2 km, then $2.1
 * for every 200 m or part while the fare is under $102.5, then $1.4. Waiting time is not charged.
 */
export function taxiFare(metres: number): number {
  let tenths = 290; // in ten-cent steps, so the $102.5 threshold is exact
  for (let d = 2000; d < metres; d += 200) tenths += tenths < 1025 ? 21 : 14;
  return tenths / 10;
}
/** metres by road between two points (world pixels), or -1 */
export function roadMetres(ax: number, ay: number, bx: number, by: number): number {
  const r = driveRoute(ax, ay, bx, by);
  if (r.length < 2) return -1;
  let m = Math.hypot(r[0].x - ax, r[0].y - ay);
  for (let i = 1; i < r.length; i += 1) m += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y);
  return m / 16;
}
/** a gig wears the laptop you use 1% and each tool it needs 4% */
export const WEAR_LAPTOP = 1;
export const WEAR_TOOL = 4;
/** a repair costs this share of the value the wear took off */
export const REPAIR_SHARE = 0.6;

// ----------------------------------------------------------------- events ---
export type QuizView = {
  title: string;
  sub: string;
  tier: Tier;
  qs: Array<{ q: string; options: string[]; form: Form; topic: Topic }>;
  i: number;
};

export type Ev =
  | { t: 'sound'; s: 'ok' | 'bad' | 'cash' | 'alert' | 'door' | 'ui' }
  | { t: 'toast'; text: string; colour?: string; secs?: number }
  | { t: 'say'; who: string; text: string }
  /** a line for the wire. public: the server shows it to everyone, with the player's name */
  | { t: 'news'; text: string; public?: string }
  | { t: 'quiz'; view: QuizView }
  | { t: 'answer'; ok: boolean; answer: number; why: string }
  | { t: 'summary'; lines: string[]; colour: string }
  | { t: 'warning'; law: string; offence: string; act: string; fix: string; fine: number; taken: string[] }
  | { t: 'arrest' }
  | { t: 'released' }
  | { t: 'sleep'; day: number; home?: string }
  | { t: 'mission'; id: string; until: number }
  | { t: 'missionGone' }
  /** a home changed hands: the server tells everyone, so the boards by the doors stay right */
  | { t: 'homeChange'; id: string; sold: boolean }
  | { t: 'carChange' };

/** what the rules need to know about the rest of the server: who owns which home */
export type World = { homeTaken?: (id: string) => boolean };

export type Result = { ok: boolean; err?: string; events: Ev[] };

// ----------------------------------------------------------------- helpers ---
const money = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
const round10 = (n: number): number => Math.round(n * 10) / 10;

export function ago(ms: number): string {
  const h = Math.floor(ms / HOUR);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const employer = (id: string): Employer | undefined => EMPLOYERS.find((e) => e.id === id);

function addMoney(s: Save, n: number): void {
  s.money = Math.max(0, round10(s.money + n));
  if (n > 0) s.earned = round10(s.earned + n);
}

/** the in-game clock. Every new day costs rent (§10); what you cannot pay is not owed */
function addMinutes(s: Save, n: number, ev: Ev[]): void {
  s.minutes += Math.max(0, Math.round(n));
  while (s.minutes >= 24 * 60) {
    s.minutes -= 24 * 60;
    newDay(s, ev);
  }
}

function newDay(s: Save, ev: Ev[]): void {
  s.day += 1;
  const h = s.residence ? home(s.residence) : undefined;
  const due = h ? Math.max(1, Math.round(h.price * HOME_FEES)) : RENT;
  const paid = Math.min(s.money, due);
  addMoney(s, -paid);
  const parts = [h ? `fees and rates ${money(paid)}` : `rent ${money(paid)}`];
  if (s.car) {
    const m = carModel(s.car.model)!;
    const run = Math.min(s.money, m.daily);
    addMoney(s, -run);
    s.car.value = Math.max(Math.round(m.price * CAR_FLOOR), Math.round(s.car.value - m.price * CAR_LOSS_PER_DAY));
    parts.push(`car ${money(run)}`);
  }
  ev.push({ t: 'toast', text: `day ${s.day}: ${parts.join(', ')}${paid < due ? ' (all you had)' : ''}`, colour: '#ff9a6a' });
  for (const [id, until] of Object.entries(s.lic)) {
    if (s.inv.includes(id) && until === s.day) ev.push({ t: 'toast', text: `your ${item(id)?.name ?? id} licence ran out`, colour: '#ff9a6a', secs: 5 });
  }
}

function addMastery(s: Save, topic: string, delta: number): void {
  s.mastery[topic] = Math.max(0, Math.min(100, (s.mastery[topic] ?? 0) + delta));
}

// -------------------------------------------------------------------- gear ---
/** condition of an owned item, 0-100 */
export const condition = (s: Save, id: string): number => (id === 'laptop1' ? 100 : s.cond[id] ?? 100);
/** a licence counts while its 30 days last */
export const licenceLive = (s: Save, id: string): boolean => (s.lic[id] ?? 0) > s.day;
/** does this owned item count for gigs right now */
export function works(s: Save, id: string): boolean {
  const it = item(id);
  if (!it || !s.inv.includes(id)) return false;
  if (it.kind === 'licence') return licenceLive(s, id);
  if (it.kind === 'laptop' || it.kind === 'tool') return condition(s, id) > 0;
  return true; // pirated copies never run out: that is the temptation
}

const LAPTOP_RANK: Record<string, number> = { laptop1: 1, laptop2: 2, laptop3: 3 };
/** the laptop you work on: the best one that still works */
export function bestLaptop(s: Save): string {
  return s.inv.filter((id) => LAPTOP_RANK[id] && works(s, id)).sort((a, b) => LAPTOP_RANK[b] - LAPTOP_RANK[a])[0] ?? 'laptop1';
}
export const payBoost = (s: Save): number => item(bestLaptop(s))?.payBoost ?? 1;

/** which owned item covers a gig's need: a better laptop covers a lesser one; real before pirated */
export function coverFor(s: Save, need: string): string | null {
  if (LAPTOP_RANK[need]) {
    const l = bestLaptop(s);
    return LAPTOP_RANK[l] >= LAPTOP_RANK[need] ? l : null;
  }
  const real = s.inv.find((id) => item(id)?.provides === need && item(id)?.kind !== 'pirated' && works(s, id));
  return real ?? s.inv.find((id) => item(id)?.provides === need && item(id)?.kind === 'pirated') ?? null;
}
export const has = (s: Save, need: string): boolean => coverFor(s, need) !== null;

/** what an item is worth now: price times condition, a licence by the share of its days left;
 *  pirated copies count for nothing */
export function itemValue(s: Save, id: string): number {
  const it = item(id);
  if (!it || it.kind === 'pirated' || !it.price) return 0;
  if (it.kind === 'licence') return Math.round((it.price * Math.max(0, (s.lic[id] ?? 0) - s.day)) / LICENCE_DAYS);
  return Math.round((it.price * condition(s, id)) / 100);
}

/** the leaderboard: cash plus gear at what it is worth now. Buying gear moves money into gear, so
 *  it never drops you; wear, expiry and rent do */
export function netWorth(s: Save): number {
  const homes = Object.values(s.homes).reduce((sum, h) => sum + h.paid, 0);
  return Math.round(s.money + s.inv.reduce((sum, id) => sum + itemValue(s, id), 0) + homes + (s.car?.value ?? 0));
}

/** tenants' rent so far that has not been collected yet, by home */
export function tenantsOwe(s: Save, now: number): number {
  let sum = 0;
  for (const [id, h] of Object.entries(s.homes)) {
    if (id === s.residence) continue;
    const hours = Math.floor((now - h.rentTo) / HOUR);
    if (hours > 0) sum += (home(id)!.price * TENANT_PER_REAL_DAY * hours) / 24;
  }
  return sum;
}

export function repairCost(s: Save, id: string): number {
  const it = item(id);
  if (!it) return 0;
  return Math.round((it.price * (100 - condition(s, id)) * REPAIR_SHARE) / 100);
}

// ---------------------------------------------------------------- the quiz ---
function drawQuestions(s: Save, topics: Topic[], n: number, forms: [Form, Form] = [1, 6]): Question[] {
  const pool = QUESTIONS.filter((q) => topics.includes(q.topic) && q.form >= forms[0] && q.form <= forms[1]);
  const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fresh_ = shuffle(pool.filter((q) => !s.seen.includes(q.id)));
  const stale = shuffle(pool.filter((q) => s.seen.includes(q.id)));
  return [...fresh_, ...stale].slice(0, n);
}

const byId = new Map(QUESTIONS.map((q) => [q.id, q]));

function holdQuiz(s: Save, q: Omit<HeldQuiz, 'qs' | 'i' | 'right' | 'rightForms'>, picked: Question[], ev: Ev[]): Result {
  if (!picked.length) return fail('no questions for that topic yet');
  s.quiz = {
    ...q, i: 0, right: 0, rightForms: [],
    qs: picked.map((x) => ({ id: x.id, order: [0, 1, 2, 3].sort(() => Math.random() - 0.5) })),
  };
  ev.push({ t: 'sound', s: 'door' }, { t: 'quiz', view: quizView(s.quiz) });
  return { ok: true, events: ev };
}

export function quizView(z: HeldQuiz): QuizView {
  return {
    title: z.title, sub: z.sub, tier: z.tier, i: z.i,
    qs: z.qs.map(({ id, order }) => {
      const q = byId.get(id)!;
      return { q: q.q, options: order.map((o) => q.options[o]), form: q.form, topic: q.topic };
    }),
  };
}

const fail = (err: string): Result => ({ ok: false, err, events: [{ t: 'toast', text: err, colour: '#ff9a6a' }, { t: 'sound', s: 'bad' }] });

// ----------------------------------------------------------------- the law ---
function arrest(s: Save, c: Crime, id: string, now: number, ev: Ev[]): void {
  s.mission = null;
  s.missionTaken = null;
  s.quiz = null;
  s.record.push({ id, day: s.day, jailed: true });
  s.jail = { until: now + JAIL_MS, act: c.act, law: c.law, offence: c.offence, fix: c.fix };
  ev.push({ t: 'sound', s: 'bad' }, { t: 'arrest' }, { t: 'news', text: 'a stanley technician was detained tonight', public: 'was arrested and taken to stanley prison' });
}

/** warning first: a first minor offence is a fine and a confiscation; anything else is jail */
function commit(s: Save, o: Offence, now: number, ev: Ev[]): void {
  if (o.serious || s.record.length > 0) { arrest(s, o, o.id, now, ev); return; }
  const fine = Math.min(s.money, WARNING_FINE);
  addMoney(s, -fine);
  const taken = s.inv.filter((id) => item(id)?.kind === 'pirated');
  s.inv = s.inv.filter((id) => item(id)?.kind !== 'pirated');
  s.record.push({ id: o.id, day: s.day, jailed: false });
  ev.push({ t: 'sound', s: 'alert' }, { t: 'news', text: 'police issue a warning over pirated software in stanley' },
    { t: 'warning', law: o.law, offence: o.offence, act: o.act, fix: o.fix, fine, taken: taken.map((t) => item(t)!.name) });
}

// --------------------------------------------------------------- real time ---
/** issue work tasks that fell due, warn, fire; let people out of prison; close a missed callout.
 *  Safe to run any number of times: it only looks at the wall clock */
function tick(s: Save, now: number, ev: Ev[]): void {
  // tenants pay by the real hour (a home you live in has none)
  let rent = 0;
  for (const [id, h] of Object.entries(s.homes)) {
    if (id === s.residence) { h.rentTo = now; continue; }
    const hours = Math.floor((now - h.rentTo) / HOUR);
    if (hours <= 0) continue;
    rent += (home(id)!.price * TENANT_PER_REAL_DAY * hours) / 24;
    h.rentTo += hours * HOUR;
  }
  if (rent >= 0.1) addMoney(s, Math.round(rent * 10) / 10);
  if (s.jail && now >= s.jail.until) {
    s.jail = null;
    ev.push({ t: 'released' });
  }
  if (s.mission && now >= s.mission.until && s.missionTaken !== s.mission.id) {
    const d = MISSIONS.find((m) => m.id === s.mission!.id);
    s.mission = null;
    noShow(s, d?.client, 'missed the callout', ev);
  }
  const w = s.work;
  if (!w) return;
  const e = employer(w.id);
  if (!e) { s.work = null; return; }
  while (now - w.last >= TASK_EVERY) {
    w.last += TASK_EVERY;
    if (w.tasks.length < TASK_CAP) w.tasks.push(w.last);
  }
  const oldest = w.tasks[0];
  if (oldest === undefined) return;
  const age = now - oldest;
  if (age >= fireAfter(e)) {
    s.work = null;
    s.fired[e.id] = now + REHIRE_WAIT;
    s.rep[e.name] = (s.rep[e.name] ?? 0) - 20;
    ev.push({ t: 'sound', s: 'bad' }, { t: 'news', text: `${e.name} let its it helper go`, public: `was fired by ${e.name}` },
      { t: 'say', who: e.boss, text: `you left a task for ${ago(age)}. i cannot run ${e.name} like this. you are fired. come back in a week if you want to try again.` });
    return;
  }
  if (!w.warned && age >= fireAfter(e) / 2) {
    w.warned = true;
    ev.push({ t: 'sound', s: 'alert' }, { t: 'news', text: `${e.boss} at ${e.name} wants that work done` },
      { t: 'toast', text: `${e.boss}: a task has waited ${ago(age)}. ${e.strict ? 'strict' : 'relaxed'} boss - fired at ${e.strict ? 3 : 5} days`, colour: '#ff9a6a', secs: 6 });
  }
}

function noShow(s: Save, client: string | undefined, what: string, ev: Ev[]): void {
  if (client) {
    s.rep[client] = (s.rep[client] ?? 0) - 10;
    ev.push({ t: 'news', text: `${client} called ah ming instead` });
  }
  addMoney(s, -NO_SHOW_FEE);
  ev.push({ t: 'missionGone' }, { t: 'sound', s: 'bad' }, { t: 'toast', text: `${what} - no-show fee -$${NO_SHOW_FEE}`, colour: '#ff6a6a', secs: 4 });
}

// ----------------------------------------------------------------- actions ---
type Args = Record<string, unknown>;
const str = (a: Args, k: string): string => (typeof a[k] === 'string' ? (a[k] as string) : '');
const num = (a: Args, k: string): number => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? (a[k] as number) : NaN);

export const ACTIONS = [
  'tick', 'quiz.start', 'quiz.answer', 'quiz.end', 'buy', 'repair', 'renew', 'crime', 'offer.decline',
  'work.apply', 'work.quit', 'sleep', 'fare', 'ride.end', 'job.wrong', 'job.done', 'job.crime',
  'mission.new', 'mission.take', 'mission.leave', 'study.time', 'home.buy', 'home.sell', 'home.live',
  'car.buy', 'car.sell', 'car.park', 'taxi.ride',
] as const;
export type ActionName = (typeof ACTIONS)[number];

export function act(s: Save, name: string, a: Args, now: number, world: World = {}): Result {
  const ev: Ev[] = [];
  tick(s, now, ev);
  if (name === 'tick') return { ok: true, events: ev };
  if (s.jail) return { ok: false, err: 'you are in prison', events: ev };
  const r = run(s, name, a, now, ev, world);
  // a failed action still delivers what the tick said
  if (!r.ok) r.events = [...ev.filter((e) => !r.events.includes(e)), ...r.events];
  return r;
}

function run(s: Save, name: string, a: Args, now: number, ev: Ev[], world: World): Result {
  const done = (): Result => ({ ok: true, events: ev });
  switch (name) {
    // ---------------------------------------------------------- quizzes
    case 'quiz.start': {
      if (s.quiz && !s.quiz.over) return fail('finish the one you are doing first');
      const kind = str(a, 'kind');
      if (kind === 'gig') {
        const g = boardFor(s.day).find((x) => x.id === str(a, 'id'));
        if (!g) return fail('that gig is not on the board today');
        if (s.gigs.includes(`${s.day}:${g.id}`)) return fail('already done today');
        if (s.energy <= 0) return fail('too tired. take the bus home and sleep');
        const missing = g.needs.filter((n) => !has(s, n));
        if (missing.length) return fail(`you need: ${missing.join(', ')}`);
        const pirated = g.needs.some((n) => item(coverFor(s, n) ?? '')?.kind === 'pirated');
        return holdQuiz(s, { kind, ref: g.id, title: `gig - ${g.title}`, sub: `${g.client}, ${g.place}`, tier: g.tier, pirated },
          drawQuestions(s, g.topics, g.questions, g.forms), ev);
      }
      if (kind === 'work') {
        const w = s.work, e = w && employer(w.id);
        if (!w || !e) return fail('you do not work anywhere');
        if (!w.tasks.length) return fail('no tasks waiting yet');
        return holdQuiz(s, { kind, ref: e.id, title: `work task - ${e.name}`, sub: `${e.boss} is watching`, tier: e.tier },
          drawQuestions(s, e.topics, TASK_QUESTIONS, e.forms), ev);
      }
      if (kind === 'course') {
        const c = COURSES.find((x) => x.id === str(a, 'id'));
        if (!c) return fail('no such course');
        if (s.certs.includes(c.id)) return fail('you have this certificate');
        if (s.money < c.price) return fail('not enough money');
        addMoney(s, -c.price);
        return holdQuiz(s, { kind, ref: c.id, title: `exam - ${c.name}`, sub: 'stanley plaza training centre', tier: c.tier },
          drawQuestions(s, c.topics, COURSE_QUESTIONS, c.forms), ev);
      }
      if (kind === 'study') {
        const t = str(a, 'topic') as Topic;
        if (!TOPIC_NAMES[t]) return fail('no such topic');
        return holdQuiz(s, { kind, ref: t, title: `study - ${TOPIC_NAMES[t]}`, sub: 'stanley public library', tier: t.startsWith('J') ? 'junior' : 'dse' },
          drawQuestions(s, [t], 5), ev);
      }
      return fail('no such quiz');
    }
    case 'quiz.answer': {
      const z = s.quiz;
      if (!z || z.over) return fail('no quiz');
      const pick = num(a, 'i');
      const at = num(a, 'q');
      if (!(pick >= 0 && pick <= 3)) return fail('pick a, b, c or d');
      // answering the same question twice (a repeated message) changes nothing
      if (at !== z.i) return { ok: false, err: 'already answered', events: [] };
      const h = z.qs[z.i];
      const q = byId.get(h.id)!;
      const answer = h.order.indexOf(q.answer);
      const ok = pick === answer;
      s.answered += 1;
      if (ok) { z.right += 1; z.rightForms.push(q.form); s.right += 1; }
      addMastery(s, q.topic, ok ? 4 : -2);
      s.seen = [q.id, ...s.seen.filter((x) => x !== q.id)].slice(0, 24);
      ev.push({ t: 'sound', s: ok ? 'ok' : 'bad' }, { t: 'answer', ok, answer, why: q.why });
      z.i += 1;
      if (z.i >= z.qs.length) settle(s, z, now, ev);
      return done();
    }
    case 'quiz.end': {
      // the summary has been read: a gig done with pirated software ends with a police check
      const z = s.quiz;
      s.quiz = null;
      if (z?.over && z.pirated) commit(s, OFFENCES.piracyUse, now, ev);
      return done();
    }
    // ---------------------------------------------------------------- shops
    case 'buy': {
      const id = str(a, 'id');
      const it = item(id);
      if (!it || !(SHOP_STOCK.includes(id) || PIRATE_STOCK.includes(id))) return fail('not for sale');
      if (s.inv.includes(id)) return fail('you have one');
      if (s.money < it.price) return fail('not enough money');
      addMoney(s, -it.price);
      s.inv.push(id);
      if (it.kind === 'laptop' || it.kind === 'tool') s.cond[id] = 100;
      if (it.kind === 'licence') s.lic[id] = s.day + LICENCE_DAYS;
      ev.push({ t: 'sound', s: 'cash' }, { t: 'toast', text: it.kind === 'pirated' ? `bought: ${it.name}. it has no receipt.` : `bought: ${it.name}`, colour: it.kind === 'pirated' ? '#ff9a6a' : '#7be08a' });
      return done();
    }
    case 'repair': {
      const id = str(a, 'id');
      const it = item(id);
      if (!it || !s.inv.includes(id) || (it.kind !== 'laptop' && it.kind !== 'tool') || id === 'laptop1') return fail('nothing to repair');
      if (condition(s, id) >= 100) return fail('it is in perfect shape');
      const cost = repairCost(s, id);
      if (s.money < cost) return fail('not enough money');
      addMoney(s, -cost);
      s.cond[id] = 100;
      ev.push({ t: 'sound', s: 'cash' }, { t: 'toast', text: `ah yan fixed your ${it.name}: ${money(cost)}`, colour: '#7be08a' });
      return done();
    }
    case 'renew': {
      const id = str(a, 'id');
      const it = item(id);
      if (!it || it.kind !== 'licence' || !s.inv.includes(id)) return fail('no such licence');
      if ((s.lic[id] ?? 0) - s.day > RENEW_WINDOW) return fail(`renewal opens ${RENEW_WINDOW} days before it runs out`);
      if (s.money < it.price) return fail('not enough money');
      addMoney(s, -it.price);
      s.lic[id] = Math.max(s.lic[id] ?? 0, s.day) + LICENCE_DAYS;
      ev.push({ t: 'sound', s: 'cash' }, { t: 'toast', text: `${it.name}: renewed to day ${s.lic[id]}`, colour: '#7be08a' });
      return done();
    }
    // -------------------------------------------------------------- the law
    case 'crime': {
      const id = str(a, 'id');
      if (id === 'offer') { arrest(s, OFFER.crime, 's161', now, ev); return done(); }
      const o = OFFENCES[id];
      if (!o || id === 'piracyUse') return fail('no');
      commit(s, o, now, ev);
      return done();
    }
    case 'offer.decline': s.declined = true; return done();
    // ---------------------------------------------------------------- work
    case 'work.apply': {
      const e = employer(str(a, 'id'));
      if (!e) return fail('nobody is hiring here');
      if (s.work) return fail(`you already work at ${employer(s.work.id)?.name ?? 'a job'}`);
      const back = s.fired[e.id] ?? 0;
      if (back > now) return fail(`you were fired. reapply in ${ago(back - now)}`);
      const missing = e.needs.filter((n) => !s.certs.includes(n));
      if (missing.length) return fail(`needs the ${COURSES.find((c) => c.id === missing[0])?.name ?? missing[0]}`);
      if (e.cleanDays && s.record.some((r) => r.day > s.day - e.cleanDays)) return fail(`no offences in the last ${e.cleanDays} days`);
      s.work = { id: e.id, hired: now, last: now, tasks: [now], warned: false, done: 0 };
      ev.push({ t: 'sound', s: 'cash' }, { t: 'news', text: `${e.name} hired a new it helper`, public: `was hired by ${e.name}` },
        { t: 'say', who: e.boss, text: `you start now. a task lands every 5 hours, even when you are not here. ${e.strict ? 'leave one for 3 days and you are out.' : 'leave one for 5 days and we will have words - then you are out.'}` });
      return done();
    }
    case 'work.quit': {
      const e = s.work && employer(s.work.id);
      if (!e) return fail('you do not work anywhere');
      s.work = null;
      ev.push({ t: 'say', who: e.boss, text: 'fair enough. the door is open if you change your mind.' });
      return done();
    }
    // ----------------------------------------------------------- getting about
    case 'sleep': {
      // the bus home, or your own front door: a new day (rent or fees), full energy, a new board
      const h = s.residence ? home(s.residence) : undefined;
      const atHome = str(a, 'at') === 'home';
      if (atHome) {
        if (!h) return fail('you do not live anywhere yet');
        if (Math.hypot(s.x / 16 - h.tx, s.y / 16 - h.ty) > 6) return fail('go to your front door to sleep');
      } else addMoney(s, -Math.min(s.money, SLEEP_FARE));
      s.minutes = 8 * 60;
      newDay(s, ev);
      s.energy = 5;
      ev.push({ t: 'sound', s: 'door' }, { t: 'sleep', day: s.day, home: atHome ? h!.id : undefined });
      return done();
    }
    // ---------------------------------------------------------------- homes
    case 'home.buy': {
      const h = home(str(a, 'id'));
      if (!h) return fail('not for sale');
      if (s.homes[h.id]) return fail('it is yours already');
      if (world.homeTaken?.(h.id)) return fail('someone else bought it');
      if (s.money < h.price) return fail('not enough money');
      addMoney(s, -h.price);
      s.homes[h.id] = { paid: h.price, rentTo: now };
      const first = !s.residence;
      if (first) s.residence = h.id;
      ev.push({ t: 'sound', s: 'cash' }, { t: 'homeChange', id: h.id, sold: true },
        { t: 'news', text: `${h.name} sold for ${money(h.price)}`, public: `bought ${h.name} for ${money(h.price)}` },
        { t: 'say', who: 'mr lam', text: first
          ? `the keys to ${h.name}. you live here now: no more rent, just fees of ${money(Math.max(1, Math.round(h.price * HOME_FEES)))} a day. sleep at your own front door.`
          : `the keys to ${h.name}. i will find you tenants: about ${money(Math.round(h.price * TENANT_PER_REAL_DAY))} a real day, paid by the hour.` });
      return done();
    }
    case 'home.sell': {
      const h = home(str(a, 'id'));
      const own = h && s.homes[h.id];
      if (!h || !own) return fail('that is not yours');
      const back = Math.round(own.paid * HOME_SELL);
      addMoney(s, back);
      delete s.homes[h.id];
      if (s.residence === h.id) s.residence = Object.keys(s.homes)[0] ?? null;
      ev.push({ t: 'sound', s: 'cash' }, { t: 'homeChange', id: h.id, sold: false },
        { t: 'toast', text: `sold ${h.name}: ${money(back)} after the agent's fee and stamp duty`, colour: '#7be08a', secs: 5 });
      return done();
    }
    case 'home.live': {
      const id = str(a, 'id');
      if (!s.homes[id]) return fail('that is not yours');
      s.residence = id;
      ev.push({ t: 'toast', text: `you live at ${home(id)!.name} now`, colour: '#7be08a' });
      return done();
    }
    // ---------------------------------------------------------------- taxis
    case 'taxi.ride': {
      // the meter runs over the road distance from where you got in, measured here; short of money,
      // you pay what you have
      const fx = num(a, 'x'), fy = num(a, 'y');
      const to = PLACES.find((p) => p.id === str(a, 'to')) ?? (home(str(a, 'to')) && { tx: home(str(a, 'to'))!.tx, ty: home(str(a, 'to'))!.ty });
      if (!to || !Number.isFinite(fx) || !Number.isFinite(fy)) return fail('where to?');
      // you are charged at the end of the ride: you must be there (the road nearest the place)
      if (s.x >= 0 && Math.hypot(s.x / 16 - to.tx, s.y / 16 - to.ty) > 90) return fail('the taxi has not got there yet');
      const m = roadMetres(fx, fy, to.tx * 16 + 8, to.ty * 16 + 8);
      if (m < 0) return fail('no road goes there');
      const fare = Math.min(s.money, taxiFare(m));
      addMoney(s, -fare);
      addMinutes(s, Math.max(2, Math.min(20, Math.round((m / 1000 / 25) * 60))), ev);
      ev.push({ t: 'sound', s: 'cash' }, { t: 'toast', text: `taxi: ${(m / 1000).toFixed(1)} km, ${money(fare)}${fare < taxiFare(m) ? ' (all you had)' : ''}`, colour: '#7be08a', secs: 4 });
      return done();
    }
    // ----------------------------------------------------------------- cars
    case 'car.buy': {
      const m = carModel(str(a, 'model'));
      if (!m) return fail('no such car');
      if (s.car?.model === m.id) return fail('you have one');
      const trade = s.car ? Math.round(s.car.value * CAR_BUYBACK) : 0;
      if (s.money + trade < m.price) return fail('not enough money, even with part exchange');
      addMoney(s, trade - m.price);
      const x = num(a, 'x'), y = num(a, 'y');
      s.car = { model: m.id, paid: m.price, value: m.price, x: Number.isFinite(x) ? x : s.x, y: Number.isFinite(y) ? y : s.y, angle: num(a, 'angle') || 0 };
      ev.push({ t: 'sound', s: 'cash' }, { t: 'carChange' }, { t: 'news', text: `stanley motors sold a ${m.name}`, public: `drove a new ${m.name} out of stanley motors` },
        { t: 'say', who: 'stanley motors', text: `${trade ? `we took your old car for ${money(trade)}. ` : ''}it is parked outside. walk up to it and press c to drive; c again to park.` });
      return done();
    }
    case 'car.sell': {
      if (!s.car) return fail('you have no car');
      const back = Math.round(s.car.value * CAR_BUYBACK);
      addMoney(s, back);
      s.car = null;
      ev.push({ t: 'sound', s: 'cash' }, { t: 'carChange' }, { t: 'toast', text: `sold your car for ${money(back)}`, colour: '#7be08a' });
      return done();
    }
    case 'car.park': {
      if (!s.car) return fail('you have no car');
      const x = num(a, 'x'), y = num(a, 'y'), ang = num(a, 'angle');
      if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('where?');
      s.car.x = x; s.car.y = y; s.car.angle = Number.isFinite(ang) ? ang : 0;
      return done();
    }
    case 'fare': {
      const r = ROUTES.find((x) => x.no === str(a, 'route'));
      if (!r) return fail('no such route');
      if (s.money < r.fare) return fail('not enough money for the fare');
      addMoney(s, -r.fare);
      ev.push({ t: 'sound', s: 'cash' }, { t: 'toast', text: `paid ${money(r.fare)} on the ${r.no}`, colour: '#7be08a' });
      return done();
    }
    case 'ride.end': {
      // in-game minutes for a ride: the client measures the route; kept within what Stanley allows
      const m = num(a, 'minutes');
      addMinutes(s, Math.max(2, Math.min(20, Number.isFinite(m) ? m : 2)), ev);
      return done();
    }
    case 'study.time': {
      // a lift or a pause that passes time without anything else: capped
      const m = num(a, 'minutes');
      addMinutes(s, Math.max(0, Math.min(30, Number.isFinite(m) ? m : 0)), ev);
      return done();
    }
    // ------------------------------------------------------ console jobs and callouts
    case 'job.wrong': {
      if (!JOBS.some((j) => j.id === str(a, 'id')) && !MISSIONS.some((j) => j.id === str(a, 'id'))) return fail('no such job');
      addMinutes(s, 4, ev);
      return done();
    }
    case 'job.done': {
      // console jobs pay once each; their answers live in the game's code (the screen shows them),
      // so the most anyone gains by reading it is fixed
      const id = str(a, 'id');
      const mission = s.missionTaken === id;
      const d = (mission ? MISSIONS : JOBS).find((j) => j.id === id);
      if (!d) return fail('no such job');
      if (s.done.includes(id)) return fail('already done');
      const pay = d.pay * (mission ? MISSION_PAY : 1);
      addMoney(s, pay);
      addMastery(s, d.mastery[0], d.mastery[1]);
      s.done.push(id);
      if (mission) { s.missionTaken = null; s.mission = null; }
      addMinutes(s, d.minutes, ev);
      ev.push({ t: 'sound', s: 'cash' }, { t: 'news', text: d.wire, public: `was paid ${money(pay)} by ${d.client}` });
      return done();
    }
    case 'job.crime': {
      const id = str(a, 'id');
      const d = [...JOBS, ...MISSIONS].find((j) => j.id === id);
      const c = d?.stages.flatMap((st) => st.choices).find((ch) => ch.crime)?.crime;
      if (!c) return fail('no');
      arrest(s, c, 's161', now, ev);
      return done();
    }
    case 'mission.new': {
      // a callout on the street: the client asks for one when its timer runs out
      if (s.mission) return done();
      const open = MISSIONS.filter((m) => !s.done.includes(m.id));
      if (!open.length) return fail('no callouts left');
      const d = open[Math.floor(Math.random() * open.length)];
      s.mission = { id: d.id, until: now + MISSION_WINDOW };
      ev.push({ t: 'sound', s: 'alert' }, { t: 'mission', id: d.id, until: s.mission.until });
      return done();
    }
    case 'mission.take': {
      if (!s.mission || s.mission.id !== str(a, 'id')) return fail('that callout has gone');
      s.missionTaken = s.mission.id;
      return done();
    }
    case 'mission.leave': {
      // walked out of a callout you had taken
      const id = s.missionTaken;
      if (!id) return done();
      const d = MISSIONS.find((m) => m.id === id);
      s.missionTaken = null;
      s.mission = null;
      noShow(s, d?.client, 'walked out of the callout', ev);
      return done();
    }
    default:
      return fail(`unknown action ${name}`);
  }
}

/** the last answer is in: pay, record, and the end screen */
function settle(s: Save, z: HeldQuiz, now: number, ev: Ev[]): void {
  z.over = true;
  const n = z.qs.length, right = z.right;
  let lines: string[] = [];
  let colour = '#7be08a';
  if (z.kind === 'gig') {
    const g = GIG(z.ref);
    const earned = z.rightForms.reduce((sum, f) => sum + FORM_RATE[f], 0);
    const pay = Math.round((earned * g.mult * payBoost(s)) / 10) * 10;
    s.gigs = [...s.gigs.filter((k) => Number(k.split(':')[0]) >= s.day - 2), `${s.day}:${g.id}`];
    s.energy = Math.max(0, s.energy - 1);
    addMinutes(s, g.minutes, ev);
    // wear: the laptop you worked on, and each tool the gig needed
    const wear: string[] = [];
    const lap = bestLaptop(s);
    if (lap !== 'laptop1') { s.cond[lap] = Math.max(0, condition(s, lap) - WEAR_LAPTOP); }
    for (const need of g.needs) {
      const id = coverFor(s, need);
      if (id && item(id)?.kind === 'tool') {
        s.cond[id] = Math.max(0, condition(s, id) - WEAR_TOOL);
        if (s.cond[id] <= 20) wear.push(`${item(id)!.name} ${s.cond[id]}%`);
      }
    }
    if (pay) { addMoney(s, pay); ev.push({ t: 'sound', s: 'cash' }, { t: 'news', text: `${g.client} paid a freelancer ${money(pay)}`, public: `was paid ${money(pay)} by ${g.client}` }); }
    else { s.rep[g.client] = (s.rep[g.client] ?? 0) - 2; colour = '#ff6a6a'; }
    lines = [
      `${right} of ${n} right`,
      pay ? `paid: ${money(pay)}` : 'not paid: nothing was usable',
      payBoost(s) > 1 ? `your laptop added ${Math.round((payBoost(s) - 1) * 100)}%` : 'a better laptop pays more',
      z.pirated ? 'the client is checking your software licence...' : wear.length ? `worn: ${wear.join(', ')} - pixel fix repairs` : `${g.client} will remember you`,
    ];
  } else if (z.kind === 'work') {
    const e = employer(z.ref)!;
    const w = s.work;
    addMoney(s, e.wage);
    s.rep[e.name] = (s.rep[e.name] ?? 0) + (right - 1);
    if (w && w.id === e.id) {
      w.tasks.shift();
      w.done += 1;
      w.warned = !!w.tasks.length && now - w.tasks[0] >= fireAfter(e) / 2;
    }
    addMinutes(s, 60, ev);
    ev.push({ t: 'sound', s: 'cash' });
    lines = [
      `${right} of ${n} right`,
      `wage paid: ${money(e.wage)}`,
      right === n ? `${e.boss} nods. from ${e.boss}, that is high praise.` : right ? `${e.boss}: "fine. check your work next time."` : `${e.boss}: "did you even read it?"`,
      s.work?.tasks.length ? `${s.work.tasks.length} more task(s) waiting` : 'nothing else waiting',
    ];
  } else if (z.kind === 'course') {
    const c = COURSES.find((x) => x.id === z.ref)!;
    addMinutes(s, 90, ev);
    if (right >= COURSE_PASS) {
      s.certs.push(c.id);
      ev.push({ t: 'sound', s: 'cash' }, { t: 'news', text: `a stanley freelancer earned the ${c.name}`, public: `earned the ${c.name}` });
      lines = [`${right} of ${n}: passed`, `certificate: ${c.name}`, 'employers can see it now'];
    } else {
      colour = '#ff6a6a';
      lines = [`${right} of ${n}: not passed (needs ${COURSE_PASS})`, 'study at the library, then try again', `retake fee: ${money(c.price)}`];
    }
  } else {
    const t = z.ref as Topic;
    addMinutes(s, 30, ev);
    lines = [`${right} of ${n} right`, `${TOPIC_NAMES[t]} mastery: ${s.mastery[t] ?? 0}`, right === n ? 'the librarian looks impressed' : 'read the explanations: they are the lesson'];
  }
  ev.push({ t: 'summary', lines, colour });
}

const GIG = (id: string): Gig => GIGS.find((x) => x.id === id)!;

export { ITEMS };
