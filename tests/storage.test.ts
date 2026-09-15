import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE, STORE, listProjects, persistProject } from "../src/storage";
import { defaultBrief, ProjectSchema, sampleProject } from "../shared/model";
import { generateProject } from "../shared/planner";
function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) || null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}
test("saving beyond 30 projects never evicts an older design", () => {
  const storage = memory();
  for (let i = 0; i < 35; i++) persistProject(storage, sampleProject());
  assert.equal(listProjects(storage).length, 35);
});
test("unrecognized entries survive saves and do not hide valid projects", () => {
  const storage = memory(),
    p = sampleProject(),
    future = { id: "future-project", version: 99, name: "Preserve this" };
  storage.setItem(STORE, JSON.stringify([future, p]));
  assert.equal(listProjects(storage).length, 1);
  persistProject(storage, p);
  assert.ok(
    JSON.parse(storage.getItem(STORE)!).some(
      (x: any) => x.id === "future-project",
    ),
  );
});
test("unreadable library is never overwritten", () => {
  const storage = memory();
  storage.setItem(STORE, "unreadable");
  assert.throws(() => persistProject(storage, sampleProject()));
  assert.equal(storage.getItem(STORE), "unreadable");
});
test("long brief notes and conversation round-trip through project storage", () => {
  const storage = memory();
  const p = generateProject({ ...defaultBrief, notes: "a".repeat(12000) });
  p.conversation = [{ role: "user", content: "Keep all of my notes." }];
  ProjectSchema.parse(p);
  persistProject(storage, p);
  const saved = listProjects(storage)[0];
  assert.equal(saved.brief.notes.length, 12000);
  assert.equal(saved.conversation?.[0].content, "Keep all of my notes.");
  assert.equal(storage.getItem(ACTIVE), p.id);
});
