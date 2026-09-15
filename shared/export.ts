import { openingLine, wallOpenings, wallSegments } from "./geometry";
import {
  DEFAULT_ROOM_WALL_THICKNESS,
  openingDimensions,
  type Floor,
  type Project,
} from "./model";
import { ceilingHeight } from "./heights";
export function exportDXF(floor: Floor): string {
  const out: (string | number)[] = [
    0,
    "SECTION",
    2,
    "HEADER",
    9,
    "$ACADVER",
    1,
    "AC1027",
    9,
    "$INSUNITS",
    70,
    6,
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
  ];
  const line = (
    layer: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) =>
    out.push(
      0,
      "LINE",
      8,
      layer,
      10,
      x1,
      20,
      -y1,
      30,
      0,
      11,
      x2,
      21,
      -y2,
      31,
      0,
    );
  for (const wall of wallSegments(floor)) {
    const dx = wall.x2 - wall.x1,
      dy = wall.y2 - wall.y1,
      len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const holes = wallOpenings(wall, floor.items),
      breaks = [
        ...new Set([0, len, ...holes.flatMap((h) => [h.start, h.end])]),
      ].sort((a, b) => a - b);
    for (let i = 0; i < breaks.length - 1; i++) {
      const a = breaks[i],
        b = breaks[i + 1];
      if (holes.some((h) => (a + b) / 2 >= h.start && (a + b) / 2 <= h.end))
        continue;
      for (const offset of [-wall.thickness / 2, wall.thickness / 2])
        line(
          "WALLS",
          wall.x1 + (dx * a) / len - (dy * offset) / len,
          wall.y1 + (dy * a) / len + (dx * offset) / len,
          wall.x1 + (dx * b) / len - (dy * offset) / len,
          wall.y1 + (dy * b) / len + (dx * offset) / len,
        );
    }
  }
  for (const room of floor.rooms) {
    out.push(
      0,
      "TEXT",
      8,
      "ROOM_LABELS",
      10,
      room.x + 0.2,
      20,
      -(room.y + room.h / 2),
      30,
      0,
      40,
      0.2,
      1,
      room.name.replace(/[\r\n]/g, " "),
    );
    out.push(
      0,
      "TEXT",
      8,
      "AREAS",
      10,
      room.x + 0.2,
      20,
      -(room.y + room.h / 2 + 0.3),
      30,
      0,
      40,
      0.13,
      1,
      (room.w * room.h).toFixed(2) + " m2",
    );
  }
  for (const item of floor.items) {
    if (["door", "window", "opening"].includes(item.type)) {
      const { a, b } = openingLine(item);
      line(item.type.toUpperCase(), a.x, a.y, b.x, b.y);
      if (item.type === "door") {
        const angle = ((item.rotation + 90) * Math.PI) / 180;
        line(
          "DOOR_SWINGS",
          a.x,
          a.y,
          a.x + item.w * Math.cos(angle),
          a.y + item.w * Math.sin(angle),
        );
        out.push(
          0,
          "ARC",
          8,
          "DOOR_SWINGS",
          10,
          a.x,
          20,
          -a.y,
          30,
          0,
          40,
          item.w,
          50,
          (270 - item.rotation + 360) % 360,
          51,
          (360 - item.rotation) % 360,
        );
      }
      continue;
    }
    const angle = (item.rotation * Math.PI) / 180,
      cx = item.x + item.w / 2,
      cy = item.y + item.h / 2;
    const corners = [
      [-item.w / 2, -item.h / 2],
      [item.w / 2, -item.h / 2],
      [item.w / 2, item.h / 2],
      [-item.w / 2, item.h / 2],
    ].map(([x, y]) => [
      cx + x * Math.cos(angle) - y * Math.sin(angle),
      cy + x * Math.sin(angle) + y * Math.cos(angle),
    ]);
    out.push(0, "LWPOLYLINE", 8, "FURNITURE", 90, 4, 70, 1);
    for (const [x, y] of corners) out.push(10, x, 20, -y);
  }
  out.push(0, "ENDSEC", 0, "EOF");
  return out.join("\n") + "\n";
}
function cell(value: unknown) {
  let str = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  return '"' + str.replaceAll('"', '""') + '"';
}
export function exportSchedule(project: Project): string {
  const rows: unknown[][] = [
    [
      "Floor",
      "Category",
      "Name",
      "Quantity",
      "Width (m)",
      "Depth (m)",
      "Area (m2)",
      "Finish / Color",
      "Floor ceiling height (m)",
      "Opening height (m)",
      "Sill height (m)",
      "Room wall thickness (m)",
    ],
  ];
  for (const floor of project.floors) {
    for (const r of floor.rooms)
      rows.push([
        floor.name,
        "Room",
        r.name,
        1,
        r.w.toFixed(2),
        r.h.toFixed(2),
        (r.w * r.h).toFixed(2),
        r.material + " / " + r.color,
        ceilingHeight(floor).toFixed(3),
        "",
        "",
        (r.wallThickness ?? DEFAULT_ROOM_WALL_THICKNESS).toFixed(3),
      ]);
    const groups = new Map<
      string,
      { item: (typeof floor.items)[number]; count: number }
    >();
    for (const item of floor.items) {
      const opening = openingDimensions(item);
      const key = [
        item.type,
        item.name,
        item.w,
        item.h,
        item.color,
        opening?.height,
        opening?.sill,
      ].join("|");
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { item, count: 1 });
    }
    for (const { item, count } of groups.values())
      rows.push([
        floor.name,
        "Object",
        item.name,
        count,
        item.w.toFixed(2),
        item.h.toFixed(2),
        "",
        item.color,
        ceilingHeight(floor).toFixed(3),
        openingDimensions(item)?.height.toFixed(3) || "",
        openingDimensions(item)?.sill.toFixed(3) || "",
        "",
      ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
