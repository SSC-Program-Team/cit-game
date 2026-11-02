/**
 * What the browser and the school server say to each other over one WebSocket (api/ws), the coat
 * colour each player wears, and the rules for names and class numbers. See docs/design/one-street.md.
 */
import type { Ev, Save } from './rules.ts';

export type PublicSave = Omit<Save, 'quiz'> & { quiz: null };

/** a line of news: when (server ms) and what */
export type NewsItem = [number, string];
/** someone in Stanley Prison: class and number (5C01), the offence, release time */
export type Prisoner = [string, string, number];

export type ToServer =
  /** first message. token: the random id this browser keeps; name and cls: only when asked */
  | { t: 'hello'; token: string; name?: string; cls?: string }
  | { t: 'act'; id: number; name: string; args: Record<string, unknown> }
  /** where you are on the street, a few times a second while you move */
  | { t: 'pos'; x: number; y: number }
  /** the quiz in progress, to carry on after a reconnect */
  | { t: 'quiz?' }
  /** the news stand: everything from the past 12 hours */
  | { t: 'news?' };

export type ToClient =
  | { t: 'welcome'; id: string; name: string; cls: string; coat: string; save: PublicSave; now: number }
  /** first visit: a name and a class number; players from before class numbers: just the class */
  | { t: 'need-name'; why?: string; ask: Array<'name' | 'cls'> }
  | { t: 'res'; id: number; ok: boolean; err?: string; events: Ev[]; save: PublicSave; now: number }
  /** something happened without you asking: a work task, a firing, release from prison */
  | { t: 'push'; events: Ev[]; save: PublicSave; now: number }
  /** other players on the street: id, name, coat, x, y */
  | { t: 'others'; list: Array<[string, string, string, number, number]> }
  /** one new line of news, as it happens */
  | { t: 'wire'; at: number; text: string }
  /** the news stand's paper: the past 12 hours, newest first */
  | { t: 'news'; list: NewsItem[] }
  /** the richest on the server: name and wealth; you: your place (1-based) and wealth */
  | { t: 'board'; top: Array<[string, number]>; you: [number, number] }
  /** who is in Stanley Prison now */
  | { t: 'prison'; list: Prisoner[] }
  | { t: 'paused' };

/** how far back the news stand goes */
export const NEWS_HOURS = 12;

/** coats players wear, so you can tell each other apart in the street */
export const COATS = ['#e8463a', '#3a8ae8', '#f2c230', '#3ac46a', '#c05ae8', '#f28a3a', '#3ad0d0', '#e85a9a', '#9ad03a', '#ffffff', '#5a5ae8', '#d8a070'];
export function coatFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COATS[h % COATS.length];
}

/** a short list; teachers rename anything it misses. Some words are refused anywhere in a name,
 *  others only as a whole word, so that dickson and hancock still get in */
const RUDE_ANYWHERE = ['fuck', 'shit', 'cunt', 'bitch', 'slut', 'whore', 'nigg', 'porn', 'penis', 'vagina', 'pussy', 'wank'];
const RUDE_WORD = ['dick', 'cock', 'fag', 'sex', 'rape', 'diu', 'puk', 'gay', 'ass', 'tit', 'tits', 'chisin', 'hamgaachaan'];

/** 3-12 lowercase letters, digits and single spaces. Returns the cleaned name or an error */
export function checkName(raw: string): { name: string } | { err: string } {
  const name = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 12) return { err: 'a name is 3 to 12 letters or digits' };
  if (!/^[a-z0-9 ]+$/.test(name)) return { err: 'letters, digits and spaces only' };
  const flat = name.replace(/ /g, '');
  const words = [...name.split(' '), flat];
  if (RUDE_ANYWHERE.some((w) => flat.includes(w)) || RUDE_WORD.some((w) => words.includes(w))) return { err: 'pick another name' };
  return { name };
}

/** class and class number, as the prison shows them: form 1-6, a class letter, two digits (5C01) */
export function checkClass(raw: string): { cls: string } | { err: string } {
  const m = raw.toUpperCase().replace(/[\s-]/g, '').match(/^([1-6])([A-Z])(\d{1,2})$/);
  if (!m || Number(m[3]) < 1) return { err: 'class and number look like 5C01' };
  return { cls: `${m[1]}${m[2]}${m[3].padStart(2, '0')}` };
}
