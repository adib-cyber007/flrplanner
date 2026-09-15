import test from "node:test";
import assert from "node:assert/strict";
import { defaultBrief, makeRoom, makeItem, type Floor } from "../shared/model";
import { doorwayAccess, doorwayChecks } from "../shared/access";
import { generateProject, validateFloor } from "../shared/planner";
import { applyOperations } from "../shared/agent";
const fixture = (): Floor => ({
  id: "access",
  name: "Access test",
  walls: [],
  rooms: [makeRoom("Living room", 0, 0, 4, 4), makeRoom("Bedroom", 4, 0, 4, 4)],
  items: [
    makeItem("door", 1, 0, { name: "Entrance" }),
    makeItem("door", 4, 1, { name: "Bedroom door", rotation: 90 }),
  ],
});
test("generated rooms connect to an exterior door across every entrance direction and floor", () => {
  for (const orientation of ["North", "East", "South", "West"] as const)
    for (const variant of [0, 1, 2]) {
      const p = generateProject(
        { ...defaultBrief, width: 18, depth: 16, floors: 2, orientation },
        variant,
      );
      for (const floor of p.floors) {
        assert.equal(doorwayAccess(floor).unreachable.length, 0);
        assert.equal(doorwayChecks(floor)[0].level, "pass");
      }
    }
});
test("windows, floating doors and corner overlaps do not create a doorway route", () => {
  const floor = fixture();
  assert.equal(doorwayAccess(floor).reachable.size, 2);
  const connection = floor.items[1];
  for (const substitute of [
    makeItem("window", 3.925, 1, { w: 0.15, h: 1 }),
    { ...connection, x: 4.5 },
    { ...connection, y: 3.8 },
  ]) {
    const changed = { ...floor, items: [floor.items[0], substitute] };
    assert.deepEqual(
      doorwayAccess(changed).unreachable.map((r) => r.id),
      [floor.rooms[1].id],
    );
    assert.ok(
      validateFloor(changed, defaultBrief).some(
        (c) => c.title === "Doorway connections" && c.level === "error",
      ),
    );
  }
  const withOpening = {
    ...floor,
    items: [floor.items[0], makeItem("opening", 3.925, 1, { w: 0.15, h: 1 })],
  };
  assert.equal(doorwayAccess(withOpening).reachable.size, 2);
});
test("AI cannot remove the only entrance or room access but can replace a doorway atomically", () => {
  const floor = fixture(),
    before = JSON.stringify(floor);
  for (const door of floor.items)
    assert.throws(
      () =>
        applyOperations(
          floor,
          [{ kind: "remove", target: "item", id: door.id }],
          defaultBrief,
        ),
      /without a doorway connection/,
    );
  const changed = applyOperations(
    floor,
    [
      { kind: "remove", target: "item", id: floor.items[1].id },
      {
        kind: "add_item",
        type: "door",
        x: 4,
        y: 2,
        w: 0.9,
        h: 0.9,
        rotation: 90,
      },
    ],
    defaultBrief,
  ).floor;
  assert.equal(doorwayAccess(changed).unreachable.length, 0);
  assert.equal(JSON.stringify(floor), before);
});
test("existing disconnected rooms remain repairable and partitions prevent a full pass claim", () => {
  const floor = fixture();
  floor.items.pop();
  const result = applyOperations(
    floor,
    [
      {
        kind: "update_room",
        id: floor.rooms[1].id,
        patch: { name: "Guest room" },
      },
    ],
    defaultBrief,
  );
  assert.ok(result.warnings.some((w) => w.includes("Doorway connections")));
  const repaired = applyOperations(
    floor,
    [
      {
        kind: "add_item",
        type: "door",
        x: 4,
        y: 2,
        w: 0.9,
        h: 0.9,
        rotation: 90,
      },
    ],
    defaultBrief,
  ).floor;
  assert.equal(doorwayAccess(repaired).unreachable.length, 0);
  repaired.walls.push({
    id: "partition",
    x1: 2,
    y1: 0,
    x2: 2,
    y2: 4,
    thickness: 0.12,
  });
  assert.equal(doorwayChecks(repaired)[0].level, "warning");
});
