// Geohash Base32 alphabet (Crockford variant without 0, 1, a, i, l, o)
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < BASE32.length; i++) DECODE_MAP[BASE32[i]] = i;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DecodedGeohash extends LatLng {
  error: { lat: number; lng: number };
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface Neighbors {
  n: string;
  ne: string;
  e: string;
  se: string;
  s: string;
  sw: string;
  w: string;
  nw: string;
}

/**
 * Encode a lat/lng coordinate to a geohash string.
 *
 * @param lat Latitude (-90..90)
 * @param lng Longitude (-180..180)
 * @param precision Length of the hash (1..12). Default: 9
 */
export function encode(lat: number, lng: number, precision = 9): string {
  if (lat < -90 || lat > 90) throw new RangeError(`lat must be in [-90, 90], got ${lat}`);
  if (lng < -180 || lng > 180) throw new RangeError(`lng must be in [-180, 180], got ${lng}`);
  if (precision < 1 || precision > 12) throw new RangeError(`precision must be in [1, 12], got ${precision}`);

  let minLat = -90, maxLat = 90;
  let minLng = -180, maxLng = 180;
  let hash = "";
  let bits = 0, bitCount = 0;
  let isLng = true;

  while (hash.length < precision) {
    if (isLng) {
      const midLng = (minLng + maxLng) / 2;
      if (lng >= midLng) { bits = (bits << 1) | 1; minLng = midLng; }
      else { bits = bits << 1; maxLng = midLng; }
    } else {
      const midLat = (minLat + maxLat) / 2;
      if (lat >= midLat) { bits = (bits << 1) | 1; minLat = midLat; }
      else { bits = bits << 1; maxLat = midLat; }
    }
    isLng = !isLng;

    if (++bitCount === 5) {
      hash += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }
  return hash;
}

/**
 * Decode a geohash to its center lat/lng with error bounds.
 */
export function decode(hash: string): DecodedGeohash {
  const bbox = decodeBbox(hash);
  const lat = (bbox.minLat + bbox.maxLat) / 2;
  const lng = (bbox.minLng + bbox.maxLng) / 2;
  return {
    lat,
    lng,
    error: {
      lat: (bbox.maxLat - bbox.minLat) / 2,
      lng: (bbox.maxLng - bbox.minLng) / 2,
    },
  };
}

/**
 * Decode a geohash to its bounding box.
 */
export function decodeBbox(hash: string): BBox {
  if (!hash) throw new Error("geohash must not be empty");

  let minLat = -90, maxLat = 90;
  let minLng = -180, maxLng = 180;
  let isLng = true;

  for (const ch of hash) {
    const val = DECODE_MAP[ch.toLowerCase()];
    if (val === undefined) throw new Error(`Invalid geohash character: ${ch}`);

    for (let bit = 4; bit >= 0; bit--) {
      const bitVal = (val >> bit) & 1;
      if (isLng) {
        const midLng = (minLng + maxLng) / 2;
        if (bitVal) minLng = midLng; else maxLng = midLng;
      } else {
        const midLat = (minLat + maxLat) / 2;
        if (bitVal) minLat = midLat; else maxLat = midLat;
      }
      isLng = !isLng;
    }
  }
  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Find the geohash of a neighboring cell in the given direction.
 */
export function neighbor(hash: string, direction: "n" | "s" | "e" | "w"): string {
  const { lat, lng } = decode(hash);
  const bbox = decodeBbox(hash);
  const latStep = bbox.maxLat - bbox.minLat;
  const lngStep = bbox.maxLng - bbox.minLng;

  const offsets = { n: [latStep, 0], s: [-latStep, 0], e: [0, lngStep], w: [0, -lngStep] };
  const [dlat, dlng] = offsets[direction];
  const precision = hash.length;

  let newLat = lat + dlat;
  let newLng = lng + dlng;

  // Wrap longitude
  if (newLng > 180) newLng -= 360;
  if (newLng < -180) newLng += 360;
  // Clamp latitude
  newLat = Math.max(-90, Math.min(90, newLat));

  return encode(newLat, newLng, precision);
}

/**
 * Get all 8 neighbors of a geohash cell.
 */
export function neighbors(hash: string): Neighbors {
  const n = neighbor(hash, "n");
  const s = neighbor(hash, "s");
  const e = neighbor(hash, "e");
  const w = neighbor(hash, "w");
  return {
    n,
    ne: neighbor(n, "e"),
    e,
    se: neighbor(s, "e"),
    s,
    sw: neighbor(s, "w"),
    w,
    nw: neighbor(n, "w"),
  };
}

/**
 * Get the 9 cells covering the hash and its 8 neighbors.
 * Useful for proximity search: any point within one cell's distance
 * is guaranteed to be in one of these 9 cells.
 */
export function expand(hash: string): string[] {
  const nb = neighbors(hash);
  return [hash, nb.n, nb.ne, nb.e, nb.se, nb.s, nb.sw, nb.w, nb.nw];
}

/**
 * Get all geohashes at the given precision that cover the bounding box.
 * Useful for spatial index queries.
 */
export function bboxHashes(
  minLat: number, minLng: number,
  maxLat: number, maxLng: number,
  precision: number
): string[] {
  const hashes = new Set<string>();

  const seed = encode((minLat + maxLat) / 2, (minLng + maxLng) / 2, precision);
  const queue = [seed];

  while (queue.length > 0) {
    const h = queue.pop()!;
    if (hashes.has(h)) continue;

    const bbox = decodeBbox(h);
    // Check if this hash overlaps with the query bbox
    if (bbox.maxLat < minLat || bbox.minLat > maxLat ||
        bbox.maxLng < minLng || bbox.minLng > maxLng) continue;

    hashes.add(h);
    for (const dir of ["n", "s", "e", "w"] as const) {
      const nb = neighbor(h, dir);
      if (!hashes.has(nb)) queue.push(nb);
    }
  }
  return [...hashes].sort();
}

/**
 * Get the parent hash (precision - 1).
 */
export function parent(hash: string): string {
  if (hash.length <= 1) throw new Error("Cannot get parent of precision-1 hash");
  return hash.slice(0, -1);
}

/**
 * Get all 32 children hashes at precision + 1.
 */
export function children(hash: string): string[] {
  return BASE32.split("").map(ch => hash + ch);
}

/**
 * Check if a lat/lng coordinate is within the cell of a geohash.
 */
export function contains(hash: string, lat: number, lng: number): boolean {
  const { minLat, minLng, maxLat, maxLng } = decodeBbox(hash);
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

/**
 * Approximate great-circle distance between two lat/lng points in kilometers.
 * Uses the Haversine formula.
 */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number { return (deg * Math.PI) / 180; }

/**
 * Approximate distance between the centers of two geohashes in km.
 */
export function distance(hash1: string, hash2: string): number {
  const a = decode(hash1);
  const b = decode(hash2);
  return haversine(a.lat, a.lng, b.lat, b.lng);
}
