// Optional live model test using only a synthetic brief.
import assert from "node:assert/strict";
import { defaultBrief } from "../shared/model.ts";
const r = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b",
      apiKey: "",
    },
    brief: defaultBrief,
    prompt:
      "Make two floors. On the ground floor include ONLY one living room, one kitchen and one bathroom. On the first upper floor include ONLY three bedrooms and two bathrooms. Keep the plot dimensions unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const data = await r.json();
assert.equal(r.status, 200, JSON.stringify(data));
assert.equal(data.brief.floors, 2);
assert.equal(data.brief.width, defaultBrief.width);
assert.equal(data.brief.floorPrograms.length, 2);
assert.deepEqual(
  Object.fromEntries(
    data.brief.floorPrograms
      .find((p) => p.floor === 0)
      .rooms.map((r) => [r.type, r.count]),
  ),
  { "Living room": 1, Kitchen: 1, Bathroom: 1 },
);
assert.deepEqual(
  Object.fromEntries(
    data.brief.floorPrograms
      .find((p) => p.floor === 1)
      .rooms.map((r) => [r.type, r.count]),
  ),
  { Bedroom: 3, Bathroom: 2 },
);
console.log(
  "Live local model prepared separate ground and upper-floor room programs.",
);
