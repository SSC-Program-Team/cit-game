/**
 * The rules: every action that changes money, reputation, answers, jobs or the record, as plain
 * functions on a save. The school server runs them (server/main.ts); solo play runs the same code
 * in the browser. Nothing here touches the DOM.
 *
 *   act(save, name, args, now) -> { ok, events, err }
 *
 * `now` is the real wall clock in ms (the server's, when there is one). Living expenses, work
 * tasks, the freelance board, people in the street and prison all run on it: there is no in-game
 * clock any more. See docs/design/one-street.md.
 */
import { QUESTIONS, FORM_RATE, type Form, type Question, type Tier, type Topic } from './questions.ts';
import { ESSAYS, type Essay } from './essays.ts';
import { keywordMark, drawable, ANSWER_MAX, type Mark } from './marking.ts';
import {
  HOUR, DAY, EXPENSES_PER_HOUR, START_MONEY, REP, EXAMS, ESSAY_POINTS, PASS_SHARE, EMPLOYERS, TASK_EVERY, TASK_CAP,
  TASK_QUESTIONS, REHIRE_WAIT, fireAfter, INTERVIEW_QUESTIONS, INTERVIEW_PASS, INTERVIEW_WAIT, GIGS, slotOf, boardFor,
  essayRate, OFFENCES, WARNING_FINE, JAIL_MS, ENCOUNTERS, ENCOUNTER_WAIT, ENCOUNTER_GAP,
  type Employer, type Offence, type Exam, type Gig, type Encounter,
} from './economy.ts';

// ------------------------------------------------------------------- save ---
export type Jail = { until: number; id: string; act: string; law: string; offence: string; fix: string };

/** the company you work for. Times are wall-clock ms: tasks arrive in real time */
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

export type RecordEntry = { id: string; at: number; jailed: boolean };

export type QuizKind = 'gig' | 'work' | 'exam' | 'interview' | 'encounter';

/** a quiz in progress. Kept with the save on the server and never sent whole: the client gets the
 *  questions with shuffled options, not the answers or the marking points */
export type HeldQuiz = {
  kind: QuizKind;
  ref: string;
  title: string;
  sub: string;
  tier: Tier;
  /** MC: question id and the order its options are shown in. essay: the essay id */
  qs: Array<{ id: string; essay?: boolean; order: number[] }>;
  i: number;
  /** MCs right */
  right: number;
  /** what the answers so far are worth: money for paid work, points for an exam */
  pay: number;
  points: number;
  max: number;
  /** the essay's mark, once it is in */
  mark?: Mark & { marks: number };
  over?: boolean;
};

export type Save = {
  v: 4;
  money: number;
  /** reputation: never below 0 */
  rep: number;
  /** where you stand on the street (canvas pixels) */
  x: number;
  y: number;
  /** living expenses are paid up to this wall-clock time */
  paidTo: number;
  /** wall-clock release time, so closing the tab does not shorten the sentence */
  jail: Jail | null;
  record: RecordEntry[];
  /** exam ids passed */
  certs: string[];
  work: Work | null;
  /** company id -> wall-clock time you may apply again (fired, or a failed interview) */
  wait: Record<string, number>;
  /** gigs done, as `${slot}:${gigId}` */
  gigs: string[];
  /** someone who has stopped you in the street, and until when they wait */
  encounter: { id: string; until: number } | null;
  /** nobody stops you before this */
  nextEncounter: number;
  mastery: Record<string, number>;
  /** the last question ids, so the same one does not come straight back */
  seen: string[];
  answered: number;
  right: number;
  /** everything ever earned, and spent on living, for the teacher page */
  earned: number;
  spent: number;
  quiz: HeldQuiz | null;
};

export const fresh = (): Save => ({
  v: 4, money: START_MONEY, rep: 0, x: 320, y: 198, paidTo: 0, jail: null, record: [], certs: [], work: null,
  wait: {}, gigs: [], encounter: null, nextEncounter: 0, mastery: {}, seen: [], answered: 0, right: 0, earned: 0,
  spent: 0, quiz: null,
});

/** bring a save up to date. The village saves (v3 and older) start again on the one street */
export function migrate(raw: unknown): Save {
  const s = fresh();
  if (!raw || typeof raw !== 'object' || (raw as { v?: number }).v !== 4) return s;
  Object.assign(s, raw);
  for (const k of ['wait', 'mastery'] as const) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  for (const k of ['record', 'certs', 'gigs', 'seen'] as const) if (!Array.isArray(s[k])) s[k] = [];
  if (s.work && !employer(s.work.id)) s.work = null;
  s.rep = Math.max(0, Number(s.rep) || 0);
  return s;
}

/** what the client may see: the save without the quiz the server is holding */
export function publicSave(s: Save): Omit<Save, 'quiz'> & { quiz: null } {
  return { ...s, quiz: null };
}

// ----------------------------------------------------------------- events ---
export type QuizQ =
  | { kind: 'mc'; q: string; options: string[]; form: Form; topic: Topic }
  | { kind: 'essay'; q: string; form: Form; topic: Topic; marks: number };

export type QuizView = { kind: QuizKind; title: string; sub: string; tier: Tier; qs: QuizQ[]; i: number };

export type Ev =
  | { t: 'sound'; s: 'ok' | 'bad' | 'cash' | 'alert' | 'door' | 'ui' }
  | { t: 'toast'; text: string; colour?: string; secs?: number }
  | { t: 'say'; who: string; text: string }
  /** a line for the news. public: the server puts it on everyone's news with the player's name */
  | { t: 'news'; text: string; public?: string }
  | { t: 'quiz'; view: QuizView }
  | { t: 'answer'; ok: boolean; answer: number; why: string }
  | { t: 'marked'; score: number; marks: number; feedback: string; model: string; by: 'ai' | 'keywords' }
  | { t: 'summary'; lines: string[]; colour: string }
  | { t: 'warning'; law: string; offence: string; act: string; fix: string; fine: number }
  | { t: 'arrest' }
  | { t: 'released' }
  | { t: 'encounter'; id: string; until: number }
  | { t: 'encounterGone' };

export type Result = { ok: boolean; err?: string; events: Ev[] };

// ----------------------------------------------------------------- helpers ---
export const money = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
const round10 = (n: number): number => Math.round(n * 10) / 10;

export function ago(ms: number): string {
  const h = Math.floor(ms / HOUR);
  if (h < 1) return `${Math.max(1, Math.ceil(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const employer = (id: string): Employer | undefined => EMPLOYERS.find((e) => e.id === id);
export const exam = (id: string): Exam | undefined => EXAMS.find((e) => e.id === id);
export const gig = (id: string): Gig | undefined => GIGS.find((g) => g.id === id);
export const encounter = (id: string): Encounter | undefined => ENCOUNTERS.find((e) => e.id === id);

function addMoney(s: Save, n: number): void {
  s.money = Math.max(0, round10(s.money + n));
  if (n > 0) s.earned = round10(s.earned + n);
}

function addRep(s: Save, n: number): void {
  s.rep = Math.max(0, s.rep + n);
}

function addMastery(s: Save, topic: string, delta: number): void {
  s.mastery[topic] = Math.max(0, Math.min(100, (s.mastery[topic] ?? 0) + delta));
}

/** the leaderboard: wealth is cash */
export const netWorth = (s: Save): number => Math.round(s.money);

/** an offence in the last `days` real days */
export const recentRecord = (s: Save, days: number, now: number): boolean => s.record.some((r) => r.at > now - days * DAY);

/** why you cannot take this gig or job yet, or '' */
export function missing(s: Save, needs: string[], rep: number): string {
  const cert = needs.find((n) => !s.certs.includes(n));
  if (cert) return `needs the ${exam(cert)?.name ?? cert} (ssc)`;
  if (s.rep < rep) return `needs reputation ${rep}`;
  return '';
}

// ---------------------------------------------------------------- the quiz ---
const shuffle = <T>(a: T[]): T[] => {
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function drawMcs(s: Save, topics: Topic[], n: number, forms: [Form, Form]): Question[] {
  const pool = QUESTIONS.filter((q) => topics.includes(q.topic) && q.form >= forms[0] && q.form <= forms[1]);
  return [...shuffle(pool.filter((q) => !s.seen.includes(q.id))), ...shuffle(pool.filter((q) => s.seen.includes(q.id)))].slice(0, n);
}

function drawEssay(s: Save, topics: Topic[], forms: [Form, Form]): Essay | undefined {
  const pool = ESSAYS.filter((e) => topics.includes(e.topic));
  const inForm = pool.filter((e) => e.form >= forms[0] && e.form <= forms[1]);
  const list = inForm.length ? inForm : pool;
  return shuffle(list.filter((e) => !s.seen.includes(e.id)))[0] ?? shuffle([...list])[0];
}

const mcById = new Map(QUESTIONS.map((q) => [q.id, q]));
const essayById = new Map(ESSAYS.map((e) => [e.id, e]));
export const essayOf = (id: string): Essay | undefined => essayById.get(id);

function holdQuiz(s: Save, q: Pick<HeldQuiz, 'kind' | 'ref' | 'title' | 'sub' | 'tier'>, mcs: Question[], essay: Essay | undefined, ev: Ev[]): Result {
  if (!mcs.length && !essay) return fail('no questions for that yet');
  s.quiz = {
    ...q, i: 0, right: 0, pay: 0, points: 0, max: mcs.length + (essay ? ESSAY_POINTS : 0),
    qs: [
      ...mcs.map((x) => ({ id: x.id, order: shuffle([0, 1, 2, 3]) })),
      ...(essay ? [{ id: essay.id, essay: true, order: [] }] : []),
    ],
  };
  ev.push({ t: 'sound', s: 'door' }, { t: 'quiz', view: quizView(s.quiz) });
  return { ok: true, events: ev };
}

export function quizView(z: HeldQuiz): QuizView {
  return {
    kind: z.kind, title: z.title, sub: z.sub, tier: z.tier, i: z.i,
    qs: z.qs.map(({ id, essay, order }): QuizQ => {
      if (essay) {
        const e = essayById.get(id)!;
        return { kind: 'essay', q: e.q, form: e.form, topic: e.topic, marks: e.points.length };
      }
      const q = mcById.get(id)!;
      return { kind: 'mc', q: q.q, options: order.map((o) => q.options[o]), form: q.form, topic: q.topic };
    }),
  };
}

const fail = (err: string): Result => ({ ok: false, err, events: [{ t: 'toast', text: err, colour: '#ff9a6a' }, { t: 'sound', s: 'bad' }] });

/** the pay multiplier for paid quizzes (gigs, people in the street); 0 for the rest */
function multOf(z: HeldQuiz): number {
  if (z.kind === 'gig') return gig(z.ref)?.mult ?? 1;
  if (z.kind === 'encounter') { const e = encounter(z.ref); return e?.kind === 'job' ? e.mult : 1; }
  return 0;
}

// ----------------------------------------------------------------- the law ---
function arrest(s: Save, o: Offence, now: number, ev: Ev[]): void {
  s.encounter = null;
  s.quiz = null;
  s.record.push({ id: o.id, at: now, jailed: true });
  s.jail = { until: now + JAIL_MS, id: o.id, act: o.act, law: o.law, offence: o.offence, fix: o.fix };
  addRep(s, REP.arrested);
  ev.push({ t: 'sound', s: 'bad' }, { t: 'arrest' },
    { t: 'news', text: 'police took someone to stanley prison', public: `was arrested: ${o.offence}` });
}

/** warning first: a first minor offence is a fine; a second offence, or a serious one, is prison */
function commit(s: Save, o: Offence, now: number, ev: Ev[]): void {
  if (o.serious || s.record.length > 0) { arrest(s, o, now, ev); return; }
  const fine = Math.min(s.money, WARNING_FINE);
  addMoney(s, -fine);
  s.record.push({ id: o.id, at: now, jailed: false });
  ev.push({ t: 'sound', s: 'alert' }, { t: 'warning', law: o.law, offence: o.offence, act: o.act, fix: o.fix, fine });
}

// --------------------------------------------------------------- real time ---
/** living expenses, work tasks, warnings, firing, release, someone who gave up waiting.
 *  Safe to run any number of times: it only looks at the wall clock */
function tick(s: Save, now: number, ev: Ev[]): void {
  if (!s.paidTo) s.paidTo = now;
  const hours = Math.floor((now - s.paidTo) / HOUR);
  if (hours > 0) {
    s.paidTo += hours * HOUR;
    const due = hours * EXPENSES_PER_HOUR;
    const paid = Math.min(s.money, due);
    addMoney(s, -paid);
    s.spent = round10(s.spent + paid);
    if (hours > 1) ev.push({ t: 'toast', text: `living expenses while you were away: ${money(paid)}${paid < due ? ' (all you had)' : ''}`, colour: '#ff9a6a', secs: 5 });
  }
  if (s.jail && now >= s.jail.until) {
    s.jail = null;
    ev.push({ t: 'released' });
  }
  if (s.encounter && now >= s.encounter.until) {
    s.encounter = null;
    ev.push({ t: 'encounterGone' });
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
    s.wait[e.id] = now + REHIRE_WAIT;
    addRep(s, REP.fired);
    ev.push({ t: 'sound', s: 'bad' }, { t: 'news', text: `${e.name} let someone go`, public: `was fired by ${e.name}` },
      { t: 'say', who: e.boss, text: `you left a task for ${ago(age)}. you are fired. come back in a week if you want to try again.` });
    return;
  }
  if (!w.warned && age >= fireAfter(e) / 2) {
    w.warned = true;
    ev.push({ t: 'sound', s: 'alert' },
      { t: 'toast', text: `${e.boss}: a task has waited ${ago(age)}. ${e.strict ? 'strict' : 'relaxed'} boss - fired at ${e.strict ? 3 : 5} days`, colour: '#ff9a6a', secs: 6 });
  }
}

// ----------------------------------------------------------------- actions ---
type Args = Record<string, unknown>;
const str = (a: Args, k: string): string => (typeof a[k] === 'string' ? (a[k] as string) : '');
const num = (a: Args, k: string): number => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? (a[k] as number) : NaN);

export const ACTIONS = [
  'tick', 'quiz.start', 'quiz.answer', 'quiz.essay', 'quiz.end', 'work.quit', 'encounter.new', 'encounter.answer',
] as const;
export type ActionName = (typeof ACTIONS)[number];

export function act(s: Save, name: string, a: Args, now: number): Result {
  const ev: Ev[] = [];
  tick(s, now, ev);
  if (name === 'tick') return { ok: true, events: ev };
  if (s.jail) return { ok: false, err: 'you are in prison', events: ev };
  const r = run(s, name, a, now, ev);
  // a failed action still delivers what the tick said
  if (!r.ok) r.events = [...ev.filter((e) => !r.events.includes(e)), ...r.events];
  return r;
}

function run(s: Save, name: string, a: Args, now: number, ev: Ev[]): Result {
  const done = (): Result => ({ ok: true, events: ev });
  switch (name) {
    case 'quiz.start': {
      if (s.quiz && !s.quiz.over) return fail('finish the one you are doing first');
      const kind = str(a, 'kind');
      if (kind === 'gig') {
        const g = boardFor(slotOf(now)).find((x) => x.id === str(a, 'id'));
        if (!g) return fail('that gig is not on the board any more');
        if (s.gigs.includes(`${slotOf(now)}:${g.id}`)) return fail('you did that one. a new board comes every 3 hours');
        const why = missing(s, g.needs, g.rep);
        if (why) return fail(why);
        return holdQuiz(s, { kind, ref: g.id, title: `freelance - ${g.title}`, sub: g.client, tier: g.tier },
          drawMcs(s, g.topics, g.mcs, g.forms), g.essay ? drawEssay(s, g.topics, g.forms) : undefined, ev);
      }
      if (kind === 'work') {
        const w = s.work, e = w && employer(w.id);
        if (!w || !e) return fail('you do not work for a company');
        if (!w.tasks.length) return fail('no tasks waiting yet');
        return holdQuiz(s, { kind, ref: e.id, title: `work task - ${e.name}`, sub: `${e.boss} is watching`, tier: e.tier },
          drawMcs(s, e.topics, TASK_QUESTIONS, e.forms), undefined, ev);
      }
      if (kind === 'interview') {
        const e = employer(str(a, 'id'));
        if (!e) return fail('nobody is hiring here');
        if (s.work) return fail(`you already work for ${employer(s.work.id)?.name ?? 'a company'}`);
        const back = s.wait[e.id] ?? 0;
        if (back > now) return fail(`${e.name} will see you again in ${ago(back - now)}`);
        const why = missing(s, e.needs, e.rep);
        if (why) return fail(why);
        if (e.cleanDays && recentRecord(s, e.cleanDays, now)) return fail(`no offences in the last ${e.cleanDays} days`);
        return holdQuiz(s, { kind, ref: e.id, title: `interview - ${e.name}`, sub: `${e.boss} asks the questions`, tier: e.tier },
          drawMcs(s, e.topics, INTERVIEW_QUESTIONS, e.forms), undefined, ev);
      }
      if (kind === 'exam') {
        const x = exam(str(a, 'id'));
        if (!x) return fail('no such exam');
        if (s.money < x.fee) return fail(`the fee is ${money(x.fee)}`);
        addMoney(s, -x.fee);
        return holdQuiz(s, { kind, ref: x.id, title: `exam - ${x.name}`, sub: "st stephen's college exam hall", tier: x.tier },
          drawMcs(s, x.topics, x.mcs, x.forms), drawEssay(s, x.topics, x.forms), ev);
      }
      if (kind === 'encounter') {
        const e = s.encounter && encounter(s.encounter.id);
        if (!e || e.kind !== 'job') return fail('they have gone');
        s.encounter = null;
        s.nextEncounter = now + gap();
        return holdQuiz(s, { kind, ref: e.id, title: e.title, sub: e.who, tier: e.forms[1] >= 4 ? 'dse' : 'junior' },
          drawMcs(s, e.topics, e.mcs, e.forms), undefined, ev);
      }
      return fail('no such quiz');
    }
    case 'quiz.answer': {
      const z = s.quiz;
      if (!z || z.over) return fail('no quiz');
      const pick = num(a, 'i');
      // answering the same question twice (a repeated message) changes nothing
      if (num(a, 'q') !== z.i) return { ok: false, err: 'already answered', events: [] };
      const h = z.qs[z.i];
      if (h.essay) return fail('this one is written');
      if (!(pick >= 0 && pick <= 3)) return fail('pick a, b, c or d');
      const q = mcById.get(h.id)!;
      const answer = h.order.indexOf(q.answer);
      const ok = pick === answer;
      s.answered += 1;
      if (ok) { z.right += 1; z.points += 1; z.pay += FORM_RATE[q.form] * multOf(z); s.right += 1; }
      addMastery(s, q.topic, ok ? 4 : -2);
      s.seen = [q.id, ...s.seen.filter((x) => x !== q.id)].slice(0, 30);
      ev.push({ t: 'sound', s: ok ? 'ok' : 'bad' }, { t: 'answer', ok, answer, why: q.why });
      z.i += 1;
      if (z.i >= z.qs.length) settle(s, z, now, ev);
      return done();
    }
    case 'quiz.essay': {
      // the school server marks the answer with the AI first and passes the mark in; without one
      // (solo, or the AI was unreachable) the keyword check marks it
      const z = s.quiz;
      if (!z || z.over) return fail('no quiz');
      if (num(a, 'q') !== z.i) return { ok: false, err: 'already answered', events: [] };
      const h = z.qs[z.i];
      if (!h.essay) return fail('this one is multiple choice');
      const e = essayById.get(h.id)!;
      const text = drawable(str(a, 'text')).slice(0, ANSWER_MAX);
      const given = a.mark as Mark | undefined;
      const mark: Mark = given && Number.isFinite(given.score) ? { ...given, score: Math.max(0, Math.min(e.points.length, Math.round(given.score))) } : keywordMark(e, text);
      const marks = e.points.length;
      z.mark = { ...mark, marks };
      const share = mark.score / marks;
      z.points += share * ESSAY_POINTS;
      z.pay += essayRate(e.form) * share * multOf(z);
      s.answered += 1;
      if (share >= 0.5) s.right += 1;
      addMastery(s, e.topic, Math.round(share * 8) - 2);
      s.seen = [e.id, ...s.seen.filter((x) => x !== e.id)].slice(0, 30);
      ev.push({ t: 'sound', s: share >= 0.5 ? 'ok' : 'bad' },
        { t: 'marked', score: mark.score, marks, feedback: mark.feedback, model: e.model, by: mark.by });
      z.i += 1;
      if (z.i >= z.qs.length) settle(s, z, now, ev);
      return done();
    }
    case 'quiz.end': {
      s.quiz = null;
      return done();
    }
    case 'work.quit': {
      const e = s.work && employer(s.work.id);
      if (!e) return fail('you do not work for a company');
      s.work = null;
      ev.push({ t: 'say', who: e.boss, text: 'fair enough. the door is open if you change your mind.' });
      return done();
    }
    case 'encounter.new': {
      // the client asks when its street timer runs out; the server decides whether anyone comes
      if (s.encounter) { ev.push({ t: 'encounter', id: s.encounter.id, until: s.encounter.until }); return done(); }
      if (now < s.nextEncounter || (s.quiz && !s.quiz.over)) return { ok: false, err: 'nobody', events: ev };
      // a job a little more often than a trap
      const jobs = ENCOUNTERS.filter((e) => e.kind === 'job'), traps = ENCOUNTERS.filter((e) => e.kind === 'trap');
      const list = Math.random() < 0.55 ? jobs : traps;
      const e = list[Math.floor(Math.random() * list.length)];
      s.encounter = { id: e.id, until: now + ENCOUNTER_WAIT };
      ev.push({ t: 'sound', s: 'alert' }, { t: 'encounter', id: e.id, until: s.encounter.until });
      return done();
    }
    case 'encounter.answer': {
      const e = s.encounter && encounter(s.encounter.id);
      if (!e) return fail('they have gone');
      const yes = a.yes === true;
      if (yes && e.kind === 'job') return run(s, 'quiz.start', { kind: 'encounter' }, now, ev);
      s.encounter = null;
      s.nextEncounter = now + gap();
      ev.push({ t: 'encounterGone' });
      if (!yes) {
        if (e.kind === 'trap') ev.push({ t: 'say', who: 'good call', text: e.signs });
        return done();
      }
      if (e.kind === 'trap') commit(s, OFFENCES[e.offence], now, ev);
      return done();
    }
    default:
      return fail(`unknown action ${name}`);
  }
}

const gap = (): number => ENCOUNTER_GAP[0] + Math.random() * (ENCOUNTER_GAP[1] - ENCOUNTER_GAP[0]);

/** the last answer is in: pay, reputation, the record, and the end screen */
function settle(s: Save, z: HeldQuiz, now: number, ev: Ev[]): void {
  z.over = true;
  const essay = z.mark ? `written answer: ${z.mark.score} of ${z.mark.marks}` : '';
  const mcLine = z.qs.some((q) => !q.essay) ? `${z.right} of ${z.qs.filter((q) => !q.essay).length} multiple choice right` : '';
  let lines: string[] = [];
  let colour = '#7be08a';
  if (z.kind === 'gig' || z.kind === 'encounter') {
    const pay = Math.round(z.pay / 10) * 10;
    const share = z.max ? z.points / z.max : 0;
    if (z.kind === 'gig') s.gigs = [...s.gigs.filter((k) => Number(k.split(':')[0]) >= slotOf(now) - 2), `${slotOf(now)}:${z.ref}`];
    const rep = share >= 0.5 ? REP.gigGood : share > 0 ? REP.gigSome : 0;
    addRep(s, rep);
    if (pay) { addMoney(s, pay); ev.push({ t: 'sound', s: 'cash' }); } else colour = '#ff6a6a';
    lines = [mcLine, essay, pay ? `paid: ${money(pay)}` : 'not paid: nothing was usable',
      rep ? `reputation +${rep} (now ${s.rep})` : 'no reputation for that one'].filter(Boolean);
  } else if (z.kind === 'work') {
    const e = employer(z.ref)!;
    const w = s.work;
    addMoney(s, e.wage);
    if (w && w.id === e.id) {
      w.tasks.shift();
      w.done += 1;
      w.warned = !!w.tasks.length && now - w.tasks[0] >= fireAfter(e) / 2;
    }
    ev.push({ t: 'sound', s: 'cash' });
    lines = [mcLine, `wage paid: ${money(e.wage)}`,
      z.right === z.qs.length ? `${e.boss} nods. that is high praise.` : z.right ? `${e.boss}: "fine. check your work next time."` : `${e.boss}: "did you even read it?"`,
      s.work?.tasks.length ? `${s.work.tasks.length} more task(s) waiting` : 'nothing else waiting'];
  } else if (z.kind === 'interview') {
    const e = employer(z.ref)!;
    if (z.right >= INTERVIEW_PASS && !s.work) {
      s.work = { id: e.id, hired: now, last: now, tasks: [now], warned: false, done: 0 };
      ev.push({ t: 'sound', s: 'cash' }, { t: 'news', text: `${e.name} hired someone`, public: `was hired by ${e.name}` });
      lines = [mcLine, `hired by ${e.name}`, `wage ${money(e.wage)} a task. a task arrives every 5 hours, even when you are away.`,
        e.strict ? 'strict boss: leave a task 3 days and you are fired.' : 'relaxed boss: leave a task 5 days and you are fired.'];
    } else {
      colour = '#ff6a6a';
      s.wait[e.id] = now + INTERVIEW_WAIT;
      lines = [mcLine, `not this time (needs ${INTERVIEW_PASS} right)`, 'read the notes at the library, then try again in an hour'];
    }
  } else {
    const x = exam(z.ref)!;
    const pass = z.points >= z.max * PASS_SHARE - 1e-9;
    const first = pass && !s.certs.includes(x.id);
    if (first) {
      s.certs.push(x.id);
      addRep(s, REP.exam);
      ev.push({ t: 'sound', s: 'cash' }, { t: 'news', text: `someone passed the ${x.name}`, public: `passed the ${x.name}` });
    }
    if (!pass) colour = '#ff6a6a';
    lines = [mcLine, essay, `${Math.round(z.points * 10) / 10} of ${z.max} points: ${pass ? 'passed' : `not passed (needs ${Math.round(z.max * PASS_SHARE * 10) / 10})`}`,
      first ? `certificate: ${x.name}. reputation +${REP.exam}` : pass ? 'you had this certificate already: no reputation this time' : 'read the notes at the library, then sit it again'].filter(Boolean);
  }
  ev.push({ t: 'summary', lines, colour });
}

export { HOUR };
