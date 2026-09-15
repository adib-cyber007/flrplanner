// Optional live check; uses only a synthetic design brief.
import assert from "node:assert/strict";
import { defaultBrief } from "../shared/model.ts";
const config = {
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:4b",
  apiKey: "",
};
const response = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config,
    brief: defaultBrief,
    prompt:
      "Set the setbacks to 3 meters north, 2 meters east, 1 meter south and 1.5 meters west. Leave plot dimensions, room counts and entrance direction unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const result = await response.json();
assert.equal(response.status, 200, JSON.stringify(result));
assert.deepEqual(result.brief.sideSetbacks, {
  north: 3,
  east: 2,
  south: 1,
  west: 1.5,
});
assert.equal(result.brief.width, defaultBrief.width);
assert.equal(result.brief.orientation, defaultBrief.orientation);
const uniform = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config,
    brief: result.brief,
    prompt:
      "Change to a uniform setback of 1 meter on every side. Remove the individual side setback overrides. Leave everything else unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const cleared = await uniform.json();
assert.equal(uniform.status, 200, JSON.stringify(cleared));
assert.equal(cleared.brief.sideSetbacks, null);
assert.equal(cleared.brief.setback, 1);
console.log(
  "Live local model proposed all four side setbacks and restored uniform setbacks on request.",
);
