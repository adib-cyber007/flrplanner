import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBrief,
  ProjectSchema,
  sampleProject,
  type Brief,
} from "../shared/model";
import {
  approveRequirements,
  emptyRequirements,
  intakeIssues,
  readyToGenerate,
  requirementTopics,
} from "../shared/requirements";
function filled(): Brief {
  return {
    ...structuredClone(defaultBrief),
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
  };
}
test("all constraint sections require explicit responses before building", () => {
  assert.equal(readyToGenerate(defaultBrief), false);
  const issues = intakeIssues(defaultBrief);
  for (const topic of requirementTopics)
    assert.ok(issues.some((i) => i.startsWith(topic.title)));
  assert.throws(() => approveRequirements(defaultBrief), /answer this section/);
});
test("unknowns are allowed only after explicit review, and changing facts invalidates approval", () => {
  const b = filled();
  b.requirements!.assumptionsAccepted = false;
  assert.throws(() => approveRequirements(b), /Review and accept/);
  b.requirements!.assumptionsAccepted = true;
  const approved = approveRequirements(b);
  assert.equal(readyToGenerate(approved), true);
  assert.equal(readyToGenerate({ ...approved, width: 13 }), false);
  assert.equal(
    readyToGenerate({ ...approved, notes: "Protect the wall" }),
    false,
  );
  assert.equal(readyToGenerate(JSON.parse(JSON.stringify(approved))), true);
});
test("non-negotiable written constraints block generation instead of being silently ignored", () => {
  const b = filled();
  b.requirements!.responses[6] = {
    key: "structure",
    status: "provided",
    details: "Keep every existing load-bearing wall.",
    priority: "must",
  };
  assert.throws(() => approveRequirements(b), /non-negotiable constraint/);
  b.requirements!.responses[6].priority = "preference";
  b.requirements!.custom = [
    {
      id: "custom",
      text: "Kitchen must occupy the north-east corner",
      priority: "must",
    },
  ];
  assert.throws(() => approveRequirements(b), /Non-negotiable/);
});
test("provided answers need details and duplicate sections cannot pass schema validation", () => {
  const b = filled();
  b.requirements!.responses[0].status = "provided";
  assert.throws(() => approveRequirements(b), /add the details/);
  const p = sampleProject();
  p.brief = b;
  p.brief.requirements!.responses[1] = p.brief.requirements!.responses[0];
  assert.throws(() => ProjectSchema.parse(p));
});
test("complete requirement notes and approvals survive an editable project export", () => {
  const p = sampleProject();
  p.brief = approveRequirements(filled());
  p.brief.requirements!.responses[0].details =
    "Family home; renovation. Preserve survey reference S-01.";
  p.brief = approveRequirements(p.brief);
  const imported = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.equal(
    imported.brief.requirements?.responses[0].details,
    p.brief.requirements!.responses[0].details,
  );
  assert.equal(readyToGenerate(imported.brief), true);
});
