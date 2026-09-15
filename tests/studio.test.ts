import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import express from "express";
import { ProjectRepository, RepositoryError } from "../server/repository";
import { projectRoutes } from "../server/projects";
import { StudioClient, StudioError } from "../src/studio";
import { sampleProject } from "../shared/model";

let directory: string,
  repository: ProjectRepository,
  server: Server,
  base: string;
const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};
const client = (storage = memory()) =>
  new StudioClient(storage, (input, init) => fetch(base + String(input), init));
test.before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "forma-studio-test-"));
  repository = new ProjectRepository(directory);
  const app = express();
  app.use("/api/projects", projectRoutes(repository));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("forma-studio-test-"));
  await rm(resolved, { recursive: true, force: true });
});

test("projects survive a repository restart, and IDs cannot escape the studio folder", async () => {
  const p = { ...sampleProject(), id: "../../a-client/project" };
  p.conversation = [{ role: "user", content: "Keep the family kitchen." }];
  const saved = await repository.save(p, null);
  assert.equal(saved.revision, 1);
  const reopened = await new ProjectRepository(directory).get(p.id);
  assert.deepEqual(reopened, saved);
  const files = await readdir(path.join(directory, "projects"));
  assert.ok(files.every((name) => /^[a-f0-9]{64}\.json$/.test(name)));
  assert.equal(
    (await repository.save(saved.project, 1)).revision,
    1,
    "no-op save does not produce revisions",
  );
});
test("concurrent writers cannot overwrite a newer design", async () => {
  const p = sampleProject();
  await repository.save(p, null);
  const results = await Promise.allSettled([
    repository.save({ ...p, name: "Window A" }, 1),
    repository.save({ ...p, name: "Window B" }, 1),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.ok(
    rejected.reason instanceof RepositoryError &&
      rejected.reason.status === 409,
  );
  assert.equal((await repository.get(p.id))?.project.name, "Window A");
});
test("named version restoration preserves the design it replaces", async () => {
  const p = sampleProject();
  const original = await repository.save(p, null);
  const version = await repository.checkpoint(
    p.id,
    original.revision,
    "Approved concept",
  );
  const updated = await repository.save(
    { ...p, name: "Revised concept" },
    original.revision,
  );
  const restored = await repository.restore(
    p.id,
    version.versionId,
    updated.revision,
  );
  assert.equal(restored.project.name, p.name);
  assert.equal(restored.revision, 3);
  const history = await repository.versions(p.id);
  const safetyCopy = history.versions.find(
    (v) => v.label === "Before restoring a version",
  )!;
  assert.equal(
    (await repository.version(p.id, safetyCopy.versionId)).project.name,
    "Revised concept",
  );
  await assert.rejects(
    repository.version(p.id, "../../projects"),
    /Invalid version ID/,
  );
});
test("an unreadable project is reported and never overwritten", async () => {
  const p = sampleProject();
  await repository.save(p, null);
  const files = await readdir(path.join(directory, "projects"));
  const file = (
    await Promise.all(
      files.map(async (name) => ({
        name,
        text: await readFile(path.join(directory, "projects", name), "utf8"),
      })),
    )
  ).find((f) => JSON.parse(f.text).project.id === p.id)!;
  const target = path.join(directory, "projects", file.name);
  await writeFile(target, "unreadable project content");
  await assert.rejects(
    repository.save({ ...p, name: "Must not overwrite" }, 1),
    /preserved/,
  );
  assert.equal(await readFile(target, "utf8"), "unreadable project content");
  assert.ok(
    (await repository.list()).warnings.some((w) => w.includes(file.name)),
  );
});
test("client queues overlapping autosaves and rejects a competing window", async () => {
  const a = client(),
    b = client(),
    p = sampleProject();
  await a.initialize([], null);
  await a.save(p);
  await b.initialize([], p.id);
  const results = await Promise.all([
    a.save({ ...p, name: "First edit" }),
    a.save({ ...p, name: "Latest edit" }),
  ]);
  assert.equal(results[1].revision, results[0].revision + 1);
  await assert.rejects(
    b.save({ ...p, name: "Stale edit" }),
    (e) => e instanceof StudioError && e.status === 409,
  );
  assert.equal((await repository.get(p.id))?.project.name, "Latest edit");
});
test("offline browser edits resume safely when the disk revision is unchanged", async () => {
  const storage = memory(),
    p = sampleProject(),
    first = client(storage);
  await first.initialize([], null);
  await first.save(p);
  const pending = { ...p, name: "My offline changes" };
  const reopened = await client(storage).initialize([pending], p.id);
  assert.equal(reopened.recoveryCount, 0);
  assert.equal((await repository.get(p.id))?.project.name, pending.name);
});
test("newer disk changes replace an unchanged cache; divergent drafts become copies", async () => {
  const storage = memory(),
    p = sampleProject(),
    a = client(storage);
  await a.initialize([], null);
  await a.save(p);
  const b = client();
  await b.initialize([], p.id);
  await b.save({ ...p, name: "Another window's change" });
  const unchanged = await client(storage).initialize([p], p.id);
  assert.equal(unchanged.recoveryCount, 0);
  assert.equal(
    unchanged.projects.find((x) => x.id === p.id)?.name,
    "Another window's change",
  );
  // No matching base marker: both versions must be retained.
  const divergent = await client().initialize(
    [{ ...p, name: "Unsynced browser draft" }],
    p.id,
  );
  assert.equal(divergent.recoveryCount, 1);
  assert.notEqual(divergent.selectedId, p.id);
  assert.ok(
    divergent.projects.some(
      (x) => x.id === p.id && x.name === "Another window's change",
    ),
  );
  assert.ok(
    divergent.projects.some(
      (x) =>
        x.id === divergent.selectedId &&
        x.name.includes("Unsynced browser draft"),
    ),
  );
});
test("project API validates IDs, revisions, and large conversation backups", async () => {
  const p = sampleProject();
  p.conversation = Array.from({ length: 30 }, () => ({
    role: "user" as const,
    content: "Full client request. ".repeat(500),
  }));
  const saved = await client().save(p);
  assert.equal(saved.project.conversation?.length, 30);
  const response = await fetch(`${base}/api/projects/wrong-id`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: p, expectedRevision: saved.revision }),
  });
  assert.equal(response.status, 400);
  const invalid = await fetch(`${base}/api/projects/${p.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: p }),
  });
  assert.equal(invalid.status, 400);
});
