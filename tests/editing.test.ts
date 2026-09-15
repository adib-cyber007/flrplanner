import test from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeRoom, type Floor } from "../shared/model";
import { moveRoom, resizeElement, snapOpening } from "../shared/editing";
import { openingLine, wallOpenings, wallSegments } from "../shared/geometry";
const floor = (): Floor => ({
  id: "floor",
  name: "Test",
  rooms: [makeRoom("Living room", 0, 0, 6, 5)],
  items: [],
  walls: [],
});
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("moving a room keeps its contents and attached openings together, respecting locks", () => {
  const f = floor();
  f.items = [
    makeItem("sofa", 1.15, 1.25),
    makeItem("window", 2, -0.075),
    makeItem("plant", 1, 2, { locked: true }),
    makeItem("desk", 8, 8),
  ];
  f.walls = [{ id: "partition", x1: 1, y1: 1, x2: 1, y2: 4, thickness: 0.15 }];
  const moved = moveRoom(f, f.rooms[0].id, 1.2, 2.3);
  close(moved.items[0].x, 2.35);
  close(moved.items[0].y, 3.55);
  close(moved.items[1].x, 3.2);
  assert.deepEqual(moved.items[2], f.items[2]);
  assert.deepEqual(moved.items[3], f.items[3]);
  close(moved.walls[0].y2, 6.3);
});
test("door and window snapping aligns the actual opening line with a wall", () => {
  const f = floor();
  for (const item of [
    makeItem("door", 5.8, 2),
    makeItem("window", 5.5, 2),
    makeItem("opening", 1, -0.1),
  ]) {
    const snapped = snapOpening(f, item);
    assert.ok(
      wallSegments(f).some((w) => wallOpenings(w, [snapped]).length === 1),
    );
    const { a, b } = openingLine(snapped);
    const aligned = wallSegments(f).some(
      (w) =>
        Math.abs((b.x - a.x) * (w.y2 - w.y1) - (b.y - a.y) * (w.x2 - w.x1)) <
          0.0001 &&
        Math.abs((a.x - w.x1) * (w.y2 - w.y1) - (a.y - w.y1) * (w.x2 - w.x1)) <
          0.0001,
    );
    assert.ok(aligned);
  }
  const far = makeItem("door", 20, 20);
  assert.deepEqual(snapOpening(f, far), far);
});
test("room corner resizing fixes the opposite corner and enforces minimum size", () => {
  const f = floor(),
    id = f.rooms[0].id;
  const resized = resizeElement(f, "room", id, [0, 0], { x: 2, y: 1 }).rooms[0];
  assert.equal(resized.w, 4);
  assert.equal(resized.h, 4);
  assert.equal(resized.x + resized.w, 6);
  assert.equal(resized.y + resized.h, 5);
  const clamped = resizeElement(f, "room", id, [1, 1], { x: -2, y: -2 })
    .rooms[0];
  assert.equal(clamped.w, 0.5);
  assert.equal(clamped.h, 0.5);
});
test("rotated furniture resizes around the fixed opposite corner", () => {
  const f = floor(),
    item = makeItem("sofa", 1, 1, { w: 2, h: 1, rotation: 90 });
  f.items = [item];
  const resized = resizeElement(f, "item", item.id, [1, 1], { x: 0.5, y: 3.5 })
    .items[0];
  assert.equal(resized.w, 3);
  assert.equal(resized.h, 2);
  // Original top-left corner rotates to (2.5, 0.5); it must remain there.
  close(resized.x + resized.w / 2 + resized.h / 2, 2.5);
  close(resized.y + resized.h / 2 - resized.w / 2, 0.5);
  f.items = [{ ...item, locked: true }];
  assert.deepEqual(
    resizeElement(f, "item", item.id, [1, 1], { x: 3, y: 3 }),
    f,
  );
});
