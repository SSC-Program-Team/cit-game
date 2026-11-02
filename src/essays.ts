/**
 * Essay (written-answer) questions. The school server sends the answer to the school AI
 * (ai.ssc.edu.hk/spark/v1) with the marking points below; if the AI cannot be reached, or in solo
 * play, the keyword check marks it instead: a point scores when the answer mentions any of its keys.
 *
 * Every question is original, in the style of a DSE Paper 1 short structured question.
 * Rules, enforced by scripts/check-content.ts:
 * - 2-4 marking points, one mark each; every point has at least one key (lowercase)
 * - every string uses only characters in the pixel font
 * - `q` <= 300 chars, each point <= 120, `model` <= 360
 */
import type { Form, Tier, Topic } from './questions.ts';

export type Essay = {
  id: string;
  form: Form;
  tier: Tier;
  topic: Topic;
  q: string;
  points: Array<{ point: string; keys: string[] }>;
  /** a full-mark answer, shown after marking */
  model: string;
};

export const ESSAYS: Essay[] = [
  { id: 'w.j1.ram', form: 2, tier: 'junior', topic: 'J1',
    q: 'Chan Tai\'s computer is very slow when she opens many programs at once. Explain why adding more RAM could help. (2 marks)',
    points: [
      { point: 'RAM holds the programs and data that are running / in use', keys: ['running', 'in use', 'open program', 'currently', 'working memory', 'temporar'] },
      { point: 'with too little RAM the computer swaps to the slower disk / storage; more RAM avoids this', keys: ['swap', 'virtual memory', 'disk', 'storage', 'hard drive', 'ssd', 'page file', 'paging'] },
    ],
    model: 'RAM holds the programs and data in use. When it is full, the computer moves data to the much slower disk (virtual memory). More RAM keeps more programs in fast memory, so it slows down less.' },
  { id: 'w.j2.phish', form: 2, tier: 'junior', topic: 'J2',
    q: 'A stall holder gets an email: "Your bank account is locked. Click here and enter your password within 1 hour." Give TWO signs that this is phishing and say what she should do. (3 marks)',
    points: [
      { point: 'it creates urgency / a time limit / a threat', keys: ['urgen', 'hurry', '1 hour', 'one hour', 'time limit', 'pressure', 'threat', 'locked'] },
      { point: 'it asks for a password / personal details; banks never ask for these by email', keys: ['password', 'personal', 'never ask', 'details', 'login'] },
      { point: 'do not click; contact the bank directly / delete or report it', keys: ['not click', "don't click", 'do not click', 'call the bank', 'contact the bank', 'phone the bank', 'report', 'delete', 'official'] },
    ],
    model: 'It rushes her with a one-hour deadline and a threat, and it asks for her password, which a bank never asks for by email. She should not click the link; she should delete or report it and call the bank on its official number.' },
  { id: 'w.j3.loop', form: 3, tier: 'junior', topic: 'J3',
    q: 'The coding club wants a program that prints the numbers 1 to 100. Explain why a loop is better than writing 100 print statements. (2 marks)',
    points: [
      { point: 'a loop repeats the same instruction(s), so the code is much shorter', keys: ['repeat', 'shorter', 'less code', 'fewer lines', 'iterat'] },
      { point: 'easier to change / fewer mistakes / works for any number', keys: ['change', 'modify', 'mistake', 'error', 'maintain', 'any number', 'flexib', 'easier'] },
    ],
    model: 'A loop repeats one print statement 100 times, so the program is a few lines instead of 100. It is also easier to change (for example to 1000) and there is less chance of typing a mistake.' },
  { id: 'w.j4.bias', form: 3, tier: 'junior', topic: 'J4',
    q: 'A shop trains an AI to pick job applicants using only data about its past staff, who were nearly all men. Explain what problem this could cause and one way to reduce it. (3 marks)',
    points: [
      { point: 'the training data is biased / not representative', keys: ['bias', 'represent', 'unbalanced', 'imbalanced', 'mostly men', 'training data'] },
      { point: 'the AI may unfairly reject women / discriminate', keys: ['women', 'female', 'unfair', 'discriminat', 'reject'] },
      { point: 'use more balanced / diverse data, or have humans check the decisions', keys: ['balanced', 'divers', 'more data', 'human', 'check', 'review', 'audit', 'fair data'] },
    ],
    model: 'The training data is biased: it mostly shows men, so the AI may learn to prefer men and unfairly reject women. The shop should train it on balanced, diverse data and have people review its decisions.' },
  { id: 'w.a.validate', form: 4, tier: 'dse', topic: 'A',
    q: 'The store\'s stock spreadsheet has a "Quantity" column. Describe ONE validation check for it and explain why validation does not guarantee the data is correct. (3 marks)',
    points: [
      { point: 'a range / type check, e.g. a whole number of 0 or more', keys: ['range', 'type check', 'integer', 'whole number', 'positive', '>= 0', 'not negative', 'presence'] },
      { point: 'it rejects impossible values', keys: ['reject', 'impossible', 'invalid', 'not allowed', 'error message'] },
      { point: 'a value can be valid but still wrong, e.g. 15 typed instead of 51 (needs verification)', keys: ['valid but', 'still wrong', 'reasonable but', 'verif', 'typo', 'wrong number', 'accurate'] },
    ],
    model: 'A range check that Quantity is a whole number of 0 or more rejects impossible entries such as -3 or "abc". But validation only checks that data is reasonable: typing 15 instead of 51 passes, so it can still be wrong. Verification (such as double entry) is needed for that.' },
  { id: 'w.b.ssd', form: 4, tier: 'dse', topic: 'B',
    q: 'The chops stall\'s old PC has a hard disk drive (HDD). Give TWO reasons to replace it with a solid-state drive (SSD). (2 marks)',
    points: [
      { point: 'faster access / faster boot and loading', keys: ['fast', 'speed', 'quick', 'boot', 'load', 'access time'] },
      { point: 'no moving parts: more robust / quieter / less power', keys: ['moving part', 'robust', 'durab', 'shock', 'quiet', 'power', 'reliab', 'drop'] },
    ],
    model: 'An SSD has much faster access times, so the PC boots and opens programs faster. It has no moving parts, so it is more robust if knocked, silent and uses less power.' },
  { id: 'w.c.wifi', form: 5, tier: 'dse', topic: 'C',
    q: 'Murray House wants guest Wi-Fi for diners. Suggest TWO measures to keep the restaurant\'s own computers safe from the guests. (2 marks)',
    points: [
      { point: 'a separate guest network / VLAN / SSID, isolated from the office network', keys: ['separate', 'guest network', 'vlan', 'isolat', 'different network', 'own network', 'ssid'] },
      { point: 'a firewall / strong encryption (WPA2/WPA3) / password / client isolation', keys: ['firewall', 'wpa', 'encrypt', 'password', 'client isolation', 'block'] },
    ],
    model: 'Put guests on a separate network (its own SSID or VLAN) isolated from the office computers, and protect it with WPA2/WPA3 encryption and a firewall that blocks guest traffic from reaching the office network.' },
  { id: 'w.d.test', form: 5, tier: 'dse', topic: 'D',
    q: 'The bus timetable script asks for an hour from 0 to 23. Give THREE test values a tester should try and say what each one tests. (3 marks)',
    points: [
      { point: 'normal data, e.g. 12', keys: ['normal', 'typical', 'valid'] },
      { point: 'boundary / extreme data, e.g. 0 or 23', keys: ['boundary', 'extreme', 'edge', 'limit', ' 0', '23'] },
      { point: 'erroneous / invalid data, e.g. 24, -1 or "abc"', keys: ['erroneous', 'invalid', 'abnormal', '24', '-1', 'letter', 'text', 'out of range'] },
    ],
    model: '12 is normal data and should be accepted. 0 and 23 are boundary data at the edges of the range and should be accepted. 24 (or -1, or "abc") is erroneous data and should be rejected.' },
  { id: 'w.e.pdpo', form: 4, tier: 'dse', topic: 'E',
    q: 'The bakery collects customers\' phone numbers for birthday cake reminders. Under the PDPO, explain TWO things it must do with this data. (2 marks)',
    points: [
      { point: 'tell customers the purpose; use it only for that purpose (e.g. not sell it)', keys: ['purpose', 'only for', 'not sell', 'not share', 'tell', 'inform', 'consent'] },
      { point: 'keep it secure / accurate / not longer than needed', keys: ['secure', 'protect', 'safe', 'accurate', 'delete', 'longer than', 'encrypt', 'password'] },
    ],
    model: 'It must tell customers why the numbers are collected and use them only for cake reminders, not sell or pass them on. It must keep them secure and accurate, and delete them when no longer needed.' },
  { id: 'w.e.copyright', form: 4, tier: 'dse', topic: 'E',
    q: 'A freelancer finds a photo online for a poster she is paid to make. Explain why she should not just use it, and suggest TWO legal alternatives. (3 marks)',
    points: [
      { point: 'the photo is protected by copyright; using it without permission is infringement', keys: ['copyright', 'permission', 'infring', 'owner', 'illegal'] },
      { point: 'get permission / buy a licence', keys: ['permission', 'licen', 'buy', 'pay', 'ask the'] },
      { point: 'use public domain / Creative Commons images, or take her own photo', keys: ['creative commons', 'public domain', 'own photo', 'free to use', 'royalty', 'take a photo', 'her own'] },
    ],
    model: 'Photos online are usually protected by copyright, so using one in paid work without permission is infringement. She could buy a licence or ask the owner for permission, or use a Creative Commons or public domain image, or take her own photo.' },
];
