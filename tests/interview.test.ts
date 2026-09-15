import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBrief,
  ProjectSchema,
  sampleProject,
  type Brief,
} from "../shared/model";
import {
  applyIntake,
  nextIntakeTopic,
  proposeIntake,
  constraintsFromAnswers,
} from "../shared/interview";
import {
  approveRequirements,
  emptyRequirements,
  readyToGenerate,
  requirementTopics,
} from "../shared/requirements";

test("preparing from collected answers grounds explicit values and rejects contradictory notes", () => {
  const b: Brief = {
    ...defaultBrief,
    requirements: {
      ...emptyRequirements(),
      responses: [
        {
          key: "site",
          status: "provided",
          details: "The plot is 18 meters by 14 meters.",
          priority: "preference",
        },
        {
          key: "rooms",
          status: "provided",
          details: "We want 3 bedrooms and 2 bathrooms.",
          priority: "preference",
        },
      ],
    },
  };
  assert.deepEqual(constraintsFromAnswers(b), {
    width: 18,
    depth: 14,
    bedrooms: 3,
    bathrooms: 2,
  });
  b.requirements!.responses[1].details += "\nWe want 4 bedrooms.";
  assert.throws(() => constraintsFromAnswers(b), /conflicting bedrooms/);
});

test("interview answers preserve exact wording, require application and advance to unanswered topics", () => {
  const source = "A renovation for our family. Keep the courtyard.",
    brief = structuredClone(defaultBrief);
  const proposal = proposeIntake(brief, source, [
    { key: "project", status: "provided", details: source, priority: "must" },
  ]);
  assert.equal(brief.requirements, undefined);
  const applied = applyIntake(brief, proposal);
  assert.equal(applied.requirements!.responses[0].details, source);
  assert.equal(nextIntakeTopic(applied)!.key, "site");
  assert.equal(readyToGenerate(applied), false);
});
test("invented or rewritten model details are rejected", () => {
  assert.throws(
    () =>
      proposeIntake(defaultBrief, "We have two children.", [
        {
          key: "household",
          status: "provided",
          details: "Family of four",
          priority: "preference",
        },
      ]),
    /not quoted/,
  );
});
test("existing non-negotiable notes cannot be erased or downgraded by new answers", () => {
  const brief: Brief = {
    ...defaultBrief,
    requirements: {
      ...emptyRequirements(),
      responses: [
        {
          key: "structure",
          status: "provided",
          details: "Keep the column.",
          priority: "must",
        },
      ],
    },
  };
  const applied = applyIntake(
    brief,
    proposeIntake(brief, "Not applicable.", [
      {
        key: "structure",
        status: "not-applicable",
        details: "Not applicable.",
        priority: "preference",
      },
    ]),
  );
  const answer = applied.requirements!.responses[0];
  assert.equal(answer.priority, "must");
  assert.equal(answer.status, "provided");
  assert.equal(answer.details, "Keep the column.\nNot applicable.");
});
test("stale proposals cannot replace newer requirements and saved answers invalidate generation approval", () => {
  const brief = approveRequirements({
    ...defaultBrief,
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
  const proposal = proposeIntake(brief, "Two children.", [
    {
      key: "household",
      status: "provided",
      details: "Two children.",
      priority: "preference",
    },
  ]);
  assert.throws(
    () => applyIntake({ ...brief, width: 24 }, proposal),
    /requirements changed/,
  );
  assert.equal(readyToGenerate(applyIntake(brief, proposal)), false);
  assert.throws(
    () => applyIntake(brief, { ...proposal, status: "dismissed" }),
    /requirements changed/,
  );
});
test("intake proposals survive project export without changing the design", () => {
  const p = sampleProject(),
    before = structuredClone(p.floors);
  const source = "Home for my parents.";
  p.conversation = [
    {
      role: "assistant",
      content: "Review",
      intake: proposeIntake(p.brief, source, [
        {
          key: "project",
          status: "provided",
          details: source,
          priority: "preference",
        },
      ]),
    },
  ];
  const imported = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(imported.floors, before);
  assert.equal(imported.conversation![0].intake!.source, source);
});
