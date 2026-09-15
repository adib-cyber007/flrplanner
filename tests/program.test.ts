import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBrief,
  BriefSchema,
  ProjectSchema,
  type Brief,
} from "../shared/model";
import { generateProject, validateFloor } from "../shared/planner";
import { floorProgram } from "../shared/program";
import { explicitConstraints } from "../shared/intent";
import { constraintsFromAnswers } from "../shared/interview";
import { emptyRequirements, intakeIssues } from "../shared/requirements";

function splitBrief(): Brief {
  return {
    ...defaultBrief,
    width: 18,
    depth: 14,
    floors: 2,
    floorPrograms: [
      {
        floor: 0,
        rooms: [
          { type: "Living room", count: 1 },
          { type: "Kitchen", count: 1 },
          { type: "Office", count: 1 },
          { type: "Bathroom", count: 1 },
        ],
      },
      {
        floor: 1,
        rooms: [
          { type: "Bedroom", count: 3 },
          { type: "Bathroom", count: 2 },
        ],
      },
    ],
    roomSizeRules: [
      { roomType: "Bedroom", minWidth: 3, minDepth: 3, minArea: 12 },
    ],
  };
}
test("each floor receives exactly its own room program for every entrance orientation", () => {
  for (const orientation of ["North", "East", "South", "West"] as const) {
    const brief = { ...splitBrief(), orientation };
    const p = ProjectSchema.parse(generateProject(brief));
    for (const [index, floor] of p.floors.entries()) {
      assert.equal(floor.programIndex, index);
      const actual = floor.rooms
        .filter((r) => r.type !== "Hallway")
        .map((r) => r.type)
        .sort();
      const expected = floorProgram(brief, index)
        .rooms.flatMap((r) => Array(r.count).fill(r.type))
        .sort();
      assert.deepEqual(actual, expected);
      assert.equal(
        validateFloor(floor, brief).filter((c) => c.level === "error").length,
        0,
      );
    }
  }
});
test("missing floors, empty programs and invalid counts cannot be generated", () => {
  const b = splitBrief();
  b.floorPrograms!.pop();
  assert.throws(() => generateProject(b), /Floor 2/);
  assert.ok(intakeIssues(b).some((i) => i.startsWith("Floor 2")));
  b.floorPrograms![0].rooms = [];
  assert.throws(() => generateProject(b), /Floor 1/);
  const invalid = splitBrief();
  invalid.floorPrograms![0].rooms[0].count = -1;
  assert.equal(BriefSchema.safeParse(invalid).success, false);
});
test("one-floor custom programs can omit default living and kitchen rooms", () => {
  const p = generateProject({
    ...defaultBrief,
    floorPrograms: [{ floor: 0, rooms: [{ type: "Office", count: 2 }] }],
  });
  assert.deepEqual(
    p.floors[0].rooms.filter((r) => r.type !== "Hallway").map((r) => r.type),
    ["Office", "Office"],
  );
});
test("floor-specific counts do not overwrite shared counts or trigger false conflicts", () => {
  const text =
    "Ground floor: 1 bedroom. First floor: 3 bedrooms and 2 bathrooms.";
  assert.equal(explicitConstraints(text, defaultBrief).bedrooms, undefined);
  const b: Brief = {
    ...defaultBrief,
    requirements: {
      ...emptyRequirements(),
      responses: [
        {
          key: "rooms",
          status: "provided",
          details: text,
          priority: "preference",
        },
      ],
    },
  };
  assert.deepEqual(constraintsFromAnswers(b), {});
});
