import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBrief,
  makeRoom,
  BriefSchema,
  type Brief,
} from "../shared/model";
import { generateProject, validateFloor } from "../shared/planner";
import { applyOperations } from "../shared/agent";
import {
  arrangeBanks,
  relationshipChecks,
  relationshipIssues,
  sharedWallLength,
} from "../shared/relationships";

test("generated rooms satisfy adjacent and separate rules in every entrance orientation", () => {
  for (const orientation of ["North", "East", "South", "West"] as const) {
    const brief: Brief = {
      ...defaultBrief,
      width: 18,
      depth: 14,
      orientation,
      extras: ["Dining room", "Office"],
      roomRelationships: [
        { a: "Kitchen", b: "Dining room", relation: "adjacent" },
        { a: "Bedroom", b: "Kitchen", relation: "separate" },
        { a: "Office", b: "Bedroom", relation: "adjacent" },
      ],
    };
    for (const variant of [0, 1, 2]) {
      const f = generateProject(brief, variant).floors[0];
      assert.equal(
        relationshipChecks(f, brief).filter((c) => c.level === "pass").length,
        3,
      );
      assert.equal(
        validateFloor(f, brief).filter((c) => c.level === "error").length,
        0,
      );
    }
  }
});
test("a corner contact is not adjacency, and AI edits cannot break a required relationship", () => {
  const a = makeRoom("Kitchen", 0, 0, 3, 3),
    b = makeRoom("Dining room", 3, 3, 3, 3);
  assert.equal(sharedWallLength(a, b), 0);
  const brief: Brief = {
    ...defaultBrief,
    width: 18,
    depth: 14,
    roomRelationships: [
      { a: "Kitchen", b: "Dining room", relation: "adjacent" },
    ],
  };
  const f = generateProject(brief).floors[0],
    dining = f.rooms.find((r) => r.type === "Dining room")!;
  const before = structuredClone(f);
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "remove", target: "room", id: dining.id }],
        brief,
      ),
    /required room relationship/,
  );
  assert.deepEqual(f, before);
});
test("missing co-located types and contradictory pairs cannot pass requirement validation", () => {
  const brief: Brief = {
    ...defaultBrief,
    extras: [],
    roomRelationships: [{ a: "Kitchen", b: "Office", relation: "adjacent" }],
  };
  assert.equal(relationshipIssues(brief).length, 1);
  assert.throws(() => generateProject(brief), /room lists cannot support/);
  assert.equal(
    BriefSchema.safeParse({
      ...brief,
      roomRelationships: [
        { a: "Kitchen", b: "Bedroom", relation: "adjacent" },
        { a: "Bedroom", b: "Kitchen", relation: "separate" },
      ],
    }).success,
    false,
  );
  assert.equal(
    arrangeBanks(
      [{ type: "Kitchen" }, { type: "Dining room" }, { type: "Living room" }],
      [],
      [
        { a: "Kitchen", b: "Dining room", relation: "adjacent" },
        { a: "Dining room", b: "Living room", relation: "adjacent" },
        { a: "Living room", b: "Kitchen", relation: "adjacent" },
      ],
    ),
    null,
  );
});
test("separation can be satisfied by putting room types on different floors", () => {
  const brief: Brief = {
    ...defaultBrief,
    floors: 2,
    floorPrograms: [
      { floor: 0, rooms: [{ type: "Kitchen", count: 1 }] },
      { floor: 1, rooms: [{ type: "Bedroom", count: 1 }] },
    ],
    roomRelationships: [{ a: "Kitchen", b: "Bedroom", relation: "separate" }],
  };
  assert.deepEqual(relationshipIssues(brief), []);
  assert.equal(generateProject(brief).floors.length, 2);
});
