/**
 * Cars at Stanley Motors (docs/design/stanley-expansion.md §11.2). Invented models. A car loses 1%
 * of its price each in-game day, down to 40%; parking and fuel cost something every day; the
 * dealer buys back at 80% of what it is worth now, or takes it in part exchange.
 */
export type CarModel = {
  id: string;
  name: string;
  price: number;
  /** parking and fuel, per in-game day */
  daily: number;
  /** top speed, km/h, and how quick it is off the mark (1 = ordinary) */
  speed: number;
  pep: number;
  /** length and width in metres, for drawing */
  len: number;
  wid: number;
  blurb: string;
};

export const CARS: CarModel[] = [
  { id: 'hatch', name: 'used hatchback', price: 12000, daily: 40, speed: 40, pep: 0.9, len: 3.9, wid: 1.7, blurb: 'ten years old, one careful owner. gets you round stanley.' },
  { id: 'saloon', name: 'family saloon', price: 38000, daily: 80, speed: 45, pep: 1, len: 4.7, wid: 1.8, blurb: 'comfortable and dull. the boot fits a week of shopping.' },
  { id: 'ev', name: 'electric hatch', price: 68000, daily: 30, speed: 45, pep: 1.15, len: 4.2, wid: 1.8, blurb: 'quiet, quick, and cheap to run: charge it at the car park.' },
  { id: 'suv', name: 'seven-seat suv', price: 120000, daily: 140, speed: 45, pep: 0.95, len: 4.9, wid: 1.95, blurb: 'room for the whole team and their kit. thirsty.' },
  { id: 'coupe', name: 'sports coupe', price: 260000, daily: 200, speed: 50, pep: 1.35, len: 4.5, wid: 1.9, blurb: '35% quicker than anything else here. everyone on the promenade looks.' },
];

export const car = (id: string): CarModel | undefined => CARS.find((c) => c.id === id);

export const CAR_LOSS_PER_DAY = 0.01;
export const CAR_FLOOR = 0.4;
export const CAR_BUYBACK = 0.8;
