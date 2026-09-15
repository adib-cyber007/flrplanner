import { z } from "zod";
import {
  BriefSchema,
  DEFAULT_ROOM_WALL_THICKNESS,
  EditOperationSchema,
  EditProposalSchema,
  FloorSchema,
  openingDimensions,
  makeItem,
  uid,
  type Brief,
  type EditOperation,
  type Floor,
  type EditProposal,
} from "./model";
import { moveRoom, snapOpening, geometryLockIssue } from "./editing";
import { validateFloor } from "./planner";
import { roomSizeChecks } from "./roomSizes";
import { relationshipChecks } from "./relationships";
import { circulationChecks } from "./circulation";
import { doorwayAccess } from "./access";
import { unresolvedWrittenRequirements } from "./requirementLinks";
import { ceilingHeight, heightChecks } from "./heights";
import { openingChecks } from "./openings";
import { editWall, wallEndpoints } from "./wallEditing";
import { formatLength, type DisplayUnits } from "./units";

export async function designHash(floor: Floor, brief: Brief) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({
        floor: FloorSchema.parse({ ...floor, reference: undefined }),
        brief: BriefSchema.parse(brief),
      }),
    ),
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
function delta(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  units: DisplayUnits = "m",
) {
  const labels: Record<string, string> = {
    w: "width",
    h: "depth",
    x: "X",
    y: "Y",
    rotation: "rotation",
    material: "floor finish",
    color: "color",
    name: "name",
    type: "room type",
    locked: "locked",
    opening: "opening elevation",
    thickness: "thickness",
    wallThickness: "room wall thickness",
    x1: "start X",
    y1: "start Y",
    x2: "end X",
    y2: "end Y",
  };
  return Object.entries(patch)
    .filter(([k, v]) => before[k] !== v)
    .map(([k, v]) => {
      const fmt = (n: unknown) =>
        typeof n === "number"
          ? k === "rotation"
            ? `${Number(n.toFixed(3))}°`
            : formatLength(n, units, 3)
          : k === "opening" &&
              n &&
              typeof n === "object" &&
              "height" in n &&
              "sill" in n
            ? `height ${formatLength(Number(n.height), units, 6)}, sill ${formatLength(Number(n.sill), units, 6)}`
            : n === undefined && k === "opening"
              ? "default dimensions"
              : String(n);
      return `${labels[k] || k}: ${fmt(before[k])} → ${fmt(v)}`;
    })
    .join("; ");
}
export function applyOperations(
  original: Floor,
  input: EditOperation[],
  brief: Brief,
  units: DisplayUnits = "m",
) {
  const operations = z.array(EditOperationSchema).min(1).max(30).parse(input);
  if (unresolvedWrittenRequirements(brief).length)
    throw Error(
      "A non-negotiable written requirement is unresolved. AI edits cannot verify it yet. Review Requirements & constraints and resolve it through manual design before requesting an AI change.",
    );
  let floor = structuredClone(original);
  const changes: string[] = [];
  for (const op of operations) {
    if (op.kind === "add_item") {
      const { kind: _kind, type, x, y, ...options } = op;
      const item = snapOpening(floor, makeItem(type, x, y, options));
      floor.items.push(item);
      changes.push(
        `Add ${item.name} at (${formatLength(item.x, units)}, ${formatLength(item.y, units)}).`,
      );
      continue;
    }
    if (op.kind === "add_room") {
      floor.rooms.push({ ...op.room, id: uid() });
      changes.push(
        `Add ${op.room.name}, ${formatLength(op.room.w, units)} × ${formatLength(op.room.h, units)}.`,
      );
      continue;
    }
    const kind =
      op.kind === "remove"
        ? op.target
        : op.kind === "update_room"
          ? "room"
          : op.kind === "update_item"
            ? "item"
            : "wall";
    const key = kind === "room" ? "rooms" : kind === "item" ? "items" : "walls";
    const found = floor[key].find((x) => x.id === op.id);
    if (!found)
      throw Error(
        "The proposed edit refers to an object that is not on this floor. Ask again using its name or select it first.",
      );
    const label = ("name" in found && found.name) || "Custom wall";
    if (
      kind === "wall" &&
      "x1" in found &&
      found.geometryLocked &&
      (op.kind === "remove" ||
        (op.kind === "update_wall" &&
          (["x1", "y1", "x2", "y2", "thickness"] as const).some(
            (k) => op.patch[k] !== undefined && op.patch[k] !== found[k],
          )))
    )
      throw Error(
        `${label} has locked geometry. Unlock it in Wall properties before asking for this edit.`,
      );
    if (
      kind === "room" &&
      "w" in found &&
      "geometryLocked" in found &&
      found.geometryLocked &&
      (op.kind === "remove" ||
        (op.kind === "update_room" &&
          (["x", "y", "w", "h", "wallThickness"] as const).some(
            (k) => op.patch[k] !== undefined && op.patch[k] !== found[k],
          )))
    )
      throw Error(
        `${label} has locked geometry. Unlock it in Room properties before asking for this edit.`,
      );
    if (
      "locked" in found &&
      found.locked &&
      !(
        op.kind === "update_item" &&
        op.patch.locked === false &&
        Object.keys(op.patch).length === 1
      )
    )
      throw Error(`${label} is locked. Unlock it before asking for this edit.`);
    if (op.kind === "remove") {
      floor = { ...floor, [key]: floor[key].filter((x) => x.id !== op.id) };
      changes.push(
        `Remove ${label}${kind === "room" ? " (its furniture stays on the floor)" : ""}.`,
      );
    } else {
      const description = delta(found, op.patch, units);
      if (!description) continue;
      if (op.kind === "update_room") {
        const room = floor.rooms.find((r) => r.id === op.id)!;
        floor = moveRoom(
          floor,
          op.id,
          op.patch.x ?? room.x,
          op.patch.y ?? room.y,
        );
        const moved = floor.rooms.find((r) => r.id === op.id)!;
        if (
          moved.x !== (op.patch.x ?? room.x) ||
          moved.y !== (op.patch.y ?? room.y)
        )
          throw Error(
            "Moving this room would put its contents outside the supported coordinate range.",
          );
        floor.rooms = floor.rooms.map((r) =>
          r.id === op.id ? { ...r, ...op.patch } : r,
        );
      } else if (op.kind === "update_item")
        floor.items = floor.items.map((i) =>
          i.id === op.id ? { ...i, ...op.patch } : i,
        );
      else {
        const beforeItems = floor.items;
        floor = editWall(floor, op.id, op.patch);
        const moved = floor.items.filter(
          (item, index) => item !== beforeItems[index],
        );
        if (moved.length)
          changes.push(
            `Attached openings follow the wall: ${moved.map((i) => i.name).join(", ")}.`,
          );
      }
      changes.push(`${label} — ${description}.`);
    }
  }
  const checkedFloor = FloorSchema.safeParse(floor);
  if (!checkedFloor.success) throw Error(checkedFloor.error.issues[0].message);
  const lockIssue = geometryLockIssue(original, floor);
  if (lockIssue) throw Error(lockIssue);
  const sizeFailure = roomSizeChecks(floor, brief, undefined, units).find(
    (c) => c.level === "error",
  );
  const circulationFailure = circulationChecks(floor, brief, units).find(
    (c) => c.level === "error",
  );
  if (circulationFailure)
    throw Error(
      `The proposed edit violates a required circulation width. ${circulationFailure.detail}`,
    );
  if (sizeFailure)
    throw Error(
      `The proposed edit violates a required room size. ${sizeFailure.detail} Review the size requirement before applying a conflicting edit.`,
    );
  if (!changes.length)
    throw Error("This request would not change the current floor.");
  const checks = validateFloor(floor, brief, undefined, units);
  const openingFailure = openingChecks(floor, brief, units).find(
    (c) => c.level === "error",
  );
  if (openingFailure) throw Error(openingFailure.detail);
  const heightFailure = heightChecks(floor, brief, undefined, units).find(
    (c) => c.level === "error",
  );
  if (heightFailure)
    throw Error(
      `The floor height does not match the brief. ${heightFailure.detail} Review Floor settings before applying AI edits.`,
    );
  const relationshipFailure = relationshipChecks(
    floor,
    brief,
    undefined,
    units,
  ).find((c) => c.level === "error");
  if (relationshipFailure)
    throw Error(
      `The edit violates a required room relationship. ${relationshipFailure.detail}`,
    );
  const envelopeFailure = checks.find(
    (c) => c.title === "Building envelope" && c.level === "error",
  );
  if (envelopeFailure)
    throw Error(
      `The proposed edit exceeds the plot's buildable footprint. ${envelopeFailure.detail} Revise the edit or review the site constraints.`,
    );
  const warnings = checks
    .filter((c) => c.level === "error" || c.level === "warning")
    .map((c) => `${c.title}: ${c.detail}`)
    .slice(0, 20);
  const beforeAccess = doorwayAccess(original),
    afterAccess = doorwayAccess(floor);
  const lost = floor.rooms.filter(
    (room) =>
      !afterAccess.reachable.has(room.id) &&
      (beforeAccess.reachable.has(room.id) ||
        !original.rooms.some((r) => r.id === room.id)),
  );
  if (lost.length)
    throw Error(
      `This edit would leave rooms without a doorway connection from an exterior door: ${lost.map((r) => r.name).join(", ")}. Include a replacement doorway or revise the edit.`,
    );
  return { floor, changes, warnings };
}
export async function proposeEdits(
  floor: Floor,
  brief: Brief,
  operations: EditOperation[],
  units: DisplayUnits = "m",
): Promise<EditProposal> {
  const checked = applyOperations(floor, operations, brief, units);
  return EditProposalSchema.parse({
    floorId: floor.id,
    baseHash: await designHash(floor, brief),
    operations,
    changes: checked.changes,
    warnings: checked.warnings,
    status: "pending",
  });
}

export type Target = { kind: "room" | "item" | "wall"; id: string };
/** Small complete-command grammar for fast offline edits. Ambiguous targets are never guessed. */
export function simpleEdit(
  text: string,
  floor: Floor,
  selected?: Target | null,
): { operations?: EditOperation[]; reply?: string } {
  const command = text.trim().replace(/[.!]$/, ""),
    normalized = command.toLowerCase();
  if (/\band\b|;|\n/.test(normalized)) return {};
  const resolve = (name: string): Target | string => {
    const query = name
      .toLowerCase()
      .replace(/^(?:the|my)\s+/, "")
      .trim();
    if (
      /^(?:it|this|selected(?: (?:room|object|item|wall|door|window|opening))?)$/.test(
        query,
      )
    )
      return (
        selected ||
        "Select a room or object first, or include its name in your prompt."
      );
    const targets = [
      ...floor.walls.map((w, i) => ({
        kind: "wall" as const,
        id: w.id,
        name: w.name || `Wall ${i + 1}`,
        type: "wall",
      })),
      ...floor.rooms.map((r) => ({
        kind: "room" as const,
        id: r.id,
        name: r.name,
        type: r.type,
      })),
      ...floor.items.map((i) => ({
        kind: "item" as const,
        id: i.id,
        name: i.name,
        type:
          i.type === "dining"
            ? "dining table"
            : i.type === "coffee"
              ? "coffee table"
              : i.type,
      })),
    ];
    let matches = targets.filter((t) => t.name.toLowerCase() === query);
    if (!matches.length)
      matches = targets.filter(
        (t) =>
          t.type.toLowerCase() === query ||
          t.name.toLowerCase().includes(query),
      );
    if (matches.length === 1) return matches[0];
    return matches.length
      ? `There are ${matches.length} matches for “${name}”. Select the one you mean, then refer to “selected object” or “selected room”.`
      : `I couldn't find “${name}” on this floor. Select the target or use its name from Layers.`;
  };
  const targetOperation = (
    name: string,
    fn: (target: Target) => EditOperation,
  ): ReturnType<typeof simpleEdit> => {
    const target = resolve(name);
    return typeof target === "string"
      ? { reply: target }
      : { operations: [fn(target)] };
  };
  const patch = (
    target: Target,
    values: Record<string, unknown>,
  ): EditOperation =>
    ({
      kind:
        target.kind === "room"
          ? "update_room"
          : target.kind === "item"
            ? "update_item"
            : "update_wall",
      id: target.id,
      patch: values,
    }) as EditOperation;
  const object = (t: Target) =>
    (t.kind === "room"
      ? floor.rooms
      : t.kind === "item"
        ? floor.items
        : floor.walls
    ).find((x) => x.id === t.id)!;
  const remove = normalized.match(/^(?:please\s+)?(?:remove|delete)\s+(.+)$/);
  if (remove)
    return targetOperation(remove[1], (t) => ({
      kind: "remove",
      target: t.kind,
      id: t.id,
    }));
  const rename = command.match(
    /^(?:please\s+)?rename\s+(.+?)\s+to\s+["']?(.+?)["']?$/i,
  );
  if (rename)
    return targetOperation(rename[1], (t) => patch(t, { name: rename[2] }));
  const elevation = normalized.match(
    /^(?:please\s+)?(?:set|make|change)\s+(.+?)\s+(sill height|opening height|height)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet)$/,
  );
  if (elevation)
    return targetOperation(elevation[1], (t) => {
      const item =
        t.kind === "item" ? floor.items.find((i) => i.id === t.id) : undefined;
      const dimensions = item && openingDimensions(item);
      if (!item || !dimensions)
        throw Error(
          "Select a door, window or open passage for opening dimensions. Use Floor settings for ceiling height.",
        );
      const value =
        Number(elevation[3]) * (/ft|feet/.test(elevation[4]) ? 0.3048 : 1);
      const sill = elevation[2] === "sill height";
      if (sill && item.type !== "window")
        throw Error(
          "Sill height applies to windows. Doors and open passages start at floor level.",
        );
      return patch(t, {
        opening: {
          height: sill ? dimensions.height : value,
          sill: sill ? value : dimensions.sill,
        },
      });
    });
  const size = normalized.match(
    /^(?:please\s+)?(?:make|resize|set)\s+(.+?)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet)\s+(wide|wider|narrower|deep|deeper|shorter)$/,
  );
  if (size)
    return targetOperation(size[1], (t) => {
      const value = +size[2] * (/ft|feet/.test(size[3]) ? 0.3048 : 1),
        key = /wide|wider|narrower/.test(size[4]) ? "w" : "h",
        source = object(t);
      if (!(key in source)) throw Error("Select a room or object to resize.");
      const old = (source as unknown as Record<string, number>)[key];
      const next = /wider|deeper/.test(size[4])
        ? old + value
        : /narrower|shorter/.test(size[4])
          ? old - value
          : value;
      return patch(t, { [key]: Number(next.toFixed(4)) });
    });
  const move = normalized.match(
    /^(?:please\s+)?move\s+(.+?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet)\s+(?:to\s+the\s+)?(left|right|up|down|north|south|east|west)$/,
  );
  if (move)
    return targetOperation(move[1], (t) => {
      const source = object(t);
      const amount = +move[2] * (/ft|feet/.test(move[3]) ? 0.3048 : 1),
        horizontal = /left|right|east|west/.test(move[4]),
        key = horizontal ? "x" : "y";
      const offset = amount * (/left|up|north|west/.test(move[4]) ? -1 : 1);
      if ("x1" in source)
        return patch(
          t,
          horizontal
            ? { x1: source.x1 + offset, x2: source.x2 + offset }
            : { y1: source.y1 + offset, y2: source.y2 + offset },
        );
      return patch(t, {
        [key]: Number(
          (
            source[key] +
            amount * (/left|up|north|west/.test(move[4]) ? -1 : 1)
          ).toFixed(4),
        ),
      });
    });
  const rotate = normalized.match(
    /^(?:please\s+)?rotate\s+(.+?)\s+(?:by\s+)?(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)$/,
  );
  if (rotate)
    return targetOperation(rotate[1], (t) => {
      const source = object(t);
      if ("x1" in source)
        return patch(
          t,
          wallEndpoints(
            source,
            Math.hypot(source.x2 - source.x1, source.y2 - source.y1),
            (Math.atan2(source.y2 - source.y1, source.x2 - source.x1) * 180) /
              Math.PI +
              Number(rotate[2]),
          ),
        );
      if (!("rotation" in source))
        throw Error(
          "Rotation is available for furniture and openings. Rooms have rectangular footprints.",
        );
      return patch(t, { rotation: source.rotation + +rotate[2] });
    });
  return {};
}

export function modelContext(floor: Floor, selected?: Target | null) {
  const ids = new Map<string, string>();
  const rooms = floor.rooms.map((r, i) => {
    const ref = `r${i + 1}`;
    ids.set(ref, r.id);
    return {
      ref,
      name: r.name,
      type: r.type,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      wallThickness: r.wallThickness ?? DEFAULT_ROOM_WALL_THICKNESS,
      material: r.material,
      geometryLocked: !!r.geometryLocked,
    };
  });
  const items = floor.items.map((item, i) => {
    const ref = `i${i + 1}`;
    ids.set(ref, item.id);
    const dimensions = openingDimensions(item);
    return {
      ref,
      name: item.name,
      type: item.type,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      rotation: item.rotation,
      locked: item.locked,
      opening: dimensions
        ? { height: dimensions.height, sill: dimensions.sill }
        : undefined,
    };
  });
  const walls = floor.walls.map((w, i) => {
    const ref = `w${i + 1}`;
    ids.set(ref, w.id);
    return { ...w, id: undefined, ref };
  });
  const selection = selected
    ? [...ids].find(([, id]) => id === selected.id)?.[0]
    : undefined;
  return {
    context: {
      floorName: floor.name,
      ceilingHeight: ceilingHeight(floor),
      programIndex: floor.programIndex,
      rooms,
      items,
      walls,
      selection,
    },
    ids,
  };
}
