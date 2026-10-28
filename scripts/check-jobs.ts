/**
 * Build-time check for src/jobs.ts: every string must render in the bitmap font and fit
 * its slot, and every question must have exactly one right answer.
 *
 *   node --experimental-strip-types scripts/check-jobs.ts
 */
import { JOBS, MISSIONS, OFFER, CHARSET, type JobDef } from '../src/jobs.ts';

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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`jobs ok: ${JOBS.length} jobs, ${MISSIONS.length} missions`);
