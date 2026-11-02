/**
 * Study notes, read at Stanley Public Library. They cover what is asked in interviews, freelance
 * gigs, work tasks and exams, topic by topic. The project owner will write them; until a topic has
 * notes, its shelf shows revision cards made from the explanations in the question bank.
 *
 * Format, checked by scripts/check-content.ts:
 * - `topic` is one of J1-J4 (junior) or A-E (DSE), as in src/questions.ts
 * - `title` <= 60 chars; `body` is plain text, paragraphs separated by a blank line (\n\n),
 *   lines that start with two spaces are shown as code; <= 3000 chars
 * - only characters the pixel font can draw (no curly quotes or long dashes)
 *
 * Example:
 *   { id: 'n.c.dns', topic: 'C', title: 'DNS: names to addresses',
 *     body: 'A DNS server turns a domain name such as www.ssc.edu.hk into an IP address.\n\n...' },
 */
import type { Topic } from './questions.ts';

export type Note = { id: string; topic: Topic; title: string; body: string };

export const NOTES: Note[] = [];
