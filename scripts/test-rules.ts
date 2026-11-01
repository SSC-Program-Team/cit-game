/**
 * Checks the rules on a fresh save: gigs pay and wear gear, work tasks arrive in real time and get
 * you fired, rent comes out each day, licences run out, piracy is warned then jailed.
 *   node --experimental-strip-types --no-warnings scripts/test-rules.ts
 */
import { act, fresh, netWorth, quizView, type Save } from '../src/rules.ts';
import { QUESTIONS } from '../src/questions.ts';
import { boardFor, HOUR, DAY } from '../src/economy.ts';

let fails = 0;
const ok = (cond: unknown, what: string): void => { if (!cond) { fails += 1; console.log('FAIL', what); } else console.log('ok  ', what); };
let now = Date.UTC(2026, 10, 1, 9);
const s: Save = fresh();
const A = (name: string, args: Record<string, unknown> = {}) => act(s, name, args, now);

/** answer the held quiz: all right (or all wrong) */
function answerAll(right: boolean) {
  const z = s.quiz!;
  let last;
  for (let i = 0; i < z.qs.length; i += 1) {
    const h = z.qs[i];
    const q = QUESTIONS.find((x) => x.id === h.id)!;
    const correct = h.order.indexOf(q.answer);
    last = A('quiz.answer', { q: i, i: right ? correct : (correct + 1) % 4 });
  }
  return last!;
}

// a gig with no gear needs
const g = boardFor(s.day).find((x) => !x.needs.length)!;
ok(g, 'a gig with no needs on day 1');
let r = A('quiz.start', { kind: 'gig', id: g.id });
ok(r.ok && s.quiz && r.events.some((e) => e.t === 'quiz'), 'gig quiz starts');
ok(!JSON.stringify(quizView(s.quiz!)).includes('"answer"'), 'the quiz view carries no answers');
const before = s.money;
r = answerAll(true);
ok(r.events.some((e) => e.t === 'summary'), 'summary after the last answer');
ok(s.money > before, `gig paid ${s.money - before}`);
ok(!A('quiz.answer', { q: 0, i: 0 }).ok, 'cannot answer after the end');
A('quiz.end');
ok(!A('quiz.start', { kind: 'gig', id: g.id }).ok, 'same gig twice in a day refused');

// buying gear moves money into gear: net worth unchanged
const nw = netWorth(s);
r = A('buy', { id: 'tester' });
ok(r.ok && netWorth(s) === nw, 'buying a tester keeps net worth');
ok(!A('buy', { id: 'laptop3' }).ok, 'cannot afford the workstation');

// rent on a new day
const m0 = s.money;
A('sleep');
ok(s.day === 2 && Math.abs(m0 - s.money - 162) < 0.01, `sleep: day 2, paid fare + rent (${m0 - s.money})`);

// work: hire, tasks in real time, warning, firing
r = A('work.apply', { id: 'cafe' });
ok(r.ok && s.work?.tasks.length === 1, 'hired at the cafe with one task');
now += 6 * HOUR; A('tick');
ok(s.work?.tasks.length === 2, 'a second task after 5 hours');
r = A('quiz.start', { kind: 'work' }); answerAll(false); A('quiz.end');
ok(s.work?.tasks.length === 1 && s.work.done === 1, 'a task done, wage paid whatever the score');
now += 3 * DAY; r = A('tick');
ok(s.work?.warned, 'warned at half the limit');
now += 3 * DAY; r = A('tick');
ok(!s.work && s.fired.cafe > now, 'fired after 5 days (relaxed boss)');
ok(!A('work.apply', { id: 'cafe' }).ok, 'cannot reapply for a week');

// licences run out after 30 days
s.money += 2000;
A('buy', { id: 'office' });
ok(s.lic.office === s.day + 30, 'licence for 30 days');
ok(!A('renew', { id: 'office' }).ok, 'renewal not open yet');
for (let i = 0; i < 24; i += 1) A('sleep');
s.money += 1000;
ok(A('renew', { id: 'office' }).ok, 'renewal open in the last 7 days');

// piracy: warning first, then prison
const p: Save = fresh();
p.money = 5000;
act(p, 'buy', { id: 'p.office' }, now);
const gig = [...Array(40).keys()].map((d) => boardFor(d + 1).find((x) => x.needs.length === 1 && x.needs[0] === 'office')).find(Boolean)!;
p.day = [...Array(40).keys()].find((d) => boardFor(d + 1).some((x) => x.id === gig.id))! + 1;
r = act(p, 'quiz.start', { kind: 'gig', id: gig.id }, now);
ok(r.ok && p.quiz?.pirated, 'gig with a pirated licence is flagged');
for (let i = 0; i < p.quiz!.qs.length; i += 1) act(p, 'quiz.answer', { q: i, i: 0 }, now);
r = act(p, 'quiz.end', {}, now);
ok(r.events.some((e) => e.t === 'warning') && !p.inv.includes('p.office') && p.record.length === 1, 'first offence: warning, fine, confiscation');
r = act(p, 'crime', { id: 'piracySell' }, now);
ok(p.jail && r.events.some((e) => e.t === 'arrest'), 'selling discs: prison');
ok(!act(p, 'buy', { id: 'tester' }, now).ok, 'nothing to do in prison');
now += 31 * 60 * 1000;
r = act(p, 'tick', {}, now);
ok(!p.jail && r.events.some((e) => e.t === 'released'), 'released after 30 real minutes');

// homes: the first is where you live (fees, not rent); others are let by the real hour
{
  const { HOMES } = await import('../src/homes.ts');
  const h: Save = fresh();
  h.money = 100000;
  const [a, b] = HOMES.filter((x) => x.price < 30000);
  ok(!act(h, 'home.buy', { id: a.id }, now, { homeTaken: (id) => id === a.id }).ok, 'cannot buy a home someone else owns');
  const nw = netWorth(h);
  ok(act(h, 'home.buy', { id: a.id }, now).ok && h.residence === a.id, 'first home is where you live');
  ok(netWorth(h) === nw, 'buying a home keeps net worth');
  ok(!act(h, 'sleep', { at: 'home' }, now).ok, 'cannot sleep at home from across town');
  h.x = a.tx * 16; h.y = a.ty * 16;
  const m1 = h.money;
  ok(act(h, 'sleep', { at: 'home' }, now).ok && m1 - h.money === Math.max(1, Math.round(a.price * 0.0003)), 'sleep at home: fees, no rent, no fare');
  act(h, 'home.buy', { id: b.id }, now);
  const m2 = h.money;
  act(h, 'tick', {}, now + 24 * HOUR);
  ok(Math.abs(h.money - m2 - b.price * 0.003) < 1, `a real day of tenants on the second home (${(h.money - m2).toFixed(1)})`);
  act(h, 'sleep', {}, now + 24 * HOUR); act(h, 'sleep', {}, now + 24 * HOUR);
  ok(Math.abs(h.money - m2 - b.price * 0.003) < 200, 'sleeping does not farm tenants');
  const m3 = h.money;
  ok(act(h, 'home.sell', { id: b.id }, now + 24 * HOUR).ok && h.money - m3 === Math.round(b.price * 0.9), 'selling returns 90%');
  // cars
  ok(act(h, 'car.buy', { model: 'hatch' }, now).ok && h.car?.value === 12000, 'bought a hatchback');
  act(h, 'sleep', {}, now + 24 * HOUR);
  ok(h.car?.value === 11880, 'a car loses 1% a day');
  const m4 = h.money;
  ok(act(h, 'car.buy', { model: 'saloon' }, now + 24 * HOUR).ok && Math.round(m4 - h.money) === 38000 - Math.round(11880 * 0.8), 'part exchange at 80%');
}

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
