/**
 * Everything you can buy, every place that hires you, every gig on the board, and the
 * offences that send you to the police. All of it is data; main.ts runs it.
 * See docs/design/stanley-expansion.md §4-6.
 */
import { FORM_RATE, type Form, type Tier, type Topic } from './questions.ts';

// ------------------------------------------------------------------ items ---
export type ItemKind = 'laptop' | 'tool' | 'licence' | 'pirated';

export type Item = {
  id: string;
  name: string;
  kind: ItemKind;
  price: number;
  /** what this item counts as when a gig lists its needs (a pirated copy counts as the real one) */
  provides: string;
  /** laptops: multiplier on gig pay */
  payBoost?: number;
  blurb: string;
};

export const ITEMS: Item[] = [
  { id: 'laptop1', name: 'used laptop', kind: 'laptop', price: 0, provides: 'laptop1', payBoost: 1,
    blurb: 'second-hand, sticky keys. you own it already.' },
  { id: 'laptop2', name: 'mid-range laptop', kind: 'laptop', price: 3800, provides: 'laptop2', payBoost: 1.1,
    blurb: 'runs the bigger jobs. gigs pay 10% more.' },
  { id: 'laptop3', name: 'workstation laptop', kind: 'laptop', price: 9800, provides: 'laptop3', payBoost: 1.2,
    blurb: 'fast enough for anything. gigs pay 20% more.' },
  { id: 'tester', name: 'cable tester', kind: 'tool', price: 380, provides: 'tester',
    blurb: 'checks every wire in a network cable. needed for cabling gigs.' },
  { id: 'camera', name: 'camera', kind: 'tool', price: 2400, provides: 'camera',
    blurb: 'for product photos and site surveys.' },
  { id: 'labeler', name: 'label printer', kind: 'tool', price: 650, provides: 'labeler',
    blurb: 'labels for cables, ports and shelves.' },
  { id: 'office', name: 'office suite licence', kind: 'licence', price: 790, provides: 'office',
    blurb: 'word processor and spreadsheet. a real licence key.' },
  { id: 'photo', name: 'photo editor licence', kind: 'licence', price: 1200, provides: 'photo',
    blurb: 'edit photos and make posters. a real licence key.' },
  { id: 'accounts', name: 'accounting software licence', kind: 'licence', price: 1600, provides: 'accounts',
    blurb: 'books and invoices for small businesses.' },
  { id: 'p.office', name: 'pirated office suite', kind: 'pirated', price: 120, provides: 'office',
    blurb: 'a burned disc and a key on a scrap of paper.' },
  { id: 'p.photo', name: 'pirated photo editor', kind: 'pirated', price: 180, provides: 'photo',
    blurb: 'a crack from a forum. it mostly works.' },
  { id: 'p.accounts', name: 'pirated accounting software', kind: 'pirated', price: 240, provides: 'accounts',
    blurb: 'the activation screen has a typo in it.' },
];

export const item = (id: string): Item | undefined => ITEMS.find((i) => i.id === id);

/** what Pixel Fix sells */
export const SHOP_STOCK = ['laptop2', 'laptop3', 'tester', 'camera', 'labeler', 'office', 'photo', 'accounts'];
/** what the man at the phone stall sells */
export const PIRATE_STOCK = ['p.office', 'p.photo', 'p.accounts'];

/** the friendly name of a need, for the board */
export const NEED_NAMES: Record<string, string> = {
  laptop2: 'mid-range laptop', laptop3: 'workstation', tester: 'cable tester', camera: 'camera',
  labeler: 'label printer', office: 'office suite', photo: 'photo editor', accounts: 'accounting software',
};

// ---------------------------------------------------------------- courses ---
export type Course = {
  id: string;
  name: string;
  price: number;
  tier: Tier;
  topics: Topic[];
  forms: [Form, Form];
  blurb: string;
};

export const COURSES: Course[] = [
  { id: 'c.junior', name: 'junior digital skills', price: 300, tier: 'junior', topics: ['J1', 'J2', 'J4'], forms: [1, 3],
    blurb: 'basics, staying safe online, and ai.' },
  { id: 'c.support', name: 'it support certificate', price: 900, tier: 'dse', topics: ['B', 'C'], forms: [4, 6],
    blurb: 'hardware, operating systems, networks. tide restaurant asks for it.' },
  { id: 'c.code', name: 'python programming', price: 1200, tier: 'dse', topics: ['D'], forms: [4, 6],
    blurb: 'algorithms, tracing and testing.' },
];

export const COURSE_QUESTIONS = 5;
export const COURSE_PASS = 4;

// -------------------------------------------------------------- employers ---
export type Employer = {
  id: string;
  /** place id where you apply and do tasks */
  place: string;
  name: string;
  boss: string;
  tier: Tier;
  topics: Topic[];
  forms: [Form, Form];
  /** paid for every completed work task, whatever the score; easier work pays less */
  wage: number;
  /** strict bosses fire at 3 days, relaxed at 5 */
  strict: boolean;
  needs: string[];
  /** refuses anyone with an offence in the last N in-game days */
  cleanDays: number;
  pitch: string;
};

export const EMPLOYERS: Employer[] = [
  { id: 'cafe', place: 'cafe', name: 'bayview cafe', boss: 'miss ho', tier: 'junior', topics: ['J1', 'J2', 'J4'], forms: [1, 3],
    wage: 280, strict: false, needs: [], cleanDays: 0,
    pitch: 'help with the till, the wi-fi and our social media. relaxed hours.' },
  { id: 'tide', place: 'murray', name: 'tide restaurant', boss: 'mr cheung', tier: 'dse', topics: ['A', 'B', 'C', 'E'], forms: [4, 6],
    wage: 420, strict: true, needs: ['c.support'], cleanDays: 14,
    pitch: 'run it for the restaurant: bookings, network, data. i check everything.' },
];

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** a work task lands every five real hours, even while the game is closed */
export const TASK_EVERY = 5 * HOUR;
export const TASK_CAP = 4;
export const TASK_QUESTIONS = 3;
export const REHIRE_WAIT = 7 * DAY;
export const fireAfter = (e: Employer): number => (e.strict ? 3 : 5) * DAY;

// ------------------------------------------------------------------- gigs ---
export type Gig = {
  id: string;
  client: string;
  /** shown on the board: where the work is */
  place: string;
  title: string;
  tier: Tier;
  topics: Topic[];
  questions: number;
  /** which forms' questions this gig draws: easier gigs draw lower forms and pay less */
  forms: [Form, Form];
  /** on top of each right answer's form rate: gear-heavy gigs pay more */
  mult: number;
  needs: string[];
  minutes: number;
};

export const GIGS: Gig[] = [
  { id: 'g.menu', client: 'chan tai', place: 'tea shop', title: 'type up the new menu',
    tier: 'junior', topics: ['J1'], questions: 4, forms: [1, 2], mult: 1.3, needs: ['office'], minutes: 60 },
  { id: 'g.poster', client: 't-shirt stall', place: 'stanley market', title: 'design a sale poster',
    tier: 'junior', topics: ['J2'], questions: 4, forms: [1, 2], mult: 1.4, needs: ['photo'], minutes: 90 },
  { id: 'g.chatbot', client: 'stall holders', place: 'stanley market', title: 'explain the new ai chatbot',
    tier: 'junior', topics: ['J4'], questions: 4, forms: [2, 3], mult: 1.2, needs: [], minutes: 60 },
  { id: 'g.club', client: 'kids coding club', place: 'stanley library', title: 'help run a coding class',
    tier: 'junior', topics: ['J3'], questions: 4, forms: [1, 3], mult: 1.2, needs: [], minutes: 90 },
  { id: 'g.photos', client: 'silk stall', place: 'stanley market', title: 'product photos for a web shop',
    tier: 'junior', topics: ['J1', 'J2'], questions: 5, forms: [1, 2], mult: 1.7, needs: ['camera', 'photo'], minutes: 120 },
  { id: 'g.stock', client: 'the store', place: 'stanley main st', title: 'build a stock spreadsheet',
    tier: 'dse', topics: ['A'], questions: 4, forms: [4, 5], mult: 1.2, needs: ['office'], minutes: 90 },
  { id: 'g.books', client: 'bakery', place: 'stanley main st', title: 'monthly accounts and invoices',
    tier: 'dse', topics: ['A', 'E'], questions: 5, forms: [4, 5], mult: 1.3, needs: ['accounts'], minutes: 120 },
  { id: 'g.cable', client: 'plaza office', place: 'stanley plaza', title: 'cable a new office',
    tier: 'dse', topics: ['C'], questions: 5, forms: [4, 6], mult: 1.4, needs: ['tester', 'labeler'], minutes: 150 },
  { id: 'g.upgrade', client: 'chops stall', place: 'stanley market', title: 'upgrade an old pc',
    tier: 'dse', topics: ['B'], questions: 4, forms: [4, 5], mult: 1.25, needs: ['laptop2'], minutes: 90 },
  { id: 'g.privacy', client: 'tide restaurant', place: 'murray house', title: 'write a privacy notice',
    tier: 'dse', topics: ['E'], questions: 4, forms: [4, 5], mult: 1.1, needs: [], minutes: 60 },
  { id: 'g.script', client: 'bus company', place: 'bus terminus', title: 'fix the timetable script',
    tier: 'dse', topics: ['D'], questions: 5, forms: [5, 6], mult: 1.3, needs: ['laptop2'], minutes: 120 },
  { id: 'g.wifi', client: 'murray house', place: 'murray house', title: 'guest wi-fi for diners',
    tier: 'dse', topics: ['C', 'E'], questions: 5, forms: [4, 6], mult: 1.4, needs: ['tester', 'laptop2'], minutes: 150 },
];

export const BOARD_SIZE = 4;

/** what one right answer on this gig is worth on average, before the laptop boost */
export function gigRate(g: Gig): number {
  let sum = 0;
  for (let f = g.forms[0]; f <= g.forms[1]; f += 1) sum += FORM_RATE[f as Form];
  return (sum / (g.forms[1] - g.forms[0] + 1)) * g.mult;
}

/** the board for an in-game day: deterministic, half junior and half DSE */
export function boardFor(day: number): Gig[] {
  const pick = (list: Gig[], n: number, salt: number): Gig[] => {
    const out: Gig[] = [];
    const pool = [...list];
    let s = (day * 2654435761 + salt) >>> 0;
    while (out.length < n && pool.length) {
      s = (s * 1664525 + 1013904223) >>> 0;
      out.push(pool.splice(s % pool.length, 1)[0]);
    }
    return out;
  };
  return [
    ...pick(GIGS.filter((g) => g.tier === 'junior'), BOARD_SIZE / 2, 1),
    ...pick(GIGS.filter((g) => g.tier === 'dse'), BOARD_SIZE / 2, 2),
  ];
}

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
    act: 'did paid work with pirated software. the client checked the key.',
    fix: 'buy the licence, or take gigs that do not need it',
  },
  piracySell: {
    id: 'piracySell', serious: true,
    law: 'copyright ordinance (cap. 528) s.118',
    offence: 'selling or distributing infringing copies',
    act: 'sold pirated discs for the man at the phone stall',
    fix: 'say no. selling copies is a serious offence, not a side job',
  },
  dataLeak: {
    id: 'dataLeak', serious: true,
    law: 'personal data (privacy) ordinance (cap. 486) s.64',
    offence: 'disclosing personal data obtained without consent',
    act: "copied the stall holders' customer list and sold it",
    fix: 'customer data is only used for the purpose it was given for',
  },
};

export const WARNING_FINE = 500;
