import test from "node:test";
import assert from "node:assert/strict";
import { defaultBrief, type Brief, BriefSchema } from "../shared/model";
import { generateProject, validateFloor } from "../shared/planner";
import {
  circulationChecks,
  circulationDimensions,
} from "../shared/circulation";
import { applyOperations } from "../shared/agent";

test("hallway and door width requests are generated across entrance rotations and floors", () => {
  for (const orientation of ["North", "East", "South", "West"] as const) {
    const brief: Brief = {
      ...defaultBrief,
      width: 18,
      depth: 16,
      floors: 2,
      orientation,
      circulation: { minHallwayWidth: 1.8, minDoorWidth: 1.1 },
    };
    for (const variant of [0, 1, 2])
      for (const floor of generateProject(brief, variant).floors) {
        assert.ok(
          floor.rooms
            .filter((r) => r.type === "Hallway")
            .every((r) => Math.min(r.w, r.h) >= 1.8 - 1e-7),
        );
        assert.ok(
          floor.items
            .filter((r) => r.type === "door")
            .every((r) => r.w >= 1.1 - 1e-7),
        );
        assert.ok(
          circulationChecks(floor, brief).every((c) => c.level === "pass"),
        );
        assert.equal(
          validateFloor(floor, brief).filter((c) => c.level === "error").length,
          0,
        );
      }
  }
});
test("AI cannot narrow requested circulation and manual violations remain visible", () => {
  const brief: Brief = {
    ...defaultBrief,
    circulation: { minHallwayWidth: 1.8, minDoorWidth: 1.1 },
  };
  const floor = generateProject(brief).floors[0],
    hall = floor.rooms.find((r) => r.type === "Hallway")!,
    door = floor.items.find((r) => r.type === "door")!;
  assert.throws(
    () =>
      applyOperations(
        floor,
        [{ kind: "update_room", id: hall.id, patch: { w: 1.2 } }],
        brief,
      ),
    /required circulation width/,
  );
  assert.throws(
    () =>
      applyOperations(
        floor,
        [{ kind: "update_item", id: door.id, patch: { w: 0.8 } }],
        brief,
      ),
    /required circulation width/,
  );
  const changed = structuredClone(floor);
  changed.items.find((r) => r.id === door.id)!.w = 0.8;
  assert.ok(
    validateFloor(changed, brief).some(
      (c) => c.title === "Required door width" && c.level === "error",
    ),
  );
  assert.ok(
    circulationChecks({ ...floor, rooms: [] }, brief).some(
      (c) => c.title === "Required hallway width" && c.level === "error",
    ),
  );
  assert.ok(
    circulationChecks({ ...floor, items: [] }, brief).some(
      (c) => c.title === "Required door width" && c.level === "error",
    ),
  );
});
test("mobility defaults remain minimums and wider entrance requests enlarge the hall", () => {
  assert.deepEqual(
    circulationDimensions({
      ...defaultBrief,
      accessibility: true,
      circulation: { minHallwayWidth: 0.8, minDoorWidth: 0.7 },
    }),
    { hallway: 1.5, door: 1 },
  );
  assert.deepEqual(
    circulationDimensions({
      ...defaultBrief,
      circulation: { minDoorWidth: 1.6 },
    }),
    { hallway: 1.6, door: 1.6 },
  );
  assert.equal(
    BriefSchema.safeParse({ ...defaultBrief, circulation: {} }).success,
    false,
  );
  assert.equal(
    BriefSchema.safeParse({ ...defaultBrief, circulation: { minDoorWidth: 4 } })
      .success,
    false,
  );
  assert.throws(
    () =>
      generateProject({
        ...defaultBrief,
        width: 6,
        depth: 6,
        circulation: { minHallwayWidth: 5 },
      }),
    /narrow|fit/,
  );
});
