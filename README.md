# geohashkit

[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)

Zero-dependency TypeScript geohash encoding for location-based services: encode/decode lat-lng, neighbors, bounding box, proximity search, distance, parent/children. Drop-in replacement for `ngeohash` (256k/week) with full TypeScript types.

[![npm](https://img.shields.io/npm/v/@billdaddy/geohashkit)](https://www.npmjs.com/package/@billdaddy/geohashkit)
[![license](https://img.shields.io/npm/l/@billdaddy/geohashkit)](LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

## Install

```bash
npm install @billdaddy/geohashkit
```

## Why?

- `ngeohash` — 256k downloads/week — but has no TypeScript types and was abandoned in 2022
- Python `geohash2`, Go `geohash` — widely used in production location services
- geohashkit fills the zero-dependency TypeScript gap, with full types and haversine distance

## Quick start

```typescript
import { encode, decode, neighbors, expand } from "@billdaddy/geohashkit";

// Eiffel Tower
const hash = encode(48.8584, 2.2945, 6);  // "u09tun"

const { lat, lng, error } = decode(hash);
// lat ≈ 48.8584, lng ≈ 2.2945
// error.lat ≈ 0.0009 (±90m), error.lng ≈ 0.0018 (±180m)

// 9-cell proximity search (center + 8 neighbors)
const cells = expand(hash); // ["u09tun", "u09tup", "u09tuu", ...]
```

## API

### `encode(lat, lng, precision?): string`

Encode coordinates to a geohash string. Precision 1–12 (default: 9).

```typescript
encode(48.8584, 2.2945, 6);  // "u09tun"
encode(48.8584, 2.2945, 9);  // "u09tunquc"
encode(40.6892, -74.0445, 5); // "dr5r7"  (Statue of Liberty)
```

### `decode(hash): { lat, lng, error }`

Decode a geohash to its center coordinates and error bounds.

```typescript
const { lat, lng, error } = decode("u09tun");
// lat: 48.8538, lng: 2.2961
// error: { lat: 0.00085, lng: 0.00171 }  (half the cell size)
```

### `decodeBbox(hash): BBox`

Decode a geohash to `{ minLat, minLng, maxLat, maxLng }`.

```typescript
const bbox = decodeBbox("u09tun");
// { minLat: 48.8525, minLng: 2.2900, maxLat: 48.8553, maxLng: 2.3022 }
```

### `neighbor(hash, direction): string`

Get the adjacent cell in one direction (`"n"` | `"s"` | `"e"` | `"w"`).

```typescript
neighbor("u09tun", "n"); // cell to the north
neighbor("u09tun", "e"); // cell to the east
```

### `neighbors(hash): Neighbors`

Get all 8 surrounding cells.

```typescript
const nb = neighbors("u09tun");
// { n, ne, e, se, s, sw, w, nw } — each a 6-char hash
```

### `expand(hash): string[]`

Get the cell and its 8 neighbors (9 cells total). Use this for proximity search.

```typescript
const cells = expand("u09tun"); // [center, n, ne, e, se, s, sw, w, nw]
```

### `bboxHashes(minLat, minLng, maxLat, maxLng, precision): string[]`

Get all hashes at the given precision that cover a bounding box.

```typescript
const hashes = bboxHashes(48.85, 2.29, 48.87, 2.30, 6);
// All precision-6 cells overlapping that area
```

### `parent(hash): string`

Get the parent cell (precision − 1).

```typescript
parent("u09tun"); // "u09tu"
parent("u09tu");  // "u09t"
```

### `children(hash): string[]`

Get all 32 child cells (precision + 1).

```typescript
children("u09t"); // ["u09t0", "u09t1", ..., "u09tz"] — 32 entries
```

### `contains(hash, lat, lng): boolean`

Check if a coordinate falls within a geohash cell.

```typescript
contains("u09tun", 48.8584, 2.2945); // true
```

### `haversine(lat1, lng1, lat2, lng2): number`

Great-circle distance in kilometers (Haversine formula).

```typescript
haversine(48.8584, 2.2945, 40.6892, -74.0445); // ~5840 km (Paris → NYC)
```

### `distance(hash1, hash2): number`

Distance between the centers of two geohash cells in km.

```typescript
distance("u09tun", "dr5r7"); // ~5840 km
```

## Use cases

### Proximity search (ride-sharing, restaurants)

```typescript
import { encode, expand } from "@billdaddy/geohashkit";

const PRECISION = 7; // ~150m cells

// Index: store each entity's geohash
const drivers = [
  { id: 1, lat: 48.8590, lng: 2.2950 }, // 60m away
  { id: 2, lat: 48.9000, lng: 2.3500 }, // 5km away
];

const index = new Map<string, typeof drivers>();
for (const d of drivers) {
  const h = encode(d.lat, d.lng, PRECISION);
  if (!index.has(h)) index.set(h, []);
  index.get(h)!.push(d);
}

// Query: find drivers near a pickup point
function nearbyDrivers(lat: number, lng: number) {
  const cells = new Set(expand(encode(lat, lng, PRECISION)));
  return drivers.filter(d => cells.has(encode(d.lat, d.lng, PRECISION)));
}

nearbyDrivers(48.8584, 2.2945); // → [driver 1]
```

### Spatial clustering by precision

```typescript
import { encode, parent } from "@billdaddy/geohashkit";

// Group GPS pings into ~5km × 5km tiles (precision 4)
const pings = [
  { lat: 48.8584, lng: 2.2945 },
  { lat: 48.8600, lng: 2.2960 }, // same tile
  { lat: 51.5074, lng: -0.1278 }, // London — different tile
];

const clusters = new Map<string, typeof pings>();
for (const p of pings) {
  const tile = encode(p.lat, p.lng, 4); // ~20km resolution
  if (!clusters.has(tile)) clusters.set(tile, []);
  clusters.get(tile)!.push(p);
}
```

### Bounding box coverage for map tiles

```typescript
import { bboxHashes, decodeBbox } from "@billdaddy/geohashkit";

// Find all precision-7 cells in a viewport
const viewport = { minLat: 48.84, minLng: 2.27, maxLat: 48.87, maxLng: 2.32 };
const tiles = bboxHashes(viewport.minLat, viewport.minLng,
                          viewport.maxLat, viewport.maxLng, 7);

// Load data for each tile from a spatial index
for (const tile of tiles) {
  const bbox = decodeBbox(tile);
  // fetch data for this bbox from DB...
}
```

## Precision reference

| Precision | Cell size        | Use case                       |
|-----------|------------------|--------------------------------|
| 1         | ±2500 km         | Continent-level                |
| 2         | ±630 km          | Country-level                  |
| 3         | ±78 km           | Region/state                   |
| 4         | ±20 km           | City-level                     |
| 5         | ±2.4 km          | District                       |
| 6         | ±0.61 km (~600m) | Neighborhood                   |
| 7         | ±76 m            | Street block (proximity search)|
| 8         | ±19 m            | Building                       |
| 9         | ±2.4 m           | Front door                     |
| 10        | ±0.60 m          | Within a room                  |
| 11        | ±0.074 m         | Centimeter precision           |
| 12        | ±0.019 m         | Sub-centimeter                 |

## Contributors ✨

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome — code, docs, bug reports, ideas, reviews! See the [emoji key](https://allcontributors.org/docs/en/emoji-key) for how each contribution is recognized, and open a PR or issue to get involved.

Thanks goes to these wonderful people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/trananhtung"><img src="https://avatars.githubusercontent.com/u/30992229?v=4?s=100" width="100px;" alt="Tung Tran"/><br /><sub><b>Tung Tran</b></sub></a><br /><a href="https://github.com/trananhtung/geohashkit/commits?author=trananhtung" title="Code">💻</a> <a href="#maintenance-trananhtung" title="Maintenance">🚧</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

MIT
