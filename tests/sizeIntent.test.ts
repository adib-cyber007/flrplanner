import test from "node:test";
import assert from "node:assert/strict";
import { groundRoomSizes } from "../shared/sizeIntent";
test("explicit exact dimensions repair partial model bounds without changing other rooms", () => {
  const result = groundRoomSizes(
    "Every office must be exactly 3 meters wide and exactly 4 meters deep. Every bedroom must have an area no larger than 16 square meters.",
    [
      { roomType: "Office", maxDepth: 4 },
      { roomType: "Kitchen", minArea: 8 },
    ],
  );
  assert.deepEqual(
    result.find((r) => r.roomType === "Office"),
    { roomType: "Office", minWidth: 3, maxWidth: 3, minDepth: 4, maxDepth: 4 },
  );
  assert.equal(result.find((r) => r.roomType === "Bedroom")!.maxArea, 16);
  assert.equal(result.find((r) => r.roomType === "Kitchen")!.minArea, 8);
});
test("explicit ranges and exact pairs convert feet and reject contradictory statements", () => {
  assert.equal(
    groundRoomSizes("Every bedroom must be at most 16 m².")[0].maxArea,
    16,
  );
  const result = groundRoomSizes(
    "Every office must be exactly 10 by 12 feet. Every bedroom must be at least 100 square feet and at most 140 square feet.",
  );
  const office = result.find((r) => r.roomType === "Office")!;
  assert.equal(office.minWidth, 3.048);
  assert.equal(office.maxDepth, 12 * 0.3048);
  const bed = result.find((r) => r.roomType === "Bedroom")!;
  assert.equal(bed.minArea, 100 * 0.3048 * 0.3048);
  assert.equal(bed.maxArea, 140 * (0.3048 * 0.3048));
  assert.throws(
    () =>
      groundRoomSizes(
        "Every office must be exactly 3 meters wide. Every office must be exactly 4 meters wide.",
      ),
    /Conflicting/,
  );
});
test("negation, named-room exceptions, floor-specific and mixed-room sentences are not overgeneralized", () => {
  for (const request of [
    "Every office must not be exactly 3 meters wide.",
    "The primary bedroom must be exactly 4 meters wide.",
    "Every office on the upper floor must be exactly 3 meters wide.",
    "Every office must be exactly 3 meters wide and every bedroom at least 4 meters wide.",
  ])
    assert.deepEqual(groundRoomSizes(request), []);
});
