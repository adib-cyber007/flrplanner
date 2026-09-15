import {
  BriefSchema,
  IntakeProposalSchema,
  RequirementsSchema,
  type Brief,
  type Requirements,
  type IntakeProposal,
} from "./model";
import {
  emptyRequirements,
  requirementReviewKey,
  requirementTopics,
} from "./requirements";
import { explicitConstraints } from "./intent";

export function constraintsFromAnswers(brief: Brief): Partial<Brief> {
  const changes: Partial<Brief> = {};
  const notes = [
    ...(brief.requirements?.responses || [])
      .filter((r) => r.status === "provided")
      .map((r) => r.details),
    ...(brief.requirements?.custom || []).map((c) => c.text),
  ];
  for (const note of notes.flatMap((text) => text.split(/\n+|(?<=[.!?])\s+/))) {
    const found = explicitConstraints(note, { ...brief, ...changes });
    for (const field of ["width", "depth", "bedrooms", "bathrooms"] as const) {
      if (
        found[field] !== undefined &&
        changes[field] !== undefined &&
        found[field] !== changes[field]
      )
        throw Error(
          `Your saved answers contain conflicting ${field} values (${changes[field]} and ${found[field]}). Correct that requirement before preparing a layout brief.`,
        );
    }
    Object.assign(changes, found);
  }
  return changes;
}

export function nextIntakeTopic(brief: Brief) {
  return requirementTopics.find(
    (t) =>
      !brief.requirements?.responses.some(
        (r) => r.key === t.key && (r.status !== "provided" || r.details.trim()),
      ),
  );
}
export function proposeIntake(
  brief: Brief,
  source: string,
  answers: Requirements["responses"],
): IntakeProposal {
  const parsed = RequirementsSchema.shape.responses.parse(answers);
  if (!parsed.length)
    throw Error(
      "Choose a topic or provide more details so the answer can be recorded accurately.",
    );
  const responses = parsed.map((answer) => {
    if (!answer.details.trim() || !source.includes(answer.details))
      throw Error(
        "The AI returned details that were not quoted from your message. Choose a topic to save your exact words, or try again.",
      );
    const prior = brief.requirements?.responses.find(
      (r) => r.key === answer.key,
    );
    const details =
      prior?.details && !prior.details.includes(answer.details)
        ? `${prior.details}\n${answer.details}`
        : prior?.details || answer.details;
    if (details.length > 4000)
      throw Error(
        "This topic would exceed 4,000 characters. Review its existing notes in Requirements & constraints before adding more.",
      );
    return {
      ...answer,
      details,
      priority:
        prior?.priority === "must" ? ("must" as const) : answer.priority,
      status:
        prior?.status === "provided" || prior?.priority === "must"
          ? ("provided" as const)
          : answer.status,
    };
  });
  return IntakeProposalSchema.parse({
    baseKey: requirementReviewKey(brief),
    source,
    responses,
  });
}
export function applyIntake(brief: Brief, input: IntakeProposal): Brief {
  const proposal = IntakeProposalSchema.parse(input);
  if (
    proposal.status !== "pending" ||
    proposal.baseKey !== requirementReviewKey(brief)
  )
    throw Error(
      "The requirements changed after this proposal. Send the answer again to use the latest brief.",
    );
  const requirements = brief.requirements || emptyRequirements();
  return BriefSchema.parse({
    ...brief,
    requirements: {
      ...requirements,
      responses: [
        ...requirements.responses.filter(
          (r) => !proposal.responses.some((p) => p.key === r.key),
        ),
        ...proposal.responses,
      ],
      reviewedAt: undefined,
      reviewKey: undefined,
      coreConfirmed: false,
      assumptionsAccepted: false,
    },
  });
}
