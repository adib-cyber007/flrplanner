import {
  FloorSchema,
  WallSchema,
  type Floor,
  type Item,
  type Wall,
} from "./model";
import { openingLine, wallSegments } from "./geometry";

const precise = (n: number) => Math.round(n * 1e6) / 1e6;
const angleDelta = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
function attachment(wall: Wall, item: Item) {
  if (!["door", "window", "opening"].includes(item.type)) return undefined;
  const dx = wall.x2 - wall.x1,
    dy = wall.y2 - wall.y1,
    length = Math.hypot(dx, dy);
  if (length < 0.2) return undefined;
  const { a, b } = openingLine(item);
  const along = (p: { x: number; y: number }) =>
    ((p.x - wall.x1) * dx + (p.y - wall.y1) * dy) / length;
  const distance = Math.max(
    ...[a, b].map(
      (p) => Math.abs((p.x - wall.x1) * dy - (p.y - wall.y1) * dx) / length,
    ),
  );
  return distance <= 0.02 &&
    Math.min(along(a), along(b)) >= -1e-6 &&
    Math.max(along(a), along(b)) <= length + 1e-6
    ? distance
    : undefined;
}

export function wallEndpoints(
  wall: Wall,
  length: number,
  angleDegrees: number,
  anchor: "start" | "end" = "start",
) {
  if (
    !Number.isFinite(length) ||
    length < 0.2 ||
    !Number.isFinite(angleDegrees)
  )
    throw Error("Enter a wall length of at least 0.2 m and a finite angle.");
  const angle = ((angleDegrees % 360) * Math.PI) / 180,
    dx = length * Math.cos(angle),
    dy = length * Math.sin(angle);
  return anchor === "start"
    ? {
        x1: wall.x1,
        y1: wall.y1,
        x2: precise(wall.x1 + dx),
        y2: precise(wall.y1 + dy),
      }
    : {
        x1: precise(wall.x2 - dx),
        y1: precise(wall.y2 - dy),
        x2: wall.x2,
        y2: wall.y2,
      };
}

/** Edit one custom wall; attached openings retain size and distance from the chosen anchor. */
export function editWall(
  floor: Floor,
  id: string,
  patch: Partial<Omit<Wall, "id">>,
  anchor?: "start" | "end",
): Floor {
  const old = floor.walls.find((w) => w.id === id);
  if (!old) throw Error("This custom wall is no longer on the floor.");
  const parsed = WallSchema.safeParse({ ...old, ...patch });
  if (!parsed.success)
    throw Error(
      "Wall dimensions exceed the supported coordinate or thickness limits.",
    );
  const next = parsed.data;
  const positionChanged = (["x1", "y1", "x2", "y2"] as const).some(
    (k) => old[k] !== next[k],
  );
  if (
    old.geometryLocked &&
    (positionChanged || old.thickness !== next.thickness)
  )
    throw Error(
      `${old.name || "Custom wall"} has locked geometry. Unlock it before editing.`,
    );
  let items = floor.items;
  if (positionChanged) {
    const oldLength = Math.hypot(old.x2 - old.x1, old.y2 - old.y1);
    if (Math.hypot(next.x2 - next.x1, next.y2 - next.y1) < 0.2 - 1e-6)
      throw Error("A custom wall must be at least 0.2 m long.");
    const fixed =
      anchor ??
      ((old.x1 !== next.x1 || old.y1 !== next.y1) &&
      old.x2 === next.x2 &&
      old.y2 === next.y2
        ? "end"
        : "start");
    const delta =
      Math.atan2(next.y2 - next.y1, next.x2 - next.x1) -
      Math.atan2(old.y2 - old.y1, old.x2 - old.x1);
    const from =
      fixed === "start" ? { x: old.x1, y: old.y1 } : { x: old.x2, y: old.y2 };
    const to =
      fixed === "start"
        ? { x: next.x1, y: next.y1 }
        : { x: next.x2, y: next.y2 };
    const walls = wallSegments(floor);
    if (oldLength >= 0.2)
      items = floor.items.map((item) => {
        const distance = attachment(old, item);
        if (distance === undefined) return item;
        if (
          walls.some((w) => {
            const other = w !== old ? attachment(w, item) : undefined;
            return other !== undefined && other <= distance + 0.001;
          })
        )
          throw Error(
            `${item.name} lies on more than one wall. Move the opening off the overlapping walls before editing this wall.`,
          );
        const door = item.type === "door";
        const x = item.x + (door ? 0 : item.w / 2) - from.x,
          y = item.y + (door ? 0 : item.h / 2) - from.y;
        const moved = {
          ...item,
          x: precise(
            to.x +
              x * Math.cos(delta) -
              y * Math.sin(delta) -
              (door ? 0 : item.w / 2),
          ),
          y: precise(
            to.y +
              x * Math.sin(delta) +
              y * Math.cos(delta) -
              (door ? 0 : item.h / 2),
          ),
          rotation: precise(
            (((item.rotation + (delta * 180) / Math.PI) % 360) + 360) % 360,
          ),
        };
        if (attachment(next, moved) === undefined)
          throw Error(
            `${item.name} would no longer fit on this wall. Move or resize the opening before shortening the wall.`,
          );
        const changed =
          Math.abs(moved.x - item.x) > 1e-6 ||
          Math.abs(moved.y - item.y) > 1e-6 ||
          Math.abs(angleDelta(moved.rotation - item.rotation)) > 1e-6;
        if (item.locked && changed)
          throw Error(
            `${item.name} is locked. Unlock it before moving its wall.`,
          );
        return changed ? moved : item;
      });
  }
  const result = {
    ...floor,
    walls: floor.walls.map((w) => (w.id === id ? next : w)),
    items,
  };
  const checked = FloorSchema.safeParse(result);
  if (!checked.success) throw Error(checked.error.issues[0].message);
  return result;
}
