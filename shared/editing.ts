import {
  DEFAULT_CEILING_HEIGHT,
  DEFAULT_ROOM_WALL_THICKNESS,
  FloorSchema,
  type Floor,
  type Item,
} from "./model";
import { openingLine, wallSegments } from "./geometry";

const round = (n: number) => Math.round(n * 10) / 10;
const precise = (n: number) => Math.round(n * 1e6) / 1e6;
const opening = (item: Item) =>
  ["door", "window", "opening"].includes(item.type);

/** Locks protect room footprints and custom wall geometry, independently of names. */
export function geometryLockIssue(before: Floor, after: Floor) {
  if (
    before.walls.some((w) => w.geometryLocked) &&
    (before.ceilingHeight ?? DEFAULT_CEILING_HEIGHT) !==
      (after.ceilingHeight ?? DEFAULT_CEILING_HEIGHT)
  )
    return "This floor has locked walls. Unlock their geometry before changing the ceiling height.";
  for (const room of before.rooms) {
    if (!room.geometryLocked) continue;
    const next = after.rooms.find((r) => r.id === room.id);
    if (
      !next ||
      (["x", "y", "w", "h"] as const).some((k) => next[k] !== room[k]) ||
      (next.wallThickness ?? DEFAULT_ROOM_WALL_THICKNESS) !==
        (room.wallThickness ?? DEFAULT_ROOM_WALL_THICKNESS)
    )
      return `${room.name} has locked geometry. Unlock its geometry in Room properties before moving, resizing or deleting it.`;
  }
  for (const wall of before.walls) {
    if (!wall.geometryLocked) continue;
    const next = after.walls.find((w) => w.id === wall.id);
    if (
      !next ||
      (["x1", "y1", "x2", "y2", "thickness"] as const).some(
        (k) => next[k] !== wall[k],
      )
    )
      return `${wall.name || "Custom wall"} has locked geometry. Unlock it in Wall properties before moving, resizing or deleting it.`;
  }
  return undefined;
}

export function regenerationLockIssue(floors: Floor[]) {
  const fixed = floors.flatMap((floor) => [
    ...floor.rooms
      .filter((r) => r.geometryLocked)
      .map((r) => `${floor.name}: ${r.name}`),
    ...floor.walls
      .filter((w) => w.geometryLocked)
      .map((w) => `${floor.name}: ${w.name || "Custom wall"}`),
  ]);
  return fixed.length
    ? `Regeneration is paused because geometry is locked (${fixed.slice(0, 6).join(", ")}${fixed.length > 6 ? ` and ${fixed.length - 6} more` : ""}). Continue editing the existing plan, or unlock these elements in Properties before replacing the layout.`
    : undefined;
}

export function moveRoom(
  floor: Floor,
  id: string,
  x: number,
  y: number,
): Floor {
  const room = floor.rooms.find((r) => r.id === id);
  if (!room || room.geometryLocked) return floor;
  const dx = x - room.x,
    dy = y - room.y;
  const contains = (px: number, py: number) =>
    px >= room.x - 0.01 &&
    px <= room.x + room.w + 0.01 &&
    py >= room.y - 0.01 &&
    py <= room.y + room.h + 0.01;
  const next = {
    ...floor,
    rooms: floor.rooms.map((r) => (r.id === id ? { ...r, x, y } : r)),
    items: floor.items.map((item) => {
      const line = opening(item) ? openingLine(item) : null;
      const cx = line ? (line.a.x + line.b.x) / 2 : item.x + item.w / 2;
      const cy = line ? (line.a.y + line.b.y) / 2 : item.y + item.h / 2;
      return !item.locked && contains(cx, cy)
        ? { ...item, x: precise(item.x + dx), y: precise(item.y + dy) }
        : item;
    }),
    walls: floor.walls.map((w) =>
      !w.geometryLocked && contains(w.x1, w.y1) && contains(w.x2, w.y2)
        ? {
            ...w,
            x1: precise(w.x1 + dx),
            x2: precise(w.x2 + dx),
            y1: precise(w.y1 + dy),
            y2: precise(w.y2 + dy),
          }
        : w,
    ),
  };
  return FloorSchema.safeParse(next).success ? next : floor;
}

/** Align the opening's real cut line, accounting for the door hinge pivot. */
export function snapOpening(floor: Floor, item: Item, radius = 0.6): Item {
  if (!opening(item) || item.locked) return item;
  const door = item.type === "door",
    span = door ? item.w : Math.max(item.w, item.h);
  const px = item.x + (door ? 0 : item.w / 2),
    py = item.y + (door ? 0 : item.h / 2);
  let best = radius,
    result = item;
  for (const wall of wallSegments(floor)) {
    const dx = wall.x2 - wall.x1,
      dy = wall.y2 - wall.y1,
      len = Math.hypot(dx, dy);
    if (len < span + 0.02) continue;
    let ux = dx / len,
      uy = dy / len;
    let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (door && Math.cos(((item.rotation - angle) * Math.PI) / 180) < -0.001) {
      ux *= -1;
      uy *= -1;
      angle += 180;
    }
    const sx = ux * dx + uy * dy < 0 ? wall.x2 : wall.x1,
      sy = ux * dx + uy * dy < 0 ? wall.y2 : wall.y1;
    const t = Math.max(
      door ? 0.01 : span / 2,
      Math.min(
        len - (door ? span + 0.01 : span / 2),
        (px - sx) * ux + (py - sy) * uy,
      ),
    );
    const ax = sx + t * ux,
      ay = sy + t * uy,
      distance = Math.hypot(px - ax, py - ay);
    if (distance > best) continue;
    best = distance;
    result = {
      ...item,
      x: ax - (door ? 0 : item.w / 2),
      y: ay - (door ? 0 : item.h / 2),
      rotation: angle - (!door && item.h > item.w ? 90 : 0),
    };
  }
  return result;
}

/** Resize from one corner while its diagonally opposite corner stays fixed. */
export function resizeElement(
  floor: Floor,
  kind: "room" | "item",
  id: string,
  corner: [number, number],
  pointer: { x: number; y: number },
): Floor {
  const object = (kind === "room" ? floor.rooms : floor.items).find(
    (o) => o.id === id,
  );
  if (
    !object ||
    ("locked" in object && object.locked) ||
    ("geometryLocked" in object && object.geometryLocked)
  )
    return floor;
  const door = "type" in object && object.type === "door";
  const angle = (("rotation" in object ? object.rotation : 0) * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle),
    [cx, cy] = corner;
  const center = {
    x: object.x + (door ? 0 : object.w / 2),
    y: object.y + (door ? 0 : object.h / 2),
  };
  const fx = (1 - cx) * object.w - (door ? 0 : object.w / 2),
    fy = (1 - cy) * object.h - (door ? 0 : object.h / 2);
  const anchor = {
    x: center.x + fx * c - fy * s,
    y: center.y + fx * s + fy * c,
  };
  const dx = pointer.x - anchor.x,
    dy = pointer.y - anchor.y;
  const min = kind === "room" ? 0.5 : 0.1,
    max = kind === "room" ? 100 : 20;
  const w = Math.min(
    max,
    Math.max(min, round((cx ? 1 : -1) * (dx * c + dy * s))),
  );
  const h = Math.min(
    max,
    Math.max(min, round((cy ? 1 : -1) * (-dx * s + dy * c))),
  );
  const ax = (1 - cx) * w - (door ? 0 : w / 2),
    ay = (1 - cy) * h - (door ? 0 : h / 2);
  const resized = {
    ...object,
    w,
    h,
    x: anchor.x - ax * c + ay * s - (door ? 0 : w / 2),
    y: anchor.y - ax * s - ay * c - (door ? 0 : h / 2),
  };
  const key = kind === "room" ? "rooms" : "items";
  const next = {
    ...floor,
    [key]: floor[key].map((o) => (o.id === id ? resized : o)),
  };
  return FloorSchema.safeParse(next).success ? next : floor;
}
