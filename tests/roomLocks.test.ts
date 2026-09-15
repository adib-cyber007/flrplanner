import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleProject,
  ProjectSchema,
  EditOperationSchema,
} from "../shared/model";
import {
  moveRoom,
  resizeElement,
  geometryLockIssue,
  regenerationLockIssue,
} from "../shared/editing";
import { applyOperations, designHash, modelContext } from "../shared/agent";

function fixed() {
  const project = sampleProject();
  project.floors[0].rooms[0].geometryLocked = true;
  return project;
}

test("locked room footprints resist movement, resizing, removal and combined unlock edits", () => {
  const p = fixed(),
    f = p.floors[0],
    room = f.rooms[0];
  assert.equal(moveRoom(f, room.id, room.x + 1, room.y), f);
  assert.equal(resizeElement(f, "room", room.id, [1, 1], { x: 20, y: 20 }), f);
  for (const next of [
    { ...f, rooms: f.rooms.slice(1) },
    {
      ...f,
      rooms: f.rooms.map((r) =>
        r.id === room.id ? { ...r, geometryLocked: false, x: r.x + 1 } : r,
      ),
    },
  ])
    assert.match(geometryLockIssue(f, next)!, /locked geometry/);
  const unlocked = {
    ...f,
    rooms: f.rooms.map((r) => ({ ...r, geometryLocked: false })),
  };
  assert.equal(geometryLockIssue(f, unlocked), undefined);
  assert.notDeepEqual(
    moveRoom(unlocked, room.id, room.x + 0.1, room.y),
    unlocked,
  );
});

test("AI cannot unlock or change fixed geometry even in a batch, but can change its finish", () => {
  const p = fixed(),
    f = p.floors[0],
    room = f.rooms[0];
  const snapshot = structuredClone(f);
  for (const patch of [
    { x: room.x + 0.1 },
    { w: room.w + 0.1 },
    { h: room.h + 0.1 },
    { y: room.y + 0.1 },
    { wallThickness: 0.3 },
  ])
    assert.throws(
      () =>
        applyOperations(
          f,
          [
            { kind: "update_room", id: room.id, patch: { name: "Renamed" } },
            { kind: "update_room", id: room.id, patch },
          ],
          p.brief,
        ),
      /locked geometry/,
    );
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "remove", target: "room", id: room.id }],
        p.brief,
      ),
    /locked geometry/,
  );
  assert.equal(
    EditOperationSchema.safeParse({
      kind: "update_room",
      id: room.id,
      patch: { geometryLocked: false },
    }).success,
    false,
  );
  const result = applyOperations(
    f,
    [{ kind: "update_room", id: room.id, patch: { material: "stone" } }],
    p.brief,
  );
  assert.equal(result.floor.rooms[0].geometryLocked, true);
  assert.equal(result.floor.rooms[0].material, "stone");
  assert.deepEqual(f, snapshot);
});

test("room locks survive project backups and invalidate earlier AI proposals", async () => {
  const p = sampleProject(),
    f = p.floors[0];
  const hash = await designHash(f, p.brief);
  f.rooms[0].geometryLocked = true;
  assert.notEqual(await designHash(f, p.brief), hash);
  const restored = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.floors[0].rooms[0].geometryLocked, true);
  assert.equal(modelContext(f).context.rooms[0].geometryLocked, true);
});

test("regeneration checks locks on every floor, including floors removed from a new brief", () => {
  const p = fixed();
  const floors = [
    { ...p.floors[0], rooms: [] },
    { ...p.floors[0], id: "upper", name: "Upper floor" },
  ];
  assert.match(regenerationLockIssue(floors)!, /Upper floor/);
  assert.equal(
    regenerationLockIssue(
      floors.map((f) => ({
        ...f,
        rooms: f.rooms.map((r) => ({ ...r, geometryLocked: false })),
      })),
    ),
    undefined,
  );
});
