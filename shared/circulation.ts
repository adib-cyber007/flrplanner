import type { Brief, Floor } from "./model";
import { formatLength, type DisplayUnits } from "./units";

export function circulationDimensions(brief: Brief) {
  const door = Math.max(
    brief.accessibility ? 1 : 0.9,
    brief.circulation?.minDoorWidth || 0,
  );
  return {
    door,
    hallway: Math.max(
      brief.accessibility ? 1.5 : 1.2,
      brief.circulation?.minHallwayWidth || 0,
      door,
    ),
  };
}
export function circulationDescription(
  brief: Brief,
  units: DisplayUnits = "m",
) {
  const d = circulationDimensions(brief);
  return `Hallway footprint width ≥ ${formatLength(d.hallway, units, 3)}; door leaf width ≥ ${formatLength(d.door, units, 3)}`;
}
/** Checks nominal geometry only; no certification of clear passage or accessible routes. */
export function circulationChecks(
  floor: Floor,
  brief: Brief,
  units: DisplayUnits = "m",
) {
  if (!brief.circulation && !brief.accessibility) return [];
  const d = circulationDimensions(brief);
  const out = [];
  if (brief.circulation?.minHallwayWidth !== undefined || brief.accessibility) {
    const halls = floor.rooms.filter((r) => r.type === "Hallway");
    const narrow = halls.filter((r) => Math.min(r.w, r.h) < d.hallway - 1e-7);
    out.push({
      level:
        halls.length && !narrow.length ? ("pass" as const) : ("error" as const),
      title: "Required hallway width",
      detail: halls.length
        ? `Every hallway footprint must be at least ${formatLength(d.hallway, units, 3)} wide.${narrow.length ? ` Too narrow: ${narrow.map((r) => r.name).join(", ")}.` : " Satisfied."}`
        : "A hallway is required on this floor to satisfy the circulation brief.",
    });
  }
  if (brief.circulation?.minDoorWidth !== undefined || brief.accessibility) {
    const doors = floor.items.filter((item) => item.type === "door");
    const narrow = doors.filter((door) => door.w < d.door - 1e-7);
    out.push({
      level:
        doors.length && !narrow.length ? ("pass" as const) : ("error" as const),
      title: "Required door width",
      detail: doors.length
        ? `Every door leaf must be at least ${formatLength(d.door, units, 3)} wide.${narrow.length ? ` Too narrow: ${narrow.map((r) => r.name).join(", ")}.` : " Satisfied."} Clear openings and approach space need separate review.`
        : "No doors are present to satisfy the circulation brief.",
    });
  }
  return out;
}
