/**
 * Green minibuses that really serve Stanley. Positions are metres on the map (see world.ts).
 *
 * GMB 40   Stanley Village (Stanley Beach Road) - Causeway Bay; calls at Stanley Plaza in Stanley.
 * GMB 52   Aberdeen (Shek Pai Wan) - Stanley Prison; calls at Ma Hang Estate, Stanley Plaza and
 *          St Stephen's College in Stanley.
 *
 * Fares: the Transport Department set the 52's Ma Hang Estate - Stanley Prison section fare at
 * $3.1 from 6 September 2026. The 40 publishes no section fare inside Stanley, so the game uses
 * the same $3.1 for a hop within the village. Check both against the TD before release.
 */
export type Stop = { id: string; name: string; x: number; y: number };
export type Route = { no: string; colour: string; fare: number; stops: Stop[] };

export const ROUTES: Route[] = [
  { no: '40', colour: '#2f8a4a', fare: 3.1, stops: [
    { id: 'gmb40-village', name: 'stanley beach road (40 terminus)', x: 752, y: 396 },
    { id: 'gmb40-plaza', name: 'stanley plaza', x: 384, y: 330 },
  ] },
  { no: '52', colour: '#2f8a4a', fare: 3.1, stops: [
    { id: 'gmb52-mahang', name: 'ma hang estate', x: 76, y: 256 },
    { id: 'gmb52-plaza', name: 'stanley plaza', x: 392, y: 318 },
    { id: 'gmb52-ssc', name: "st stephen's college", x: 1168, y: 696 },
    { id: 'gmb52-prison', name: 'stanley prison', x: 1228, y: 816 },
  ] },
];

export const routesAt = (stopId: string): Route[] => ROUTES.filter((r) => r.stops.some((s) => s.id === stopId));
