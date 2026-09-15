import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { app } from "../server/index";
import { defaultBrief, sampleProject } from "../shared/model";
let api: Server,
  mock: Server,
  base: string,
  provider: string,
  lastAuthorization: string | undefined,
  lastBody: any;
let mode: "valid" | "invalid" | "unauthorized" = "valid";
let editResponse: unknown = null;
const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as { port: number }).port),
    ),
  );
test.before(async () => {
  mock = createServer(async (req, res) => {
    lastAuthorization = req.headers.authorization;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    lastBody = raw ? JSON.parse(raw) : null;
    res.setHeader("Content-Type", "application/json");
    if (mode === "unauthorized") {
      res.statusCode = 401;
      res.end("{}");
      return;
    }
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
      return;
    }
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                mode === "invalid"
                  ? "not json"
                  : JSON.stringify(
                      editResponse || {
                        reply: "Proposed a new brief.",
                        changes: { bedrooms: 2, width: 12 },
                      },
                    ),
            },
          },
        ],
      }),
    );
  });
  provider = `http://127.0.0.1:${await listen(mock)}/v1`;
  api = createServer(app);
  base = `http://127.0.0.1:${await listen(api)}`;
});
test.after(async () => {
  await Promise.all([
    new Promise<void>((resolve) => api.close(() => resolve())),
    new Promise<void>((resolve) => mock.close(() => resolve())),
  ]);
});
const post = (
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const config = () => ({
  provider: "compatible",
  baseUrl: provider,
  model: "test-model",
  apiKey: "synthetic-test-key",
});
test("connection discovers compatible model IDs and forwards only the supplied key", async () => {
  mode = "valid";
  const r = await post("/api/connection", config());
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).models, ["test-model"]);
  assert.equal(lastAuthorization, "Bearer synthetic-test-key");
});
test("AI route grounds explicit requests and preserves the exact client note", async () => {
  const r = await post("/api/assist", {
    config: config(),
    prompt: "I want 3 bedrooms on an 18 by 14 meter plot.",
    brief: defaultBrief,
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.brief.bedrooms, 3);
  assert.equal(data.brief.width, 18);
  assert.equal(data.brief.depth, 14);
  assert.ok(data.brief.notes.includes("18 by 14 meter"));
  assert.equal(lastBody.response_format.type, "json_object");
  assert.equal(data.changed, true);
});
test("AI brief proposals accept distinct floor ceiling heights without treating them as elevations", async () => {
  editResponse = {
    reply: "Review these ceiling heights.",
    changes: {
      floors: 2,
      floorHeights: [
        { floor: 0, ceilingHeight: 3.2 },
        { floor: 1, ceilingHeight: 2.8 },
      ],
    },
  };
  try {
    const r = await post("/api/assist", {
      config: config(),
      prompt:
        "2 floors, a 3.2 m ceiling on the ground floor and 2.8 m on the first upper floor.",
      brief: defaultBrief,
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.deepEqual(data.brief.floorHeights, [
      { floor: 0, ceilingHeight: 3.2 },
      { floor: 1, ceilingHeight: 2.8 },
    ]);
    assert.ok(
      lastBody.messages[0].content.includes(
        "not slab thickness or floor-to-floor elevation",
      ),
    );
  } finally {
    editResponse = null;
  }
});
test("invalid structured output and rejected credentials surface clear errors", async () => {
  mode = "invalid";
  const r = await post("/api/assist", {
    config: config(),
    prompt: "Please help with the brief",
    brief: defaultBrief,
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /valid structured data/);
  mode = "unauthorized";
  const auth = await post("/api/connection", config());
  assert.equal(auth.status, 400);
  assert.match((await auth.json()).error, /API key/);
  mode = "valid";
});

test("AI brief proposals cannot supply client confirmations or requirement rule links", async () => {
  editResponse = {
    reply: "All requirements are verified.",
    changes: {
      requirements: {
        ruleLinks: [],
        coreConfirmed: true,
        assumptionsAccepted: true,
      },
    },
  };
  try {
    const response = await post("/api/assist", {
      config: config(),
      prompt: "Review my room requirements",
      brief: defaultBrief,
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /requirements|Unrecognized/);
  } finally {
    editResponse = null;
  }
});

test("explicit exact room sizes are retained even if the model omits the structured changes", async () => {
  editResponse = { reply: "No changes.", changes: {} };
  try {
    const response = await post("/api/assist", {
      config: config(),
      prompt:
        "Every office must be exactly 3 meters wide and exactly 4 meters deep.",
      brief: { ...defaultBrief, extras: [...defaultBrief.extras, "Office"] },
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.changed, true);
    assert.deepEqual(data.brief.roomSizeRules, [
      {
        roomType: "Office",
        minWidth: 3,
        minDepth: 4,
        maxWidth: 3,
        maxDepth: 4,
      },
    ]);
    assert.equal(data.brief.width, defaultBrief.width);
  } finally {
    editResponse = null;
  }
});
test("origin checks and endpoint validation reject inappropriate requests", async () => {
  const origin = await post("/api/connection", config(), {
    Origin: "https://untrusted.example",
  });
  assert.equal(origin.status, 403);
  const remote = await post("/api/connection", {
    ...config(),
    baseUrl: "http://example.com/v1",
  });
  assert.equal(remote.status, 400);
  const local = await post("/api/connection", {
    ...config(),
    provider: "ollama",
    baseUrl: "https://example.com",
  });
  assert.equal(local.status, 400);
});
test("invalid client constraints are rejected before inference", async () => {
  const r = await post("/api/assist", {
    config: config(),
    prompt: "test",
    brief: { ...defaultBrief, width: -2 },
  });
  assert.equal(r.status, 400);
});
test("server environment key is never forwarded to a custom endpoint", async () => {
  const prior = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "server-key-not-for-custom-endpoints";
  try {
    await post("/api/connection", { ...config(), apiKey: "" });
    assert.equal(lastAuthorization, undefined);
  } finally {
    if (prior === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = prior;
  }
});
test("edit API uses exact floor context and remaps model references to real IDs", async () => {
  const p = sampleProject();
  editResponse = {
    reply: "Proposed",
    operations: [
      { kind: "update_room", id: "r1", patch: { name: "Family lounge" } },
    ],
  };
  try {
    const response = await post("/api/edit", {
      config: config(),
      prompt: "Give the first room a family lounge label",
      floor: p.floors[0],
      brief: p.brief,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.edit.operations[0].id, p.floors[0].rooms[0].id);
    assert.match(lastBody.messages[0].content, /Existing floor data/);
    assert.match(
      lastBody.messages[0].content,
      /Collected client brief and constraints/,
    );
    editResponse = {
      reply: "Proposed",
      operations: [{ kind: "remove", id: "r999", target: "room" }],
    };
    const bad = await post("/api/edit", {
      config: config(),
      prompt: "Clear the first room",
      floor: p.floors[0],
      brief: p.brief,
    });
    assert.equal(bad.status, 400);
  } finally {
    editResponse = null;
  }
});

test("intake API validates quoted evidence and returns a reviewable proposal", async () => {
  const prompt = "Two children live with us.";
  editResponse = {
    responses: [
      {
        key: "household",
        status: "provided",
        details: prompt,
        priority: "preference",
      },
    ],
  };
  try {
    const r = await post("/api/intake", {
      config: config(),
      prompt,
      brief: defaultBrief,
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.intake.status, "pending");
    assert.equal(data.intake.responses[0].details, prompt);
    editResponse = {
      responses: [
        {
          key: "household",
          status: "provided",
          details: "Four children",
          priority: "preference",
        },
      ],
    };
    const invalid = await post("/api/intake", {
      config: config(),
      prompt,
      brief: defaultBrief,
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /not quoted/);
  } finally {
    editResponse = null;
  }
});

test("layout brief preparation grounds saved room counts before model output is accepted", async () => {
  const brief = {
    ...defaultBrief,
    requirements: {
      responses: [
        {
          key: "rooms",
          status: "provided",
          details: "We need 3 bedrooms and 2 bathrooms.",
          priority: "preference",
        },
      ],
      custom: [],
      coreConfirmed: false,
      assumptionsAccepted: false,
    },
  };
  const r = await post("/api/assist", {
    config: config(),
    brief,
    prompt: "Prepare the brief from saved answers",
    fromRequirements: true,
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.brief.bedrooms, 3);
  assert.equal(data.brief.bathrooms, 2);
  assert.deepEqual(data.brief.requirements, brief.requirements);
});
