import type { Brief, Floor, Room } from "./model";
import { floorProgram } from "./program";
import { formatLength, type DisplayUnits } from "./units";
export type RoomRelationship = NonNullable<Brief["roomRelationships"]>[number];
export function relationshipDescription(
  r: RoomRelationship,
  units: DisplayUnits = "m",
) {
  return r.relation === "adjacent"
    ? `${r.a} beside ${r.b} (at least one shared boundary ≥ ${formatLength(1, units, 2)})`
    : `${r.a} and ${r.b} must not share a boundary`;
}
export function sharedWallLength(a: Room, b: Room) {
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  if (near(a.x + a.w, b.x) || near(b.x + b.w, a.x))
    return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  if (near(a.y + a.h, b.y) || near(b.y + b.h, a.y))
    return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  return 0;
}
export function activeRelationships(brief: Brief, index: number) {
  const types = new Set(floorProgram(brief, index).rooms.map((r) => r.type));
  return (brief.roomRelationships || []).filter(
    (r) => types.has(r.a) && types.has(r.b),
  );
}
export function relationshipIssues(brief: Brief) {
  const together = Array.from({ length: brief.floors }, (_, i) =>
    activeRelationships(brief, i),
  ).flat();
  const types = new Set(
    Array.from({ length: brief.floors }, (_, i) =>
      floorProgram(brief, i).rooms.map((r) => r.type),
    ).flat(),
  );
  return (brief.roomRelationships || [])
    .filter((r) =>
      r.relation === "adjacent"
        ? !together.includes(r)
        : !types.has(r.a) || !types.has(r.b),
    )
    .map(
      (r) =>
        `${r.a} / ${r.b}: the room lists cannot support this relationship. Adjacent rooms must be requested on a common floor. Update the room lists or remove this relationship.`,
    );
}
export function relationshipChecks(
  floor: Floor,
  brief: Brief,
  index = floor.programIndex ?? 0,
  units: DisplayUnits = "m",
) {
  return activeRelationships(brief, index).map((rule) => {
    const a = floor.rooms.filter((r) => r.type === rule.a),
      b = floor.rooms.filter((r) => r.type === rule.b);
    const lengths = a.flatMap((x) => b.map((y) => sharedWallLength(x, y)));
    const pass =
      a.length > 0 &&
      b.length > 0 &&
      (rule.relation === "adjacent"
        ? lengths.some((n) => n >= 1 - 1e-6)
        : lengths.every((n) => n <= 1e-6));
    return {
      level: pass ? ("pass" as const) : ("error" as const),
      title: `Room relationship: ${rule.a} / ${rule.b}`,
      detail: `${relationshipDescription(rule, units)}. ${pass ? "Satisfied on this floor." : "Not satisfied on this floor."}`,
    };
  });
}
const matches = (r: RoomRelationship, a: string, b: string) =>
  (r.a === a && r.b === b) || (r.a === b && r.b === a);
/** Bounded type-order search: keep one ordering for each set of achieved adjacent pairs. */
function bankOrders<T extends { type: string }>(
  rooms: T[],
  rules: RoomRelationship[],
) {
  const wanted = rules.filter((r) => r.relation === "adjacent"),
    forbidden = rules.filter((r) => r.relation === "separate");
  const found = new Map<number, T[]>(),
    visited = new Set<string>();
  let remaining = 3000;
  const visit = (order: T[], unused: T[], mask: number) => {
    if (--remaining < 0) return;
    if (!unused.length) {
      if (!found.has(mask)) found.set(mask, order);
      return;
    }
    const last = order.at(-1)?.type;
    const key =
      unused
        .map((r) => r.type)
        .sort()
        .join(",") +
      "/" +
      last +
      "/" +
      mask;
    if (visited.has(key)) return;
    visited.add(key);
    const types = new Set<string>();
    const candidates = unused
      .map((room, i) => ({
        room,
        i,
        gain: last
          ? wanted.reduce(
              (m, r, j) => (matches(r, last, room.type) ? m | (1 << j) : m),
              0,
            )
          : 0,
      }))
      .sort(
        (a, b) =>
          ((b.gain & ~mask) !== 0 ? 1 : 0) - ((a.gain & ~mask) !== 0 ? 1 : 0),
      );
    for (const { room, i, gain } of candidates) {
      if (types.has(room.type)) continue;
      types.add(room.type);
      if (last && forbidden.some((r) => matches(r, last, room.type))) continue;
      visit(
        [...order, room],
        unused.filter((_, j) => j !== i),
        mask | gain,
      );
    }
  };
  visit([], rooms, 0);
  return found;
}
export function arrangeBanks<T extends { type: string }>(
  left: T[],
  right: T[],
  rules: RoomRelationship[],
) {
  if (!rules.length) return { left, right };
  const wanted = rules.filter((r) => r.relation === "adjacent");
  if (
    wanted.some(
      (r) =>
        ![left, right].some(
          (bank) =>
            bank.some((x) => x.type === r.a) &&
            bank.some((x) => x.type === r.b),
        ),
    )
  )
    return null;
  const required = (1 << wanted.length) - 1;
  const l = bankOrders(left, rules),
    r = bankOrders(right, rules);
  for (const [lm, lo] of l)
    for (const [rm, ro] of r)
      if ((lm | rm) === required) return { left: lo, right: ro };
  return null;
}
