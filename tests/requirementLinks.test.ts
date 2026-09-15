import test from "node:test";
import assert from "node:assert/strict";
import { sampleProject, ProjectSchema } from "../shared/model";
import {
  confirmRuleLink,
  enforceableRules,
  linkedRequirement,
  unresolvedWrittenRequirements,
} from "../shared/requirementLinks";
import {
  approveRequirements,
  emptyRequirements,
  readyToGenerate,
  requirementTopics,
} from "../shared/requirements";
import { applyOperations } from "../shared/agent";

function fixture() {
  const p = sampleProject();
  p.brief.roomSizeRules = [{ roomType: "Bedroom", minWidth: 3, minArea: 9 }];
  p.brief.requirements = {
    ...emptyRequirements(),
    responses: requirementTopics.map((t) => ({
      key: t.key,
      status: "unknown",
      details: "",
      priority: "preference",
    })),
    custom: [
      {
        id: "size",
        text: "Every bedroom must be at least 3 m wide and 9 m².",
        priority: "must",
      },
    ],
  };
  return p;
}
test("circulation links preserve their meaning and reopen when a required width changes", () => {
  const p = fixture();
  p.brief.circulation = { minHallwayWidth: 1.8, minDoorWidth: 1.1 };
  p.brief.requirements!.custom = [
    {
      id: "widths",
      text: "Every hallway footprint must be at least 1.8 m wide and every door leaf at least 1.1 m wide.",
      priority: "must",
    },
  ];
  const text = p.brief.requirements!.custom[0].text;
  const rules = enforceableRules(p.brief).filter((r) =>
    r.key.includes("-width"),
  );
  assert.equal(rules.length, 2);
  p.brief.requirements = confirmRuleLink(
    p.brief,
    "custom:widths",
    text,
    rules.map((r) => r.key),
  );
  assert.equal(unresolvedWrittenRequirements(p.brief).length, 0);
  p.brief.circulation.minDoorWidth = 1.2;
  assert.equal(unresolvedWrittenRequirements(p.brief).length, 1);
});
function linked() {
  const p = fixture();
  p.brief.requirements = confirmRuleLink(
    p.brief,
    "custom:size",
    p.brief.requirements!.custom[0].text,
    [enforceableRules(p.brief)[0].key],
  );
  p.brief.requirements.coreConfirmed = true;
  p.brief.requirements.assumptionsAccepted = true;
  return p;
}
test("human-reviewed links unblock only the matching requirement and survive project export", () => {
  const p = fixture();
  assert.equal(unresolvedWrittenRequirements(p.brief).length, 1);
  const q = linked();
  q.brief = approveRequirements(q.brief);
  assert.equal(
    readyToGenerate(ProjectSchema.parse(JSON.parse(JSON.stringify(q))).brief),
    true,
  );
  q.brief.requirements!.custom.push({
    id: "columns",
    text: "Preserve every column",
    priority: "must",
  });
  assert.deepEqual(
    unresolvedWrittenRequirements(q.brief).map((r) => r.source),
    ["custom:columns"],
  );
  assert.throws(() => approveRequirements(q.brief), /Preserve every column/);
});
test("edited wording, changed rule values, removed rules and changed floor scopes reopen the blocker", () => {
  for (const change of [
    (p: ReturnType<typeof linked>) => {
      p.brief.requirements!.custom[0].text += " and soundproof.";
    },
    (p: ReturnType<typeof linked>) => {
      p.brief.roomSizeRules![0].minWidth = 2.9;
    },
    (p: ReturnType<typeof linked>) => {
      p.brief.roomSizeRules![0].maxArea = 16;
    },
    (p: ReturnType<typeof linked>) => {
      p.brief.roomSizeRules = [];
    },
    (p: ReturnType<typeof linked>) => {
      p.brief.floors++;
    },
    (p: ReturnType<typeof linked>) => {
      p.brief.bedrooms++;
    },
  ]) {
    const p = linked();
    change(p);
    assert.equal(unresolvedWrittenRequirements(p.brief).length, 1);
    assert.equal(readyToGenerate(p.brief), false);
  }
});
test("links require the current provided non-negotiable text and real rules", () => {
  const p = fixture(),
    text = p.brief.requirements!.custom[0].text;
  assert.throws(() => confirmRuleLink(p.brief, "custom:size", text, []));
  assert.throws(() =>
    confirmRuleLink(p.brief, "custom:size", text, ["made up"]),
  );
  assert.throws(() =>
    confirmRuleLink(p.brief, "custom:size", "stale", [
      enforceableRules(p.brief)[0].key,
    ]),
  );
  assert.throws(() =>
    confirmRuleLink(p.brief, "topic:rooms", text, [
      enforceableRules(p.brief)[0].key,
    ]),
  );
  p.brief.requirements!.responses[3] = {
    key: "rooms",
    status: "provided",
    details: text,
    priority: "must",
  };
  p.brief.requirements = confirmRuleLink(p.brief, "topic:rooms", text, [
    enforceableRules(p.brief)[0].key,
  ]);
  assert.ok(linkedRequirement(p.brief, "topic:rooms", text));
  p.brief.requirements.responses[3].status = "unknown";
  assert.ok(
    unresolvedWrittenRequirements(p.brief).some(
      (r) => r.source === "topic:rooms",
    ),
  );
});
test("AI edits remain transactional and enforce the rule behind a resolved written requirement", () => {
  const p = linked(),
    f = p.floors[0],
    bedroom = f.rooms.find((r) => r.type === "Bedroom")!;
  const before = JSON.stringify(f);
  const changed = applyOperations(
    f,
    [{ kind: "update_room", id: bedroom.id, patch: { name: "Guest bedroom" } }],
    p.brief,
  );
  assert.equal(
    changed.floor.rooms.find((r) => r.id === bedroom.id)!.name,
    "Guest bedroom",
  );
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "update_room", id: bedroom.id, patch: { w: 2 } }],
        p.brief,
      ),
    /size requirement/,
  );
  assert.equal(JSON.stringify(f), before);
});
test("multiple linked rules must all remain present; reversed pair spelling preserves the same relationship", () => {
  const p = fixture();
  p.brief.roomRelationships = [
    { a: "Kitchen", b: "Dining room", relation: "adjacent" },
  ];
  const text = p.brief.requirements!.custom[0].text;
  p.brief.requirements = confirmRuleLink(
    p.brief,
    "custom:size",
    text,
    enforceableRules(p.brief).map((r) => r.key),
  );
  p.brief.roomRelationships = [
    { a: "Dining room", b: "Kitchen", relation: "adjacent" },
  ];
  assert.ok(linkedRequirement(p.brief, "custom:size", text));
  p.brief.roomRelationships[0].relation = "separate";
  assert.equal(linkedRequirement(p.brief, "custom:size", text), false);
});
