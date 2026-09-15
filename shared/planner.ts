import { layoutFloor } from "./layout";
import { heightChecks, heightIssues } from "./heights";
import { openingChecks, openingSizeIssues } from "./openings";
import { roomSizeChecks } from "./roomSizes";
import { siteEnvelope, setbackDescription } from "./site";
import { floorProgram, programIssues } from "./program";
import { relationshipChecks, relationshipIssues } from "./relationships";
import { circulationChecks } from "./circulation";
import { doorwayChecks } from "./access";
import { displayLength, type DisplayUnits } from "./units";
import {
  BriefSchema,
  colors,
  makeItem,
  makeRoom,
  uid,
  type Brief,
  type Floor,
  type Project,
  type Room,
} from "./model";
export type Check = {
  level: "pass" | "warning" | "error";
  title: string;
  detail: string;
};
export function validateFloor(
  floor: Floor,
  brief: Brief,
  index = floor.programIndex ?? 0,
  units: DisplayUnits = "m",
): Check[] {
  const out: Check[] = [
    ...heightChecks(floor, brief, index, units),
    ...openingChecks(floor, brief, units),
    ...roomSizeChecks(floor, brief, index, units),
    ...relationshipChecks(floor, brief, index, units),
    ...circulationChecks(floor, brief, units),
    ...doorwayChecks(floor, units),
  ];
  const expected = floorProgram(brief, index).rooms;
  if (brief.floorPrograms && !expected.length)
    out.push({
      level: "warning",
      title: "Floor requirements",
      detail:
        "No room program is recorded for this floor. Review the floor count and room requirements before generating.",
    });
  const { width, depth } = siteEnvelope(brief);
  const outside = floor.rooms.filter(
    (r) =>
      r.x < -0.01 ||
      r.y < -0.01 ||
      r.x + r.w > width + 0.01 ||
      r.y + r.h > depth + 0.01,
  );
  out.push({
    level: outside.length ? "error" : "pass",
    title: "Building envelope",
    detail: outside.length
      ? `${outside.map((r) => r.name).join(", ")} extend outside the ${displayLength(width, units, 1)} × ${displayLength(depth, units, 1)} ${units} buildable area.`
      : `All rooms are within the ${displayLength(width, units)} × ${displayLength(depth, units)} ${units} buildable footprint. Setbacks: ${setbackDescription(brief, units)}.`,
  });
  let overlap = 0;
  for (let i = 0; i < floor.rooms.length; i++)
    for (let j = i + 1; j < floor.rooms.length; j++) {
      const a = floor.rooms[i],
        b = floor.rooms[j];
      if (
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.03 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.03
      )
        overlap++;
    }
  out.push({
    level: overlap ? "error" : "pass",
    title: "Room intersections",
    detail: overlap
      ? `${overlap} overlapping room pair(s). Move or resize the highlighted spaces.`
      : "Room footprints do not overlap.",
  });
  for (const type of new Set([
    "Bedroom",
    "Bathroom",
    ...expected.map((r) => r.type),
  ])) {
    const n = expected.find((r) => r.type === type)?.count || 0;
    const count = floor.rooms.filter((r) => r.type === type).length;
    out.push({
      level: count === n ? "pass" : "warning",
      title: `${type} count`,
      detail: `${count} on this floor; ${n} requested for floor ${index + 1}.`,
    });
  }
  const small = floor.rooms.filter(
    (r) =>
      r.type !== "Hallway" &&
      (Math.min(r.w, r.h) < 1.8 || (r.type === "Bedroom" && r.w * r.h < 8)),
  );
  if (small.length)
    out.push({
      level: "warning",
      title: "Compact spaces",
      detail: `Review clearances in ${small.map((r) => r.name).join(", ")}. Dimensions are conceptual, not code-certified.`,
    });
  const requested = expected
    .map((r) => r.type)
    .filter((e) => !floor.rooms.some((r) => r.type === e));
  if (requested.length)
    out.push({
      level: "warning",
      title: "Additional rooms",
      detail: `Not present on this floor: ${requested.join(", ")}.`,
    });
  out.push({
    level: "warning",
    title: "Design review",
    detail:
      "Natural light, structural design, utilities, budget, local regulations and free-text preferences are not certified by these geometric checks.",
  });
  return out;
}
export function generateProject(input: Brief, variant = 0): Project {
  const brief = BriefSchema.parse(input);
  const issues = [
    ...programIssues(brief),
    ...relationshipIssues(brief),
    ...heightIssues(brief),
    ...openingSizeIssues(brief),
  ];
  if (issues.length) throw Error(issues[0]);
  const { width, depth } = siteEnvelope(brief);
  if (width < 5 || depth < 5)
    throw Error(
      "The setbacks leave less than 5 m of buildable width or depth. Increase the plot or reduce setbacks.",
    );
  const floors = Array.from({ length: brief.floors }, (_, i) =>
    layoutFloor(brief, variant, i),
  );
  const sizeFailure = floors
    .flatMap((f) => roomSizeChecks(f, brief))
    .find((c) => c.level === "error");
  if (sizeFailure) throw Error(sizeFailure.detail);
  const relationshipFailure = floors
    .flatMap((f) => relationshipChecks(f, brief))
    .find((c) => c.level === "error");
  if (relationshipFailure) throw Error(relationshipFailure.detail);
  const circulationFailure = floors
    .flatMap((f) => circulationChecks(f, brief))
    .find((c) => c.level === "error");
  if (circulationFailure) throw Error(circulationFailure.detail);
  const accessFailure = floors
    .flatMap((floor) => doorwayChecks(floor))
    .find((c) => c.level === "error");
  if (accessFailure) throw Error(accessFailure.detail);
  return {
    version: 1,
    id: uid(),
    name: "My " + brief.style.toLowerCase() + " home",
    floors,
    brief,
    updatedAt: new Date().toISOString(),
    notes: [
      "Generated using a bounded room-allocation search. Each room has a door to the central hallway and an exterior window.",
      "The main entrance follows your " +
        brief.orientation.toLowerCase() +
        " entrance preference.",
      ...(brief.openPlan
        ? [
            "Adjacent public rooms are connected with wide openings where the room allocation allows.",
          ]
        : []),
      ...(brief.notes
        ? ["Your full client notes are preserved in the design brief."]
        : []),
      ...(brief.floors > 1
        ? [
            brief.floorPrograms
              ? "Each floor uses its own room requirements. Stair locations and vertical circulation are indicative and require coordination between floors."
              : "The room program repeats per floor. Stair locations and vertical circulation require detailed review.",
          ]
        : []),
    ],
  };
}
