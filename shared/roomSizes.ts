import type { Brief, Floor, RoomSizeRule } from "./model";
import { floorProgram } from "./program";
import { displayArea, displayLength, type DisplayUnits } from "./units";

export function roomSizeDescription(
  rule: RoomSizeRule,
  units: DisplayUnits = "m",
) {
  const length = (value: number) => displayLength(value, units, 3);
  const area = (value: number) => displayArea(value, units, 3);
  return [
    rule.minWidth === undefined
      ? ""
      : `width ≥ ${length(rule.minWidth)} ${units}`,
    rule.minDepth === undefined
      ? ""
      : `depth ≥ ${length(rule.minDepth)} ${units}`,
    rule.minArea === undefined ? "" : `area ≥ ${area(rule.minArea)} ${units}²`,
    rule.maxWidth === undefined
      ? ""
      : `width ≤ ${length(rule.maxWidth)} ${units}`,
    rule.maxDepth === undefined
      ? ""
      : `depth ≤ ${length(rule.maxDepth)} ${units}`,
    rule.maxArea === undefined ? "" : `area ≤ ${area(rule.maxArea)} ${units}²`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Dimensions follow the displayed plan axes, regardless of entrance rotation. */
export function roomSizeChecks(
  floor: Floor,
  brief: Brief,
  index = floor.programIndex ?? 0,
  units: DisplayUnits = "m",
) {
  return (brief.roomSizeRules || []).map((rule) => {
    const rooms = floor.rooms.filter((r) => r.type === rule.roomType);
    if (
      brief.floorPrograms &&
      !rooms.length &&
      !floorProgram(brief, index).rooms.some((r) => r.type === rule.roomType)
    )
      return {
        level: "pass" as const,
        title: `${rule.roomType} size requirement`,
        detail:
          "This room type is not requested on this floor; its minimums apply on floors containing it.",
      };
    const failures = rooms.filter(
      (r) =>
        r.w + 1e-7 < (rule.minWidth || 0) ||
        r.h + 1e-7 < (rule.minDepth || 0) ||
        r.w * r.h + 1e-7 < (rule.minArea || 0) ||
        r.w - 1e-7 > (rule.maxWidth ?? Infinity) ||
        r.h - 1e-7 > (rule.maxDepth ?? Infinity) ||
        r.w * r.h - 1e-7 > (rule.maxArea ?? Infinity),
    );
    return {
      level:
        !rooms.length || failures.length
          ? ("error" as const)
          : ("pass" as const),
      title: `${rule.roomType} size requirement`,
      detail: !rooms.length
        ? `No ${rule.roomType} is present to satisfy ${roomSizeDescription(rule, units)}.`
        : failures.length
          ? `${failures.map((r) => `${r.name} (${displayLength(r.w, units)} × ${displayLength(r.h, units)} ${units}, ${displayArea(r.w * r.h, units, 2)} ${units}²)`).join("; ")} does not meet ${roomSizeDescription(rule, units)}.`
          : `All ${rooms.length} ${rule.roomType} room(s) satisfy ${roomSizeDescription(rule, units)}.`,
    };
  });
}
