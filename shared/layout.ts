import { requestedHeight } from "./heights";
import { openingForBrief } from "./openings";
import {
  colors,
  makeItem,
  makeRoom,
  uid,
  type Brief,
  type Floor,
  type Item,
  type Room,
} from "./model";
import { siteEnvelope } from "./site";
import { programRooms } from "./program";
import { activeRelationships, arrangeBanks } from "./relationships";
import { circulationDimensions } from "./circulation";
type Program = {
  type: Room["type"];
  name: string;
  min: number;
  weight: number;
  minArea: number;
  minCross: number;
  max: number;
  maxArea: number;
  maxCross: number;
};
const minimumArea: Record<string, number> = {
  "Living room": 14,
  Kitchen: 7,
  Bedroom: 8,
  Bathroom: 3,
  "Dining room": 6,
  Office: 5,
  Utility: 3,
  Balcony: 3,
  Garage: 14,
  "Prayer room": 4,
};
const targetArea: Record<string, number> = {
  "Living room": 24,
  Kitchen: 12,
  Bedroom: 14,
  Bathroom: 5,
  "Dining room": 10,
  Office: 9,
  Utility: 5,
  Balcony: 6,
  Garage: 18,
  "Prayer room": 5,
};
/** Distribute spare length by weight, stopping at each room's upper limit.
 * If every room is capped, the remaining footprint stays unallocated. */
function allocateLengths(rooms: Program[], available: number) {
  const lengths = rooms.map((r) => r.min);
  let remaining = available - lengths.reduce((a, b) => a + b, 0);
  for (let pass = 0; pass <= rooms.length && remaining > 1e-9; pass++) {
    const active = rooms
      .map((r, i) => i)
      .filter((i) => lengths[i] < rooms[i].max - 1e-9);
    const weight = active.reduce((sum, i) => sum + rooms[i].weight, 0);
    if (!weight) break;
    const spare = remaining;
    for (const i of active) {
      const delta = Math.min(
        rooms[i].max - lengths[i],
        (spare * rooms[i].weight) / weight,
      );
      lengths[i] += delta;
      remaining -= delta;
    }
  }
  return lengths;
}
const palettes: Record<
  Brief["style"],
  { floor: string; bed: string; wet: string; wood: string }
> = {
  Japandi: {
    floor: "#ece4d7",
    bed: "#aab8a3",
    wet: "#dfe7e6",
    wood: "#c3a580",
  },
  Contemporary: {
    floor: "#e5e4df",
    bed: "#9faaa7",
    wet: "#d5dfe0",
    wood: "#ab9785",
  },
  Minimal: {
    floor: "#eeede6",
    bed: "#c8c9bd",
    wet: "#e3e7e0",
    wood: "#c9b89c",
  },
  Traditional: {
    floor: "#ddcbb2",
    bed: "#a8ac90",
    wet: "#e5dfce",
    wood: "#ac8560",
  },
  Industrial: {
    floor: "#d1d0c7",
    bed: "#929e91",
    wet: "#ccd4cf",
    wood: "#a78361",
  },
  Coastal: {
    floor: "#ece5d6",
    bed: "#9cbec0",
    wet: "#d9e8e4",
    wood: "#ccb793",
  },
};
/** Bounded beam search partitions the room program into two corridor-connected banks. */
export function layoutFloor(
  brief: Brief,
  variant: number,
  index: number,
): Floor {
  const envelope = siteEnvelope(brief);
  const across = ["East", "West"].includes(brief.orientation)
    ? envelope.depth
    : envelope.width;
  const available = across - circulationDimensions(brief).hallway;
  const candidates = [available / 2];
  if (brief.roomSizeRules?.length || brief.roomRelationships?.length) {
    for (const rule of brief.roomSizeRules || []) {
      const cross = ["East", "West"].includes(brief.orientation)
        ? rule.minDepth
        : rule.minWidth;
      if (cross !== undefined) candidates.push(cross, available - cross);
      const maxCross = ["East", "West"].includes(brief.orientation)
        ? rule.maxDepth
        : rule.maxWidth;
      if (maxCross !== undefined)
        candidates.push(maxCross, available - maxCross);
    }
    for (let i = 1; i < 20; i++) candidates.push((available * i) / 20);
  }
  let failure: unknown;
  for (const split of [...new Set(candidates)].sort(
    (a, b) => Math.abs(a - available / 2) - Math.abs(b - available / 2),
  )) {
    if (split < 1.8 || available - split < 1.8) continue;
    try {
      return layoutWithSplit(brief, variant, index, split);
    } catch (e) {
      failure = e;
    }
  }
  if (brief.roomRelationships?.length)
    throw Error(
      "The current layout search could not satisfy the room relationships together with the room counts and sizes. Review the relationships or adjust the program and plot. No conflicting layout was created.",
    );
  if (brief.roomSizeRules?.length)
    throw Error(
      "The current layout search could not fit the requested room counts and size limits. Review the plot, room program and size requirements. Your existing design is unchanged.",
    );
  throw (
    failure ||
    Error(
      "The buildable area is too narrow for rooms and a connecting hallway.",
    )
  );
}
function layoutWithSplit(
  brief: Brief,
  variant: number,
  index: number,
  split: number,
): Floor {
  const { width, depth } = siteEnvelope(brief);
  const horizontal = ["East", "West"].includes(brief.orientation),
    W = horizontal ? depth : width,
    D = horizontal ? width : depth,
    hall = circulationDimensions(brief).hallway,
    banks = [split, W - hall - split],
    leftBank = banks[0];
  if (Math.min(...banks) < 1.8 || D < 4)
    throw Error(
      "The buildable area is too narrow for rooms and a connecting hallway. Reduce setbacks or increase the plot.",
    );
  const list = programRooms(brief, index);
  const extras = list.map((r) => r.type);
  const program: Program[] = list.map((p) => {
    const rule = brief.roomSizeRules?.find((r) => r.roomType === p.type);
    return {
      ...p,
      min: Math.max(
        p.type === "Bedroom"
          ? 2.2
          : p.type === "Bathroom"
            ? 1.6
            : p.type === "Living room"
              ? 2.5
              : 1.8,
        (horizontal ? rule?.minWidth : rule?.minDepth) || 0,
        circulationDimensions(brief).door + 0.44,
      ),
      minArea: Math.max(minimumArea[p.type] || 4, rule?.minArea || 0),
      minCross: Math.max(
        (horizontal ? rule?.minDepth : rule?.minWidth) || 0,
        circulationDimensions(brief).door + 0.15,
      ),
      max: (horizontal ? rule?.maxWidth : rule?.maxDepth) ?? Infinity,
      maxCross: (horizontal ? rule?.maxDepth : rule?.maxWidth) ?? Infinity,
      maxArea: rule?.maxArea ?? Infinity,
      weight: targetArea[p.type] || 8,
    };
  });
  type Partition = {
    left: Program[];
    right: Program[];
    a: number;
    b: number;
    wa: number;
    wb: number;
  };
  let beam: Partition[] = [{ left: [], right: [], a: 0, b: 0, wa: 0, wb: 0 }];
  for (const room of program) {
    const next: Partition[] = [];
    for (const state of beam) {
      const left = {
        ...room,
        min: Math.max(room.min, room.minArea / banks[0]),
        max: Math.min(room.max, room.maxArea / banks[0]),
      };
      const right = {
        ...room,
        min: Math.max(room.min, room.minArea / banks[1]),
        max: Math.min(room.max, room.maxArea / banks[1]),
      };
      if (
        banks[0] + 1e-8 >= room.minCross &&
        banks[0] <= room.maxCross + 1e-8 &&
        left.min <= left.max + 1e-8 &&
        state.a + left.min <= D + 1e-8
      )
        next.push({
          ...state,
          left: [...state.left, left],
          a: state.a + left.min,
          wa: state.wa + room.weight,
        });
      if (
        banks[1] + 1e-8 >= room.minCross &&
        banks[1] <= room.maxCross + 1e-8 &&
        right.min <= right.max + 1e-8 &&
        state.b + right.min <= D + 1e-8
      )
        next.push({
          ...state,
          right: [...state.right, right],
          b: state.b + right.min,
          wb: state.wb + room.weight,
        });
    }
    beam = next
      .sort((a, b) => Math.abs(a.a - a.b) - Math.abs(b.a - b.b))
      .slice(0, 256);
    if (!beam.length)
      throw Error(
        "These rooms do not fit with usable clearances. Increase the plot, reduce setbacks, or reduce the room count.",
      );
  }
  const preferOffice =
    /office.{0,70}(?:next|near|adjacen)|(?:next|near|adjacen).{0,70}office/i.test(
      brief.notes,
    );
  const score = (p: Partition) => {
    let s = Math.abs(p.wa - p.wb) * 0.05;
    const same = (a: string, b: string) =>
      [p.left, p.right].some(
        (arr) => arr.some((x) => x.name === a) && arr.some((x) => x.name === b),
      );
    if (brief.openPlan && !same("Living room", "Kitchen")) s += 20;
    if (
      brief.openPlan &&
      extras.includes("Dining room") &&
      !same("Kitchen", "Dining room")
    )
      s += 8;
    if (preferOffice && !same("Office", "Primary bedroom")) s += 12;
    if (!p.left.length || !p.right.length) s += 100;
    return s;
  };
  beam.sort((a, b) => score(a) - score(b));
  const relationships = activeRelationships(brief, index);
  if (relationships.length) {
    const feasible: Partition[] = [];
    const cache = new Map<string, ReturnType<typeof arrangeBanks<Program>>>();
    for (const partition of beam) {
      const key =
        partition.left
          .map((r) => r.type)
          .sort()
          .join(",") +
        "/" +
        partition.right
          .map((r) => r.type)
          .sort()
          .join(",");
      if (!cache.has(key))
        cache.set(
          key,
          arrangeBanks(partition.left, partition.right, relationships),
        );
      const ordered = cache.get(key);
      if (ordered) feasible.push({ ...partition, ...ordered });
      if (feasible.length >= 3) break;
    }
    if (!feasible.length)
      throw Error("Room relationships do not fit this allocation.");
    beam = feasible;
  }
  const chosen = beam[Math.min(variant % 3, beam.length - 1)];
  const palette = palettes[brief.style];
  const rooms: Room[] = [makeRoom("Hallway", leftBank, 0, hall, D)];
  const items: Item[] = [];
  const rowGroups: Room[][] = [];
  for (const [side, raw] of [chosen.left, chosen.right].entries()) {
    const bank = banks[side];
    const ordered = [...raw];
    if (preferOffice && !relationships.length) {
      const office = ordered.findIndex((p) => p.type === "Office"),
        primary = ordered.findIndex((p) => p.name === "Primary bedroom");
      if (office >= 0 && primary >= 0) {
        const [o] = ordered.splice(office, 1);
        ordered.splice(
          ordered.findIndex((p) => p.name === "Primary bedroom") + 1,
          0,
          o,
        );
      }
    }
    const lengths = allocateLengths(ordered, D);
    let y = 0;
    const group: Room[] = [];
    for (const [i, p] of ordered.entries()) {
      const length = lengths[i];
      const r = makeRoom(
        p.type,
        side === 0 ? 0 : leftBank + hall,
        y,
        bank,
        length,
        p.name,
      );
      r.color = p.type === "Bathroom" ? palette.wet : palette.floor;
      r.material =
        brief.style === "Industrial"
          ? "plain"
          : ["Kitchen", "Bathroom", "Utility"].includes(p.type)
            ? "tile"
            : "oak";
      rooms.push(r);
      group.push(r);
      y += length;
      const doorW = circulationDimensions(brief).door;
      items.push(
        makeItem(
          "door",
          side === 0 ? leftBank : leftBank + hall,
          r.y + (side === 0 ? 0.22 : doorW + 0.22),
          { w: doorW, h: doorW, rotation: side === 0 ? 90 : 270 },
        ),
      );
      items.push(
        makeItem(
          "window",
          side === 0 ? -0.075 : W - 0.075,
          r.y + (r.h - Math.min(1.5, r.h - 0.5)) / 2,
          { w: 0.15, h: Math.min(1.5, r.h - 0.5) },
        ),
      );
      const add = (
        type: Item["type"],
        dx: number,
        dy: number,
        overrides: Partial<Item> = {},
      ) => {
        const item = makeItem(type, r.x + dx, r.y + dy, overrides);
        if (
          dx >= 0.1 &&
          dy >= 0.1 &&
          dx + item.w <= r.w - 0.1 &&
          dy + item.h <= r.h - 0.1
        )
          items.push(item);
      };
      if (p.type === "Living room") {
        add("rug", 0.5, 0.75, {
          w: Math.min(3.2, r.w - 0.9),
          h: Math.min(2.1, r.h - 1),
        });
        add("sofa", 0.45, 0.2, {
          w: Math.min(2.7, r.w - 1),
          color: palette.bed,
        });
        add("coffee", 1, 1.45, { color: palette.wood });
        add("plant", r.w - 0.8, r.h - 0.8);
      }
      if (p.type === "Kitchen") {
        add("kitchen", 0.15, 0.15, { w: r.w - 0.3, color: palette.bed });
        add("island", 0.65, 1.2, { w: Math.min(1.8, r.w - 1.1) });
      }
      if (p.type === "Bedroom") {
        const bw = r.w > 3 ? 1.6 : 1;
        add(bw > 1 ? "bed" : "single-bed", 0.45, 0.2, {
          w: bw,
          h: Math.min(2.1, r.h - 0.4),
          color: palette.bed,
        });
        add("nightstand", bw + 0.65, 0.2, {
          w: 0.4,
          h: 0.4,
          color: palette.wood,
        });
        add("wardrobe", r.w - 0.8, 0.2, {
          w: 0.6,
          h: Math.min(1.7, r.h - 0.5),
          color: palette.wood,
        });
      }
      if (p.type === "Bathroom") {
        add("shower", 0.15, 0.15);
        add("toilet", 1.4, 0.2);
        add("sink", r.w - 1.2, 0.2);
      }
      if (p.type === "Dining room")
        add("dining", 0.7, 0.2, {
          w: Math.min(2.2, r.w - 1.1),
          h: Math.min(1.5, r.h - 0.4),
          color: palette.wood,
        });
      if (p.type === "Office") {
        add("desk", 0.3, 0.2, { color: palette.wood });
        add("chair", 0.6, 1);
        add("bookshelf", r.w - 1.5, 0.2);
      }
      if (p.type === "Balcony") {
        add("plant", 0.2, 0.2);
        add("armchair", 1.1, 0.3);
      }
      if (p.type === "Utility")
        add("wardrobe", 0.2, 0.2, { w: Math.min(1.8, r.w - 0.4) });
    }
    rowGroups.push(group);
  }
  if (brief.openPlan)
    for (const group of rowGroups)
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i],
          b = group[i + 1];
        if (
          ["Living room", "Kitchen", "Dining room"].includes(a.type) &&
          ["Living room", "Kitchen", "Dining room"].includes(b.type)
        ) {
          items.push(
            makeItem("opening", a.x + 0.3, b.y - 0.075, {
              w: Math.max(0.9, a.w - 0.6),
              h: 0.15,
              color: palette.floor,
            }),
          );
        }
      }
  items.push(
    makeItem("door", leftBank, 0, { w: hall, h: hall, name: "Main entrance" }),
  );
  if (brief.floors > 1) {
    const r =
      rooms.find((r) => r.type === "Living room") ||
      rooms.find((r) => r.type !== "Hallway" && r.h >= 3.3);
    if (r && r.h >= 3.3)
      items.push(makeItem("stairs", r.x + r.w - 1.3, r.y + 0.15));
  }
  const turn =
    brief.orientation === "North"
      ? 0
      : brief.orientation === "East"
        ? 90
        : brief.orientation === "South"
          ? 180
          : 270;
  const rotatePoint = (x: number, y: number) =>
    turn === 90
      ? { x: D - y, y: x }
      : turn === 180
        ? { x: W - x, y: D - y }
        : turn === 270
          ? { x: y, y: W - x }
          : { x, y };
  const transformedRooms = rooms.map((r) => {
    const corners = [rotatePoint(r.x, r.y), rotatePoint(r.x + r.w, r.y + r.h)];
    return {
      ...r,
      x: Math.min(...corners.map((p) => p.x)),
      y: Math.min(...corners.map((p) => p.y)),
      w: horizontal ? r.h : r.w,
      h: horizontal ? r.w : r.h,
    };
  });
  const transformedItems = items.map((i) => {
    if (i.type === "door") {
      const p = rotatePoint(i.x, i.y);
      return { ...i, ...p, rotation: (i.rotation + turn) % 360 };
    }
    const center = rotatePoint(i.x + i.w / 2, i.y + i.h / 2);
    return {
      ...i,
      x: center.x - i.w / 2,
      y: center.y - i.h / 2,
      rotation: (i.rotation + turn) % 360,
    };
  });
  return {
    id: uid(),
    programIndex: index,
    ceilingHeight: requestedHeight(brief, index),
    name: index === 0 ? "Ground floor" : `Floor ${index + 1}`,
    rooms: transformedRooms,
    items: transformedItems.map((item) => openingForBrief(item, brief)),
    walls: [],
  };
}
