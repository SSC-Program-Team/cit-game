/**
 * What the browser and the school server say to each other over one WebSocket (api/ws), the coat
 * colour each player wears, and the name rule. See docs/design/stanley-expansion.md §10.
 */
import type { Ev, Save } from './rules.ts';

export type PublicSave = Omit<Save, 'quiz'> & { quiz: null };

export type ToServer =
  /** first message. token: the random id this browser keeps; name: only when asked for one */
  | { t: 'hello'; token: string; name?: string }
  | { t: 'act'; id: number; name: string; args: Record<string, unknown> }
  /** where you are, in world pixels, a few times a second while you move */
  | { t: 'pos'; x: number; y: number }
  /** the quiz in progress, to carry on after a reconnect */
  | { t: 'quiz?' };

export type ToClient =
  | { t: 'welcome'; id: string; name: string; coat: string; save: PublicSave; now: number }
  | { t: 'need-name'; why?: string }
  | { t: 'res'; id: number; ok: boolean; err?: string; events: Ev[]; save: PublicSave; now: number }
  /** something happened without you asking: a work task, a firing, release from prison */
  | { t: 'push'; events: Ev[]; save: PublicSave; now: number }
  /** other players near you: id, name, coat, x, y */
  | { t: 'others'; list: Array<[string, string, string, number, number]> }
  | { t: 'wire'; text: string }
  /** the richest on the server: name and net worth; you: your place (1-based) and worth */
  | { t: 'board'; top: Array<[string, number]>; you: [number, number] }
  | { t: 'paused' };

/** coats players wear, so you can tell each other apart in the street */
export const COATS = ['#e8463a', '#3a8ae8', '#f2c230', '#3ac46a', '#c05ae8', '#f28a3a', '#3ad0d0', '#e85a9a', '#9ad03a', '#ffffff', '#5a5ae8', '#d8a070'];
export function coatFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COATS[h % COATS.length];
}

/** a short list; teachers rename anything it misses (§10). Some words are refused anywhere in a
 *  name, others only as a whole word, so that dickson and hancock still get in */
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

/** how far other players are sent, in world pixels (16 per metre): about 100 m */
export const NEAR = 100 * 16;
