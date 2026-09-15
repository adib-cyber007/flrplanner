import test from "node:test";
import assert from "node:assert/strict";
import { defaultBrief, BriefSchema, type Brief } from "../shared/model";
import { generateProject, validateFloor } from "../shared/planner";
import { applyOperations } from "../shared/agent";
import { roomSizeChecks } from "../shared/roomSizes";
import { intakeIssues } from "../shared/requirements";
import { explicitConstraints } from "../shared/intent";

test("minimum width, depth and area are satisfied on every floor and entrance rotation", () => {
  for (const orientation of ["North", "East", "South", "West"] as const) {
    const brief: Brief = {
      ...defaultBrief,
      width: 18,
      depth: 16,
      floors: 2,
      orientation,
      roomSizeRules: [
        { roomType: "Bedroom", minWidth: 4, minDepth: 3.2, minArea: 16 },
        { roomType: "Kitchen", minArea: 14 },
      ],
    };
    for (const variant of [0, 1, 2]) {
      const p = generateProject(brief, variant);
      for (const f of p.floors) {
        assert.equal(
          validateFloor(f, brief).filter((c) => c.level === "error").length,
          0,
          JSON.stringify(validateFloor(f, brief)),
        );
        assert.equal(
          roomSizeChecks(f, brief).filter((c) => c.level === "pass").length,
          2,
        );
      }
    }
  }
});
test("layout search shifts the hall to accommodate a wider room", () => {
  const brief: Brief = {
    ...defaultBrief,
    width: 14,
    depth: 16,
    roomSizeRules: [{ roomType: "Living room", minWidth: 8 }],
  };
  const floor = generateProject(brief).floors[0];
  assert.ok(floor.rooms.find((r) => r.type === "Living room")!.w >= 8);
  assert.equal(
    validateFloor(floor, brief).filter((c) => c.level === "error").length,
    0,
  );
});
test("impossible and missing-room requirements are not silently discarded", () => {
  assert.throws(
    () =>
      generateProject({
        ...defaultBrief,
        roomSizeRules: [{ roomType: "Bedroom", minWidth: 50 }],
      }),
    /could not fit/,
  );
  const b: Brief = {
    ...defaultBrief,
    roomSizeRules: [{ roomType: "Office", minArea: 10 }],
  };
  assert.ok(intakeIssues(b).some((i) => i.includes("not in your program")));
  assert.throws(() => generateProject(b), /No Office/);
  assert.equal(
    BriefSchema.safeParse({ ...b, roomSizeRules: [{ roomType: "Bedroom" }] })
      .success,
    false,
  );
  assert.equal(
    BriefSchema.safeParse({
      ...b,
      roomSizeRules: [
        { roomType: "Bedroom", minWidth: 3 },
        { roomType: "Bedroom", minDepth: 4 },
      ],
    }).success,
    false,
  );
});
test("manual violations appear in checks and AI proposals cannot shrink below minimums", () => {
  const brief: Brief = {
    ...defaultBrief,
    width: 18,
    depth: 16,
    roomSizeRules: [{ roomType: "Bedroom", minWidth: 4, minArea: 12 }],
  };
  const f = generateProject(brief).floors[0],
    room = f.rooms.find((r) => r.type === "Bedroom")!;
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "update_room", id: room.id, patch: { w: 3 } }],
        brief,
      ),
    /violates a required room size/,
  );
  assert.ok(room.w >= 4);
  const changed = structuredClone(f);
  changed.rooms.find((r) => r.id === room.id)!.w = 3;
  assert.ok(
    validateFloor(changed, brief).some(
      (c) => c.title === "Bedroom size requirement" && c.level === "error",
    ),
  );
});
test("room dimensions never overwrite plot dimensions in numeric grounding", () => {
  assert.equal(
    explicitConstraints("Make the kitchen at least 4 by 3 meters", defaultBrief)
      .width,
    undefined,
  );
  const result = explicitConstraints(
    "A kitchen at least 4 by 3 meters on an 18 by 14 meter plot",
    defaultBrief,
  );
  assert.equal(result.width, 18);
  assert.equal(result.depth, 14);
});

test("exact room dimensions and maximum areas survive every entrance rotation and variant", () => {
  for (const orientation of ["North", "East", "South", "West"] as const) {
    const brief: Brief = {
      ...defaultBrief,
      width: 18,
      depth: 16,
      floors: 2,
      orientation,
      extras: [
        ...new Set([...defaultBrief.extras, "Office"]),
      ] as Brief["extras"],
      roomSizeRules: [
        {
          roomType: "Office",
          minWidth: 3,
          maxWidth: 3,
          minDepth: 4,
          maxDepth: 4,
        },
        { roomType: "Bedroom", maxArea: 16 },
      ],
    };
    for (const variant of [0, 1, 2]) {
      const project = generateProject(brief, variant);
      for (const floor of project.floors) {
        const office = floor.rooms.find((r) => r.type === "Office")!;
        assert.ok(
          Math.abs(office.w - 3) < 1e-7 && Math.abs(office.h - 4) < 1e-7,
        );
        assert.ok(
          floor.rooms
            .filter((r) => r.type === "Bedroom")
            .every((r) => r.w * r.h <= 16 + 1e-7),
        );
        assert.ok(
          roomSizeChecks(floor, brief).every((c) => c.level === "pass"),
        );
        assert.equal(
          validateFloor(floor, brief).filter((c) => c.level === "error").length,
          0,
        );
      }
    }
  }
});

test("exact areas leave excess footprint unallocated instead of stretching capped rooms", () => {
  const brief: Brief = {
    ...defaultBrief,
    width: 16,
    depth: 16,
    floors: 1,
    floorPrograms: [{ floor: 0, rooms: [{ type: "Office", count: 2 }] }],
    roomSizeRules: [{ roomType: "Office", minArea: 12, maxArea: 12 }],
  };
  const floor = generateProject(brief).floors[0];
  assert.ok(
    floor.rooms
      .filter((r) => r.type === "Office")
      .every((r) => Math.abs(r.w * r.h - 12) < 1e-7),
  );
  assert.ok(floor.rooms.reduce((sum, r) => sum + r.w * r.h, 0) < 16 * 16);
});

test("contradictory ranges are rejected and AI cannot enlarge a room beyond its maximum", () => {
  for (const rule of [
    { roomType: "Bedroom", minWidth: 4, maxWidth: 3 },
    { roomType: "Bedroom", minArea: 20, maxArea: 16 },
    { roomType: "Bedroom", minWidth: 4, minDepth: 5, maxArea: 16 },
    { roomType: "Bedroom", maxWidth: 3, maxDepth: 4, minArea: 16 },
  ])
    assert.equal(
      BriefSchema.safeParse({ ...defaultBrief, roomSizeRules: [rule] }).success,
      false,
    );
  const brief: Brief = {
    ...defaultBrief,
    roomSizeRules: [{ roomType: "Bedroom", maxArea: 16 }],
  };
  const floor = generateProject(brief).floors[0],
    bedroom = floor.rooms.find((r) => r.type === "Bedroom")!;
  assert.throws(
    () =>
      applyOperations(
        floor,
        [{ kind: "update_room", id: bedroom.id, patch: { h: 20 / bedroom.w } }],
        brief,
      ),
    /required room size/,
  );
  const changed = structuredClone(floor);
  changed.rooms.find((r) => r.id === bedroom.id)!.h = 20 / bedroom.w;
  assert.ok(roomSizeChecks(changed, brief).some((c) => c.level === "error"));
});
