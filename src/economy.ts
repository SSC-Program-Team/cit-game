/**
 * The one-street game's data (docs/design/one-street.md): the companies hiring at Stanley Plaza,
 * the freelance gigs on its board, the exams at St Stephen's College, the people who stop you in
 * the street (some with work, some with a trap), and the offences that land you in Stanley Prison.
 * All of it is data; src/rules.ts runs it.
 */
import { FORM_RATE, type Form, type Tier, type Topic } from './questions.ts';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

// ------------------------------------------------------------------ money ---
/** living expenses: every real hour, even while the game is closed. No debt: cash stops at $0 */
export const EXPENSES_PER_HOUR = 2;
export const START_MONEY = 500;

// ------------------------------------------------------------- reputation ---
/** reputation never goes below 0 */
export const REP = {
  /** finishing a freelance gig: more for a good job */
  gigGood: 3,
  gigSome: 1,
  /** passing an exam, first time only */
  exam: 5,
  fired: -10,
  arrested: -15,
} as const;

// ------------------------------------------------------------------ exams ---
export type Exam = {
  id: string;
  name: string;
  /** paid at the gate each sitting */
  fee: number;
  tier: Tier;
  topics: Topic[];
  forms: [Form, Form];
  /** multiple-choice questions, then one essay */
  mcs: number;
  blurb: string;
};

export const EXAMS: Exam[] = [
  { id: 'x.junior', name: 'junior digital skills', fee: 100, tier: 'junior', topics: ['J1', 'J2', 'J4'], forms: [1, 3], mcs: 4,
    blurb: 'computer basics, staying safe online, and ai.' },
  { id: 'x.code', name: 'coding certificate', fee: 250, tier: 'junior', topics: ['J3', 'D'], forms: [2, 5], mcs: 4,
    blurb: 'algorithms, flowcharts, tracing and testing.' },
  { id: 'x.support', name: 'it support certificate', fee: 300, tier: 'dse', topics: ['B', 'C'], forms: [4, 6], mcs: 4,
    blurb: 'hardware, operating systems and networks.' },
  { id: 'x.data', name: 'data and privacy certificate', fee: 300, tier: 'dse', topics: ['A', 'E'], forms: [4, 6], mcs: 4,
    blurb: 'databases, spreadsheets, the privacy ordinance.' },
];

/** an exam has its MCs (1 point each) and one essay (2 points, by its share of the marks): pass at 70% */
export const ESSAY_POINTS = 2;
export const PASS_SHARE = 0.7;

// ------------------------------------------------------------- companies ---
export type Employer = {
  id: string;
  name: string;
  /** who you talk to */
  boss: string;
  tier: Tier;
  topics: Topic[];
  forms: [Form, Form];
  /** paid for every completed work task, whatever the score */
  wage: number;
  /** strict bosses fire at 3 days, relaxed at 5 */
  strict: boolean;
  /** exams you must have passed */
  needs: string[];
  /** reputation you need to get an interview */
  rep: number;
  /** refuses anyone with an offence in the last N real days */
  cleanDays: number;
  pitch: string;
};

export const EMPLOYERS: Employer[] = [
  { id: 'cafe', name: 'bayview cafe', boss: 'miss ho', tier: 'junior', topics: ['J1', 'J2'], forms: [1, 3],
    wage: 120, strict: false, needs: [], rep: 0, cleanDays: 0,
    pitch: 'the till, the wi-fi and our instagram. relaxed hours.' },
  { id: 'pixelfix', name: 'pixel fix', boss: 'ah yan', tier: 'junior', topics: ['J1', 'J3', 'B'], forms: [2, 4],
    wage: 180, strict: false, needs: ['x.junior'], rep: 5, cleanDays: 0,
    pitch: 'repairs and set-ups for the whole village. bring your junior certificate.' },
  { id: 'tide', name: 'tide restaurant group', boss: 'mr cheung', tier: 'dse', topics: ['B', 'C', 'E'], forms: [4, 6],
    wage: 260, strict: true, needs: ['x.support'], rep: 15, cleanDays: 14,
    pitch: 'run it for three restaurants: bookings, network, card machines. i check everything.' },
  { id: 'harbour', name: 'harbour data ltd', boss: 'ms lau', tier: 'dse', topics: ['A', 'D', 'E'], forms: [4, 6],
    wage: 340, strict: true, needs: ['x.data', 'x.code'], rep: 30, cleanDays: 30,
    pitch: 'data and scripts for shipping firms. we hire the best and fire the rest.' },
];

/** a work task lands every five real hours, even while the game is closed */
export const TASK_EVERY = 5 * HOUR;
export const TASK_CAP = 4;
export const TASK_QUESTIONS = 3;
export const REHIRE_WAIT = 7 * DAY;
export const fireAfter = (e: Employer): number => (e.strict ? 3 : 5) * DAY;
/** the interview: MCs on the company's topics; pass with this many right */
export const INTERVIEW_QUESTIONS = 3;
export const INTERVIEW_PASS = 2;
/** fail an interview and the company will see you again after an hour */
export const INTERVIEW_WAIT = HOUR;

// ------------------------------------------------------------------- gigs ---
export type Gig = {
  id: string;
  client: string;
  title: string;
  tier: Tier;
  topics: Topic[];
  /** multiple-choice questions; essay: one written answer as well */
  mcs: number;
  essay: boolean;
  forms: [Form, Form];
  /** on top of each right answer's form rate */
  mult: number;
  /** exams you must have passed, and reputation */
  needs: string[];
  rep: number;
};

export const GIGS: Gig[] = [
  { id: 'g.menu', client: 'chan tai', title: 'type up the tea shop menu', tier: 'junior', topics: ['J1'],
    mcs: 3, essay: false, forms: [1, 2], mult: 1, needs: [], rep: 0 },
  { id: 'g.tablet', client: 'grandma lee', title: 'set up a tablet for video calls', tier: 'junior', topics: ['J1', 'J2'],
    mcs: 3, essay: false, forms: [1, 2], mult: 1, needs: [], rep: 0 },
  { id: 'g.poster', client: 't-shirt stall', title: 'a sale poster that is not stolen art', tier: 'junior', topics: ['J2'],
    mcs: 3, essay: true, forms: [1, 2], mult: 1.1, needs: [], rep: 0 },
  { id: 'g.chatbot', client: 'stall holders', title: 'explain the new ai chatbot', tier: 'junior', topics: ['J4'],
    mcs: 3, essay: true, forms: [2, 3], mult: 1.1, needs: [], rep: 2 },
  { id: 'g.club', client: 'kids coding club', title: 'help run a coding class', tier: 'junior', topics: ['J3'],
    mcs: 4, essay: false, forms: [1, 3], mult: 1.1, needs: [], rep: 4 },
  { id: 'g.passwords', client: 'stanley residents', title: 'a talk on safe passwords', tier: 'junior', topics: ['J2'],
    mcs: 3, essay: true, forms: [2, 3], mult: 1.2, needs: ['x.junior'], rep: 6 },
  { id: 'g.stock', client: 'the store', title: 'build a stock spreadsheet', tier: 'dse', topics: ['A'],
    mcs: 4, essay: false, forms: [4, 5], mult: 1.1, needs: [], rep: 8 },
  { id: 'g.upgrade', client: 'chops stall', title: 'upgrade an old pc', tier: 'dse', topics: ['B'],
    mcs: 4, essay: true, forms: [4, 5], mult: 1.2, needs: ['x.support'], rep: 10 },
  { id: 'g.wifi', client: 'murray house', title: 'guest wi-fi for diners', tier: 'dse', topics: ['C'],
    mcs: 4, essay: true, forms: [4, 6], mult: 1.3, needs: ['x.support'], rep: 15 },
  { id: 'g.script', client: 'bus company', title: 'fix the timetable script', tier: 'dse', topics: ['D'],
    mcs: 4, essay: true, forms: [5, 6], mult: 1.3, needs: ['x.code'], rep: 15 },
  { id: 'g.privacy', client: 'bakery', title: 'write a privacy notice', tier: 'dse', topics: ['E'],
    mcs: 3, essay: true, forms: [4, 5], mult: 1.2, needs: ['x.data'], rep: 12 },
  { id: 'g.audit', client: 'stanley plaza office', title: 'a security check of the office', tier: 'dse', topics: ['C', 'E'],
    mcs: 5, essay: true, forms: [5, 6], mult: 1.5, needs: ['x.support', 'x.data'], rep: 25 },
];

/** the board changes every three real hours; each gig can be done once while it is up */
export const BOARD_EVERY = 3 * HOUR;
export const BOARD_SIZE = 5;
export const slotOf = (now: number): number => Math.floor(now / BOARD_EVERY);

/** what one right MC on this gig is worth on average */
export function gigRate(g: Gig): number {
  let sum = 0;
  for (let f = g.forms[0]; f <= g.forms[1]; f += 1) sum += FORM_RATE[f as Form];
  return (sum / (g.forms[1] - g.forms[0] + 1)) * g.mult;
}

/** the board for a three-hour slot: the same for everyone. Two starter gigs (no exam, no
 *  reputation needed) are always up, so a new player always has work */
export const starter = (g: Gig): boolean => !g.needs.length && g.rep === 0;
export function boardFor(slot: number): Gig[] {
  let s = (slot * 2654435761) >>> 0;
  const pick = (list: Gig[], n: number): Gig[] => {
    const pool = [...list];
    const out: Gig[] = [];
    while (out.length < n && pool.length) {
      s = (s * 1664525 + 1013904223) >>> 0;
      out.push(pool.splice(s % pool.length, 1)[0]);
    }
    return out;
  };
  return [...pick(GIGS.filter(starter), 2), ...pick(GIGS.filter((g) => !starter(g)), BOARD_SIZE - 2)];
}

/** an essay is worth twice a question of its form, by its share of the marks */
export const essayRate = (form: Form): number => FORM_RATE[form] * 2;

// ---------------------------------------------------------------- the law ---
export type Offence = {
  id: string;
  law: string;
  offence: string;
  act: string;
  fix: string;
  serious: boolean;
};

export const OFFENCES: Record<string, Offence> = {
  piracyUse: {
    id: 'piracyUse', serious: false,
    law: 'copyright ordinance (cap. 528) s.31a',
    offence: 'using an infringing copy of software in business',
    act: 'installed a cracked office suite to do paid work',
    fix: 'buy the licence, or use free software such as libreoffice',
  },
  piracySell: {
    id: 'piracySell', serious: true,
    law: 'copyright ordinance (cap. 528) s.118',
    offence: 'selling or distributing infringing copies',
    act: 'sold copied game discs for a man at the bus stop',
    fix: 'say no. selling copies is a serious offence, not a side job',
  },
  access: {
    id: 'access', serious: true,
    law: 'crimes ordinance (cap. 200) s.161',
    offence: 'access to a computer with dishonest intent',
    act: "logged into someone else's account with a guessed password",
    fix: 'never log into an account that is not yours, whoever asks',
  },
  phishing: {
    id: 'phishing', serious: true,
    law: 'crimes ordinance (cap. 200) s.161',
    offence: 'access to a computer with intent to deceive',
    act: "set up a fake wi-fi login page to collect people's passwords",
    fix: 'a page that collects passwords under false pretences is a crime',
  },
  dataLeak: {
    id: 'dataLeak', serious: true,
    law: 'personal data (privacy) ordinance (cap. 486) s.64',
    offence: 'disclosing personal data obtained without consent',
    act: "copied a cafe's customer list and sold it",
    fix: 'customer data is only used for the purpose it was given for',
  },
};

/** the first minor offence is a warning and a fine; a second offence, or any serious one, is prison */
export const WARNING_FINE = 300;
export const JAIL_MS = 30 * 60 * 1000;

// ------------------------------------------------------------- encounters ---
/**
 * Someone stops you in the street. A job is a short gig on the spot. A trap is a crime dressed up
 * as a favour: every one shows its warning signs, and walking away is always safe.
 */
export type Encounter = {
  id: string;
  who: string;
  line: string;
  accept: string;
  decline: string;
} & (
  | { kind: 'job'; title: string; topics: Topic[]; forms: [Form, Form]; mcs: number; mult: number }
  | { kind: 'trap'; offence: string; /** what gave it away, shown when you walk away */ signs: string }
);

export const ENCOUNTERS: Encounter[] = [
  { id: 'e.printer', kind: 'job', who: 'mrs wong, out of breath',
    line: 'my printer says offline and i have a flight in an hour. can you look? i will pay.',
    accept: 'have a look', decline: 'sorry, not now',
    title: 'an offline printer', topics: ['J1', 'B'], forms: [1, 4], mcs: 3, mult: 1.4 },
  { id: 'e.phone', kind: 'job', who: 'a tourist with a phone',
    line: 'the hotel wi-fi will not connect and my map is gone. please help?',
    accept: 'help them', decline: 'point them to the plaza',
    title: 'a phone with no wi-fi', topics: ['C', 'J1'], forms: [1, 5], mcs: 3, mult: 1.3 },
  { id: 'e.homework', kind: 'job', who: 'a form 2 student',
    line: 'my python homework keeps crashing. my mum says she will pay you to explain it.',
    accept: 'explain it', decline: 'not today',
    title: 'python homework', topics: ['J3', 'D'], forms: [2, 4], mcs: 3, mult: 1.2 },
  { id: 'e.ai', kind: 'job', who: 'the owner of the dried seafood shop',
    line: 'my nephew says an ai can write my shop signs. is it lying to me?',
    accept: 'explain ai to him', decline: 'walk on',
    title: 'ai for a shopkeeper', topics: ['J4'], forms: [1, 3], mcs: 3, mult: 1.2 },
  { id: 't.account', kind: 'trap', who: 'a man in a cap', offence: 'access',
    line: 'my ex changed her password but i know her birthday. log in and screenshot her messages. $600.',
    accept: 'take the $600', decline: 'walk away',
    signs: 'it is not his account, and nobody may log into an account without the owner saying yes.' },
  { id: 't.usb', kind: 'trap', who: 'a stall holder by the bus stop', offence: 'piracyUse',
    line: 'office suite, cracked, on a usb. $50 and you can do all the spreadsheet jobs. everyone does it.',
    accept: 'pay $50 and install it', decline: 'no thanks',
    signs: 'a cracked copy for paid work breaks copyright law. "everyone does it" is not a licence.' },
  { id: 't.discs', kind: 'trap', who: 'a man with a heavy bag', offence: 'piracySell',
    line: 'sell these game discs at school for me. copies, but nobody checks. you keep 30%.',
    accept: 'take the bag', decline: 'no',
    signs: 'he said it himself: copies. selling them is a serious copyright offence.' },
  { id: 't.wifi', kind: 'trap', who: 'someone with a laptop', offence: 'phishing',
    line: 'help me set up a free wi-fi page that asks for people\'s email passwords. just for fun.',
    accept: 'set it up', decline: 'refuse',
    signs: 'a page that collects passwords under a false name is phishing, fun or not.' },
  { id: 't.list', kind: 'trap', who: 'a sales rep in a suit', offence: 'dataLeak',
    line: 'you fix the cafe\'s laptop, right? copy their customer phone list for me. $800, cash.',
    accept: 'copy the list', decline: 'say no',
    signs: 'the customers gave their numbers to the cafe, not to him. selling them breaks the pdpo.' },
];

/** how long someone waits for an answer, and the gap before the next one stops you */
export const ENCOUNTER_WAIT = 90 * 1000;
export const ENCOUNTER_GAP: [number, number] = [4 * 60 * 1000, 8 * 60 * 1000];