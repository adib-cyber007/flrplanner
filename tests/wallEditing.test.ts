import test from "node:test";
import assert from "node:assert/strict";
import { makeItem, makeRoom, defaultBrief, type Floor } from "../shared/model";
import { editWall, wallEndpoints } from "../shared/wallEditing";
import { openingLine } from "../shared/geometry";
import { applyOperations, simpleEdit } from "../shared/agent";
const fixture = (): Floor => ({
  id: "floor",
  name: "Test",
  rooms: [makeRoom("Living room", 0, 0, 10, 10)],
  walls: [
    {
      id: "partition",
      name: "Kitchen partition",
      x1: 2,
      y1: 3,
      x2: 8,
      y2: 3,
      thickness: 0.15,
    },
  ],
  items: [
    makeItem("door", 3, 3),
    makeItem("window", 5.25, 2.925, { w: 1.5 }),
    makeItem("plant", 4, 5),
  ],
});
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-5, `${a} differs from ${b}`);

test("wall translation moves attached doors and windows without resizing furniture or room footprints", () => {
  const f = fixture(),
    before = structuredClone(f);
  const moved = editWall(f, "partition", { x1: 3, y1: 4, x2: 9, y2: 4 });
  for (let i = 0; i < 2; i++) {
    close(moved.items[i].x, f.items[i].x + 1);
    close(moved.items[i].y, f.items[i].y + 1);
    assert.equal(moved.items[i].w, f.items[i].w);
    assert.equal(moved.items[i].h, f.items[i].h);
  }
  assert.deepEqual(moved.items[2], f.items[2]);
  assert.deepEqual(moved.rooms, f.rooms);
  assert.deepEqual(f, before);
});

test("wall rotation preserves opening hinges, spans, and distance from either fixed endpoint", () => {
  const f = fixture(),
    wall = f.walls[0];
  const rotated = editWall(f, wall.id, wallEndpoints(wall, 6, 90));
  const door = openingLine(rotated.items[0]);
  close(door.a.x, 2);
  close(door.a.y, 4);
  close(door.b.x, 2);
  close(door.b.y, 4.9);
  const window = openingLine(rotated.items[1]);
  close(window.a.x, 2);
  close(window.b.x, 2);
  close((window.a.y + window.b.y) / 2, 7);
  const shortened = editWall(
    f,
    wall.id,
    wallEndpoints(wall, 5, 0, "end"),
    "end",
  );
  assert.deepEqual(shortened.items, f.items);
  assert.deepEqual(shortened.walls[0], { ...wall, x1: 3 });
  const inferred = editWall(f, wall.id, { x1: 3 });
  assert.deepEqual(inferred, shortened);
});

test("short walls, locked geometry, locked opening motion and overlapping-wall ambiguity are rejected atomically", () => {
  const f = fixture(),
    snapshot = structuredClone(f);
  assert.throws(() => editWall(f, "partition", { x2: 4 }), /no longer fit/);
  assert.throws(() => editWall(f, "partition", { x2: 2.1 }), /at least 0.2/);
  assert.deepEqual(f, snapshot);
  f.walls[0].geometryLocked = true;
  assert.throws(() => editWall(f, "partition", { x2: 9 }), /locked geometry/);
  f.walls[0].geometryLocked = false;
  f.items[0].locked = true;
  assert.throws(() => editWall(f, "partition", { x1: 3, x2: 9 }), /locked/);
  assert.deepEqual(editWall(f, "partition", { x2: 9 }).items[0], f.items[0]);
  f.items[0].rotation = 360;
  assert.deepEqual(editWall(f, "partition", { x2: 9 }).items[0], f.items[0]);
  f.items[0].locked = false;
  f.walls.push({ ...f.walls[0], id: "overlap" });
  assert.throws(
    () => editWall(f, "partition", { x2: 9 }),
    /more than one wall/,
  );
});

test("AI wall move and rotation proposals carry openings and report them in the review", () => {
  const f = fixture();
  const proposal = simpleEdit(
    "Move Kitchen partition 2 feet down",
    f,
  ).operations!;
  const moved = applyOperations(f, proposal, defaultBrief);
  close(moved.floor.walls[0].y1, 3.6096);
  close(moved.floor.items[0].y, 3.6096);
  assert.ok(moved.changes.some((s) => s.includes("Attached openings follow")));
  const rotation = simpleEdit(
    "Rotate Kitchen partition by 90 degrees",
    f,
  ).operations!;
  close(applyOperations(f, rotation, defaultBrief).floor.items[0].rotation, 90);
  assert.throws(
    () =>
      applyOperations(
        f,
        [
          {
            kind: "update_item",
            id: f.items[2].id,
            patch: { name: "Changed" },
          },
          { kind: "update_wall", id: "partition", patch: { x2: 4 } },
        ],
        defaultBrief,
      ),
    /no longer fit/,
  );
  assert.notEqual(f.items[2].name, "Changed");
});
