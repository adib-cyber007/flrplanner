import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ROOM_WALL_THICKNESS,
  ROOM_WALL_THICKNESS_PRESETS,
  makeRoom,
  makeItem,
  FloorSchema,
  type Floor,
} from "../shared/model";
import {
  wallSegments,
  wallOpenings,
  canWalkTo,
  roomInteriorDimensions,
} from "../shared/geometry";
import { geometryLockIssue, snapOpening } from "../shared/editing";
import { exportDXF } from "../shared/export";

const nested = (): Floor => ({
  id: "floor",
  name: "Nested rooms",
  items: [],
  walls: [],
  rooms: [
    { ...makeRoom("Living room", 0, 0, 8, 6), wallThickness: 0.2 },
    { ...makeRoom("Bathroom", 2, 0, 3, 2), wallThickness: 0.4 },
  ],
});
const boundary = (floor: Floor, axis: "h" | "v", at: number) =>
  wallSegments(floor).filter(
    (wall) => wall.boundaryAxis === axis && wall.boundaryAt === at,
  );
test("nested rooms merge only the overlapping portion, using the thicker wall", () => {
  const floor = nested();
  const top = boundary(floor, "h", 0);
  assert.deepEqual(
    top.map((s) => [s.x1, s.x2, s.thickness]),
    [
      [0, 2, 0.2],
      [2, 5, 0.4],
      [5, 8, 0.2],
    ],
  );
  assert.equal(boundary(floor, "h", 2)[0]?.thickness, 0.4);
  floor.rooms.reverse();
  assert.deepEqual(boundary(floor, "h", 0), top);
  floor.rooms[0].wallThickness = 0.1;
  assert.deepEqual(
    boundary(floor, "h", 0).map((s) => [s.x1, s.x2, s.thickness]),
    [[0, 8, 0.2]],
  );
});
test("three coincident sides and nested corner walls are never added together", () => {
  const floor = nested();
  floor.rooms[1] = { ...makeRoom("Bathroom", 0, 0, 8, 2), wallThickness: 0.1 };
  floor.rooms.push({ ...makeRoom("Utility", 0, 0, 2, 1), wallThickness: 0.3 });
  assert.deepEqual(
    boundary(floor, "v", 0).map((s) => [s.y1, s.y2, s.thickness]),
    [
      [0, 1, 0.3],
      [1, 6, 0.2],
    ],
  );
  assert.deepEqual(
    boundary(floor, "v", 8).map((s) => [s.y1, s.y2, s.thickness]),
    [[0, 6, 0.2]],
  );
});
test("old plans retain default walls; thickness validates, persists and respects locks", () => {
  const floor = nested();
  delete floor.rooms[0].wallThickness;
  const parsed = FloorSchema.parse(JSON.parse(JSON.stringify(floor)));
  assert.equal(parsed.rooms[1].wallThickness, 0.4);
  assert.equal(
    boundary(parsed, "h", 6)[0]?.thickness,
    DEFAULT_ROOM_WALL_THICKNESS,
  );
  assert.equal(DEFAULT_ROOM_WALL_THICKNESS, 0.1143);
  assert.deepEqual(
    ROOM_WALL_THICKNESS_PRESETS.map((preset) => preset.meters),
    [0.1143, 0.2286],
  );
  for (const thickness of [0, -1, 1.1, NaN]) {
    assert.equal(
      FloorSchema.safeParse({
        ...floor,
        rooms: [{ ...floor.rooms[0], wallThickness: thickness }],
      }).success,
      false,
    );
  }
  floor.rooms[0].geometryLocked = true;
  const changed = structuredClone(floor);
  changed.rooms[0].wallThickness = 0.3;
  assert.match(geometryLockIssue(floor, changed)!, /locked geometry/);
  assert.ok(exportDXF(parsed).includes("20\n-0.4"));
});
test("room dimensions include walls and report the remaining clear interior", () => {
  const floor = nested();
  const outer = roomInteriorDimensions(floor, floor.rooms[0]);
  const expected = {
    width: 7.6,
    depth: 5.4,
    area: 41.04,
    left: 0.2,
    right: 0.2,
    top: 0.4,
    bottom: 0.2,
  };
  for (const key of Object.keys(expected) as (keyof typeof expected)[])
    assert.ok(Math.abs(outer[key] - expected[key]) < 1e-9);
  const inner = roomInteriorDimensions(floor, floor.rooms[1]);
  assert.ok(Math.abs(inner.width - 2.2) < 1e-9);
  assert.ok(Math.abs(inner.depth - 1.2) < 1e-9);

  const adjacent: Floor = {
    id: "adjacent",
    name: "Adjacent",
    items: [],
    walls: [],
    rooms: [makeRoom("Bedroom", 0, 0, 3, 3), makeRoom("Bedroom", 3, 0, 3, 3)],
  };
  const clear = roomInteriorDimensions(adjacent, adjacent.rooms[0]);
  assert.ok(
    Math.abs(clear.width - (3 - DEFAULT_ROOM_WALL_THICKNESS * 1.5)) < 1e-9,
  );
});
test("door snapping and walkthrough stay continuous across a thickness transition", () => {
  const floor = nested();
  // The thicker bottom boundary of a nested room ends along a larger room's bottom wall.
  floor.rooms = [
    { ...makeRoom("Living room", 0, 0, 8, 6), wallThickness: 0.2 },
    { ...makeRoom("Bathroom", 0, 0, 2, 6), wallThickness: 0.4 },
  ];
  const door = makeItem("door", 1.5, 5.8, { w: 1.2 });
  const snapped = snapOpening(floor, door);
  assert.ok(
    wallSegments(floor).some((wall) => wallOpenings(wall, [snapped]).length),
  );
  // Remove the perpendicular partition for this passage check by making the
  // thick room finish elsewhere, leaving a thickness boundary at x=2.
  floor.rooms[1] = { ...makeRoom("Bathroom", 0, 6, 2, 2), wallThickness: 0.4 };
  floor.items = [snapped, makeItem("door", 2, 6, { rotation: 90, w: 1.2 })];
  assert.equal(canWalkTo(2.5, 5.75, floor), true);
  floor.items = [];
  assert.equal(canWalkTo(2.5, 5.75, floor), false);
});
