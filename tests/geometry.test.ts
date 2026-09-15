import test from "node:test";
import assert from "node:assert/strict";
import { defaultBrief, makeItem, makeRoom, uid } from "../shared/model";
import { generateProject, validateFloor } from "../shared/planner";
import {
  canWalkTo,
  openingLine,
  wallOpenings,
  wallSegments,
} from "../shared/geometry";
import { exportDXF, exportSchedule } from "../shared/export";
test("shared collinear room walls merge into nonduplicated segments", () => {
  const f = {
    id: uid(),
    name: "Test",
    rooms: [makeRoom("Bedroom", 0, 0, 3, 3), makeRoom("Bedroom", 3, 0, 3, 3)],
    items: [],
    walls: [],
  };
  const segments = wallSegments(f);
  assert.equal(segments.length, 5);
  assert.equal(segments.filter((s) => s.x1 === 3 && s.x2 === 3).length, 1);
});
test("door hinges rotate around their anchor and cut the matching wall", () => {
  const door = makeItem("door", 3, 1, { rotation: 90 });
  const line = openingLine(door);
  assert.ok(Math.abs(line.b.x - 3) < 0.001);
  assert.ok(Math.abs(line.b.y - 1.9) < 0.001);
  const wall = { id: "wall", x1: 3, y1: 0, x2: 3, y2: 3, thickness: 0.12 };
  const openings = wallOpenings(wall, [door]);
  assert.equal(openings.length, 1);
  assert.equal(openings[0].start, 1);
});
test("walkthrough permits doorways and prevents crossing solid walls", () => {
  const f = {
    id: uid(),
    name: "Test",
    rooms: [makeRoom("Bedroom", 0, 0, 3, 3), makeRoom("Bedroom", 3, 0, 3, 3)],
    items: [makeItem("door", 3, 1, { rotation: 90 })],
    walls: [],
  };
  assert.equal(canWalkTo(3, 1.45, f), true);
  assert.equal(canWalkTo(3, 2.5, f), false);
  assert.equal(canWalkTo(-1, 1, f), false);
});
test("bank layouts fit a family program and honor entrance direction", () => {
  for (const orientation of ["North", "South", "East", "West"] as const) {
    const p = generateProject({
      ...defaultBrief,
      width: 14,
      depth: 14,
      bedrooms: 3,
      bathrooms: 2,
      extras: ["Dining room", "Office"],
      orientation,
    });
    const f = p.floors[0],
      door = f.items.find((i) => i.name === "Main entrance")!;
    const { a, b } = openingLine(door);
    if (orientation === "North") assert.equal(a.y, 0);
    if (orientation === "South") assert.equal(a.y, 14);
    if (orientation === "East") assert.equal(a.x, 14);
    if (orientation === "West") assert.equal(a.x, 0);
    assert.ok(wallSegments(f).some((w) => wallOpenings(w, [door]).length));
    assert.equal(
      validateFloor(f, p.brief).filter((c) => c.level === "error").length,
      0,
    );
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 1.19);
  }
});
test("open-plan layouts provide wide openings when public rooms are adjacent", () => {
  const p = generateProject({
    ...defaultBrief,
    width: 16,
    depth: 14,
    openPlan: true,
  });
  assert.ok(p.floors[0].items.some((i) => i.type === "opening"));
});
test("DXF declares meter units and contains geometry; schedule escapes formulas", () => {
  const p = generateProject(defaultBrief);
  const dxf = exportDXF(p.floors[0]);
  assert.ok(dxf.includes("$INSUNITS\n70\n6"));
  assert.ok(dxf.includes("LWPOLYLINE"));
  assert.ok(dxf.endsWith("0\nEOF\n"));
  p.floors[0].rooms[0].name = "=1+1";
  const csv = exportSchedule(p);
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes("Width (m)"));
});
