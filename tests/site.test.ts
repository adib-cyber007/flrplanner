import test from "node:test";
import assert from "node:assert/strict";
import {
  BriefSchema,
  defaultBrief,
  ProjectSchema,
  type Brief,
} from "../shared/model";
import { siteEnvelope } from "../shared/site";
import { generateProject, validateFloor } from "../shared/planner";
import { applyOperations } from "../shared/agent";
import {
  intakeIssues,
  approveRequirements,
  emptyRequirements,
  requirementTopics,
  readyToGenerate,
} from "../shared/requirements";

test("per-side setbacks override uniform clearance and retain their compass sides", () => {
  const brief: Brief = {
    ...defaultBrief,
    width: 18,
    depth: 16,
    setback: 5,
    sideSetbacks: { north: 3, east: 2, south: 3, west: 4 },
  };
  assert.deepEqual(siteEnvelope(brief), {
    width: 12,
    depth: 10,
    x: 4,
    y: 3,
    setbacks: brief.sideSetbacks,
  });
  for (const orientation of ["North", "East", "South", "West"] as const) {
    const b = { ...brief, orientation };
    const p = ProjectSchema.parse(generateProject(b));
    const f = p.floors[0];
    assert.equal(
      validateFloor(f, b).filter((c) => c.level === "error").length,
      0,
    );
    assert.ok(Math.abs(Math.max(...f.rooms.map((r) => r.x + r.w)) - 12) < 1e-8);
    assert.ok(Math.abs(Math.max(...f.rooms.map((r) => r.y + r.h)) - 10) < 1e-8);
    for (const room of f.rooms) {
      assert.ok(room.x + 4 >= 4 - 1e-8);
      assert.ok(room.x + room.w + 4 <= 18 - 2 + 1e-8);
      assert.ok(room.y + room.h + 3 <= 16 - 3 + 1e-8);
    }
  }
});
test("legacy uniform projects stay compatible and clearing overrides restores uniform setbacks", () => {
  const b = { ...defaultBrief, width: 16, depth: 14, setback: 2 };
  assert.equal(siteEnvelope(BriefSchema.parse(b)).width, 12);
  assert.equal(siteEnvelope({ ...b, sideSetbacks: null }).depth, 10);
  assert.equal(
    BriefSchema.safeParse({ ...b, sideSetbacks: { north: 1 } }).success,
    false,
  );
  assert.equal(
    BriefSchema.safeParse({
      ...b,
      sideSetbacks: { north: -1, east: 0, south: 0, west: 0 },
    }).success,
    false,
  );
});

test("AI edits cannot place rooms inside the required site clearances", () => {
  const b: Brief = {
    ...defaultBrief,
    width: 18,
    depth: 16,
    sideSetbacks: { north: 3, east: 2, south: 3, west: 4 },
  };
  const f = generateProject(b).floors[0],
    room = f.rooms.find((r) => r.type === "Bedroom")!;
  const original = structuredClone(f);
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "update_room", id: room.id, patch: { x: 12 } }],
        b,
      ),
    /exceeds the plot/,
  );
  assert.deepEqual(f, original);
});
test("impossible side clearances block generation and changing a side invalidates review", () => {
  const b: Brief = {
    ...defaultBrief,
    sideSetbacks: { north: 6, south: 5, east: 0, west: 0 },
  };
  assert.ok(intakeIssues(b).includes("The setbacks leave no buildable area."));
  assert.throws(() => generateProject(b), /less than 5 m/);
  const approved = approveRequirements({
    ...defaultBrief,
    sideSetbacks: { north: 1, east: 1, south: 1, west: 1 },
    requirements: {
      ...emptyRequirements(),
      coreConfirmed: true,
      assumptionsAccepted: true,
      responses: requirementTopics.map((t) => ({
        key: t.key,
        status: "unknown",
        details: "",
        priority: "preference",
      })),
    },
  });
  assert.equal(readyToGenerate(approved), true);
  assert.equal(
    readyToGenerate({
      ...approved,
      sideSetbacks: { ...approved.sideSetbacks!, west: 2 },
    }),
    false,
  );
});
