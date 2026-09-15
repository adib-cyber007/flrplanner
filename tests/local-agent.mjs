// Optional live Ollama verification. Sends only the bundled synthetic sample.
import assert from "node:assert/strict";
import { sampleProject } from "../shared/model.ts";
const project = sampleProject();
const response = await fetch("http://127.0.0.1:3001/api/edit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b",
      apiKey: "",
    },
    floor: project.floors[0],
    brief: project.brief,
    prompt:
      "Change the name of the Living room to Family lounge. Keep its dimensions and all other objects unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const result = await response.json();
assert.equal(response.status, 200, JSON.stringify(result));
assert.ok(result.edit, JSON.stringify(result));
assert.equal(result.edit.operations.length, 1);
assert.equal(result.edit.operations[0].kind, "update_room");
assert.equal(result.edit.operations[0].id, project.floors[0].rooms[0].id);
assert.deepEqual(result.edit.operations[0].patch, { name: "Family lounge" });
console.log("Live local model produced one correct, validated edit proposal.");

const sizeResponse = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b",
      apiKey: "",
    },
    brief: project.brief,
    prompt:
      "Require every bedroom to be at least 4 meters wide, 3 meters deep and 14 square meters in area. Leave the plot dimensions, room counts and all other requirements unchanged.",
  }),
  signal: AbortSignal.timeout(95000),
});
const sizeResult = await sizeResponse.json();
assert.equal(sizeResponse.status, 200, JSON.stringify(sizeResult));
assert.deepEqual(sizeResult.brief.roomSizeRules, [
  { roomType: "Bedroom", minWidth: 4, minDepth: 3, minArea: 14 },
]);
assert.equal(sizeResult.brief.width, project.brief.width);
assert.equal(sizeResult.brief.depth, project.brief.depth);
assert.equal(sizeResult.brief.bedrooms, project.brief.bedrooms);
console.log(
  "Live local model captured room minimums without changing plot dimensions or counts.",
);
const intakePrompt = "We have two children. The total budget is 80 lakh INR.";
const intakeResponse = await fetch("http://127.0.0.1:3001/api/intake", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b",
      apiKey: "",
    },
    brief: project.brief,
    prompt: intakePrompt,
  }),
  signal: AbortSignal.timeout(95000),
});
const intakeResult = await intakeResponse.json();
assert.equal(intakeResponse.status, 200, JSON.stringify(intakeResult));
assert.ok(
  intakeResult.intake.responses.some(
    (r) => r.key === "household" && r.details.includes("two children"),
  ),
);
assert.ok(
  intakeResult.intake.responses.some(
    (r) => r.key === "budget" && r.details.includes("80 lakh INR"),
  ),
);
for (const answer of intakeResult.intake.responses)
  assert.ok(intakePrompt.includes(answer.details));
assert.equal(intakeResult.intake.status, "pending");
console.log(
  "Live local model grouped client notes into household and budget topics with exact quotes.",
);
const collectedBrief = {
  ...project.brief,
  requirements: {
    responses: [
      {
        key: "site",
        status: "provided",
        details: "Our plot is 18 meters by 14 meters.",
        priority: "preference",
      },
      {
        key: "rooms",
        status: "provided",
        details: "We need 3 bedrooms and 2 bathrooms per floor.",
        priority: "preference",
      },
    ],
    custom: [],
    coreConfirmed: false,
    assumptionsAccepted: false,
  },
};
const preparedResponse = await fetch("http://127.0.0.1:3001/api/assist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    config: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b",
      apiKey: "",
    },
    brief: collectedBrief,
    fromRequirements: true,
    prompt:
      "Prepare a proposed layout brief from the client answers saved under Requirements & constraints. Use only explicitly supplied dimensions, room counts and minimum room sizes from those answers; do not invent missing facts. Preserve all written requirements. Ask a specific question if the recorded answers conflict. The proposal will be reviewed before building.",
  }),
  signal: AbortSignal.timeout(95000),
});
const prepared = await preparedResponse.json();
assert.equal(preparedResponse.status, 200, JSON.stringify(prepared));
assert.equal(prepared.brief.width, 18);
assert.equal(prepared.brief.depth, 14);
assert.equal(prepared.brief.bedrooms, 3);
assert.equal(prepared.brief.bathrooms, 2);
assert.deepEqual(prepared.brief.requirements, collectedBrief.requirements);
console.log(
  "Live local model prepared a layout brief directly from collected answers.",
);
