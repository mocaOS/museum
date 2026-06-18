// Deterministic regression harness for the museum guide's spatial awareness.
//
// The guide resolves WHERE the visitor is standing (which room) and WHAT they
// are looking at (which hung work) entirely in-world, from a baked world map,
// BEFORE it ever calls the MOCA API — so this pure JS math is the whole
// behaviour and is fully coverable offline. We exercise the REAL shipped code:
//   1. buildGuideSpatialMap()  — the exported map baker (imported directly).
//   2. resolveRoom/resolveFocus — sliced verbatim out of the generated guide
//      script template, so a drift in the shipped resolver is caught here.
//
// Run: node apps/hyperfy/test/spatial-awareness.test.mjs
//
// Twins: apps/hyperfy/lib/guide-script.mjs ↔
//        apps/museum/src/lib/museum/hyperfy/guide-script.ts (byte-identical
//        template body — verified separately). This harness pins the .mjs twin.

import { buildGuideSpatialMap, generateGuideScript } from "../lib/guide-script.mjs";

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.error(`  FAIL ${name}`); }
}
function eq(name, got, want) { check(`${name} (got ${JSON.stringify(got)})`, got === want); }

// --- Fixture: a big room next to a small room (the "previous room" trap), a
// work hung on the big room's east wall, a work on the small room's west wall
// (the through-wall focus trap), and a rotated room (the corner-miss trap). ---
//
// Builder units: BUILDER_TILE = 8, tileMeters = 16 → k = 2. A room's world
// half-extent = tileMeters * scale / 2. groundOffset [0,0,0] keeps entity
// origin == tile center so work world coords are easy to reason about.
const TILE_METERS = 16;

const exhibition = {
  placements: [
    {
      // BIG room A: center (0,0), scale 2 → half-extent 16m, axis-aligned.
      uid: "roomA",
      position: [0, 0, 0],
      rotationY: 0,
      scale: 2,
      room: { title: "Great Hall", footprint: 8, groundOffset: [0, 0, 0] },
      // rootScale = tileMeters/footprint * scale = 16/8 * 2 = 4.
      // Slot at local x=2.5 → world x = 4 * 2.5 = 10 (east of center, on +X wall).
      slots: [{ id: "A1", position: [2.5, 1.5, 0] }],
      artworks: [{ id: 101, slotId: "A1", name: "Aurora", artist: "Vera Molnar" }],
    },
    {
      // SMALL room B: center (24,0), scale 0.5 → half-extent 4m. Its CENTER is
      // nearer to room A's far corner (15,15) than room A's center is — the exact
      // shape that made the old inscribed-circle test fall back to the wrong room.
      uid: "roomB",
      position: [12, 0, 0], // *k(2) = world x 24
      rotationY: 0,
      scale: 0.5,
      room: { title: "Cabinet", footprint: 8, groundOffset: [0, 0, 0] },
      // rootScale = 16/8 * 0.5 = 1. Slot at local x=-4 → world x = 24 - 4 = 20
      // (room B's WEST wall, facing back toward room A across the gap).
      slots: [{ id: "B1", position: [-4, 1.5, 0] }],
      artworks: [{ id: 201, slotId: "B1", name: "Vitrine", artist: "Anon" }],
    },
    {
      // ROTATED room C: center (0,-40), scale 2 → half-extent 16m, rotated 45°.
      uid: "roomC",
      position: [0, 0, -20], // *k(2) = world z -40
      rotationY: Math.PI / 4,
      scale: 2,
      room: { title: "Skew Room", footprint: 8, groundOffset: [0, 0, 0] },
      slots: [],
      artworks: [],
    },
  ],
};

const map = buildGuideSpatialMap(exhibition, TILE_METERS);

// --- Extract the REAL resolvers from the generated script template ---------
const script = generateGuideScript({
  exhibitionId: "test-exhibition",
  exhibitionName: "Spatial Test",
  spatialMap: map,
});

const spatialMatch = script.match(/const SPATIAL = (.+)/);
if (!spatialMatch) throw new Error("could not find `const SPATIAL =` in generated script");
const spatialJson = spatialMatch[1];

const startIdx = script.indexOf("const FOCUS_RANGE = 6");
const endIdx = script.indexOf("// ---------------------------------------------------------------- server ----");
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  throw new Error("could not slice resolveRoom/resolveFocus out of generated script");
}
const resolversSrc = script.slice(startIdx, endIdx);

// Eval the resolvers against the injected SPATIAL — nothing else in scope but
// SPATIAL + Math, proving they are self-contained client-side logic.
// eslint-disable-next-line no-new-func
const { resolveRoom, resolveFocus, SPATIAL } = new Function(
  `const SPATIAL = ${spatialJson};\n${resolversSrc}\nreturn { resolveRoom, resolveFocus, SPATIAL };`,
)();

// --- Sanity: the baked map ------------------------------------------------
console.log("\n[map baking]");
const A = map.rooms.find((r) => r.uid === "roomA");
const B = map.rooms.find((r) => r.uid === "roomB");
const C = map.rooms.find((r) => r.uid === "roomC");
eq("roomA half-extent hx", A.hx, 16);
eq("roomA center x", A.x, 0);
eq("roomB center x", B.x, 24);
eq("roomB half-extent hx", B.hx, 4);
eq("roomC rotation baked", Math.round(C.rot * 1000), Math.round((Math.PI / 4) * 1000));
const workA = map.works.find((w) => w.id === 101);
const workB = map.works.find((w) => w.id === 201);
eq("workA world x (east wall of A)", workA.x, 10);
eq("workB world x (west wall of B)", workB.x, 20);
check("template re-injected the same SPATIAL", SPATIAL.rooms.length === 3 && SPATIAL.works.length === 2);

// --- resolveRoom: the "previous room" regression --------------------------
console.log("\n[resolveRoom — point-in-rotated-rectangle, not inscribed circle]");
// Corner of big room A. Outside A's inscribed circle (dist 21.2 > r 16), and
// room B's CENTER is nearer (17.5) — the old circle+nearest logic returned B.
const cornerDistA = Math.hypot(15, 15);
const cornerDistB = Math.hypot(24 - 15, 15);
check(`fixture is the trap: B center nearer (${cornerDistB.toFixed(1)} < ${cornerDistA.toFixed(1)}) yet point is in A`,
  cornerDistB < cornerDistA && cornerDistA > A.r);
eq("corner of big room resolves to roomA, not the nearer small room", resolveRoom(15, 15)?.uid, "roomA");
eq("dead center of A resolves to roomA", resolveRoom(0, 0)?.uid, "roomA");
eq("inside small room B resolves to roomB", resolveRoom(24, 2)?.uid, "roomB");
// Just outside a room but within the nearest-fallback cap → that room (so a
// visitor a step outside a doorway is still "in" it, not nowhere).
eq("just outside small room B (within cap) falls back to roomB", resolveRoom(18, 0)?.uid, "roomB");
// Far empty space (200m out, beyond every room's cap) → no room at all.
eq("far empty space resolves to no room", resolveRoom(0, -200) ?? null, null);

// Rotated room C: a point in the rotated rectangle's corner (along the rotated
// axis) is inside; the same offset perpendicular pokes outside the footprint.
console.log("\n[resolveRoom — rotated footprint]");
const ax = Math.cos(Math.PI / 4) * 15; // 15m out along the room's local +x axis
const az = -40 + Math.sin(Math.PI / 4) * 15;
eq("point along roomC's rotated axis is inside roomC", resolveRoom(ax, az)?.uid, "roomC");

// --- resolveFocus: gaze + room scoping ------------------------------------
console.log("\n[resolveFocus — facing dominates, scoped to current room]");
// Visitor in room A at (6,0), workA is at (10,0). Facing +X (toward it).
eq("facing the work in this room → that work", resolveFocus(6, 0, 1.5, "roomA", 1, 0)?.id, 101);
// Same spot, facing -X (away) → the work is behind → excluded → no focus.
eq("facing AWAY from the only work → no focus", resolveFocus(6, 0, 1.5, "roomA", -1, 0), null);
// Through-wall trap: visitor near A's east edge at (15,0) facing +X toward
// room B's west-wall work at (20,0), 5m ahead. Scoped to roomA, B's work is NOT
// a candidate (it's through the wall); A's work at (10,0) is behind → no focus.
eq("looking through a wall at the next room's work → not picked (room-scoped)",
  resolveFocus(15, 0, 1.5, "roomA", 1, 0), null);
// Standing in room B looking at B's work → picked.
eq("in room B facing its work → that work", resolveFocus(24, 0, 1.5, "roomB", -1, 0)?.id, 201);

// Dead-ahead beats a closer side work: put the visitor where workA is ahead and
// confirm a sideways angle (dot below the -0.15 behind-cutoff but low) is gated.
console.log("\n[resolveFocus — behind cutoff]");
// 30° behind (dot ≈ -0.5) is excluded; ~80° to the side (dot ≈ +0.17) is kept.
eq("work ~30° behind is excluded", resolveFocus(6, 0, 1.5, "roomA", -0.87, 0.5), null);
check("work well off to the side but ahead is still eligible",
  resolveFocus(6, 0, 1.5, "roomA", 0.17, 0.98)?.id === 101);

// --- Y / floor discounting ------------------------------------------------
console.log("\n[resolveFocus — different floor]");
// Same XZ + facing, but the visitor is 10m above the work's Y (a floor up).
// Still resolves (it's the only candidate) but is the documented soft penalty,
// not a hard exclude — so a single-work room never goes blank.
eq("a floor above the only work still resolves it (soft penalty)",
  resolveFocus(6, 0, 11.5, "roomA", 1, 0)?.id, 101);

// --- Summary --------------------------------------------------------------
console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
