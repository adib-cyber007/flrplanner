import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBrief,
  FloorSchema,
  makeItem,
  makeRoom,
  openingDimensions,
  ProjectSchema,
  sampleProject,
} from "../shared/model";
import {
  openingBands,
  openingChecks,
  openingSizeIssues,
} from "../shared/openings";
import { canWalkTo, wallOpenings } from "../shared/geometry";
import { applyOperations, modelContext, simpleEdit } from "../shared/agent";
import { generateProject } from "../shared/planner";
import { updateFloorSettings } from "../shared/heights";
import { exportSchedule } from "../shared/export";
import {
  enforceableRules,
  confirmRuleLink,
  linkedRequirement,
} from "../shared/requirementLinks";
import { emptyRequirements } from "../shared/requirements";

test("opening dimensions preserve legacy defaults and reject invalid types, thresholds and ceiling overflow", () => {
  assert.deepEqual(openingDimensions(makeItem("window", 0, 0)), {
    height: 1.3,
    sill: 0.85,
    head: 2.15,
  });
  assert.deepEqual(openingDimensions(makeItem("door", 0, 0)), {
    height: 2.15,
    sill: 0,
    head: 2.15,
  });
  for (const item of [
    makeItem("sofa", 0, 0, { opening: { height: 1, sill: 0 } }),
    makeItem("door", 0, 0, { opening: { height: 2, sill: 0.1 } }),
    makeItem("window", 0, 0, { opening: { height: 2, sill: 1 } }),
  ]) {
    const f = sampleProject().floors[0];
    f.items = [item];
    assert.equal(FloorSchema.safeParse(f).success, false);
  }
  const p = sampleProject();
  p.floors[0].items = [
    makeItem("window", 0, 0, { opening: { height: 1.5, sill: 1 } }),
  ];
  assert.throws(
    () =>
      updateFloorSettings(p, p.floors[0].id, {
        name: "Ground",
        ceilingHeight: 2.3,
      }),
    /opening top exceeds/,
  );
});

test("vertical wall subtraction preserves different heads and sills, overlapping openings and cutaway clipping", () => {
  assert.deepEqual(
    openingBands(
      [
        { type: "window", bottom: 0.5, top: 1.5 },
        { type: "window", bottom: 2, top: 2.5 },
      ],
      3,
    ),
    [
      { base: 0, height: 0.5, kind: "solid" },
      { base: 0.5, height: 1, kind: "glass" },
      { base: 1.5, height: 0.5, kind: "solid" },
      { base: 2, height: 0.5, kind: "glass" },
      { base: 2.5, height: 0.5, kind: "solid" },
    ],
  );
  assert.deepEqual(
    openingBands(
      [
        { type: "door", bottom: 0, top: 2 },
        { type: "window", bottom: 1, top: 2.5 },
      ],
      3,
    ),
    [
      { base: 2, height: 0.5, kind: "glass" },
      { base: 2.5, height: 0.5, kind: "solid" },
    ],
  );
  assert.deepEqual(
    openingBands([{ type: "window", bottom: 1.5, top: 2.5 }], 1.35),
    [{ base: 0, height: 1.35, kind: "solid" }],
  );
});

test("walkthrough respects standing headroom without treating windows as doorways", () => {
  const f = {
    id: "f",
    name: "Test",
    rooms: [makeRoom("Bedroom", 0, 0, 3, 3), makeRoom("Bedroom", 3, 0, 3, 3)],
    items: [
      makeItem("door", 3, 1, {
        rotation: 90,
        opening: { height: 1.5, sill: 0 },
      }),
    ],
    walls: [],
  };
  assert.equal(canWalkTo(3, 1.45, f), false);
  assert.ok(openingChecks(f).some((c) => c.title === "Opening headroom"));
  f.items[0].opening!.height = 1.8;
  assert.equal(canWalkTo(3, 1.45, f), true);
  const holes = wallOpenings(
    { id: "wall", x1: 3, y1: 0, x2: 3, y2: 3, thickness: 0.12 },
    f.items,
  );
  assert.equal(holes[0].top, 1.8);
  assert.equal(holes[0].bottom, 0);
});

test("AI opening edits convert feet, preserve plan depth and reject invalid proposals atomically", () => {
  const p = sampleProject(),
    f = p.floors[0],
    window = f.items.find((i) => i.type === "window")!,
    snapshot = structuredClone(f);
  const selected = { kind: "item" as const, id: window.id };
  const ops = simpleEdit(
    "Set selected window sill height to 3 feet",
    f,
    selected,
  ).operations!;
  const edited = applyOperations(f, ops, p.brief);
  const updated = edited.floor.items.find((i) => i.id === window.id)!;
  assert.ok(Math.abs(updated.opening!.sill - 0.9144) < 1e-7);
  assert.equal(updated.h, window.h);
  assert.ok(edited.changes[0].includes("sill 0.9144 m"));
  assert.throws(
    () =>
      applyOperations(
        f,
        [
          { kind: "update_item", id: window.id, patch: { name: "New name" } },
          {
            kind: "update_item",
            id: window.id,
            patch: { opening: { height: 3, sill: 1 } },
          },
        ],
        p.brief,
      ),
    /opening top exceeds/,
  );
  assert.deepEqual(f, snapshot);
  assert.deepEqual(
    modelContext(f).context.items.find(
      (i) => i.ref === `i${f.items.indexOf(window) + 1}`,
    )!.opening,
    { height: 1.3, sill: 0.85 },
  );
});

test("generation and AI enforce project-wide opening sizes and contradictory heights fail before building", () => {
  const brief = {
    ...defaultBrief,
    floors: 2,
    openingSizes: {
      doorHeight: 2.3,
      passageHeight: 2.4,
      windowHeight: 1.1,
      windowSill: 1,
    },
  };
  const p = generateProject(brief);
  for (const f of p.floors) {
    assert.equal(
      openingChecks(f, brief).filter((c) => c.level === "error").length,
      0,
    );
    for (const i of f.items.filter((i) => i.type === "window"))
      assert.deepEqual(i.opening, { height: 1.1, sill: 1 });
  }
  const f = p.floors[0],
    window = f.items.find((i) => i.type === "window")!;
  assert.throws(
    () =>
      applyOperations(
        f,
        [
          {
            kind: "update_item",
            id: window.id,
            patch: { opening: { height: 1.2, sill: 1 } },
          },
        ],
        brief,
      ),
    /project-wide opening requirements/,
  );
  assert.ok(
    openingSizeIssues({
      ...brief,
      openingSizes: { windowHeight: 2, windowSill: 1 },
    }).length,
  );
  assert.throws(
    () =>
      generateProject({
        ...brief,
        openingSizes: { windowHeight: 2, windowSill: 1 },
      }),
    /above its.*ceiling/,
  );
});

test("opening requirements link to exact written needs and reopen after values change", () => {
  const p = sampleProject();
  p.brief.openingSizes = { windowSill: 1 };
  p.brief.requirements = {
    ...emptyRequirements(),
    custom: [
      {
        id: "sills",
        text: "All window sills must be 1 meter high",
        priority: "must",
      },
    ],
  };
  const rule = enforceableRules(p.brief).find((r) =>
    r.key.includes("windowSill"),
  )!;
  p.brief.requirements = confirmRuleLink(
    p.brief,
    "custom:sills",
    "All window sills must be 1 meter high",
    [rule.key],
  );
  assert.ok(
    linkedRequirement(
      p.brief,
      "custom:sills",
      "All window sills must be 1 meter high",
    ),
  );
  p.brief.openingSizes.windowSill = 1.1;
  assert.equal(
    linkedRequirement(
      p.brief,
      "custom:sills",
      "All window sills must be 1 meter high",
    ),
    false,
  );
});

test("opening schedules separate equal-plan-size windows with different elevations and backups retain them", () => {
  const p = sampleProject();
  p.floors[0].items = [
    makeItem("window", 0, 0, { opening: { height: 1, sill: 0.5 } }),
    makeItem("window", 1, 0, { opening: { height: 1.5, sill: 0.7 } }),
  ];
  const restored = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.floors[0].items, p.floors[0].items);
  const csv = exportSchedule(p);
  assert.equal(
    csv.split("\r\n").filter((row) => row.includes('"Object"')).length,
    2,
  );
  assert.ok(csv.includes('"1.000","0.500"'));
  assert.ok(csv.includes('"1.500","0.700"'));
});
