/**
 * Build-time check for src/jobs.ts: every string must render in the bitmap font and fit
 * its slot, and every question must have exactly one right answer.
 *
 *   node --experimental-strip-types scripts/check-jobs.ts
 */
import { JOBS, MISSIONS, OFFER, CHARSET, type JobDef } from '../src/jobs.ts';
import { QUESTIONS, TOPIC_TIER, tierOf, type Form, type Topic } from '../src/questions.ts';
import { GIGS, COURSES, EMPLOYERS, ITEMS, OFFENCES, COURSE_QUESTIONS, TASK_QUESTIONS } from '../src/economy.ts';
import { FONT_CHARS } from '../src/font.ts';
import { PLACES, solidTile } from '../src/world.ts';

const errors: string[] = [];

function fits(where: string, s: string, max: number): void {
  for (const ch of s.toUpperCase()) {
    if (!CHARSET.includes(ch)) errors.push(`${where}: '${ch}' is not in the font: ${s}`);
  }
  if (s.length > max) errors.push(`${where}: ${s.length} > ${max} chars: ${s}`);
}

function checkJob(j: JobDef): void {
  const at = j.id;
  fits(`${at} ticket`, j.ticket, 30);
  fits(`${at} client`, j.client, 30);
  fits(`${at} place`, j.place, 30);
  fits(`${at} symptom`, j.symptom, 30);
  fits(`${at} paid`, j.paid, 66);
  fits(`${at} wire`, j.wire, 90);
  if (j.console.length > 10) errors.push(`${at}: ${j.console.length} console lines > 10`);
  j.console.forEach((l, i) => fits(`${at} console[${i}]`, l, 52));
  j.note?.forEach((l, i) => fits(`${at} note[${i}]`, l, 19));
  if (j.note && j.note.length > 3) errors.push(`${at}: note has more than 3 lines`);
  if (j.pay <= 0) errors.push(`${at}: pay must be positive`);
  j.stages.forEach((st, si) => {
    const where = `${at} stage ${si + 1}`;
    fits(`${where} prompt`, st.prompt, 36);
    if (st.right) fits(`${where} right`, st.right, 36);
    if (st.choices.length < 2 || st.choices.length > 3) errors.push(`${where}: needs 2-3 choices`);
    const oks = st.choices.filter((c) => c.ok).length;
    if (oks !== 1) errors.push(`${where}: ${oks} right answers, needs exactly 1`);
    st.choices.forEach((c, ci) => {
      fits(`${where} choice ${ci + 1}`, c.label, 46);
      if (c.hint) fits(`${where} choice ${ci + 1} hint`, c.hint, 36);
      if (!c.ok && !c.hint && !c.crime) errors.push(`${where} choice ${ci + 1}: wrong answer with no hint`);
      if (c.ok && c.crime) errors.push(`${where} choice ${ci + 1}: right answer cannot be a crime`);
      if (c.crime) for (const [k, v] of Object.entries(c.crime)) fits(`${where} crime ${k}`, v, 56);
    });
  });
}

const ids = new Set<string>();
for (const j of [...JOBS, ...MISSIONS]) {
  if (ids.has(j.id)) errors.push(`duplicate job id ${j.id}`);
  ids.add(j.id);
  checkJob(j);
}
fits('offer who', OFFER.who, 40);
fits('offer line', OFFER.line, 96);
fits('offer take', OFFER.take, 46);
fits('offer walk', OFFER.walk, 46);
for (const [k, v] of Object.entries(OFFER.crime)) fits(`offer crime ${k}`, v, 56);

// ---- the MC bank: mixed-case prose, so the full font applies
function prose(where: string, s: string, max: number): void {
  for (const ch of s) if (ch !== '\n' && !FONT_CHARS.includes(ch)) errors.push(`${where}: '${ch}' is not in the font: ${s}`);
  if (s.length > max) errors.push(`${where}: ${s.length} > ${max} chars`);
}
const qids = new Set<string>();
for (const q of QUESTIONS) {
  const at = `question ${q.id}`;
  if (qids.has(q.id)) errors.push(`duplicate question id ${q.id}`);
  qids.add(q.id);
  if (TOPIC_TIER[q.topic] !== q.tier) errors.push(`${at}: topic ${q.topic} is not ${q.tier}`);
  if (!(q.form >= 1 && q.form <= 6) || tierOf(q.form) !== q.tier) errors.push(`${at}: form ${q.form} does not match ${q.tier}`);
  prose(`${at} q`, q.q, 360);
  if (q.q.split('\n').length > 7) errors.push(`${at}: more than 7 lines`);
  prose(`${at} why`, q.why, 300);
  if (q.options.length !== 4) errors.push(`${at}: needs 4 options`);
  if (new Set(q.options).size !== q.options.length) errors.push(`${at}: options repeat`);
  if (!(q.answer >= 0 && q.answer < 4)) errors.push(`${at}: answer out of range`);
  q.options.forEach((o, i) => prose(`${at} option ${i + 1}`, o, 84));
}
const count = (topics: Topic[], forms: [Form, Form] = [1, 6]): number =>
  QUESTIONS.filter((q) => topics.includes(q.topic) && q.form >= forms[0] && q.form <= forms[1]).length;
for (const g of GIGS) {
  if (count(g.topics, g.forms) < g.questions) errors.push(`gig ${g.id}: only ${count(g.topics, g.forms)} questions for ${g.questions}`);
  if (tierOf(g.forms[0]) !== g.tier || tierOf(g.forms[1]) !== g.tier) errors.push(`gig ${g.id}: forms do not match ${g.tier}`);
  for (const t of g.topics) if (TOPIC_TIER[t] !== g.tier) errors.push(`gig ${g.id}: topic ${t} is not ${g.tier}`);
  for (const n of g.needs) if (!ITEMS.some((i) => i.provides === n)) errors.push(`gig ${g.id}: nothing provides ${n}`);
}
for (const c of COURSES) if (count(c.topics, c.forms) < COURSE_QUESTIONS) errors.push(`course ${c.id}: too few questions`);
for (const e of EMPLOYERS) {
  if (count(e.topics, e.forms) < TASK_QUESTIONS) errors.push(`employer ${e.id}: too few questions`);
  if (!PLACES.some((p) => p.id === e.place)) errors.push(`employer ${e.id}: no place ${e.place}`);
  for (const n of e.needs) if (!COURSES.some((c) => c.id === n)) errors.push(`employer ${e.id}: unknown course ${n}`);
}
for (const o of Object.values(OFFENCES)) for (const k of ['law', 'offence', 'act', 'fix'] as const) fits(`offence ${o.id} ${k}`, o[k], 64);
for (const p of PLACES) if (solidTile(p.tx, p.ty)) errors.push(`place ${p.id}: its tile ${p.tx},${p.ty} is solid`);
for (const j of [...JOBS, ...MISSIONS]) if (!PLACES.some((p) => p.id === j.spot)) errors.push(`job ${j.id}: no place ${j.spot}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`content ok: ${JOBS.length} jobs, ${MISSIONS.length} missions, ${QUESTIONS.length} questions (${QUESTIONS.filter((q) => q.tier === 'junior').length} junior), ${GIGS.length} gigs`);
