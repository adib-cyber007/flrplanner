import {
  DEFAULT_CEILING_HEIGHT,
  CeilingHeightSchema,
  ProjectSchema,
  type Brief,
  type Floor,
  type Project,
} from "./model";
import { geometryLockIssue } from "./editing";
import { formatLength, type DisplayUnits } from "./units";

export const ceilingHeight = (floor: Floor) =>
  floor.ceilingHeight ?? DEFAULT_CEILING_HEIGHT;
export const requestedHeight = (brief: Brief, index: number) =>
  brief.floorHeights?.find((r) => r.floor === index)?.ceilingHeight ??
  DEFAULT_CEILING_HEIGHT;
export function heightIssues(brief: Brief) {
  return (brief.floorHeights || [])
    .filter((r) => r.floor >= brief.floors)
    .map(
      (r) =>
        `Ceiling height refers to Floor ${r.floor + 1}, beyond the selected floor count.`,
    );
}
export function heightChecks(
  floor: Floor,
  brief: Brief,
  index = floor.programIndex ?? 0,
  units: DisplayUnits = "m",
) {
  const required = brief.floorHeights?.find((r) => r.floor === index);
  const actual = ceilingHeight(floor);
  return [
    {
      level:
        required && Math.abs(required.ceilingHeight - actual) > 1e-6
          ? ("error" as const)
          : ("pass" as const),
      title: "Ceiling height",
      detail: `${floor.name}: ${formatLength(actual, units, 3)} modeled wall/ceiling height${required ? `; brief requires ${formatLength(required.ceilingHeight, units, 3)}` : ` (${formatLength(DEFAULT_CEILING_HEIGHT, units, 3)} is the default when unspecified)`}. Slab thickness, floor-to-floor levels, stairs and clearances require separate coordination.`,
    },
  ];
}

export function updateFloorSettings(
  project: Project,
  floorId: string,
  input: { name: string; ceilingHeight: number },
): Project {
  const index = project.floors.findIndex((f) => f.id === floorId);
  if (index < 0) throw Error("This floor is no longer in the project.");
  const before = project.floors[index];
  const height = CeilingHeightSchema.parse(input.ceilingHeight);
  if (!input.name.trim()) throw Error("Enter a floor name.");
  const changedHeight = Math.abs(height - ceilingHeight(before)) > 1e-6;
  const next = {
    ...before,
    name: input.name.trim(),
    ...(changedHeight ? { ceilingHeight: height } : {}),
  };
  const issue = geometryLockIssue(before, next);
  if (issue) throw Error(issue);
  let brief = project.brief;
  const programIndex = before.programIndex ?? index;
  if (changedHeight && programIndex < brief.floors) {
    brief = {
      ...brief,
      floorHeights: [
        ...(brief.floorHeights || []).filter((r) => r.floor !== programIndex),
        { floor: programIndex, ceilingHeight: height },
      ],
      ...(brief.requirements
        ? {
            requirements: {
              ...brief.requirements,
              reviewedAt: undefined,
              reviewKey: undefined,
              coreConfirmed: false,
              assumptionsAccepted: false,
            },
          }
        : {}),
    };
  }
  const checked = ProjectSchema.safeParse({
    ...project,
    brief,
    floors: project.floors.map((f) => (f.id === floorId ? next : f)),
  });
  if (!checked.success) throw Error(checked.error.issues[0].message);
  return checked.data;
}
