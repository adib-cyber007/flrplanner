// Optional live Ollama verification using only the synthetic sample.
import assert from "node:assert/strict";
import { sampleProject } from "../shared/model.ts";
import { applyOperations } from "../shared/agent.ts";
const project = sampleProject(),
  floor = project.floors[0],
  window = floor.items.find((i) => i.type === "window");
const config = {
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:4b",
  apiKey: "",
};
const response = await fetch("http://127.0.0.1:3001/api/edit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config,
    floor,
    brief: project.brief,
    selection: { kind: "item", id: window.id },
    prompt:
      "Set the selected window's vertical opening height to 1.2 meters and its sill height to 1.1 meters. Preserve all plan dimensions, positions, and other objects.",
  }),
  signal: AbortSignal.timeout(95000),
});
const data = await response.json();
assert.equal(response.status, 200, JSON.stringify(data));
assert.ok(data.edit, JSON.stringify(data));
const result = applyOperations(
  floor,
  data.edit.operations,
  project.brief,
).floor.items.find((i) => i.id === window.id);
assert.deepEqual(result.opening, { height: 1.2, sill: 1.1 });
assert.equal(result.h, window.h);
assert.equal(result.w, window.w);
console.log(
  "Live local model proposed correct vertical window dimensions without changing plan dimensions.",
);
const briefResponse = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ config, brief: project.brief, prompt: "Require every door to be 2.2 meters high, every open passage 2.3 meters high, every window opening 1.1 meters high, and every window sill 1 meter above the floor. Preserve the plot dimensions and room counts." }),
  signal: AbortSignal.timeout(95000),
});
const briefData = await briefResponse.json();
assert.equal(briefResponse.status, 200, JSON.stringify(briefData));
assert.deepEqual(briefData.brief.openingSizes, { doorHeight: 2.2, passageHeight: 2.3, windowHeight: 1.1, windowSill: 1 });
console.log("Live local model captured project-wide opening requirements before generation.");
