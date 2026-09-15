import test from "node:test";
import assert from "node:assert/strict";
import { explicitConstraints } from "../shared/intent";
import { defaultBrief } from "../shared/model";
test("explicit numeric requests ground model proposals, including number words", () => {
  assert.deepEqual(
    explicitConstraints(
      "I want three bedrooms and two bathrooms on an 18 by 14 meter plot.",
      defaultBrief,
    ),
    { bedrooms: 3, bathrooms: 2, width: 18, depth: 14 },
  );
});
test("feet are converted and additional office preserves existing rooms", () => {
  const b = explicitConstraints(
    "I need 3 bedrooms with a quiet office on a 60 feet by 40 feet plot.",
    defaultBrief,
  );
  assert.equal(b.width, 18.288);
  assert.equal(b.depth, 12.192);
  assert.deepEqual(b.extras, ["Dining room", "Office"]);
});
test("immediately negated room counts are not used", () => {
  assert.equal(
    explicitConstraints("Not 3 bedrooms.", defaultBrief).bedrooms,
    undefined,
  );
});
