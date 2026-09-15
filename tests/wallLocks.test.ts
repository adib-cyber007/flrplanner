import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleProject,
  ProjectSchema,
  EditOperationSchema,
} from "../shared/model";
import {
  geometryLockIssue,
  moveRoom,
  regenerationLockIssue,
} from "../shared/editing";
import {
  applyOperations,
  designHash,
  modelContext,
  simpleEdit,
} from "../shared/agent";

function surveyed() {
  const project = sampleProject();
  project.floors[0].walls = [
    {
      id: "fixed",
      name: "Surveyed partition",
      geometryLocked: true,
      x1: 1,
      y1: 1,
      x2: 1,
      y2: 3,
      thickness: 0.2,
    },
    { id: "loose", x1: 2, y1: 1, x2: 2, y2: 3, thickness: 0.1 },
  ];
  return project;
}

test("moving a room carries editable walls and leaves surveyed walls fixed", () => {
  const p = surveyed(),
    f = p.floors[0],
    room = f.rooms[0];
  const moved = moveRoom(f, room.id, room.x + 1, room.y + 1);
  assert.deepEqual(moved.walls[0], f.walls[0]);
  assert.equal(moved.walls[1].x1, f.walls[1].x1 + 1);
  assert.equal(moved.walls[1].y2, f.walls[1].y2 + 1);
  assert.equal(geometryLockIssue(f, moved), undefined);
});

test("wall locks guard all geometry and deletion while allowing names and a separate unlock", () => {
  const f = surveyed().floors[0];
  for (const key of ["x1", "y1", "x2", "y2", "thickness"] as const) {
    const after = structuredClone(f);
    after.walls[0][key] += 0.1;
    after.walls[0].geometryLocked = false;
    assert.match(
      geometryLockIssue(f, after)!,
      /Surveyed partition has locked geometry/,
    );
  }
  assert.match(geometryLockIssue(f, { ...f, walls: [] })!, /locked geometry/);
  const renamed = structuredClone(f);
  renamed.walls[0].name = "Existing wet wall";
  assert.equal(geometryLockIssue(f, renamed), undefined);
  renamed.walls[0].geometryLocked = false;
  assert.equal(geometryLockIssue(f, renamed), undefined);
});

test("AI resolves named walls and rejects locked changes atomically, including unlock attempts", () => {
  const p = surveyed(),
    f = p.floors[0],
    snapshot = structuredClone(f);
  const removal = simpleEdit("Remove Surveyed partition", f).operations!;
  assert.deepEqual(removal, [{ kind: "remove", target: "wall", id: "fixed" }]);
  assert.throws(() => applyOperations(f, removal, p.brief), /locked geometry/);
  assert.throws(
    () =>
      applyOperations(
        f,
        [
          { kind: "update_wall", id: "loose", patch: { name: "Changed" } },
          { kind: "update_wall", id: "fixed", patch: { thickness: 0.3 } },
        ],
        p.brief,
      ),
    /locked geometry/,
  );
  assert.equal(
    EditOperationSchema.safeParse({
      kind: "update_wall",
      id: "fixed",
      patch: { geometryLocked: false },
    }).success,
    false,
  );
  const renamed = applyOperations(
    f,
    simpleEdit("Rename Surveyed partition to Existing wet wall", f).operations!,
    p.brief,
  );
  assert.equal(renamed.floor.walls[0].name, "Existing wet wall");
  assert.equal(renamed.floor.walls[0].geometryLocked, true);
  assert.deepEqual(f, snapshot);
  assert.match(simpleEdit("Remove wall", f).reply!, /2 matches/);
});

test("wall locks survive backups, reach model context, stale proposals and block regeneration on other floors", async () => {
  const p = surveyed(),
    f = p.floors[0];
  const restored = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.floors[0].walls, f.walls);
  assert.equal(modelContext(f).context.walls[0].geometryLocked, true);
  assert.match(
    regenerationLockIssue([{ ...f, rooms: [], name: "Upper floor" }])!,
    /Upper floor: Surveyed partition/,
  );
  const hash = await designHash(f, p.brief);
  f.walls[0].geometryLocked = false;
  assert.notEqual(await designHash(f, p.brief), hash);
  assert.equal(regenerationLockIssue([f]), undefined);
});
