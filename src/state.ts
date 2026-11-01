/**
 * The browser's copy of your save. Online, the school server owns the real one and sends it back
 * after every action (net.ts); editing this copy changes nothing there. Solo, this is the save,
 * kept in localStorage and not on the leaderboard.
 */
import { fresh, migrate, type Save } from './rules.ts';

export type { Save };

export const state: Save = fresh();

/** the v0.5 key, so a solo save from before the server carries on */
const KEY = 'citgame.save.v1';

export function loadSolo(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(state, migrate(JSON.parse(raw)));
  } catch {
    /* a corrupt save must never block play */
  }
}

export function saveSolo(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota: play continues without persistence */
  }
}

export function resetSolo(): void {
  Object.assign(state, fresh());
  saveSolo();
}

/** take the server's copy */
export function adopt(s: Partial<Save>): void {
  Object.assign(state, s);
}

export function clock(): string {
  const h = Math.floor(state.minutes / 60);
  const m = state.minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
