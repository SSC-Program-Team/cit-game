/**
 * Named buildings and places in Stanley, from OpenStreetMap (© OpenStreetMap contributors, ODbL).
 * Tile coordinates match src/stanley-grid.ts (8 m tiles, north up). For a building, the tile is
 * one that lies inside its footprint.
 */

/** [name, kind, x, y]: kind is the OSM building/amenity tag, used to pick a look */
export const NAMED_BUILDINGS: Array<[string, string, number, number]> = [
  ['Chun Ma House', 'apartments', 2, 12], ['Ying Ma House', 'apartments', 17, 13], ['Kin Ma House', 'apartments', 10, 16],
  ['Leung Ma House', 'apartments', 1, 19], ['Koon Ma House', 'apartments', 10, 24], ['Chun Tak House', 'apartments', 20, 28],
  ['Shing Tak House', 'apartments', 33, 34], ['Chi Tak House', 'apartments', 29, 43], ['Yi Tak House', 'apartments', 34, 51],
  ['Stanley Exchange', 'service', 65, 7],
  ['Stanley Plaza', 'mall', 42, 37], ['Stanley Plaza', 'mall', 50, 44],
  ['Stanley Main Beach Water Sports Centre', 'water_sports', 106, 30],
  ['Stanley Municipal Services Building', 'civic', 80, 49],
  ['Tin Hau Temple', 'place_of_worship', 43, 52],
  ['Stanley Residents Association', 'yes', 60, 56], ["Stanley Fishermen's Recreation Club", 'yes', 72, 56],
  ['Murray House', 'heritage', 50, 63],
  ['Stanley Kai Fong Welfare Advancement Association', 'yes', 90, 63],
  ['Stanley Post Office', 'post_office', 96, 65],
  ['Stanley Baptist Chapel', 'place_of_worship', 92, 72],
  ['No.1 Bungalow', 'school', 106, 73], ['No.2 Bungalow', 'school', 114, 77], ['Block 6-7', 'school', 102, 79],
  ['North House', 'school', 119, 79], ['Block 10', 'school', 130, 79], ['Block 9', 'school', 133, 80],
  ['College House', 'school', 106, 81], ['Block 8', 'school', 132, 83], ['Chapel', 'church', 123, 87],
  ['Tang Shiu Kin Hall', 'school', 135, 88], ['Ng Wah Hall', 'school', 125, 90], ['Changing Room', 'school', 130, 90],
  ['Martin Hostel', 'school', 144, 91], ['Pao Sui Loong Building', 'school', 132, 93], ['School House', 'school', 129, 94],
  ['Centenary Building', 'school', 122, 95], ['Li Ka Shing Building', 'school', 134, 96], ['Ho Tim Building', 'school', 136, 99],
  ['Alex Y. D. Au Building', 'school', 144, 102], ['Administration Building (Luke Yip Building)', 'school', 127, 103],
  ['Classroom Block', 'school', 135, 105], ['Leung Kau Kui Student Centre', 'school', 139, 105],
  ['No.3 Bungalow', 'school', 134, 111], ['No.4 Bungalow', 'school', 128, 118], ['No.5 Bungalow', 'school', 120, 119],
  ['Ho Shung Yuk Building', 'school', 118, 146],
  ['CSD Staff Quarters Block H', 'dormitory', 150, 87], ['CSD Staff Quarters Block I', 'dormitory', 152, 87],
  ['Hong Kong Correctional Services Museum', 'museum', 156, 90],
  ['Stanley Mosque', 'place_of_worship', 167, 107],
  ["Officers' Club, Correctional Services Department", 'dormitory', 159, 110],
];

/** places worth a label or a look: [name, kind, x, y] */
export const NAMED_PLACES: Array<[string, string, number, number]> = [
  ['Stanley Village bus terminus', 'bus_station', 93.5, 51],
  ['Stanley Plaza bus stop', 'bus_station', 47.5, 39.5],
  ['Stanley Public Library', 'library', 87, 51],
  ['Stanley Market', 'marketplace', 86.5, 65],
  ['Stanley Market hawker bazaar', 'marketplace', 83, 57.5],
  ['Old Stanley Police Station', 'retail', 94, 63],
  ['Stanley Police Station', 'police', 97, 57.5],
  ['Stanley Main Street', 'street', 56.5, 57],
  ['Stanley Promenade', 'park', 76, 67.5],
  ['Stanley Ma Hang Park', 'park', 36, 68],
  ['Pak Tai Temple', 'place_of_worship', 36.5, 80.5],
  ['Kwun Yum Temple', 'place_of_worship', 20.5, 56],
  ['Blake Pier at Stanley', 'pier', 56, 76],
  ['Ma Hang Estate', 'residential', 7.5, 20.5],
  ['Ma Hang Prison', 'prison', 48.5, 6.5],
  ['Hong Kong Sea School', 'school', 122, 62.5],
  ["St Stephen's College", 'school', 124.5, 97.5],
  ['Tang Shiu Kin Sports Field', 'pitch', 112.5, 102.5],
  ['Stanley Military Cemetery', 'cemetery', 132.5, 130],
  ["St Stephen's Beach", 'beach', 117, 142],
  ['Stanley Prison', 'prison', 168, 151],
  ['Tung Tau Correctional Institution', 'prison', 151, 153],
  ['Hong Kong Correctional Services Museum', 'museum', 156, 90],
];

/** road names to paint on the map: [name, x, y, angle in radians] */
export const ROAD_LABELS: Array<[string, number, number, number]> = [
  ['STANLEY VILLAGE RD', 86, 6, -1.25],
  ['STANLEY NEW ST', 89, 53.5, 0],
  ['STANLEY MARKET RD', 74, 55.5, 0],
  ['STANLEY MAIN ST', 62, 59, 0.4],
  ['STANLEY BEACH RD', 108, 8, 1.57],
  ['CARMEL RD', 40, 30, 0.64],
  ['WONG MA KOK RD', 143, 150, 1.57],
  ['TUNG TAU WAN RD', 148, 86, -0.7],
  ['STANLEY MOUND RD', 92, 21, 0.38],
  ['CAPE RD', 14, 40, 1.57],
];

/** walled compounds you cannot walk into (OSM prison walls and fences), as tile polygons */
export const COMPOUNDS: Array<[string, number[]]> = [
  ['Stanley Prison', [152, 135, 158, 177, 185.5, 173, 182.5, 154.5, 179, 131, 152, 135]],
  ['Tung Tau Correctional Institution', [154.5, 162.5, 151.5, 139.5, 150.5, 139, 143.5, 143, 147.5, 163, 154, 162.5]],
  ['Ma Hang Prison', [36.5, 22, 40, 21, 42, 24, 43, 23.5, 55, 14.5, 57, 15, 59, 16.5, 61, 11.5, 62.5, 11.5, 63, 10.5, 61.5, 10.5,
    58, 10, 57.5, 8, 55, 1, 53, 1, 52, -0.5, 53, -2, 54.5, -2.5, 55, -4, 54, -6.5, 52.5, -7.5, 51, -8, 50, -3.5, 48.5, -2.5,
    48, 0.5, 45.5, 0.5, 44.5, 0.5, 43, 3, 36, 3.5, 30, 3, 29, 5.5, 29.5, 8, 29, 10.5, 36.5, 22]],
];
