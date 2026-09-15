import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleProject,
  ProjectSchema,
  EditOperationSchema,
} from "../shared/model";
import {
  applyOperations,
  designHash,
  modelContext,
  proposeEdits,
  simpleEdit,
} from "../shared/agent";

test("partial AI patches never insert material or unlock defaults", () => {
  const p = sampleProject(),
    f = p.floors[0];
  f.rooms[0].material = "stone";
  const patch = {
    kind: "update_room" as const,
    id: f.rooms[0].id,
    patch: { name: "Family lounge" },
  };
  assert.deepEqual(EditOperationSchema.parse(patch), patch);
  assert.equal(
    applyOperations(f, [patch], p.brief).floor.rooms[0].material,
    "stone",
  );
  const itemPatch = {
    kind: "update_item" as const,
    id: f.items[0].id,
    patch: { rotation: 90 },
  };
  assert.deepEqual(EditOperationSchema.parse(itemPatch), itemPatch);
});

test("AI edits cannot bypass a non-negotiable written constraint", async () => {
  const p = sampleProject();
  p.brief.requirements = {
    responses: [],
    custom: [
      { id: "fixed", text: "Preserve the dining table", priority: "must" },
    ],
    coreConfirmed: false,
    assumptionsAccepted: false,
  };
  await assert.rejects(
    () =>
      proposeEdits(
        p.floors[0],
        p.brief,
        simpleEdit("Remove the dining table", p.floors[0]).operations!,
      ),
    /non-negotiable written requirement/,
  );
  assert.ok(p.floors[0].items.some((i) => i.type === "dining"));
});

test("a natural-language removal targets the dining table, not its room", async () => {
  const p = sampleProject(),
    f = p.floors[0];
  const request = simpleEdit("Remove the dining table", f);
  assert.equal(request.operations?.length, 1);
  const proposal = await proposeEdits(f, p.brief, request.operations!);
  assert.equal(
    f.items.filter((i) => i.type === "dining").length,
    1,
    "proposal must not mutate the floor",
  );
  const applied = applyOperations(f, proposal.operations, p.brief);
  assert.equal(
    applied.floor.items.filter((i) => i.type === "dining").length,
    0,
  );
  assert.deepEqual(applied.floor.rooms, f.rooms);
});
test("specific measurements and selected-object moves convert feet correctly", () => {
  const p = sampleProject(),
    f = p.floors[0],
    room = f.rooms.find((r) => r.name === "Primary bedroom")!;
  const request = simpleEdit("Make the primary bedroom 2 ft wider", f);
  const result = applyOperations(f, request.operations!, p.brief);
  assert.equal(result.floor.rooms.find((r) => r.id === room.id)!.w, 5.1096);
  assert.ok(result.warnings.some((w) => /overlapping/.test(w)));
  const item = f.items.find((i) => i.type === "sofa")!;
  const move = simpleEdit("Move it 1 m left", f, { kind: "item", id: item.id });
  assert.equal(
    applyOperations(f, move.operations!, p.brief).floor.items.find(
      (i) => i.id === item.id,
    )!.x,
    0.3,
  );
});
test("ambiguous and compound commands are not partially executed", () => {
  const f = sampleProject().floors[0];
  assert.match(simpleEdit("Remove the plant", f).reply!, /matches/);
  assert.match(simpleEdit("Move it 1 m left", f).reply!, /Select/);
  assert.deepEqual(simpleEdit("Remove the dining table and add a sofa", f), {});
});
test("invalid IDs, locked items and out-of-range patches fail atomically", () => {
  const p = sampleProject(),
    f = p.floors[0],
    item = f.items[0];
  item.locked = true;
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "remove", target: "item", id: item.id }],
        p.brief,
      ),
    /locked/,
  );
  assert.throws(
    () =>
      applyOperations(
        f,
        [{ kind: "remove", target: "room", id: "missing" }],
        p.brief,
      ),
    /not on this floor/,
  );
  assert.throws(() =>
    applyOperations(
      f,
      [{ kind: "update_room", id: f.rooms[0].id, patch: { w: -1 } }],
      p.brief,
    ),
  );
  assert.equal(f.rooms[0].w, 6.6);
});
test("edit proposals persist and their fingerprints become stale after geometry or constraints change", async () => {
  const p = sampleProject(),
    f = p.floors[0];
  const proposal = await proposeEdits(f, p.brief, [
    {
      kind: "update_room",
      id: f.rooms[0].id,
      patch: { name: "Family living" },
    },
  ]);
  p.conversation = [
    { role: "assistant", content: "Review edits", edit: proposal },
  ];
  assert.deepEqual(
    ProjectSchema.parse(JSON.parse(JSON.stringify(p))).conversation?.[0].edit,
    proposal,
  );
  assert.equal(proposal.baseHash, await designHash(f, p.brief));
  assert.notEqual(
    proposal.baseHash,
    await designHash({ ...f, items: f.items.slice(1) }, p.brief),
  );
  assert.notEqual(
    proposal.baseHash,
    await designHash(f, { ...p.brief, notes: "Keep existing plumbing" }),
  );
  const { context, ids } = modelContext(f, { kind: "room", id: f.rooms[0].id });
  assert.equal(context.selection, "r1");
  assert.equal(ids.get("r1"), f.rooms[0].id);
});
