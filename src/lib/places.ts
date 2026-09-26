// Turn "11215", "park slope", or "near union sq" into a spot on the map. No outside service:
// NYC ZIP centers come from nyc-zips.json, neighborhoods and landmarks from the list below.

import ZIPS from "./nyc-zips.json";
import type { Borough } from "./types";

export interface Place {
  lat: number;
  lng: number;
  label: string; // shown in replies: "0.6 mi from 11215"
  borough: Borough;
}

const zips = ZIPS as unknown as Record<string, [number, number, Borough]>;

// Neighborhoods and landmarks New Yorkers actually say. Coordinates are approximate centers.
const NAMED: [string[], number, number, Borough][] = [
  // Manhattan
  [["union square", "union sq"], 40.7359, -73.9911, "Manhattan"],
  [["times square", "times sq"], 40.758, -73.9855, "Manhattan"],
  [["midtown"], 40.7549, -73.984, "Manhattan"],
  [["chelsea"], 40.7465, -74.0014, "Manhattan"],
  [["greenwich village", "west village", "the village"], 40.7336, -74.0027, "Manhattan"],
  [["east village"], 40.7265, -73.9815, "Manhattan"],
  [["lower east side", "les"], 40.715, -73.9843, "Manhattan"],
  [["soho"], 40.7233, -74.003, "Manhattan"],
  [["tribeca"], 40.7163, -74.0086, "Manhattan"],
  [["financial district", "fidi", "wall street"], 40.7075, -74.0113, "Manhattan"],
  [["chinatown"], 40.7158, -73.997, "Manhattan"],
  [["upper west side", "uws"], 40.787, -73.9754, "Manhattan"],
  [["upper east side", "ues"], 40.7736, -73.9566, "Manhattan"],
  [["harlem"], 40.8116, -73.9465, "Manhattan"],
  [["east harlem", "spanish harlem"], 40.7957, -73.9389, "Manhattan"],
  [["washington heights", "wash heights"], 40.8417, -73.9394, "Manhattan"],
  [["inwood"], 40.8677, -73.9212, "Manhattan"],
  [["murray hill"], 40.7479, -73.9757, "Manhattan"],
  [["kips bay"], 40.7424, -73.978, "Manhattan"],
  [["gramercy"], 40.7368, -73.9845, "Manhattan"],
  [["flatiron"], 40.7411, -73.9897, "Manhattan"],
  [["hells kitchen", "hell's kitchen"], 40.7638, -73.9918, "Manhattan"],
  [["morningside heights", "columbia"], 40.81, -73.9625, "Manhattan"],
  [["nyu", "washington square"], 40.7308, -73.9973, "Manhattan"],
  [["penn station"], 40.7506, -73.9935, "Manhattan"],
  [["grand central"], 40.7527, -73.9772, "Manhattan"],
  // Brooklyn
  [["park slope"], 40.671, -73.9814, "Brooklyn"],
  [["williamsburg"], 40.7081, -73.9571, "Brooklyn"],
  [["greenpoint"], 40.7304, -73.9515, "Brooklyn"],
  [["bushwick"], 40.6944, -73.9213, "Brooklyn"],
  [["bed stuy", "bed-stuy", "bedford stuyvesant"], 40.6872, -73.9418, "Brooklyn"],
  [["crown heights"], 40.6694, -73.9422, "Brooklyn"],
  [["flatbush"], 40.6409, -73.9624, "Brooklyn"],
  [["downtown brooklyn"], 40.6934, -73.9867, "Brooklyn"],
  [["dumbo"], 40.7033, -73.9881, "Brooklyn"],
  [["brooklyn heights"], 40.696, -73.9936, "Brooklyn"],
  [["fort greene"], 40.6892, -73.9742, "Brooklyn"],
  [["prospect heights"], 40.6775, -73.9692, "Brooklyn"],
  [["sunset park"], 40.6454, -74.0104, "Brooklyn"],
  [["bay ridge"], 40.6264, -74.0299, "Brooklyn"],
  [["bensonhurst"], 40.6049, -73.9982, "Brooklyn"],
  [["coney island"], 40.5755, -73.9707, "Brooklyn"],
  [["brighton beach"], 40.5776, -73.9614, "Brooklyn"],
  [["red hook"], 40.6734, -74.0083, "Brooklyn"],
  [["carroll gardens"], 40.6795, -73.9991, "Brooklyn"],
  [["east new york"], 40.6663, -73.8826, "Brooklyn"],
  [["borough park", "boro park"], 40.6331, -73.9967, "Brooklyn"],
  // Queens
  [["astoria"], 40.7644, -73.9235, "Queens"],
  [["long island city", "lic"], 40.7447, -73.9485, "Queens"],
  [["sunnyside"], 40.7433, -73.9196, "Queens"],
  [["woodside"], 40.7454, -73.9053, "Queens"],
  [["jackson heights"], 40.7557, -73.8831, "Queens"],
  [["elmhurst"], 40.7362, -73.8801, "Queens"],
  [["corona"], 40.7471, -73.8603, "Queens"],
  [["flushing"], 40.7675, -73.833, "Queens"],
  [["forest hills"], 40.7196, -73.8448, "Queens"],
  [["ridgewood"], 40.7043, -73.9018, "Queens"],
  [["jamaica"], 40.7027, -73.7889, "Queens"],
  [["bayside"], 40.7686, -73.7771, "Queens"],
  [["rockaway", "far rockaway"], 40.5955, -73.7572, "Queens"],
  [["richmond hill"], 40.6958, -73.8272, "Queens"],
  [["ozone park"], 40.6794, -73.8507, "Queens"],
  // Bronx
  [["fordham"], 40.8616, -73.8904, "Bronx"],
  [["south bronx", "mott haven"], 40.8091, -73.9229, "Bronx"],
  [["riverdale"], 40.8904, -73.9121, "Bronx"],
  [["pelham bay"], 40.8526, -73.8286, "Bronx"],
  [["parkchester"], 40.8374, -73.8601, "Bronx"],
  [["hunts point"], 40.8094, -73.8803, "Bronx"],
  [["belmont", "arthur avenue"], 40.8554, -73.8886, "Bronx"],
  [["yankee stadium"], 40.8296, -73.9262, "Bronx"],
  // Staten Island
  [["st george", "st. george", "ferry terminal"], 40.6437, -74.0736, "Staten Island"],
  [["new dorp"], 40.5731, -74.1159, "Staten Island"],
  [["tottenville"], 40.5126, -74.2381, "Staten Island"],
  [["great kills"], 40.554, -74.1512, "Staten Island"],
];

// Borough centers, used only when a borough is all we know.
export const BOROUGH_PLACES: Record<Borough, Place> = {
  Manhattan: { lat: 40.7831, lng: -73.9712, label: "Manhattan", borough: "Manhattan" },
  Brooklyn: { lat: 40.6782, lng: -73.9442, label: "Brooklyn", borough: "Brooklyn" },
  Queens: { lat: 40.7282, lng: -73.7949, label: "Queens", borough: "Queens" },
  Bronx: { lat: 40.8448, lng: -73.8648, label: "the Bronx", borough: "Bronx" },
  "Staten Island": { lat: 40.5795, lng: -74.1502, label: "Staten Island", borough: "Staten Island" },
};

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function placeFromZip(zip: string): Place | null {
  const hit = zips[zip];
  return hit ? { lat: hit[0], lng: hit[1], label: zip, borough: hit[2] } : null;
}

// Finds the most specific place mentioned: a ZIP, then a neighborhood or landmark.
// Boroughs alone are not returned here (too big to measure distances from).
export function findPlace(text: string): Place | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9'. ]+/g, " ").replace(/\s+/g, " ")} `;
  for (const m of t.matchAll(/\b(1\d{4})\b/g)) {
    const p = placeFromZip(m[1]);
    if (p) return p;
  }
  let best: { place: Place; len: number } | null = null;
  for (const [names, lat, lng, borough] of NAMED) {
    for (const n of names) {
      if (t.includes(` ${n} `) && (!best || n.length > best.len)) best = { place: { lat, lng, label: title(names[0]), borough }, len: n.length };
    }
  }
  return best?.place ?? null;
}

export const isNycZip = (zip: string) => zip in zips;
