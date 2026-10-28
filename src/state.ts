export type Jail = { until: number; act: string; law: string; offence: string; fix: string };

export type Save = {
  v: 1;
  money: number;
  energy: number;
  day: number;
  minutes: number;
  x: number;
  y: number;
  done: string[];
  mastery: Record<string, number>;
  /** per client: missed callouts cost trust */
  rep: Record<string, number>;
  /** wall-clock release time, so closing the tab does not shorten the sentence */
  jail: Jail | null;
  /** an open callout on the street and its seconds left */
  mission: { id: string; left: number } | null;
};

const KEY = 'citgame.save.v1';

export const state: Save = {
  v: 1,
  money: 1280,
  energy: 3,
  day: 3,
  minutes: 18 * 60 + 40,
  x: 196,
  y: 118,
  done: [],
  mastery: {},
  rep: {},
  jail: null,
  mission: null,
};

export function load(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed.v !== 1) return;
    Object.assign(state, parsed);
  } catch {
    /* a corrupt save must never block play */
  }
}

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota: play continues without persistence */
  }
}

export function addMoney(n: number): void {
  state.money = Math.max(0, state.money + n);
  save();
}

export function addMinutes(n: number): void {
  state.minutes += n;
  while (state.minutes >= 24 * 60) {
    state.minutes -= 24 * 60;
    state.day += 1;
  }
  save();
}

export function addMastery(topic: string, delta: number): void {
  state.mastery[topic] = Math.max(0, Math.min(100, (state.mastery[topic] ?? 0) + delta));
  save();
}

export function clock(): string {
  const h = Math.floor(state.minutes / 60);
  const m = state.minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
