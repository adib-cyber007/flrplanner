// Optional live model check using a synthetic brief only.
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
      "Require the kitchen beside the dining room, sharing a boundary. Require bedrooms and the kitchen to have no shared boundary. Keep all dimensions, room counts and other requirements unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const data = await r.json();
assert.equal(r.status, 200, JSON.stringify(data));
assert.equal(data.brief.roomRelationships.length, 2);
const normalized = data.brief.roomRelationships
  .map((r) => [r.a, r.b].sort().join("/") + ":" + r.relation)
  .sort();
assert.deepEqual(normalized, [
  "Bedroom/Kitchen:separate",
  "Dining room/Kitchen:adjacent",
]);
assert.equal(data.brief.width, defaultBrief.width);
assert.equal(data.brief.bedrooms, defaultBrief.bedrooms);
console.log(
  "Live local model proposed both adjacency and separation requirements correctly.",
);
