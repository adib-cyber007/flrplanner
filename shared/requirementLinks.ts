import type { Brief, Requirements } from "./model";
import { roomSizeDescription } from "./roomSizes";
import { relationshipDescription } from "./relationships";
import { floorProgram } from "./program";
import { circulationDimensions } from "./circulation";
import { displayLength, type DisplayUnits } from "./units";

/** Keys contain the rule values, so changed or removed rules invalidate links. */
export function enforceableRules(brief: Brief, units: DisplayUnits = "m") {
  const length = (value: number) =>
    `${displayLength(value, units, 3)} ${units}`;
  const scope = (types: string[]) =>
    Array.from({ length: brief.floors }, (_, i) =>
      types.map(
        (type) =>
          floorProgram(brief, i).rooms.find((r) => r.type === type)?.count || 0,
      ),
    );
  return [
    ...Object.entries(brief.openingSizes || {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key: JSON.stringify(["opening-size", key, value, brief.floors]),
        label: `${({ doorHeight: "Every door: opening height", passageHeight: "Every open passage: height", windowHeight: "Every window: opening height", windowSill: "Every window: sill height" } as Record<string, string>)[key]} = ${length(value!)}`,
      })),
    ...(brief.floorHeights || [])
      .filter((r) => r.floor < brief.floors)
      .map((r) => ({
        key: JSON.stringify([
          "ceiling-height",
          r.floor,
          r.ceilingHeight,
          brief.floors,
        ]),
        label: `Floor ${r.floor + 1}: modeled ceiling / wall height = ${length(r.ceilingHeight)} (not floor-to-floor elevation)`,
      })),
    ...(brief.circulation?.minHallwayWidth !== undefined || brief.accessibility
      ? [
          {
            key: JSON.stringify([
              "hallway-width",
              circulationDimensions(brief).hallway,
              brief.floors,
            ]),
            label: `Every hallway footprint: width ≥ ${length(circulationDimensions(brief).hallway)}`,
          },
        ]
      : []),
    ...(brief.circulation?.minDoorWidth !== undefined || brief.accessibility
      ? [
          {
            key: JSON.stringify([
              "door-width",
              circulationDimensions(brief).door,
              brief.floors,
            ]),
            label: `Every door leaf: width ≥ ${length(circulationDimensions(brief).door)} (clear passage requires review)`,
          },
        ]
      : []),
    ...(brief.roomSizeRules || []).map((r) => ({
      key: JSON.stringify([
        "size",
        r.roomType,
        r.minWidth ?? null,
        r.minDepth ?? null,
        r.minArea ?? null,
        scope([r.roomType]),
        ...(r.maxWidth !== undefined ||
        r.maxDepth !== undefined ||
        r.maxArea !== undefined
          ? [r.maxWidth ?? null, r.maxDepth ?? null, r.maxArea ?? null]
          : []),
      ]),
      label: `Every ${r.roomType}: ${roomSizeDescription(r, units)}`,
    })),
    ...(brief.roomRelationships || []).map((r) => ({
      key: JSON.stringify([
        "relationship",
        ...[r.a, r.b].sort(),
        r.relation,
        scope([r.a, r.b].sort()),
      ]),
      label: relationshipDescription(r, units),
    })),
  ];
}

export function linkedRequirement(brief: Brief, source: string, text: string) {
  const link = brief.requirements?.ruleLinks?.find((l) => l.source === source);
  const rules = enforceableRules(brief);
  return (
    !!text.trim() &&
    !!link &&
    link.text === text &&
    link.rules.length > 0 &&
    link.rules.every((key) => rules.some((r) => r.key === key))
  );
}

/** Human-reviewed equivalence, not a model's claim that arbitrary prose is satisfied. */
export function confirmRuleLink(
  brief: Brief,
  source: string,
  text: string,
  selected: string[],
): Requirements {
  const r = brief.requirements;
  const answer = r?.responses.find((a) => `topic:${a.key}` === source);
  const custom = r?.custom.find((c) => `custom:${c.id}` === source);
  if (
    !r ||
    !(
      (answer?.status === "provided" &&
        answer.priority === "must" &&
        answer.details === text) ||
      (custom?.priority === "must" && custom.text === text)
    )
  )
    throw Error(
      "The requirement changed. Review its current text before linking rules.",
    );
  const rules = enforceableRules(brief);
  if (
    !text.trim() ||
    !selected.length ||
    selected.some((key) => !rules.some((rule) => rule.key === key))
  )
    throw Error(
      "Select existing enforceable rules that fully express this requirement.",
    );
  return {
    ...r,
    ruleLinks: [
      ...(r.ruleLinks || []).filter(
        (l) =>
          l.source !== source &&
          (r.responses.some((a) => `topic:${a.key}` === l.source) ||
            r.custom.some((c) => `custom:${c.id}` === l.source)),
      ),
      { source, text, rules: [...new Set(selected)] },
    ],
    coreConfirmed: false,
    assumptionsAccepted: false,
    reviewKey: undefined,
    reviewedAt: undefined,
  };
}

export function unresolvedWrittenRequirements(brief: Brief) {
  return [
    ...(brief.requirements?.responses || [])
      .filter(
        (a) =>
          a.priority === "must" &&
          a.status !== "not-applicable" &&
          (a.status !== "provided" ||
            !linkedRequirement(brief, `topic:${a.key}`, a.details)),
      )
      .map((a) => ({ source: `topic:${a.key}`, text: a.details })),
    ...(brief.requirements?.custom || [])
      .filter(
        (c) =>
          c.priority === "must" &&
          !linkedRequirement(brief, `custom:${c.id}`, c.text),
      )
      .map((c) => ({ source: `custom:${c.id}`, text: c.text })),
  ];
}
