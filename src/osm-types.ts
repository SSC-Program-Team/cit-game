/** the shape of src/stanley-osm.ts: flat [x0, y0, x1, y1, ...] point lists in metres */
export type OsmData = {
  v: number;
  src: string;
  origin: [number, number];
  /** size in metres */
  w: number;
  h: number;
  /** [points, building tag, name, amenity/shop/tourism/historic] */
  buildings: Array<[number[], string, string, string]>;
  /** [points, highway tag, name] */
  roads: Array<[number[], string, string]>;
  /** [points, class, name]: beach wood cemetery pitch park parking plaza pier prison school built water */
  areas: Array<[number[], string, string]>;
  coast: number[][];
  /** [points, barrier tag] */
  walls: Array<[number[], string]>;
  /** [name, kind, x, y] */
  pois: Array<[string, string, number, number]>;
};
