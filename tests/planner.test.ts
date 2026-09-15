import test from "node:test";
import assert from "node:assert/strict";
import {
  BriefSchema,
  defaultBrief,
  ProjectSchema,
  sampleProject,
} from "../shared/model";
import { generateProject, validateFloor } from "../shared/planner";
test("sample project validates and has no room geometry errors", () => {
  const p = ProjectSchema.parse(sampleProject());
  assert.equal(
    validateFloor(p.floors[0], p.brief).filter((c) => c.level === "error")
      .length,
    0,
  );
});
test("generation respects room counts, bounds and non-overlap across variants", () => {
  for (const bedrooms of [1, 2, 3])
    for (const variant of [0, 1, 2, 3, 4]) {
      const brief = { ...defaultBrief, bedrooms };
      const p = ProjectSchema.parse(generateProject(brief, variant));
      const checks = validateFloor(p.floors[0], brief);
      assert.equal(
        checks.filter((c) => c.level === "error").length,
        0,
        JSON.stringify(checks),
      );
      assert.equal(
        p.floors[0].rooms.filter((r) => r.type === "Bedroom").length,
        bedrooms,
      );
      assert.equal(
        p.floors[0].rooms.filter((r) => r.type === "Bathroom").length,
        1,
      );
    }
});
test("accessibility widens circulation and all generated floors have unique identifiers", () => {
  const b = { ...defaultBrief, accessibility: true, floors: 3 };
  const p = ProjectSchema.parse(generateProject(b));
  assert.equal(p.floors.length, 3);
  for (const f of p.floors) {
    assert.equal(
      Math.min(
        f.rooms.find((r) => r.type === "Hallway")!.w,
        f.rooms.find((r) => r.type === "Hallway")!.h,
      ),
      1.5,
    );
    assert.ok(f.items.filter((i) => i.type === "door").some((i) => i.w === 1));
  }
});
test("setbacks constrain the usable footprint", () => {
  const b = { ...defaultBrief, width: 16, depth: 14, setback: 2 };
  const p = generateProject(b);
  assert.equal(Math.max(...p.floors[0].rooms.map((r) => r.x + r.w)), 12);
  assert.equal(Math.max(...p.floors[0].rooms.map((r) => r.y + r.h)), 10);
});
test("infeasible envelopes and compact room programs are rejected", () => {
  assert.throws(() =>
    generateProject({ ...defaultBrief, width: 5, depth: 5, setback: 1 }),
  );
  assert.throws(() =>
    generateProject({ ...defaultBrief, bedrooms: 8, bathrooms: 5 }),
  );
  assert.throws(() =>
    generateProject({ ...defaultBrief, width: 6, depth: 6, bedrooms: 3 }),
  );
});
test("constraint checks detect edited overlaps and out-of-bounds rooms", () => {
  const p = sampleProject(),
    f = p.floors[0];
  f.rooms[1].x = 1;
  assert.ok(
    validateFloor(f, p.brief).some(
      (c) => c.title === "Room intersections" && c.level === "error",
    ),
  );
  f.rooms[0].x = -1;
  assert.ok(
    validateFloor(f, p.brief).some(
      (c) => c.title === "Building envelope" && c.level === "error",
    ),
  );
});
test("import rejects non-finite dimensions, invalid materials and duplicate IDs", () => {
  const p = sampleProject();
  p.floors[0].rooms[0].w = Infinity;
  assert.equal(ProjectSchema.safeParse(p).success, false);
  const p2 = sampleProject();
  p2.floors[0].items[1].id = p2.floors[0].items[0].id;
  assert.equal(ProjectSchema.safeParse(p2).success, false);
  assert.equal(
    BriefSchema.safeParse({ ...defaultBrief, width: 0 }).success,
    false,
  );
});
