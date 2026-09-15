// Optional live test using a synthetic brief only.
import assert from "node:assert/strict";
import { defaultBrief } from "../shared/model.ts";
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
    brief: defaultBrief,
    prompt:
      "Require every hallway footprint to be at least 1.8 meters wide and every door leaf to be at least 1.1 meters wide. Leave all other plot dimensions and room counts unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const data = await response.json();
assert.equal(response.status, 200, JSON.stringify(data));
assert.deepEqual(data.brief.circulation, {
  minHallwayWidth: 1.8,
  minDoorWidth: 1.1,
});
assert.equal(data.brief.width, defaultBrief.width);
assert.equal(data.brief.bedrooms, defaultBrief.bedrooms);
console.log(
  "Live local model captured hallway footprint and door leaf width requirements.",
);
