/**
 * Build-time content check: every string must render in the pixel font and fit its slot, every MC
 * has exactly one right answer, every essay can be marked, and every gig, company and exam has
 * enough questions to draw from.
 *
 *   node --experimental-strip-types --no-warnings scripts/check-content.ts
 */
import { QUESTIONS, TOPIC_TIER, TOPIC_NAMES, tierOf, type Form, type Topic } from '../src/questions.ts';
import { ESSAYS } from '../src/essays.ts';
import { NOTES } from '../src/notes.ts';
import { keywordMark } from '../src/marking.ts';
import { GIGS, EXAMS, EMPLOYERS, OFFENCES, ENCOUNTERS, TASK_QUESTIONS, INTERVIEW_QUESTIONS } from '../src/economy.ts';
import { FONT_CHARS } from '../src/font.ts';

const errors: string[] = [];

function prose(where: string, s: string, max: number): void {
  for (const ch of s) if (ch !== '\n' && !FONT_CHARS.includes(ch)) errors.push(`${where}: '${ch}' is not in the font: ${s}`);
  if (s.length > max) errors.push(`${where}: ${s.length} > ${max} chars`);
}

// ---- the MC bank
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

// ---- essays
for (const e of ESSAYS) {
  const at = `essay ${e.id}`;
  if (qids.has(e.id)) errors.push(`duplicate id ${e.id}`);
  qids.add(e.id);
  if (TOPIC_TIER[e.topic] !== e.tier || tierOf(e.form) !== e.tier) errors.push(`${at}: form/topic do not match ${e.tier}`);
  prose(`${at} q`, e.q, 300);
  prose(`${at} model`, e.model, 360);
  if (e.points.length < 2 || e.points.length > 4) errors.push(`${at}: needs 2-4 marking points`);
  e.points.forEach((p, i) => {
    prose(`${at} point ${i + 1}`, p.point, 120);
    if (!p.keys.length) errors.push(`${at} point ${i + 1}: no keys`);
    for (const k of p.keys) if (k !== k.toLowerCase()) errors.push(`${at} point ${i + 1}: key "${k}" must be lowercase`);
  });
  if (keywordMark(e, e.model).score !== e.points.length) errors.push(`${at}: the model answer does not hit every point's keys`);
}

// ---- notes
for (const n of NOTES) {
  if (!TOPIC_NAMES[n.topic]) errors.push(`note ${n.id}: no topic ${n.topic}`);
  prose(`note ${n.id} title`, n.title, 60);
  prose(`note ${n.id} body`, n.body, 3000);
}

// ---- enough to draw from
const count = (topics: Topic[], forms: [Form, Form] = [1, 6]): number =>
  QUESTIONS.filter((q) => topics.includes(q.topic) && q.form >= forms[0] && q.form <= forms[1]).length;
const essays = (topics: Topic[]): number => ESSAYS.filter((e) => topics.includes(e.topic)).length;
const examIds = new Set(EXAMS.map((x) => x.id));
for (const g of GIGS) {
  if (count(g.topics, g.forms) < g.mcs) errors.push(`gig ${g.id}: only ${count(g.topics, g.forms)} questions for ${g.mcs}`);
  if (g.essay && !essays(g.topics)) errors.push(`gig ${g.id}: no essay for its topics`);
  for (const n of g.needs) if (!examIds.has(n)) errors.push(`gig ${g.id}: unknown exam ${n}`);
  prose(`gig ${g.id} title`, g.title, 46);
}
for (const x of EXAMS) {
  if (count(x.topics, x.forms) < x.mcs) errors.push(`exam ${x.id}: too few questions`);
  if (!essays(x.topics)) errors.push(`exam ${x.id}: no essay for its topics`);
}
for (const e of EMPLOYERS) {
  if (count(e.topics, e.forms) < Math.max(TASK_QUESTIONS, INTERVIEW_QUESTIONS)) errors.push(`company ${e.id}: too few questions`);
  for (const n of e.needs) if (!examIds.has(n)) errors.push(`company ${e.id}: unknown exam ${n}`);
  prose(`company ${e.id} pitch`, e.pitch, 92);
}
for (const o of Object.values(OFFENCES)) for (const k of ['law', 'offence', 'act', 'fix'] as const) prose(`offence ${o.id} ${k}`, o[k], 64);
for (const e of ENCOUNTERS) {
  prose(`encounter ${e.id} line`, e.line, 190);
  prose(`encounter ${e.id} who`, e.who, 40);
  prose(`encounter ${e.id} accept`, e.accept, 40);
  prose(`encounter ${e.id} decline`, e.decline, 40);
  if (e.kind === 'trap') {
    if (!OFFENCES[e.offence]) errors.push(`encounter ${e.id}: no offence ${e.offence}`);
    prose(`encounter ${e.id} signs`, e.signs, 190);
  } else if (count(e.topics, e.forms) < e.mcs) errors.push(`encounter ${e.id}: too few questions`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`content ok: ${QUESTIONS.length} questions (${QUESTIONS.filter((q) => q.tier === 'junior').length} junior), ${ESSAYS.length} essays, ${NOTES.length} notes, ${GIGS.length} gigs, ${EXAMS.length} exams, ${EMPLOYERS.length} companies, ${ENCOUNTERS.length} street encounters`);
