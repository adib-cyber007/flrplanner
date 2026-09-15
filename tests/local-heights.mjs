// Optional live test: synthetic project data, no studio files are changed.
import assert from "node:assert/strict";
import { defaultBrief } from "../shared/model.ts";
const response = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ config: { provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "qwen3:4b", apiKey: "" }, brief: { ...defaultBrief, floors: 2 }, prompt: "Set the ground floor ceiling height to 3.2 meters and the first upper floor ceiling height to 2.8 meters. These are floor-surface-to-ceiling measurements. Preserve all other dimensions and room requirements." }),
  signal: AbortSignal.timeout(95000),
});
const data = await response.json();
assert.equal(response.status, 200, JSON.stringify(data));
assert.equal(data.brief.floorHeights?.find((r) => r.floor === 0)?.ceilingHeight, 3.2);
assert.equal(data.brief.floorHeights?.find((r) => r.floor === 1)?.ceilingHeight, 2.8);
assert.equal(data.brief.width, defaultBrief.width);
assert.equal(data.brief.bedrooms, defaultBrief.bedrooms);
console.log("Live local model captured distinct ceiling heights for both floors.");
