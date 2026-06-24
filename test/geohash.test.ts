import { describe, test, expect } from "@jest/globals";
import {
  encode, decode, decodeBbox, neighbor, neighbors, expand,
  bboxHashes, parent, children, contains, haversine, distance,
} from "../src/index.js";

// Known geohash test vectors (verified against algorithm output)
// Eiffel Tower: 48.8584, 2.2945 → "u09tun" at p6
// Statue of Liberty: 40.6892, -74.0445 → "dr5r7" at p5
// Sydney Opera House: -33.8568, 151.2153 → "r3gx2" at p5

const EIFFEL = { lat: 48.8584, lng: 2.2945 };
const LIBERTY = { lat: 40.6892, lng: -74.0445 };
const SYDNEY = { lat: -33.8568, lng: 151.2153 };

describe("encode()", () => {
  test("Eiffel Tower precision 6", () => {
    expect(encode(EIFFEL.lat, EIFFEL.lng, 6)).toBe("u09tun");
  });

  test("Eiffel Tower precision 9", () => {
    expect(encode(EIFFEL.lat, EIFFEL.lng, 9)).toBe("u09tunquc");
  });

  test("Statue of Liberty precision 5", () => {
    expect(encode(LIBERTY.lat, LIBERTY.lng, 5)).toBe("dr5r7");
  });

  test("Sydney Opera House precision 5", () => {
    expect(encode(SYDNEY.lat, SYDNEY.lng, 5)).toBe("r3gx2");
  });

  test("default precision is 9", () => {
    expect(encode(EIFFEL.lat, EIFFEL.lng)).toHaveLength(9);
  });

  test("rejects out-of-range lat", () => {
    expect(() => encode(91, 0)).toThrow(RangeError);
    expect(() => encode(-91, 0)).toThrow(RangeError);
  });

  test("rejects out-of-range lng", () => {
    expect(() => encode(0, 181)).toThrow(RangeError);
    expect(() => encode(0, -181)).toThrow(RangeError);
  });

  test("rejects invalid precision", () => {
    expect(() => encode(0, 0, 0)).toThrow(RangeError);
    expect(() => encode(0, 0, 13)).toThrow(RangeError);
  });

  test("precision 1 returns 1 char", () => {
    expect(encode(EIFFEL.lat, EIFFEL.lng, 1)).toHaveLength(1);
  });

  test("origin (0, 0)", () => {
    const h = encode(0, 0, 6);
    expect(h).toBe("s00000");
  });

  test("extremes: North Pole", () => {
    expect(() => encode(90, 0)).not.toThrow();
  });

  test("extremes: South Pole", () => {
    expect(() => encode(-90, 0)).not.toThrow();
  });
});

describe("decode()", () => {
  test("Eiffel Tower round-trip", () => {
    const { lat, lng } = decode(encode(EIFFEL.lat, EIFFEL.lng, 9));
    expect(lat).toBeCloseTo(EIFFEL.lat, 3);
    expect(lng).toBeCloseTo(EIFFEL.lng, 3);
  });

  test("Statue of Liberty round-trip", () => {
    const { lat, lng } = decode(encode(LIBERTY.lat, LIBERTY.lng, 9));
    expect(lat).toBeCloseTo(LIBERTY.lat, 3);
    expect(lng).toBeCloseTo(LIBERTY.lng, 3);
  });

  test("Sydney round-trip (southern hemisphere)", () => {
    const { lat, lng } = decode(encode(SYDNEY.lat, SYDNEY.lng, 9));
    expect(lat).toBeCloseTo(SYDNEY.lat, 3);
    expect(lng).toBeCloseTo(SYDNEY.lng, 3);
  });

  test("error bounds decrease with precision", () => {
    const p5 = decode(encode(EIFFEL.lat, EIFFEL.lng, 5));
    const p9 = decode(encode(EIFFEL.lat, EIFFEL.lng, 9));
    expect(p9.error.lat).toBeLessThan(p5.error.lat);
    expect(p9.error.lng).toBeLessThan(p5.error.lng);
  });

  test("decoding known hash 'u09tun'", () => {
    const { lat, lng } = decode("u09tun");
    expect(lat).toBeCloseTo(EIFFEL.lat, 1);
    expect(lng).toBeCloseTo(EIFFEL.lng, 1);
  });

  test("rejects invalid character", () => {
    expect(() => decode("invalid!")).toThrow();
  });
});

describe("decodeBbox()", () => {
  test("bbox contains the center point", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    const bbox = decodeBbox(hash);
    const center = decode(hash);
    expect(center.lat).toBeGreaterThanOrEqual(bbox.minLat);
    expect(center.lat).toBeLessThanOrEqual(bbox.maxLat);
    expect(center.lng).toBeGreaterThanOrEqual(bbox.minLng);
    expect(center.lng).toBeLessThanOrEqual(bbox.maxLng);
  });

  test("bbox width/height is deterministic by precision", () => {
    const b5 = decodeBbox("u09tu");
    const b6 = decodeBbox("u09tun");
    const latSpan5 = b5.maxLat - b5.minLat;
    const latSpan6 = b6.maxLat - b6.minLat;
    expect(latSpan6).toBeLessThan(latSpan5);
  });
});

describe("neighbor()", () => {
  test("north neighbor at same precision", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    const n = neighbor(hash, "n");
    expect(n).toHaveLength(6);
    const nCenter = decode(n);
    expect(nCenter.lat).toBeGreaterThan(decode(hash).lat);
  });

  test("south neighbor is south", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    const s = neighbor(hash, "s");
    expect(decode(s).lat).toBeLessThan(decode(hash).lat);
  });

  test("east neighbor is east", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    const e = neighbor(hash, "e");
    expect(decode(e).lng).toBeGreaterThan(decode(hash).lng);
  });

  test("west neighbor is west", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    const w = neighbor(hash, "w");
    expect(decode(w).lng).toBeLessThan(decode(hash).lng);
  });
});

describe("neighbors()", () => {
  test("returns 8 distinct neighbors", () => {
    const hash = "u09tun";
    const nb = neighbors(hash);
    const all = [nb.n, nb.ne, nb.e, nb.se, nb.s, nb.sw, nb.w, nb.nw];
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8); // all unique
    // None equal the original
    all.forEach(h => expect(h).not.toBe(hash));
  });

  test("all neighbors have same precision", () => {
    const hash = "u09tun";
    const nb = neighbors(hash);
    Object.values(nb).forEach(h => expect(h).toHaveLength(6));
  });
});

describe("expand()", () => {
  test("returns 9 cells (center + 8 neighbors)", () => {
    const cells = expand("u09tun");
    expect(cells).toHaveLength(9);
    expect(cells[0]).toBe("u09tun"); // center first
  });

  test("all cells unique", () => {
    const cells = expand("u09tun");
    expect(new Set(cells).size).toBe(9);
  });
});

describe("parent() / children()", () => {
  test("parent strips last char", () => {
    expect(parent("u09tun")).toBe("u09tu");
    expect(parent("u09tu")).toBe("u09t");
  });

  test("parent rejects precision-1 hash", () => {
    expect(() => parent("u")).toThrow();
  });

  test("children returns 32 hashes at precision+1", () => {
    const c = children("u09t");
    expect(c).toHaveLength(32);
    c.forEach(h => {
      expect(h).toHaveLength(5);
      expect(h.startsWith("u09t")).toBe(true);
    });
  });

  test("children covers the parent", () => {
    const p = "u09t";
    const bbox = decodeBbox(p);
    const c = children(p);
    // All child centers should be within parent bbox
    c.forEach(h => {
      const { lat, lng } = decode(h);
      expect(lat).toBeGreaterThanOrEqual(bbox.minLat);
      expect(lat).toBeLessThanOrEqual(bbox.maxLat);
      expect(lng).toBeGreaterThanOrEqual(bbox.minLng);
      expect(lng).toBeLessThanOrEqual(bbox.maxLng);
    });
  });
});

describe("contains()", () => {
  test("center point is contained", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    expect(contains(hash, EIFFEL.lat, EIFFEL.lng)).toBe(true);
  });

  test("distant point is not contained", () => {
    const hash = encode(EIFFEL.lat, EIFFEL.lng, 6);
    expect(contains(hash, LIBERTY.lat, LIBERTY.lng)).toBe(false);
  });
});

describe("haversine()", () => {
  test("same point = 0 km", () => {
    expect(haversine(0, 0, 0, 0)).toBe(0);
  });

  test("Paris to New York ≈ 5840 km", () => {
    const dist = haversine(EIFFEL.lat, EIFFEL.lng, LIBERTY.lat, LIBERTY.lng);
    expect(dist).toBeGreaterThan(5500);
    expect(dist).toBeLessThan(6200);
  });

  test("symmetric", () => {
    const d1 = haversine(EIFFEL.lat, EIFFEL.lng, SYDNEY.lat, SYDNEY.lng);
    const d2 = haversine(SYDNEY.lat, SYDNEY.lng, EIFFEL.lat, EIFFEL.lng);
    expect(d1).toBeCloseTo(d2, 0);
  });
});

describe("distance()", () => {
  test("adjacent cells are close", () => {
    const h1 = encode(EIFFEL.lat, EIFFEL.lng, 6);
    const h2 = neighbor(h1, "n");
    expect(distance(h1, h2)).toBeLessThan(10); // within 10 km
  });

  test("cells far apart have large distance", () => {
    const h1 = encode(EIFFEL.lat, EIFFEL.lng, 5);
    const h2 = encode(SYDNEY.lat, SYDNEY.lng, 5);
    expect(distance(h1, h2)).toBeGreaterThan(10000); // >10,000 km
  });
});

describe("bboxHashes()", () => {
  test("small bbox at low precision returns non-empty", () => {
    // Small bbox around Eiffel Tower
    const hashes = bboxHashes(48.85, 2.29, 48.87, 2.30, 6);
    expect(hashes.length).toBeGreaterThan(0);
    // All hashes should overlap with the bbox
    hashes.forEach(h => {
      const bbox = decodeBbox(h);
      expect(bbox.maxLat).toBeGreaterThanOrEqual(48.85);
      expect(bbox.minLat).toBeLessThanOrEqual(48.87);
    });
  });

  test("each hash covers part of bbox", () => {
    const hashes = bboxHashes(40.68, -74.05, 40.70, -74.03, 6);
    expect(hashes.length).toBeGreaterThan(0);
  });
});

describe("Real-world: proximity search", () => {
  test("restaurants near Eiffel Tower", () => {
    const userLat = EIFFEL.lat, userLng = EIFFEL.lng;
    const precision = 7; // ~150m accuracy

    const restaurants = [
      { name: "Le Jules Verne", lat: 48.858, lng: 2.294 },     // within 200m
      { name: "Café de Flore",  lat: 48.854, lng: 2.332 },     // ~2km away
      { name: "Chez Marie",     lat: 48.860, lng: 2.296 },     // within 300m
    ];

    const userHash = encode(userLat, userLng, precision);
    const searchCells = new Set(expand(userHash));

    const nearby = restaurants.filter(r => {
      const rHash = encode(r.lat, r.lng, precision);
      return searchCells.has(rHash);
    });

    // Le Jules Verne and Chez Marie should be nearby
    expect(nearby.map(r => r.name)).toContain("Le Jules Verne");
    expect(nearby.map(r => r.name)).toContain("Chez Marie");
  });
});
