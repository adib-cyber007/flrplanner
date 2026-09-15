import test from "node:test";
import assert from "node:assert/strict";
import { defaultBrief, sampleProject, ProjectSchema } from "../shared/model";
import { createReference, calibrateReference } from "../shared/reference";
import { designHash, modelContext, applyOperations } from "../shared/agent";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=";
test("reference placement fits the footprint without distortion and survives a project backup", () => {
  const p = sampleProject();
  p.floors[0].reference = createReference(
    "Client plan.png",
    image,
    1000,
    500,
    p.brief,
  );
  assert.equal(p.floors[0].reference.w, 12);
  assert.equal(p.floors[0].reference.h, 6);
  p.floors[0].reference.x = 1;
  p.floors[0].reference.rotation = 90;
  p.floors[0].reference.opacity = 0.7;
  assert.deepEqual(
    ProjectSchema.parse(JSON.parse(JSON.stringify(p))).floors[0].reference,
    p.floors[0].reference,
  );
});

test("two-point calibration preserves the first anchor, rotation and aspect ratio", () => {
  const a = { x: 0.25, y: 0.2 },
    b = { x: 0.75, y: 0.6 };
  const world = (r: ReturnType<typeof createReference>, p: typeof a) => {
    const angle = (r.rotation * Math.PI) / 180,
      dx = (p.x - 0.5) * r.w,
      dy = (p.y - 0.5) * r.h;
    return {
      x: r.x + r.w / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: r.y + r.h / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  };
  for (const rotation of [0, 15, 90, 180, -90]) {
    const ref = {
      ...createReference("Plan", image, 1000, 500, defaultBrief),
      rotation,
      x: 2,
      y: -1,
    };
    const original = JSON.stringify(ref),
      first = world(ref, a),
      next = calibrateReference(ref, a, b, 5);
    const afterA = world(next, a),
      afterB = world(next, b);
    assert.ok(
      Math.abs(afterA.x - first.x) < 1e-9 &&
        Math.abs(afterA.y - first.y) < 1e-9,
    );
    assert.ok(
      Math.abs(Math.hypot(afterB.x - afterA.x, afterB.y - afterA.y) - 5) < 1e-9,
    );
    assert.equal(next.rotation, rotation);
    assert.equal(next.w / next.h, ref.w / ref.h);
    assert.equal(JSON.stringify(ref), original);
  }
});
test("calibration rejects coincident points, invalid distances and out-of-image coordinates", () => {
  const ref = createReference("Plan", image, 1000, 500, defaultBrief),
    a = { x: 0.1, y: 0.2 },
    b = { x: 0.9, y: 0.2 };
  assert.throws(() => calibrateReference(ref, a, a, 5), /distinct/);
  for (const value of [0, -2, Infinity, NaN])
    assert.throws(() => calibrateReference(ref, a, b, value));
  assert.throws(
    () => calibrateReference(ref, { x: -0.1, y: 0.5 }, b, 5),
    /inside/,
  );
  assert.throws(() => calibrateReference(ref, a, b, 1000), /limits/);
});
test("reference URLs cannot load remote resources or active formats; invalid extents are rejected", () => {
  for (const url of [
    "https://example.com/plan.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "javascript:alert(1)",
  ])
    assert.throws(() => createReference("Plan", url, 100, 100, defaultBrief));
  for (const dimensions of [
    [0, 100],
    [100000, 100000],
    [Infinity, 100],
  ])
    assert.throws(() =>
      createReference(
        "Plan",
        image,
        dimensions[0],
        dimensions[1],
        defaultBrief,
      ),
    );
  assert.throws(() =>
    createReference("Plan", image, 100, 100, { ...defaultBrief, setback: 10 }),
  );
});
test("AI text context and geometry fingerprints exclude reference pixels; edits preserve the image", async () => {
  const p = sampleProject(),
    floor = p.floors[0],
    hash = await designHash(floor, p.brief);
  floor.reference = createReference(
    "Private source drawing",
    image,
    100,
    100,
    p.brief,
  );
  assert.equal(await designHash(floor, p.brief), hash);
  assert.equal(
    JSON.stringify(modelContext(floor).context).includes("base64"),
    false,
  );
  const changed = applyOperations(
    floor,
    [
      {
        kind: "update_room",
        id: floor.rooms[0].id,
        patch: { name: "Family room" },
      },
    ],
    p.brief,
  ).floor;
  assert.deepEqual(changed.reference, floor.reference);
});
