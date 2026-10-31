import { grid, MAP_W, Gr } from '../src/world.ts';
const ch: Record<number, string> = { [Gr.Building]: '#', [Gr.Wall]: '|', [Gr.Wood]: 'T', [Gr.Scrub]: ',', [Gr.Path]: '.', [Gr.Steps]: '=', [Gr.Road]: 'R', [Gr.Lane]: 'L', [Gr.Sea]: '~', [Gr.School]: '_', [Gr.Hill]: '_', [Gr.Grass]: '_', [Gr.Pitch]: 'p' };
const [cx, cy, r] = process.argv.slice(2).map(Number);
for (let y = cy - r; y <= cy + r; y += 1) { let s = ''; for (let x = cx - 2 * r; x <= cx + 2 * r; x += 1) s += ch[grid[y * MAP_W + x]] ?? ' '; console.log(s); }
