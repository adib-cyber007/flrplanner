import test from "node:test";
import assert from "node:assert/strict";
import {
  BriefSchema,
  FloorSchema,
  defaultBrief,
  sampleProject,
  ProjectSchema,
} from "../shared/model";
import { generateProject } from "../shared/planner";
import {
  ceilingHeight,
  requestedHeight,
  heightChecks,
  updateFloorSettings,
} from "../shared/heights";
import { applyOperations, designHash, modelContext } from "../shared/agent";
import {
  approveRequirements,
  emptyRequirements,
  readyToGenerate,
  requirementTopics,
} from "../shared/requirements";
import {
  enforceableRules,
  confirmRuleLink,
  linkedRequirement,
} from "../shared/requirementLinks";
import { exportSchedule } from "../shared/export";

test("per-floor ceiling heights reach generated floors and legacy floors retain the default", () => {
  const brief = {
    ...defaultBrief,
    floors: 2,
    floorHeights: [
      { floor: 0, ceilingHeight: 3.4 },
      { floor: 1, ceilingHeight: 2.8 },
    ],
  };
  const p = generateProject(brief);
  assert.deepEqual(p.floors.map(ceilingHeight), [3.4, 2.8]);
  assert.equal(ceilingHeight(sampleProject().floors[0]), 2.7);
  assert.equal(requestedHeight(defaultBrief, 0), 2.7);
  for (const f of p.floors)
    assert.equal(heightChecks(f, brief)[0].level, "pass");
});

test("unsupported heights, duplicate levels and heights outside the floor count are rejected", () => {
  for (const height of [0, 2.1, 6.1, NaN, Infinity])
    assert.equal(
      FloorSchema.safeParse({
        ...sampleProject().floors[0],
        ceilingHeight: height,
      }).success,
      false,
    );
  assert.equal(
    BriefSchema.safeParse({
      ...defaultBrief,
      floorHeights: [
        { floor: 0, ceilingHeight: 3 },
        { floor: 0, ceilingHeight: 4 },
      ],
    }).success,
    false,
  );
  assert.throws(
    () =>
      generateProject({
        ...defaultBrief,
        floorHeights: [{ floor: 1, ceilingHeight: 3 }],
      }),
    /beyond the selected floor count/,
  );
});

test("existing-floor settings synchronize the brief and invalidate review without mutating geometry", () => {
  const p = sampleProject();
  p.brief = approveRequirements({
    ...p.brief,
    requirements: {
      ...emptyRequirements(),
      responses: requirementTopics.map((t) => ({
        key: t.key,
        status: "unknown",
        details: "",
        priority: "preference",
      })),
      coreConfirmed: true,
      assumptionsAccepted: true,
    },
  });
  const snapshot = structuredClone(p),
    floor = p.floors[0];
  const updated = updateFloorSettings(p, floor.id, {
    name: "Studio level",
    ceilingHeight: 3.2,
  });
  assert.equal(updated.floors[0].name, "Studio level");
  assert.equal(requestedHeight(updated.brief, 0), 3.2);
  assert.equal(readyToGenerate(updated.brief), false);
  assert.deepEqual(updated.floors[0].rooms, floor.rooms);
  assert.deepEqual(updated.floors[0].items, floor.items);
  assert.deepEqual(p, snapshot);
  const renamed = updateFloorSettings(p, floor.id, {
    name: "Renamed",
    ceilingHeight: 2.7,
  });
  assert.equal(readyToGenerate(renamed.brief), true);
});

test("fixed wall geometry blocks ceiling changes and allows floor renaming", () => {
  const p = sampleProject(),
    f = p.floors[0];
  f.walls.push({
    id: "survey",
    x1: 1,
    y1: 1,
    x2: 1,
    y2: 3,
    thickness: 0.2,
    geometryLocked: true,
  });
  assert.throws(
    () => updateFloorSettings(p, f.id, { name: f.name, ceilingHeight: 3 }),
    /locked walls/,
  );
  assert.equal(
    updateFloorSettings(p, f.id, { name: "Survey level", ceilingHeight: 2.7 })
      .floors[0].name,
    "Survey level",
  );
});

test("height rules can represent written must-haves and cannot be silently violated by AI edits", () => {
  const p = sampleProject();
  p.brief.floorHeights = [{ floor: 0, ceilingHeight: 3 }];
  p.brief.requirements = {
    ...emptyRequirements(),
    custom: [
      {
        id: "height",
        text: "Ground floor ceiling must be 3 m",
        priority: "must",
      },
    ],
  };
  const rule = enforceableRules(p.brief).find((r) =>
    r.key.includes("ceiling-height"),
  )!;
  p.brief.requirements = confirmRuleLink(
    p.brief,
    "custom:height",
    "Ground floor ceiling must be 3 m",
    [rule.key],
  );
  assert.ok(
    linkedRequirement(
      p.brief,
      "custom:height",
      "Ground floor ceiling must be 3 m",
    ),
  );
  assert.throws(
    () =>
      applyOperations(
        p.floors[0],
        [
          {
            kind: "update_room",
            id: p.floors[0].rooms[0].id,
            patch: { name: "Lounge" },
          },
        ],
        p.brief,
      ),
    /floor height does not match/,
  );
  p.brief.floorHeights[0].ceilingHeight = 3.1;
  assert.equal(
    linkedRequirement(
      p.brief,
      "custom:height",
      "Ground floor ceiling must be 3 m",
    ),
    false,
  );
});

test("heights survive backups, reach AI context and schedules, and stale prior proposals", async () => {
  const p = sampleProject(),
    f = p.floors[0],
    hash = await designHash(f, p.brief);
  f.ceilingHeight = 3.6;
  assert.notEqual(await designHash(f, p.brief), hash);
  assert.equal(modelContext(f).context.ceilingHeight, 3.6);
  assert.equal(
    ProjectSchema.parse(JSON.parse(JSON.stringify(p))).floors[0].ceilingHeight,
    3.6,
  );
  const csv = exportSchedule(p);
  assert.ok(csv.includes("Floor ceiling height (m)"));
  assert.ok(csv.includes("3.600"));
});
