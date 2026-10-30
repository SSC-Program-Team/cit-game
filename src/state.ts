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

export type Save = {
  v: 2;
  money: number;
  energy: number;
  day: number;
  minutes: number;
  /** world position in pixels */
  x: number;
  y: number;
  done: string[];
  mastery: Record<string, number>;
  /** per client or employer: trust */
  rep: Record<string, number>;
  /** wall-clock release time, so closing the tab does not shorten the sentence */
  jail: Jail | null;
  /** an open callout on the street and its seconds left */
  mission: { id: string; left: number } | null;
  /** item ids you own */
  inv: string[];
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
};

const KEY = 'citgame.save.v1';

const fresh = (): Save => ({
  v: 2,
  money: 1280,
  energy: 5,
  day: 1,
  minutes: 9 * 60,
  x: -1,
  y: -1,
  done: [],
  mastery: {},
  rep: {},
  jail: null,
  mission: null,
  inv: ['laptop1'],
  certs: [],
  work: null,
  fired: {},
  gigs: [],
  record: [],
  seen: [],
  answered: 0,
  right: 0,
});

export const state: Save = fresh();

export function load(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Omit<Partial<Save>, 'v'> & { v?: number };
    if (parsed.v === 1) {
      // v1 was one street drawn side-on: keep money, progress and any sentence, but not the position
      Object.assign(state, fresh(), {
        money: parsed.money ?? 1280, done: parsed.done ?? [], mastery: parsed.mastery ?? {},
        rep: parsed.rep ?? {}, jail: parsed.jail ?? null, day: parsed.day ?? 1,
      });
      return;
    }
    if (parsed.v !== 2) return;
    Object.assign(state, fresh(), parsed, { v: 2 });
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

export function reset(): void {
  Object.assign(state, fresh());
  save();
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
