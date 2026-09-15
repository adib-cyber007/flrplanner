// Optional live model test. Sends only a synthetic brief, never studio projects.
import assert from "node:assert/strict";
import { defaultBrief } from "../shared/model.ts";
const brief = { ...defaultBrief, extras: [...defaultBrief.extras, "Office"] };
const response = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b",
      apiKey: "",
    },
    brief,
    prompt:
      "Every office must be exactly 3 meters wide and exactly 4 meters deep. Every bedroom must have an area no larger than 16 square meters. Keep all plot dimensions, room counts and other settings unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const data = await response.json();
assert.equal(response.status, 200, JSON.stringify(data));
const office = data.brief.roomSizeRules.find((r) => r.roomType === "Office");
assert.deepEqual(
  [office.minWidth, office.maxWidth, office.minDepth, office.maxDepth],
  [3, 3, 4, 4],
);
assert.equal(
  data.brief.roomSizeRules.find((r) => r.roomType === "Bedroom").maxArea,
  16,
);
assert.equal(data.brief.width, brief.width);
assert.equal(data.brief.depth, brief.depth);
assert.equal(data.brief.bedrooms, brief.bedrooms);
console.log(
  "Live local model preserved exact office dimensions and the bedroom area maximum.",
);
