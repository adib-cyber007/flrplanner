import { roomTypes, type Brief, type Room } from "./model";
export type FloorProgram = NonNullable<Brief["floorPrograms"]>[number];
export function defaultFloorProgram(brief: Brief, floor: number): FloorProgram {
  const rooms: FloorProgram["rooms"] = [
    { type: "Living room", count: 1 },
    { type: "Kitchen", count: 1 },
  ];
  if (brief.bedrooms) rooms.push({ type: "Bedroom", count: brief.bedrooms });
  if (brief.bathrooms) rooms.push({ type: "Bathroom", count: brief.bathrooms });
  for (const type of roomTypes)
    if (
      type !== "Hallway" &&
      brief.extras.includes(type) &&
      !rooms.some((r) => r.type === type)
    )
      rooms.push({ type, count: 1 });
  return { floor, rooms };
}
export function floorProgram(brief: Brief, index: number): FloorProgram {
  return brief.floorPrograms
    ? brief.floorPrograms.find((p) => p.floor === index) || {
        floor: index,
        rooms: [],
      }
    : defaultFloorProgram(brief, index);
}
export function programSummary(brief: Brief, index: number) {
  return (
    floorProgram(brief, index)
      .rooms.map((r) => `${r.count} ${r.type}${r.count > 1 ? "s" : ""}`)
      .join(" · ") || "No rooms specified"
  );
}
export function programIssues(brief: Brief) {
  if (!brief.floorPrograms) return [];
  const issues: string[] = [];
  for (let index = 0; index < brief.floors; index++)
    if (!floorProgram(brief, index).rooms.length)
      issues.push(
        `Floor ${index + 1}: specify at least one room before generation.`,
      );
  if (brief.floorPrograms.some((p) => p.floor >= brief.floors))
    issues.push(
      "Room requirements refer to a floor beyond the selected number of floors.",
    );
  for (const rule of brief.roomSizeRules || [])
    if (
      !brief.floorPrograms.some((p) =>
        p.rooms.some((r) => r.type === rule.roomType),
      )
    )
      issues.push(
        `${rule.roomType}: a size requirement exists but no floor requests this room. Add the room or clear its minimums.`,
      );
  return issues;
}
export function programRooms(
  brief: Brief,
  index: number,
): { type: Room["type"]; name: string }[] {
  // Keep public spaces at the entrance and bathrooms toward the rear.
  const order = [
    "Living room",
    "Kitchen",
    "Dining room",
    "Bedroom",
    "Office",
    "Utility",
    "Balcony",
    "Garage",
    "Prayer room",
    "Bathroom",
  ];
  return [...floorProgram(brief, index).rooms]
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    .flatMap((r) =>
      Array.from({ length: r.count }, (_, i) => ({
        type: r.type,
        name:
          r.type === "Bedroom" && i === 0
            ? "Primary bedroom"
            : r.count === 1
              ? r.type
              : `${r.type} ${i + 1}`,
      })),
    );
}
