/**
 * Print every building's final outline (after tidying), real height and name as JSON, for tools
 * that need exactly what the game draws: `node --experimental-strip-types scripts/export-buildings.ts`
 */
import { BUILDINGS } from '../src/world.ts';

console.log(JSON.stringify(BUILDINGS.map((b) => ({ poly: b.poly, height: b.height, name: b.name }))));
