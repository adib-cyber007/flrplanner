import type { Floor, Room } from "./model";
import { openingLine } from "./geometry";
import { formatLength, type DisplayUnits } from "./units";
const tolerance = 0.02;
const minimumSpan = 0.5;
type Edge = {
  room: Room;
  axis: "h" | "v";
  at: number;
  start: number;
  end: number;
  side: number;
};
function edges(room: Room): Edge[] {
  return [
    {
      room,
      axis: "h",
      at: room.y,
      start: room.x,
      end: room.x + room.w,
      side: -1,
    },
    {
      room,
      axis: "h",
      at: room.y + room.h,
      start: room.x,
      end: room.x + room.w,
      side: 1,
    },
    {
      room,
      axis: "v",
      at: room.x,
      start: room.y,
      end: room.y + room.h,
      side: -1,
    },
    {
      room,
      axis: "v",
      at: room.x + room.w,
      start: room.y,
      end: room.y + room.h,
      side: 1,
    },
  ];
}
/** Room-boundary topology only: interior partitions, furniture and vertical travel are not solved. */
export function doorwayAccess(floor: Floor) {
  const boundaries = floor.rooms.flatMap(edges);
  const graph = new Map(floor.rooms.map((r) => [r.id, new Set<string>()]));
  const roots = new Set<string>(),
    linkedOpenings = new Set<string>();
  const minX = Math.min(...floor.rooms.map((r) => r.x)),
    maxX = Math.max(...floor.rooms.map((r) => r.x + r.w));
  const minY = Math.min(...floor.rooms.map((r) => r.y)),
    maxY = Math.max(...floor.rooms.map((r) => r.y + r.h));
  const passages = floor.items.filter(
    (i) => i.type === "door" || i.type === "opening",
  );
  for (const item of passages) {
    const line = openingLine(item);
    const hits = boundaries.flatMap((edge) => {
      const [normalA, normalB, a, b] =
        edge.axis === "h"
          ? [line.a.y, line.b.y, line.a.x, line.b.x]
          : [line.a.x, line.b.x, line.a.y, line.b.y];
      if (
        Math.abs(normalA - edge.at) > tolerance ||
        Math.abs(normalB - edge.at) > tolerance
      )
        return [];
      const start = Math.max(edge.start, Math.min(a, b)),
        end = Math.min(edge.end, Math.max(a, b));
      return end - start >= minimumSpan - 1e-7 ? [{ ...edge, start, end }] : [];
    });
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++) {
        const a = hits[i],
          b = hits[j];
        if (
          a.room.id !== b.room.id &&
          a.axis === b.axis &&
          a.side !== b.side &&
          Math.abs(a.at - b.at) <= tolerance &&
          Math.min(a.end, b.end) - Math.max(a.start, b.start) >=
            minimumSpan - 1e-7
        ) {
          graph.get(a.room.id)!.add(b.room.id);
          graph.get(b.room.id)!.add(a.room.id);
          linkedOpenings.add(item.id);
        }
      }
    if (item.type === "door")
      for (const edge of hits) {
        // Only the outer extent qualifies automatically; recesses/courtyards need manual review.
        const outside =
          edge.axis === "h"
            ? edge.side < 0
              ? minY
              : maxY
            : edge.side < 0
              ? minX
              : maxX;
        if (Math.abs(edge.at - outside) <= tolerance) {
          roots.add(edge.room.id);
          linkedOpenings.add(item.id);
        }
      }
  }
  const reachable = new Set(roots),
    queue = [...roots];
  for (let i = 0; i < queue.length; i++)
    for (const id of graph.get(queue[i]) || [])
      if (!reachable.has(id)) {
        reachable.add(id);
        queue.push(id);
      }
  return {
    reachable,
    unreachable: floor.rooms.filter((r) => !reachable.has(r.id)),
    unattached: passages.filter((i) => !linkedOpenings.has(i.id)),
    entranceRooms: roots.size,
  };
}
export function doorwayChecks(floor: Floor, units: DisplayUnits = "m") {
  const access = doorwayAccess(floor);
  const limitations = `Room-boundary connections only (overlap ≥ ${formatLength(minimumSpan, units, 2)}). Furniture, internal partitions, clear passage and connections between floors need review; entrances recessed from the outer room extent may need manual verification.`;
  return [
    {
      level: access.unreachable.length
        ? ("error" as const)
        : floor.walls.length
          ? ("warning" as const)
          : ("pass" as const),
      title: "Doorway connections",
      detail: !floor.rooms.length
        ? "No rooms to check."
        : !access.entranceRooms
          ? `No exterior door was identified. ${limitations}`
          : access.unreachable.length
            ? `No doorway connection from an exterior door on this floor: ${access.unreachable.map((r) => r.name).join(", ")}. ${limitations}`
            : `All ${floor.rooms.length} rooms connect through doors or openings to an exterior door on this floor. ${limitations}`,
    },
    ...(access.unattached.length
      ? [
          {
            level: "warning" as const,
            title: "Unconnected doors and openings",
            detail: `Check alignment and usable boundary overlap for: ${access.unattached.map((i) => i.name).join(", ")}. Windows do not count as passages.`,
          },
        ]
      : []),
  ];
}
