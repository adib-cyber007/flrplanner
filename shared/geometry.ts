import type { Floor, Item, Room, Wall } from "./model";
import { DEFAULT_ROOM_WALL_THICKNESS, openingDimensions } from "./model";
import { WALKTHROUGH_CLEAR_HEIGHT } from "./openings";
export type Segment = Wall & {
  boundaryAxis?: "h" | "v";
  boundaryAt?: number;
};
export function roomWallSegments(floor: Floor): Segment[] {
  const rows = new Map<
    string,
    {
      axis: "h" | "v";
      at: number;
      spans: [number, number, number, -1 | 1][];
    }
  >();
  for (const r of floor.rooms)
    for (const [axis, at, start, end, inward] of [
      ["h", r.y, r.x, r.x + r.w, 1],
      ["h", r.y + r.h, r.x, r.x + r.w, -1],
      ["v", r.x, r.y, r.y + r.h, 1],
      ["v", r.x + r.w, r.y, r.y + r.h, -1],
    ] as const) {
      const key = axis + at.toFixed(4);
      if (!rows.has(key)) rows.set(key, { axis, at, spans: [] });
      rows
        .get(key)!
        .spans.push([
          start,
          end,
          r.wallThickness ?? DEFAULT_ROOM_WALL_THICKNESS,
          inward,
        ]);
    }
  const result: Segment[] = [];
  for (const [key, row] of rows) {
    // Split at every overlap boundary. Shared portions use the thickest wall,
    // while the rest of each room's wall keeps its own thickness.
    const breaks = [...new Set(row.spans.flatMap(([a, b]) => [a, b]))].sort(
      (a, b) => a - b,
    );
    const merged: [number, number, number, number][] = [];
    for (let i = 0; i < breaks.length - 1; i++) {
      const a = breaks[i],
        b = breaks[i + 1],
        mid = (a + b) / 2;
      const active = row.spans.filter(([s, e]) => s <= mid && e >= mid);
      const thickness = Math.max(0, ...active.map((s) => s[2]));
      if (!thickness || b - a < 1e-7) continue;
      const directions = new Set(active.map((s) => s[3]));
      // An unshared wall sits wholly inside its room. Rooms on opposite sides
      // share one centered wall, so each footprint contains half of it.
      const offset = directions.size > 1 ? 0 : active[0][3] * thickness * 0.5;
      const last = merged.at(-1);
      if (
        last &&
        Math.abs(a - last[1]) < 1e-7 &&
        last[2] === thickness &&
        last[3] === offset
      )
        last[1] = b;
      else merged.push([a, b, thickness, offset]);
    }
    for (const [i, [a, b, thickness, offset]] of merged.entries())
      result.push({
        id: key + "-" + i,
        x1: row.axis === "h" ? a : row.at + offset,
        y1: row.axis === "h" ? row.at + offset : a,
        x2: row.axis === "h" ? b : row.at + offset,
        y2: row.axis === "h" ? row.at + offset : b,
        thickness,
        boundaryAxis: row.axis,
        boundaryAt: row.at,
      });
  }
  return result;
}
export function roomInteriorDimensions(
  floor: Floor,
  room: Room,
  segments = roomWallSegments(floor),
) {
  const inset = (
    axis: "h" | "v",
    at: number,
    start: number,
    end: number,
    inward: -1 | 1,
  ) =>
    Math.max(
      0,
      ...segments
        .filter((wall) => {
          if (
            wall.boundaryAxis !== axis ||
            Math.abs((wall.boundaryAt ?? 0) - at) > 1e-6
          )
            return false;
          const a =
            axis === "h"
              ? Math.min(wall.x1, wall.x2)
              : Math.min(wall.y1, wall.y2);
          const b =
            axis === "h"
              ? Math.max(wall.x1, wall.x2)
              : Math.max(wall.y1, wall.y2);
          return b > start + 1e-7 && a < end - 1e-7;
        })
        .map((wall) => {
          const center = axis === "h" ? wall.y1 : wall.x1;
          const innerFace = center + inward * wall.thickness * 0.5;
          return Math.max(0, inward * (innerFace - at));
        }),
    );
  const left = inset("v", room.x, room.y, room.y + room.h, 1);
  const right = inset("v", room.x + room.w, room.y, room.y + room.h, -1);
  const top = inset("h", room.y, room.x, room.x + room.w, 1);
  const bottom = inset("h", room.y + room.h, room.x, room.x + room.w, -1);
  const width = Math.max(0, room.w - left - right);
  const depth = Math.max(0, room.h - top - bottom);
  return { width, depth, area: width * depth, left, right, top, bottom };
}
export function wallSegments(floor: Floor): Segment[] {
  return [...roomWallSegments(floor), ...floor.walls];
}
export function openingLine(item: Item) {
  const angle = (item.rotation * Math.PI) / 180;
  let a: { x: number; y: number }, b: { x: number; y: number };
  if (item.type === "door") {
    a = { x: 0, y: 0 };
    b = { x: item.w, y: 0 };
    return {
      a: { x: item.x, y: item.y },
      b: {
        x: item.x + b.x * Math.cos(angle),
        y: item.y + b.x * Math.sin(angle),
      },
    };
  }
  const horizontal = item.w >= item.h;
  a = horizontal ? { x: -item.w / 2, y: 0 } : { x: 0, y: -item.h / 2 };
  b = horizontal ? { x: item.w / 2, y: 0 } : { x: 0, y: item.h / 2 };
  const rotate = (p: { x: number; y: number }) => ({
    x: item.x + item.w / 2 + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: item.y + item.h / 2 + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  });
  return { a: rotate(a), b: rotate(b) };
}
export function wallOpenings(wall: Segment, items: Item[]) {
  const dx = wall.x2 - wall.x1,
    dy = wall.y2 - wall.y1,
    length = Math.hypot(dx, dy);
  if (length < 0.01) return [];
  const ux = dx / length,
    uy = dy / length;
  return items
    .filter((i) => ["door", "window", "opening"].includes(i.type))
    .flatMap((item) => {
      const { a, b } = openingLine(item);
      const distance = (p: { x: number; y: number }) =>
        Math.abs((p.x - wall.x1) * uy - (p.y - wall.y1) * ux);
      const tolerance = Math.max(0.22, wall.thickness / 2 + 0.02);
      if (distance(a) > tolerance || distance(b) > tolerance) return [];
      const project = (p: { x: number; y: number }) =>
        (p.x - wall.x1) * ux + (p.y - wall.y1) * uy;
      const openingStart = Math.min(project(a), project(b)),
        openingEnd = Math.max(project(a), project(b));
      const start = Math.max(0, openingStart),
        end = Math.min(length, openingEnd);
      return end - start > 0.05
        ? [
            {
              start,
              end,
              openingStart,
              openingEnd,
              type: item.type,
              id: item.id,
              bottom: openingDimensions(item)!.sill,
              top: openingDimensions(item)!.head,
            },
          ]
        : [];
    })
    .sort((a, b) => a.start - b.start);
}
export function canWalkTo(x: number, y: number, floor: Floor) {
  const roomWalls = roomWallSegments(floor);
  if (
    !floor.rooms.some((r) => {
      const clear = roomInteriorDimensions(floor, r, roomWalls);
      return (
        x > r.x + clear.left &&
        y > r.y + clear.top &&
        x < r.x + r.w - clear.right &&
        y < r.y + r.h - clear.bottom
      );
    })
  ) {
    // Door transitions lie just outside the inset room footprints.
    if (
      !floor.rooms.some(
        (r) => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h,
      )
    )
      return false;
  }
  for (const wall of [...roomWalls, ...floor.walls]) {
    const dx = wall.x2 - wall.x1,
      dy = wall.y2 - wall.y1,
      len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const along = ((x - wall.x1) * dx + (y - wall.y1) * dy) / len,
      normal = Math.abs((x - wall.x1) * dy - (y - wall.y1) * dx) / len;
    if (
      along < -0.18 ||
      along > len + 0.18 ||
      normal > 0.18 + wall.thickness / 2
    )
      continue;
    const opening = wallOpenings(wall, floor.items).some(
      (o) =>
        o.type !== "window" &&
        o.bottom <= 0 &&
        o.top >= WALKTHROUGH_CLEAR_HEIGHT &&
        along >= o.openingStart + 0.18 &&
        along <= o.openingEnd - 0.18,
    );
    if (!opening) return false;
  }
  return true;
}
