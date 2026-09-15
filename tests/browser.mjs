import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const bin = path.resolve(
  "node_modules/agent-browser/bin/" +
    (process.platform === "win32"
      ? "agent-browser-win32-x64.exe"
      : process.platform === "darwin"
        ? "agent-browser-darwin-arm64"
        : "agent-browser-linux-x64"),
);
const out = path.resolve("artifacts");
mkdirSync(out, { recursive: true });
function run(...args) {
  const commandLog = path.join(out, "browser-command.json");
  const fd = openSync(commandLog, "w");
  let failure;
  try {
    execFileSync(bin, ["--session", "forma-e2e", "--json", ...args], {
      stdio: ["ignore", fd, fd],
      timeout: 35000,
      windowsHide: true,
    });
  } catch (e) {
    failure = e;
  } finally {
    closeSync(fd);
  }
  const raw = readFileSync(commandLog, "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("{"));
  if (!line)
    throw Error(raw || String(failure) || "Browser returned no output");
  const value = JSON.parse(line);
  if (!value.success) throw Error(JSON.stringify(value.error));
  return value.data?.result ?? value.data;
}
const evaluate = (code) => run("eval", code);
const click = (selector) => run("click", selector);
const fill = (selector, value) => run("fill", selector, String(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = [];
let downloadBrowser;
let studioServer;
const testDirectory = mkdtempSync(
  path.join(os.tmpdir(), "forma-browser-test-"),
);
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
async function check(name, fn) {
  if (
    process.env.FORMA_BROWSER_CHECK &&
    !process.env.FORMA_BROWSER_CHECK.split("|").some((filter) =>
      name.includes(filter),
    )
  )
    return;
  await fn();
  report.push({ name, status: "passed" });
  console.log("PASS " + name);
}
async function saved() {
  for (let n = 0; n < 30; n++) {
    if (
      evaluate(
        'document.querySelector(".save-status").textContent.includes("All changes saved")',
      )
    )
      return;
    await sleep(100);
  }
  throw Error(
    "Autosave did not finish: " +
      evaluate('document.querySelector(".save-status").title'),
  );
}
async function current() {
  await saved();
  return evaluate('JSON.parse(localStorage.getItem("forma-projects-v1"))[0]');
}
async function reviewRequirements() {
  click(".wizard-steps button:nth-child(5)");
  const labels = evaluate(
    'Array.from(document.querySelectorAll(".requirement-answer select[aria-label$=status]"),x=>x.getAttribute("aria-label"))',
  );
  for (const label of labels)
    run("select", `[aria-label="${label}"]`, "unknown");
  click(".wizard-steps button:nth-child(6)");
  run("check", "[data-core-confirm]");
  assert.equal(
    evaluate('document.querySelector("[data-core-confirm]").checked'),
    true,
  );
  run("check", "[data-assumptions-confirm]");
  assert.equal(
    evaluate('document.querySelector("[data-core-confirm]").checked'),
    true,
  );
  assert.equal(
    evaluate('document.querySelector("[data-assumptions-confirm]").checked'),
    true,
  );
  click(".wizard-footer .primary");
  assert.equal(
    evaluate('!!document.querySelector(".brief-wizard")'),
    false,
    evaluate('document.querySelector(".brief-wizard")?.innerText || ""'),
  );
}
try {
  assert.ok(
    existsSync(path.resolve("dist/index.html")),
    "Run npm run build before browser verification.",
  );
  const fd = openSync(path.join(out, "browser-server.log"), "w");
  studioServer = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        FORMA_DATA_DIR: testDirectory,
      },
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    },
  );
  closeSync(fd);
  for (let n = 0; n < 50; n++) {
    try {
      if ((await fetch(baseUrl + "/api/health")).ok) break;
    } catch {}
    await sleep(200);
  }
  run("open", baseUrl);
  evaluate("localStorage.clear()");
  run("reload");
  await saved();
  run("set", "viewport", "1440", "960");
  await check(
    "Workspace loads with furnished sample and no error overlay",
    async () => {
      assert.equal(
        evaluate('document.querySelectorAll("[data-room]").length'),
        7,
      );
      assert.equal(
        evaluate('!!document.querySelector("vite-error-overlay")'),
        false,
      );
      assert.equal(
        evaluate(
          'document.querySelector(".workspace-status > div > button").textContent.includes("Imperial")',
        ),
        true,
      );
      assert.ok(
        evaluate(
          'document.getElementById("floor-plan").textContent.includes("ft")',
        ),
      );
      click(".workspace-status > div > button");
      assert.ok(
        evaluate(
          'document.querySelector(".workspace-status > div > button").textContent.includes("Metric")',
        ),
      );
      assert.equal(
        evaluate('document.querySelector(".assistant-scroll").scrollTop'),
        0,
      );
      run("screenshot", path.join(out, "verified-desktop.png"));
    },
  );
  await check(
    "Prompt editing previews changes, applies them and supports undo",
    async () => {
      click(".assistant-tabs button:first-child");
      fill(
        '[aria-label="Message the design assistant"]',
        "Remove the dining table",
      );
      click('[aria-label="Send message"]');
      for (
        let n = 0;
        n < 30 &&
        !evaluate('!!document.querySelector(".edit-proposal .primary")');
        n++
      )
        await sleep(100);
      assert.equal(
        (await current()).floors[0].items.filter((i) => i.type === "dining")
          .length,
        1,
      );
      assert.ok(
        evaluate(
          'document.querySelector(".edit-proposal").textContent.includes("Remove")',
        ),
      );
      run("screenshot", path.join(out, "verified-ai-edit.png"));
      click(".edit-proposal .primary");
      assert.equal(
        (await current()).floors[0].items.filter((i) => i.type === "dining")
          .length,
        0,
      );
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.equal(
        (await current()).floors[0].items.filter((i) => i.type === "dining")
          .length,
        1,
      );
    },
  );
  await check(
    "Doorway checks flag a removed entrance and AI preserves existing room access",
    async () => {
      const before = (await current()).floors[0];
      fill(
        '[aria-label="Message the design assistant"]',
        "Remove the main entrance",
      );
      click('[aria-label="Send message"]');
      for (
        let n = 0;
        n < 30 &&
        !evaluate(
          'document.querySelector(".assistant-scroll").textContent.includes("without a doorway connection")',
        );
        n++
      )
        await sleep(100);
      assert.ok(
        evaluate(
          'document.querySelector(".assistant-scroll").textContent.includes("without a doorway connection")',
        ),
      );
      assert.deepEqual((await current()).floors[0], before);
      run("focus", '[aria-label="Select Main entrance"]');
      run("press", "Enter");
      run("press", "Delete");
      assert.equal(
        (await current()).floors[0].items.filter(
          (i) => i.name === "Main entrance",
        ).length,
        0,
      );
      click(".workspace-status>button");
      assert.ok(
        evaluate(
          'document.querySelector(".checks-body").textContent.includes("No exterior door was identified")',
        ),
      );
      run("screenshot", path.join(out, "verified-doorway-check.png"));
      click('[aria-label="Close dialog"]');
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.deepEqual((await current()).floors[0], before);
      click(".assistant-tabs button:first-child");
    },
  );
  await check(
    "Room geometry locks protect manual editing, AI requests and regeneration and persist after reload",
    async () => {
      const before = (await current()).floors[0];
      run("focus", '[aria-label="Select Primary bedroom"]');
      run("press", "Enter");
      click(".room-geometry-lock button");
      const locked = (await current()).floors[0];
      assert.equal(
        locked.rooms.find((r) => r.name === "Primary bedroom").geometryLocked,
        true,
      );
      assert.equal(
        evaluate(
          `document.querySelector('[aria-label="Element width"]').disabled`,
        ),
        true,
      );
      assert.equal(
        evaluate('document.querySelectorAll("[data-resize-room]").length'),
        0,
      );
      const point = evaluate(
        `(()=>{const r=document.querySelector('[data-room="Primary bedroom"] rect');const p=new DOMPoint(+r.getAttribute('x')+.2,+r.getAttribute('y')+.2).matrixTransform(document.getElementById('floor-plan').getScreenCTM());return [p.x,p.y]})()`,
      );
      run(
        "mouse",
        "move",
        String(Math.round(point[0])),
        String(Math.round(point[1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(point[0] + 30)),
        String(Math.round(point[1] + 30)),
      );
      run("mouse", "up");
      run("focus", '[aria-label="Select Primary bedroom"]');
      run("press", "Delete");
      assert.deepEqual((await current()).floors[0], locked);
      click(".brief-top");
      click(".wizard-steps button:nth-child(6)");
      assert.equal(
        evaluate('document.querySelector(".wizard-footer .primary").disabled'),
        true,
      );
      assert.ok(
        evaluate(
          'document.querySelector(".brief-wizard").textContent.includes("Regeneration is paused")',
        ),
      );
      click('[aria-label="Close dialog"]');
      click(".assistant-tabs button:first-child");
      fill(
        '[aria-label="Message the design assistant"]',
        "Move Primary bedroom 1 m right",
      );
      click('[aria-label="Send message"]');
      for (
        let n = 0;
        n < 30 &&
        !evaluate(
          'document.querySelector(".assistant-scroll").textContent.includes("locked geometry")',
        );
        n++
      )
        await sleep(100);
      assert.ok(
        evaluate(
          'document.querySelector(".assistant-scroll").textContent.includes("locked geometry")',
        ),
      );
      assert.deepEqual((await current()).floors[0], locked);
      run("reload");
      assert.deepEqual((await current()).floors[0], locked);
      run("focus", '[aria-label="Select Primary bedroom"]');
      run("press", "Enter");
      run("screenshot", path.join(out, "verified-room-lock.png"));
      click(".room-geometry-lock button");
      assert.equal(
        evaluate(
          `document.querySelector('[aria-label="Element width"]').disabled`,
        ),
        false,
      );
      fill('[aria-label="Element width"]', "5.2");
      run("press", "Enter");
      assert.equal(
        (await current()).floors[0].rooms.find(
          (r) => r.name === "Primary bedroom",
        ).w,
        5.2,
      );
      click('[aria-label="Undo (Ctrl+Z)"]');
      const restored = (await current()).floors[0];
      assert.deepEqual(
        restored.rooms.map(({ geometryLocked, ...r }) => r),
        before.rooms.map(({ geometryLocked, ...r }) => r),
      );
      assert.equal(
        restored.rooms.find((r) => r.name === "Primary bedroom").geometryLocked,
        false,
      );
      click(".assistant-tabs button:first-child");
    },
  );
  await check(
    "Named wall locks survive room movement, AI requests, reload and manual unlock",
    async () => {
      const before = (await current()).floors[0];
      click('.nav-rail [title="Build"]');
      click(".build-tools button:nth-child(2)");
      const points = evaluate(
        `(()=>{const m=document.getElementById('floor-plan').getScreenCTM();return [[1,1],[1,3]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return [p.x,p.y]})})()`,
      );
      run(
        "mouse",
        "move",
        String(Math.round(points[0][0])),
        String(Math.round(points[0][1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(points[1][0])),
        String(Math.round(points[1][1])),
      );
      run("mouse", "up");
      click('[aria-label="Select (V)"]');
      fill('[aria-label="Wall name"]', "Surveyed partition");
      click(".wall-geometry-lock button");
      const locked = (await current()).floors[0];
      assert.equal(locked.walls.length, before.walls.length + 1);
      assert.equal(locked.walls.at(-1).geometryLocked, true);
      assert.ok(
        evaluate(
          `document.querySelector('[aria-label="Wall thickness"]').disabled`,
        ),
      );
      fill('[aria-label="Wall name"]', "Existing kitchen partition");
      run("focus", '[aria-label="Select Existing kitchen partition"]');
      run("press", "Enter");
      run("press", "Delete");
      const named = (await current()).floors[0];
      assert.equal(named.walls.length, locked.walls.length);
      run("focus", '[aria-label="Select Living room"]');
      run("press", "Enter");
      fill('[aria-label="Element X position"]', "0.2");
      assert.equal(
        (await current()).floors[0].rooms.find((r) => r.name === "Living room")
          .x,
        0.2,
      );
      assert.deepEqual((await current()).floors[0].walls, named.walls);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.deepEqual((await current()).floors[0], named);
      click(".brief-top");
      click(".wizard-steps button:nth-child(6)");
      assert.ok(
        evaluate(`document.querySelector('.wizard-footer .primary').disabled`),
      );
      assert.ok(
        evaluate(
          `document.querySelector('.brief-wizard').textContent.includes('Existing kitchen partition')`,
        ),
      );
      click('[aria-label="Close dialog"]');
      run("reload");
      assert.deepEqual((await current()).floors[0], named);
      fill(
        '[aria-label="Message the design assistant"]',
        "Remove Existing kitchen partition",
      );
      click('[aria-label="Send message"]');
      for (
        let n = 0;
        n < 30 &&
        !evaluate(
          `document.querySelector('.assistant-scroll').textContent.includes('Existing kitchen partition has locked geometry')`,
        );
        n++
      )
        await sleep(100);
      assert.ok(
        evaluate(
          `document.querySelector('.assistant-scroll').textContent.includes('Existing kitchen partition has locked geometry')`,
        ),
      );
      assert.deepEqual((await current()).floors[0], named);
      run("focus", '[aria-label="Select Existing kitchen partition"]');
      run("press", "Enter");
      run("screenshot", path.join(out, "verified-wall-lock.png"));
      click(".wall-geometry-lock button");
      fill('[aria-label="Wall thickness"]', "0.25");
      assert.equal((await current()).floors[0].walls.at(-1).thickness, 0.25);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.equal((await current()).floors[0].walls.at(-1).thickness, 0.15);
      run("focus", '[aria-label="Select Existing kitchen partition"]');
      run("press", "Enter");
      run("press", "Delete");
      assert.deepEqual((await current()).floors[0].walls, before.walls);
      click(".assistant-tabs button:first-child");
    },
  );
  await check(
    "Custom walls drag, resize at endpoints, accept exact geometry and undo",
    async () => {
      downloadBrowser ||= await chromium.connectOverCDP(
        run("get", "cdp-url").cdpUrl,
      );
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      const before = (await current()).floors[0];
      const drag = async (from, to) => {
        const points = await page.evaluate(
          ([a, b]) => {
            const matrix = document.getElementById("floor-plan").getScreenCTM();
            return [a, b].map(([x, y]) => {
              const point = new DOMPoint(x, y).matrixTransform(matrix);
              return { x: point.x, y: point.y };
            });
          },
          [from, to],
        );
        await page.mouse.move(points[0].x, points[0].y);
        await page.mouse.down();
        await page.mouse.move(points[1].x, points[1].y, { steps: 5 });
        await page.mouse.up();
      };
      await page.locator('.nav-rail [title="Build"]').click();
      await page.locator(".build-tools button:nth-child(2)").click();
      await drag([1, 1], [1, 3]);
      await page.getByLabel("Select (V)", { exact: true }).click();
      await page
        .getByLabel("Wall name", { exact: true })
        .fill("Editable partition");
      const wall = (await current()).floors[0].walls.at(-1);
      assert.equal(
        (await current()).floors[0].walls.length,
        before.walls.length + 1,
      );
      assert.equal(await page.locator("[data-wall-endpoint]").count(), 2);
      await drag([wall.x1, wall.y1], [wall.x1 + 0.5, wall.y1]);
      const resized = (await current()).floors[0].walls.at(-1);
      assert.ok(Math.abs(resized.x1 - wall.x1 - 0.5) < 0.051);
      assert.equal(resized.x2, wall.x2);
      assert.equal(resized.y2, wall.y2);
      await page.getByLabel("Undo (Ctrl+Z)", { exact: true }).click();
      assert.deepEqual((await current()).floors[0].walls.at(-1), wall);
      await drag([wall.x1, wall.y1 + 0.35], [wall.x1 + 0.5, wall.y1 + 0.35]);
      const moved = (await current()).floors[0].walls.at(-1);
      assert.ok(Math.abs(moved.x1 - wall.x1 - 0.5) < 0.051);
      assert.ok(Math.abs(moved.x2 - wall.x2 - 0.5) < 0.051);
      assert.equal(moved.y1, wall.y1);
      assert.equal(moved.y2, wall.y2);
      await page.getByLabel("Wall length", { exact: true }).fill("3");
      await page.getByLabel("Wall angle", { exact: true }).fill("0");
      await page
        .getByRole("button", { name: "Apply wall geometry", exact: true })
        .click();
      const exact = (await current()).floors[0].walls.at(-1);
      assert.equal(exact.x1, moved.x1);
      assert.equal(exact.y1, moved.y1);
      assert.equal(exact.x2, moved.x1 + 3);
      assert.equal(exact.y2, moved.y1);
      await page.screenshot({
        path: path.join(out, "verified-wall-editing.png"),
      });
      await page.getByLabel("Undo (Ctrl+Z)", { exact: true }).click();
      assert.deepEqual((await current()).floors[0].walls.at(-1), moved);
      await page.reload();
      assert.deepEqual((await current()).floors[0].walls.at(-1), moved);
      await page
        .getByRole("button", { name: "Select Editable partition", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Delete");
      assert.deepEqual((await current()).floors[0], before);
      await page.locator(".assistant-tabs button:first-child").click();
    },
  );
  await check(
    "Conversational intake reviews exact answers, saves them and asks the next question",
    async () => {
      const before = (await current()).floors;
      click(".prompt-modes button:first-child");
      assert.equal(
        evaluate('document.querySelector(".interview-controls select").value'),
        "project",
      );
      const source =
        "A new home for our family, with room for visiting grandparents.";
      fill('[aria-label="Message the design assistant"]', source);
      click('[aria-label="Send message"]');
      assert.equal((await current()).brief.requirements, undefined);
      assert.ok(
        evaluate(
          'document.querySelector(".intake-proposal").textContent.includes("visiting grandparents")',
        ),
      );
      run("screenshot", path.join(out, "verified-interview.png"));
      click(".intake-proposal .primary");
      const savedAnswer = await current();
      assert.equal(
        savedAnswer.brief.requirements.responses.find(
          (r) => r.key === "project",
        ).details,
        source,
      );
      assert.equal(
        evaluate('document.querySelector(".interview-controls select").value'),
        "site",
      );
      assert.deepEqual(savedAnswer.floors, before);
      run("reload");
      assert.equal(
        (await current()).brief.requirements.responses[0].details,
        source,
      );
      assert.ok(
        evaluate(
          'document.querySelector(".intake-proposal").textContent.includes("Answers saved")',
        ),
      );
    },
  );
  await check(
    "Furniture search, insertion, properties, rotation, delete and history",
    async () => {
      const before = (await current()).floors[0].items.length;
      fill('[aria-label="Search furniture"]', "desk");
      assert.equal(
        evaluate('document.querySelectorAll(".catalog-card").length'),
        1,
      );
      click('[title="Add Writing desk"]');
      fill('[aria-label="Element width"]', "1.8");
      click('[aria-label="Rotate 90 degrees"]');
      const p = await current();
      const item = p.floors[0].items.at(-1);
      assert.equal(item.w, 1.8);
      assert.equal(item.rotation, 90);
      assert.equal(p.floors[0].items.length, before + 1);
      click(".property-actions .danger-button");
      assert.equal((await current()).floors[0].items.length, before);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.equal((await current()).floors[0].items.length, before + 1);
      click('[aria-label="Redo (Ctrl+Shift+Z)"]');
      assert.equal((await current()).floors[0].items.length, before);
    },
  );
  await check(
    "Precise room editing and geometric issue detection",
    async () => {
      run("focus", '[aria-label="Select Primary bedroom"]');
      run("press", "Enter");
      fill('[aria-label="Element width"]', "5.2");
      run("press", "Enter");
      assert.equal(
        (await current()).floors[0].rooms.find(
          (r) => r.name === "Primary bedroom",
        ).w,
        5.2,
      );
      click(".workspace-status>button");
      assert.ok(
        evaluate(
          'document.querySelector(".checks-body").textContent.includes("overlapping room pair")',
        ),
      );
      click('[aria-label="Close dialog"]');
      click('[aria-label="Undo (Ctrl+Z)"]');
    },
  );
  await check(
    "Room resizing shows live dimensions in feet with quiet corner handles",
    async () => {
      const wasMetric = evaluate(
        'document.querySelector(".workspace-status > div > button").textContent.includes("Metric")',
      );
      if (wasMetric) click(".workspace-status > div > button");
      run("focus", '[aria-label="Select Primary bedroom"]');
      run("press", "Enter");
      const points = evaluate(
        '(()=>{let m=document.getElementById("floor-plan").getScreenCTM();return [[4.5,10],[5,10.5]].map(([x,y])=>{let p=new DOMPoint(x,y).matrixTransform(m);return [p.x,p.y]})})()',
      );
      run(
        "mouse",
        "move",
        String(Math.round(points[0][0])),
        String(Math.round(points[0][1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(points[1][0])),
        String(Math.round(points[1][1])),
      );
      assert.match(
        evaluate(
          'document.querySelector("[data-live-room-measurements]").textContent',
        ),
        /W .* ft.*D .* ft/s,
      );
      assert.equal(
        evaluate(
          'Array.from(document.querySelectorAll("[data-resize-room]")).every(x=>x.getAttribute("fill")==="transparent")',
        ),
        true,
      );
      assert.equal(
        evaluate(
          'document.querySelector("[data-room]").parentElement.hasAttribute("filter")',
        ),
        false,
      );
      assert.equal(
        evaluate(
          'document.querySelector("[data-live-room-measurements]").getAttribute("font-size")',
        ),
        ".24",
      );
      assert.equal(
        evaluate(
          'document.querySelector("[data-plan-dimensions]").getAttribute("font-size")',
        ),
        ".2",
      );
      run("screenshot", path.join(out, "verified-live-room-resize.png"));
      run("mouse", "up");
      const resized = (await current()).floors[0].rooms.find(
        (r) => r.name === "Primary bedroom",
      );
      assert.equal(resized.w, 5);
      assert.ok(Math.abs(resized.h - 4.7) < 0.001);
      click('[aria-label="Undo (Ctrl+Z)"]');
      const roomBeforeMove = (await current()).floors[0].rooms.find(
        (r) => r.name === "Primary bedroom",
      );
      const movePoints = evaluate(
        `(()=>{const r=document.querySelector('[data-room="Primary bedroom"] rect'),m=document.getElementById('floor-plan').getScreenCTM(),x=+r.getAttribute('x')+.2,y=+r.getAttribute('y')+.2;return [[x,y],[x+.3,y+.2]].map(([px,py])=>{const p=new DOMPoint(px,py).matrixTransform(m);return [p.x,p.y]})})()`,
      );
      run(
        "mouse",
        "move",
        String(Math.round(movePoints[0][0])),
        String(Math.round(movePoints[0][1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(movePoints[1][0])),
        String(Math.round(movePoints[1][1])),
      );
      assert.equal(
        evaluate(
          'document.querySelector("[data-room=\\"Primary bedroom\\"]").parentElement.hasAttribute("filter")',
        ),
        false,
      );
      assert.equal(
        evaluate(
          'getComputedStyle(document.querySelector("[data-room=\\"Primary bedroom\\"]")).outlineStyle',
        ),
        "none",
      );
      run("screenshot", path.join(out, "verified-room-move-no-layer.png"));
      run("mouse", "up");
      const roomAfterMove = (await current()).floors[0].rooms.find(
        (r) => r.name === "Primary bedroom",
      );
      assert.ok(roomAfterMove.x > roomBeforeMove.x + 0.15);
      assert.ok(roomAfterMove.y > roomBeforeMove.y + 0.1);
      click('[aria-label="Undo (Ctrl+Z)"]');
      run("focus", '[data-item="sofa"]');
      run("press", "Enter");
      const before = (await current()).floors[0].items.find(
        (i) => i.type === "sofa",
      );
      const handle = evaluate(
        '(()=>{const b=document.querySelector("[data-resize-item=\\"3\\"]").getBoundingClientRect(),s=document.getElementById("floor-plan").getScreenCTM().a;return [b.x+b.width/2,b.y+b.height/2,s]})()',
      );
      run(
        "mouse",
        "move",
        String(Math.round(handle[0])),
        String(Math.round(handle[1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(handle[0] + handle[2] * 0.8)),
        String(Math.round(handle[1] + handle[2] * 0.5)),
      );
      run("mouse", "up");
      const after = (await current()).floors[0].items.find(
        (i) => i.type === "sofa",
      );
      assert.ok(after.w > before.w + 0.6);
      assert.ok(after.h > before.h + 0.3);
      click('[aria-label="Undo (Ctrl+Z)"]');
      if (wasMetric) click(".workspace-status > div > button");
    },
  );
  await check(
    "New floor and room drawing through real pointer events",
    async () => {
      click('[aria-label="Add floor"]');
      click('[aria-label="Draw room (R)"]');
      const points = evaluate(
        '(()=>{let m=document.getElementById("floor-plan").getScreenCTM();return [[1,1],[5,4]].map(([x,y])=>{let p=new DOMPoint(x,y).matrixTransform(m);return [p.x,p.y]})})()',
      );
      run(
        "mouse",
        "move",
        String(Math.round(points[0][0])),
        String(Math.round(points[0][1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(points[1][0])),
        String(Math.round(points[1][1])),
      );
      assert.match(
        evaluate(
          'document.querySelector("[data-live-room-measurements]").textContent',
        ),
        /W 4.00 m.*D 3.00 m/s,
      );
      run("mouse", "up");
      const p = await current();
      assert.equal(p.floors.length, 2);
      assert.equal(p.floors[1].rooms.length, 1);
      assert.equal(p.floors[1].rooms[0].w, 4);
      assert.equal(p.floors[1].rooms[0].h, 3);
      assert.ok(
        Math.abs((p.floors[1].rooms[0].wallThickness ?? 0.1143) - 0.1143) <
          1e-7,
      );
      assert.equal(
        evaluate('!!document.querySelector("[data-live-room-measurements]")'),
        false,
      );

      downloadBrowser ||= await chromium.connectOverCDP(
        run("get", "cdp-url").cdpUrl,
      );
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      const width = '[aria-label="Element width"]';
      const depth = '[aria-label="Element depth"]';
      const thickness = '[aria-label="Room wall thickness"]';
      assert.equal(
        evaluate(
          'document.querySelector(\'[aria-label="Use 4½\u2033 room walls"]\').getAttribute("aria-pressed")',
        ),
        "true",
      );
      click('[aria-label="Use 9\u2033 room walls"]');
      assert.equal((await current()).floors[1].rooms[0].wallThickness, 0.2286);
      assert.equal(
        evaluate(`document.querySelector('${thickness}').value`),
        "0.229",
      );
      assert.match(
        evaluate('document.querySelector(".clear-room-size").textContent'),
        /3.54 m × 2.54 m9.01 m²/,
      );
      assert.equal(
        evaluate(
          'Number(document.querySelector(\'[data-room-wall][data-wall-boundary-axis=h][data-wall-boundary-at="1"]\').getAttribute("y1")).toFixed(4)',
        ),
        "1.1143",
      );
      click('[aria-label="Use 4½\u2033 room walls"]');
      assert.equal((await current()).floors[1].rooms[0].wallThickness, 0.1143);
      // Empty/partial entries must not change saved geometry or steal focus.
      await page.locator(width).fill("");
      assert.equal(evaluate(`document.querySelector('${width}').value`), "");
      assert.equal((await current()).floors[1].rooms[0].w, 4);
      await page.keyboard.type("4.75", { delay: 40 });
      assert.equal((await current()).floors[1].rooms[0].w, 4);
      await page.keyboard.press("Enter");
      assert.equal((await current()).floors[1].rooms[0].w, 4.75);
      click('[aria-label="Increase element width"]');
      assert.equal((await current()).floors[1].rooms[0].w, 4.85);
      click('[aria-label="Decrease element width"]');
      assert.equal((await current()).floors[1].rooms[0].w, 4.75);
      fill(width, "4");
      await page.keyboard.press("Tab");
      assert.equal((await current()).floors[1].rooms[0].w, 4);
      fill(depth, "5");
      await page.keyboard.press("Escape");
      assert.equal(evaluate(`document.querySelector('${depth}').value`), "3");
      fill(depth, "0");
      await page.keyboard.press("Enter");
      assert.equal((await current()).floors[1].rooms[0].h, 3);
      assert.match(
        evaluate('document.querySelector(".dimension-error").textContent'),
        /Previous value restored/,
      );
      fill(thickness, "0.2");
      await page.keyboard.press("Enter");
      assert.equal((await current()).floors[1].rooms[0].wallThickness, 0.2);

      // Reverse drawing in feet, with static dimensions hidden, inside the outer room.
      click(".workspace-status > div > button");
      const widthFeet = evaluate(
        `Number(document.querySelector('${width}').value)`,
      );
      run("focus", width);
      await page.keyboard.press("ArrowUp");
      assert.ok(
        Math.abs((await current()).floors[1].rooms[0].w - (4 + 0.03048)) < 1e-6,
      );
      await page.keyboard.press("ArrowDown");
      assert.ok(Math.abs((await current()).floors[1].rooms[0].w - 4) < 1e-6);
      assert.ok(widthFeet > 13 && widthFeet < 13.2);
      click('[aria-label="Toggle dimensions"]');
      click('[aria-label="Draw room (R)"]');
      const innerPoints = evaluate(
        '(()=>{const m=document.getElementById("floor-plan").getScreenCTM();return [[3,3],[1,1]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return [p.x,p.y]})})()',
      );
      run(
        "mouse",
        "move",
        String(Math.round(innerPoints[0][0])),
        String(Math.round(innerPoints[0][1])),
      );
      run("mouse", "down");
      run(
        "mouse",
        "move",
        String(Math.round(innerPoints[1][0])),
        String(Math.round(innerPoints[1][1])),
      );
      assert.match(
        evaluate(
          'document.querySelector("[data-live-room-measurements]").textContent',
        ),
        /W 6.56 ft.*D 6.56 ft/s,
      );
      assert.equal(
        evaluate('!!document.querySelector("[data-plan-dimensions]")'),
        false,
      );
      run("screenshot", path.join(out, "verified-live-room-drawing.png"));
      run("mouse", "up");
      click('[aria-label="Toggle dimensions"]');
      click(".workspace-status > div > button");
      fill('[aria-label="Selected element name"]', "Nested bathroom");
      fill(thickness, "0.4");
      await page.keyboard.press("Enter");
      const topWalls = evaluate(
        `Array.from(document.querySelectorAll('[data-room-wall][data-wall-boundary-axis="h"][data-wall-boundary-at="1"]')).map(x=>[+x.getAttribute("x1"),+x.getAttribute("x2"),+x.getAttribute("stroke-width")])`,
      );
      assert.deepEqual(
        topWalls.map((row) => row.map((value) => Number(value.toFixed(6)))),
        [
          [1, 3, 0.4],
          [3, 5, 0.2],
        ],
      );
      run("screenshot", path.join(out, "verified-nested-room-walls.png"));
      await saved();
      run("reload");
      assert.equal((await current()).floors[1].rooms.at(-1).wallThickness, 0.4);
      // Return to the outer-room-only fixture for the remaining suite.
      run("select", '[aria-label="Active floor"]', p.floors[1].id);
      await page.locator('[aria-label="Select Nested bathroom"]').focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Delete");
      await page.waitForFunction(
        () => !document.querySelector('[data-room="Nested bathroom"]'),
      );
      assert.equal((await current()).floors[1].rooms.length, 1);
    },
  );
  await check("Local persistence survives a full page reload", async () => {
    const id = (await current()).id;
    run("reload");
    const p = await current();
    assert.equal(p.id, id);
    assert.equal(p.floors.length, 2);
  });
  await check(
    "Local studio survives browser data loss and restores named versions",
    async () => {
      const original = await current();
      click('[aria-label="Forma projects"]');
      fill('[aria-label="Version name"]', "Browser verification milestone");
      click(".checkpoint-form button");
      for (
        let n = 0;
        n < 30 &&
        !evaluate(
          "!!document.querySelector('[aria-label=\"Restore Browser verification milestone\"]')",
        );
        n++
      )
        await sleep(100);
      assert.ok(
        evaluate(
          "!!document.querySelector('[aria-label=\"Restore Browser verification milestone\"]')",
        ),
      );
      run("screenshot", path.join(out, "verified-studio.png"));
      click('[aria-label="Close dialog"]');
      fill('[aria-label="Project name"]', "Temporary revised name");
      await saved();
      // Navigate away first so the pagehide backup cannot repopulate storage after clearing it.
      evaluate(
        "sessionStorage.setItem('forma-test-id', '" + original.id + "')",
      );
      run("open", baseUrl + "/api/health");
      evaluate("localStorage.clear()");
      run("open", baseUrl);
      const reloaded = await current();
      assert.equal(reloaded.id, original.id);
      assert.equal(reloaded.name, "Temporary revised name");
      assert.equal(reloaded.floors.length, 2);
      click('[aria-label="Forma projects"]');
      click('[aria-label="Restore Browser verification milestone"]');
      for (let n = 0; n < 30; n++) {
        if (
          evaluate(
            'document.querySelector(".project-title-row input").value',
          ) === original.name
        )
          break;
        await sleep(100);
      }
      assert.equal((await current()).name, original.name);
      assert.ok(
        evaluate(
          'document.querySelector(".version-list").textContent.includes("Before restoring a version")',
        ),
      );
      click('[aria-label="Close dialog"]');
    },
  );
  await check(
    "Constraint intake blocks missing responses and non-negotiable unsupported requirements",
    async () => {
      const before = (await current()).floors;
      click(".constraints-shortcut");
      assert.ok(
        evaluate('!!document.querySelector(".requirements-intake")'),
        "The prompt-box shortcut opens the constraint questions directly",
      );
      click(".wizard-steps button:nth-child(6)");
      click(".wizard-footer .primary");
      assert.ok(
        evaluate(
          'document.querySelector(".intake-blockers").textContent.includes("Site & boundaries")',
        ),
      );
      assert.deepEqual((await current()).floors, before);
      click(".wizard-steps button:nth-child(5)");
      fill(
        '[aria-label="Existing & fixed elements details"]',
        "Preserve the structural columns at their surveyed coordinates.",
      );
      run(
        "select",
        '[aria-label="Existing & fixed elements priority"]',
        "must",
      );
      click(".wizard-steps button:nth-child(6)");
      click(".wizard-footer .primary");
      assert.ok(
        evaluate(
          'document.querySelector(".intake-blockers").textContent.includes("non-negotiable")',
        ),
      );
      run("screenshot", path.join(out, "verified-constraint-review.png"));
      click('[aria-label="Close dialog"]');
      run("reload");
      const persisted = await current();
      assert.equal(
        persisted.brief.requirements.responses.find(
          (r) => r.key === "structure",
        ).priority,
        "must",
      );
      assert.deepEqual(persisted.floors, before);
      click(".brief-top");
      click(".wizard-steps button:nth-child(5)");
      run(
        "select",
        '[aria-label="Existing & fixed elements priority"]',
        "preference",
      );
      click('[aria-label="Close dialog"]');
    },
  );
  await check(
    "Imperial brief inputs produce correctly converted geometry",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:nth-child(2)");
      fill('[aria-label="Plot width"]', 60);
      fill('[aria-label="Plot depth"]', 40);
      run("check", '[aria-label="Different setbacks on each side"]');
      fill('[aria-label="north setback"]', 3);
      fill('[aria-label="east setback"]', 1);
      fill('[aria-label="south setback"]', 2);
      fill('[aria-label="west setback"]', 4);
      run("screenshot", path.join(out, "verified-side-setbacks.png"));
      click(".wizard-steps button:nth-child(2)");
      fill('[aria-label="Bedroom minWidth"]', 12);
      fill('[aria-label="Bedroom minDepth"]', 10);
      fill('[aria-label="Bedroom minArea"]', 140);
      run("screenshot", path.join(out, "verified-room-minimums.png"));
      click(".wizard-steps button:nth-child(4)");
      await reviewRequirements();
      const p = await current();
      assert.ok(Math.abs(p.brief.width - 18.288) < 0.000001);
      assert.ok(Math.abs(p.brief.depth - 12.192) < 0.000001);
      assert.ok(Math.abs(p.brief.sideSetbacks.north - 0.9144) < 1e-8);
      assert.ok(Math.abs(p.brief.sideSetbacks.east - 0.3048) < 1e-8);
      assert.ok(Math.abs(p.brief.sideSetbacks.south - 0.6096) < 1e-8);
      assert.ok(Math.abs(p.brief.sideSetbacks.west - 1.2192) < 1e-8);
      assert.ok(
        Math.abs(
          Math.max(...p.floors[0].rooms.map((r) => r.x + r.w)) - 16.764,
        ) < 1e-8,
      );
      assert.ok(
        Math.abs(
          Math.max(...p.floors[0].rooms.map((r) => r.y + r.h)) - 10.668,
        ) < 1e-8,
      );
      const rule = p.brief.roomSizeRules.find((r) => r.roomType === "Bedroom");
      assert.ok(Math.abs(rule.minWidth - 3.6576) < 1e-8);
      assert.ok(Math.abs(rule.minDepth - 3.048) < 1e-8);
      assert.ok(Math.abs(rule.minArea - 13.0064256) < 1e-8);
      for (const room of p.floors[0].rooms.filter(
        (r) => r.type === "Bedroom",
      )) {
        assert.ok(room.w >= rule.minWidth - 1e-8);
        assert.ok(room.h >= rule.minDepth - 1e-8);
        assert.ok(room.w * room.h >= rule.minArea - 1e-8);
      }
    },
  );
  await check(
    "Guided brief generates requested program and preserves free-form notes",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:first-child");
      fill('.modal input[type="number"]:nth-of-type(1)', "18");
      fill(".modal .form-grid label:nth-child(2) input", "14");
      click(".wizard-steps button:nth-child(2)");
      click('[aria-label="More bedrooms"]');
      click('[aria-label="More bathrooms"]');
      click(".choice-grid button:nth-child(2)");
      click(".wizard-steps button:nth-child(4)");
      fill(
        ".notes-label textarea",
        "A quiet office next to the primary bedroom. Keep existing plumbing on the east side.",
      );
      await reviewRequirements();
      const p = await current();
      assert.equal(p.brief.bedrooms, 3);
      assert.equal(p.brief.bathrooms, 2);
      assert.equal(
        p.floors[0].rooms.filter((r) => r.type === "Bedroom").length,
        3,
      );
      assert.ok(p.brief.notes.includes("existing plumbing"));
      assert.equal(
        p.floors[0].rooms.filter((r) => r.type === "Office").length,
        1,
      );
    },
  );
  await check(
    "Room relationship inputs constrain generated geometry",
    async () => {
      click(".brief-top");
      click(".wizard-steps button:nth-child(2)");
      evaluate(
        'document.querySelector(".relationship-inputs").scrollIntoView({block:"center"})',
      );
      click(".relationship-inputs > button");
      assert.equal(
        evaluate('document.querySelectorAll(".relationship-row").length'),
        1,
      );
      run("select", '[aria-label="Relationship first room"]', "Bedroom");
      run("select", '[aria-label="Relationship second room"]', "Kitchen");
      run("select", '[aria-label="Room relationship"]', "separate");
      click(".relationship-inputs > button");
      assert.equal(
        evaluate('document.querySelectorAll(".relationship-row").length'),
        2,
      );
      run("screenshot", path.join(out, "verified-room-relationships.png"));
      await reviewRequirements();
      const p = await current(),
        rooms = p.floors[0].rooms;
      assert.equal(p.brief.roomRelationships.length, 2);
      const kitchen = rooms.find((r) => r.type === "Kitchen"),
        dining = rooms.find((r) => r.type === "Dining room");
      const share = (a, b) =>
        ((Math.abs(a.x + a.w - b.x) < 1e-6 ||
          Math.abs(b.x + b.w - a.x) < 1e-6) &&
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6) ||
        ((Math.abs(a.y + a.h - b.y) < 1e-6 ||
          Math.abs(b.y + b.h - a.y) < 1e-6) &&
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6);
      assert.ok(share(kitchen, dining));
      assert.ok(
        rooms
          .filter((r) => r.type === "Bedroom")
          .every((r) => !share(r, kitchen)),
      );
    },
  );
  await check(
    "Separate floor programs generate different rooms without repeating public spaces",
    async () => {
      click(".brief-top");
      run("select", '[aria-label="Number of floors"]', "2");
      click(".wizard-steps button:nth-child(2)");
      run("check", '[aria-label="Different rooms on each floor"]');
      fill('[aria-label="Floor 1 Bedroom count"]', 0);
      for (const type of ["Living room", "Kitchen", "Office", "Dining room"])
        fill(`[aria-label="Floor 2 ${type} count"]`, 0);
      run("screenshot", path.join(out, "verified-floor-programs.png"));
      await reviewRequirements();
      const p = await current();
      assert.equal(p.floors.length, 2);
      assert.equal(
        p.floors[0].rooms.filter((r) => r.type === "Bedroom").length,
        0,
      );
      assert.equal(
        p.floors[0].rooms.filter((r) => r.type === "Office").length,
        1,
      );
      assert.equal(
        p.floors[1].rooms.filter((r) => r.type === "Bedroom").length,
        3,
      );
      assert.equal(
        p.floors[1].rooms.filter((r) => r.type === "Bathroom").length,
        2,
      );
      assert.equal(
        p.floors[1].rooms.filter(
          (r) => r.type === "Kitchen" || r.type === "Living room",
        ).length,
        0,
      );
      run("reload");
      assert.deepEqual(
        (await current()).brief.floorPrograms,
        p.brief.floorPrograms,
      );
    },
  );
  await check(
    "Written must-haves link to enforced rules and reopen when those rules change",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:first-child");
      click(".wizard-steps button:nth-child(2)");
      fill('[aria-label="Bedroom minWidth"]', 3);
      click(".wizard-steps button:nth-child(5)");
      fill(
        '[aria-label="Additional constraint"]',
        "Every bedroom must be at least 3 m wide.",
      );
      run("select", '[aria-label="Additional constraint priority"]', "must");
      evaluate(
        'document.querySelector(".custom-constraint").scrollIntoView({block:"center"})',
      );
      click(".custom-constraint button");
      const link = ".custom-constraint-row .requirement-rule-link";
      evaluate(
        `document.querySelector('${link}').scrollIntoView({block:"center"})`,
      );
      const bedroomRuleIndex = evaluate(
        `Array.from(document.querySelectorAll('${link} label')).findIndex(label => label.textContent.includes('Every Bedroom'))`,
      );
      assert.ok(bedroomRuleIndex >= 0);
      run("check", `${link} label:nth-of-type(${bedroomRuleIndex + 1}) input`);
      click(`${link} .outline`);
      assert.ok(
        evaluate(
          `document.querySelector('${link}').textContent.includes("confirmed by you")`,
        ),
      );
      run("screenshot", path.join(out, "verified-requirement-link.png"));
      await reviewRequirements();
      const p = await current();
      assert.equal(p.brief.requirements.ruleLinks.length, 1);
      assert.ok(
        p.floors
          .flatMap((f) => f.rooms)
          .filter((r) => r.type === "Bedroom")
          .every((r) => r.w >= 3 - 1e-7),
      );
      run("reload");
      click(".brief-top");
      click(".wizard-steps button:nth-child(2)");
      fill('[aria-label="Bedroom minWidth"]', 3.1);
      click(".wizard-steps button:nth-child(5)");
      assert.ok(
        evaluate(
          `document.querySelector('${link}').textContent.includes("review the link again")`,
        ),
      );
      click(".wizard-steps button:nth-child(6)");
      assert.ok(
        evaluate(
          'document.querySelector(".intake-blockers").textContent.includes("Every bedroom must")',
        ),
      );
      // Remove the synthetic note after verifying the stale-link gate.
      click(".wizard-steps button:nth-child(5)");
      evaluate(
        'document.querySelector(".custom-constraint-row > button").scrollIntoView({block:"center"})',
      );
      click(
        '[aria-label="Remove constraint Every bedroom must be at least 3 m wide."]',
      );
      assert.equal(
        evaluate('document.querySelectorAll(".custom-constraint-row").length'),
        0,
      );
      click('[aria-label="Close dialog"]');
    },
  );
  await check(
    "Exact room dimensions and maximum areas work through the brief editor",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:first-child");
      fill('[aria-label="Plot width"]', 18);
      fill('[aria-label="Plot depth"]', 16);
      click(".wizard-steps button:nth-child(2)");
      run("check", '[aria-label="Different rooms on each floor"]');
      fill('[aria-label="Floor 1 Office count"]', 1);
      fill('[aria-label="Office minWidth"]', 3);
      fill('[aria-label="Office maxWidth"]', 3);
      fill('[aria-label="Office minDepth"]', 4);
      fill('[aria-label="Office maxDepth"]', 4);
      fill('[aria-label="Bedroom maxArea"]', 16);
      evaluate(
        `document.querySelector('[aria-label="Office maxDepth"]').scrollIntoView({block:"center"})`,
      );
      run("screenshot", path.join(out, "verified-size-limits.png"));
      await reviewRequirements();
      const project = await current();
      const rooms = project.floors.flatMap((f) => f.rooms);
      assert.ok(rooms.some((r) => r.type === "Office"));
      assert.ok(
        rooms
          .filter((r) => r.type === "Office")
          .every((r) => Math.abs(r.w - 3) < 1e-7 && Math.abs(r.h - 4) < 1e-7),
      );
      assert.ok(
        rooms
          .filter((r) => r.type === "Bedroom")
          .every((r) => r.w * r.h <= 16 + 1e-7),
      );
      assert.equal(
        project.brief.roomSizeRules.find((r) => r.roomType === "Bedroom")
          .maxArea,
        16,
      );
    },
  );
  await check(
    "Circulation widths convert feet and constrain hallways and doors on every floor",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:nth-child(2)");
      click(".wizard-steps button:nth-child(3)");
      fill('[aria-label="Minimum hallway width"]', 6);
      fill('[aria-label="Minimum door width"]', 3.5);
      evaluate(
        'document.querySelector(".circulation-inputs").scrollIntoView({block:"center"})',
      );
      run("screenshot", path.join(out, "verified-circulation.png"));
      await reviewRequirements();
      const project = await current();
      assert.ok(
        Math.abs(project.brief.circulation.minHallwayWidth - 1.8288) < 1e-7,
      );
      assert.ok(
        Math.abs(project.brief.circulation.minDoorWidth - 1.0668) < 1e-7,
      );
      for (const floor of project.floors) {
        assert.ok(
          floor.rooms
            .filter((r) => r.type === "Hallway")
            .every((r) => Math.min(r.w, r.h) >= 1.8288 - 1e-7),
        );
        assert.ok(
          floor.items
            .filter((r) => r.type === "door")
            .every((r) => r.w >= 1.0668 - 1e-7),
        );
      }
    },
  );
  await check(
    "Floor references preserve aspect ratio, placement, visibility and local persistence",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:nth-child(2)");
      click('[aria-label="Close dialog"]');
      downloadBrowser ||= await chromium.connectOverCDP(
        run("get", "cdp-url").cdpUrl,
      );
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      await page
        .locator('[aria-label="Import floor reference image"]')
        .setInputFiles({
          name: "Client sketch.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await page.locator("[data-reference-image]").waitFor();
      click('.nav-rail [title="Build"]');
      await page.locator(".reference-controls").waitFor();
      fill('[aria-label="Reference image width"]', 20);
      fill('[aria-label="Reference X"]', 2);
      fill('[aria-label="Reference rotation"]', 15);
      const p = await current(),
        ref = p.floors[0].reference;
      assert.equal(ref.w, ref.h);
      // Previous circulation check selects feet.
      assert.ok(Math.abs(ref.w - 6.096) < 1e-7);
      assert.ok(Math.abs(ref.x - 0.6096) < 1e-7);
      assert.equal(ref.rotation, 15);
      evaluate("localStorage.clear()");
      run("reload");
      await page.locator("[data-reference-image]").waitFor();
      assert.deepEqual((await current()).floors[0].reference, ref);
      click('.nav-rail [title="Build"]');
      evaluate(
        'document.querySelector(".reference-controls").scrollIntoView({block:"center"})',
      );
      run("screenshot", path.join(out, "verified-reference.png"));
      run("uncheck", '.reference-controls input[type="checkbox"]');
      assert.equal(
        evaluate('!!document.querySelector("[data-reference-image]")'),
        false,
      );
      assert.ok((await current()).floors[0].reference.dataUrl);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.equal(
        evaluate('!!document.querySelector("[data-reference-image]")'),
        true,
      );
      click('[aria-label="Remove reference image"]');
      assert.equal((await current()).floors[0].reference, undefined);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.deepEqual((await current()).floors[0].reference, ref);
      const floors = (await current()).floors;
      if (floors.length > 1) {
        run("select", '[aria-label="Active floor"]', floors[1].id);
        assert.equal(
          evaluate('!!document.querySelector("[data-reference-image]")'),
          false,
        );
        run("select", '[aria-label="Active floor"]', floors[0].id);
        assert.equal(
          evaluate('!!document.querySelector("[data-reference-image]")'),
          true,
        );
      }
      click(".brief-top");
      await reviewRequirements();
      assert.deepEqual((await current()).floors[0].reference, ref);
    },
  );
  await check(
    "Reference calibration scales from two clicked points and supports keyboard entry and undo",
    async () => {
      click(".workspace-status > div > button");
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      const before = (await current()).floors[0];
      click('.nav-rail [title="Build"]');
      await page
        .getByRole("button", { name: "Calibrate from two points", exact: true })
        .click();
      const svg = page.locator(".calibration-image");
      const points = await svg.evaluate((el) => {
        const m = el.getScreenCTM(),
          height = el.viewBox.baseVal.height;
        return [
          [200, height * 0.3],
          [800, height * 0.3],
        ].map(([x, y]) => {
          const p = new DOMPoint(x, y).matrixTransform(m);
          return { x: p.x, y: p.y };
        });
      });
      for (const p of points) await page.mouse.click(p.x, p.y);
      fill('[aria-label="Calibration known distance"]', 4);
      run("screenshot", path.join(out, "verified-reference-calibration.png"));
      await page
        .getByRole("button", { name: "Apply scale", exact: true })
        .click();
      const after = (await current()).floors[0];
      assert.ok(Math.abs(after.reference.w - 4 / 0.6) < 0.03);
      assert.equal(after.reference.rotation, before.reference.rotation);
      assert.deepEqual(after.rooms, before.rooms);
      assert.deepEqual(after.items, before.items);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.deepEqual((await current()).floors[0], before);
      await page
        .getByRole("button", { name: "Calibrate from two points", exact: true })
        .click();
      await page.locator(".reference-calibration summary").click();
      for (const [point, x] of [
        [1, 20],
        [2, 80],
      ]) {
        fill(`[aria-label="Calibration point ${point} X"]`, x);
        fill(`[aria-label="Calibration point ${point} Y"]`, 30);
      }
      fill('[aria-label="Calibration known distance"]', 4);
      await page
        .getByRole("button", { name: "Apply scale", exact: true })
        .click();
      assert.ok(
        Math.abs((await current()).floors[0].reference.w - 4 / 0.6) < 1e-7,
      );
      click('[aria-label="Undo (Ctrl+Z)"]');
      await page
        .getByRole("button", { name: "Calibrate from two points", exact: true })
        .click();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".reference-calibration").count(), 0);
      assert.deepEqual((await current()).floors[0], before);
    },
  );
  await check(
    "Opening requirements and individual elevations persist, validate ceiling fit and export correct window geometry",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:first-child");
      click(".wizard-steps button:nth-child(4)");
      fill('[aria-label="Required door height"]', 2.2);
      fill('[aria-label="Required open passage height"]', 2.3);
      fill('[aria-label="Required window opening height"]', 1);
      fill('[aria-label="Required window sill height"]', 1.1);
      await reviewRequirements();
      const generated = await current();
      for (const floor of generated.floors)
        for (const item of floor.items.filter((i) => i.type === "window"))
          assert.deepEqual(item.opening, { height: 1, sill: 1.1 });
      downloadBrowser ||= await chromium.connectOverCDP(
        run("get", "cdp-url").cdpUrl,
      );
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      click(".brief-top");
      click(".wizard-steps button:nth-child(4)");
      await page
        .getByLabel("Required window opening height", { exact: true })
        .fill("");
      await page
        .getByLabel("Required window sill height", { exact: true })
        .fill("");
      assert.equal(
        await page
          .getByLabel("Required window opening height", { exact: true })
          .inputValue(),
        "",
      );
      click('[aria-label="Close dialog"]');
      assert.deepEqual(
        (await current()).brief.openingSizes,
        { doorHeight: 2.2, passageHeight: 2.3 },
        "Clearing window requirements leaves only door and passage heights",
      );
      await page.locator('[data-item="window"]').first().focus();
      await page.keyboard.press("Enter");
      fill('[aria-label="Selected element name"]', "Courtyard window");
      const original = (await current()).floors[0].items.find(
        (i) => i.name === "Courtyard window",
      );
      click(".workspace-status>div>button");
      fill('[aria-label="Opening height"]', 4);
      fill('[aria-label="Window sill height"]', 3);
      await page
        .getByRole("button", { name: "Apply opening dimensions", exact: true })
        .click();
      const edited = (await current()).floors[0].items.find(
        (i) => i.id === original.id,
      );
      assert.ok(Math.abs(edited.opening.height - 1.2192) < 1e-7);
      assert.ok(Math.abs(edited.opening.sill - 0.9144) < 1e-7);
      assert.equal(edited.h, original.h);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.deepEqual(
        (await current()).floors[0].items.find((i) => i.id === original.id),
        original,
      );
      click('[aria-label="Redo (Ctrl+Shift+Z)"]');
      run("reload");
      assert.deepEqual(
        (await current()).floors[0].items.find((i) => i.id === original.id),
        edited,
      );
      assert.ok(
        evaluate(
          'document.querySelector(".workspace-status > div > button").textContent.includes("Imperial")',
        ),
      );
      click(".workspace-status > div > button");
      run("focus", '[aria-label="Select Courtyard window"]');
      run("press", "Enter");
      fill('[aria-label="Opening height"]', 3);
      await page
        .getByRole("button", { name: "Apply opening dimensions", exact: true })
        .click();
      assert.ok(
        evaluate(
          `document.querySelector('.opening-controls').textContent.includes('opening top exceeds')`,
        ),
      );
      assert.deepEqual(
        (await current()).floors[0].items.find((i) => i.id === original.id),
        edited,
      );
      fill('[aria-label="Opening height"]', 1.2);
      fill('[aria-label="Window sill height"]', 0.9);
      await page
        .getByRole("button", { name: "Apply opening dimensions", exact: true })
        .click();
      click(".assistant-tabs button:first-child");
      fill(
        '[aria-label="Message the design assistant"]',
        "Set selected window height to 1.4 m",
      );
      click('[aria-label="Send message"]');
      await page.locator(".edit-proposal .primary").last().waitFor();
      await page.locator(".edit-proposal .primary").last().click();
      assert.deepEqual(
        (await current()).floors[0].items.find((i) => i.id === original.id)
          .opening,
        { height: 1.4, sill: 0.9 },
      );
      run("focus", '[aria-label="Select Courtyard window"]');
      run("press", "Enter");
      await page.locator(".opening-controls").scrollIntoViewIfNeeded();
      run("screenshot", path.join(out, "verified-opening-elevation.png"));
      click(".view-switch button:nth-child(2)");
      await page.locator(".scene3d canvas").waitFor();
      await page
        .getByRole("button", { name: "Toggle full-height walls" })
        .click();
      click(".export-button");
      const pending = page.waitForEvent("download");
      await page.locator('[data-format="glb"]').click();
      const file = await pending,
        destination = path.join(out, "verified-opening-elevation.glb");
      assert.equal(await file.failure(), null);
      await file.saveAs(destination);
      const bytes = readFileSync(destination),
        gltf = JSON.parse(
          bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
        );
      const glass = gltf.nodes.filter(
        (n) =>
          n.extras?.kind === "window-glass" &&
          n.extras.openingIds.includes(original.id),
      );
      assert.ok(glass.length);
      for (const node of glass) {
        const accessor =
          gltf.accessors[
            gltf.meshes[node.mesh].primitives[0].attributes.POSITION
          ];
        const scale = node.matrix?.[5] ?? node.scale?.[1] ?? 1,
          y = node.matrix?.[13] ?? node.translation?.[1] ?? 0;
        assert.ok(Math.abs(accessor.min[1] * scale + y - 0.9) < 1e-5);
        assert.ok(Math.abs(accessor.max[1] * scale + y - 2.3) < 1e-5);
      }
      click('[aria-label="Close dialog"]');
      click(".view-switch button:first-child");
    },
  );
  await check(
    "Per-floor ceiling heights convert feet, persist, support undo and reach actual GLB wall geometry",
    async () => {
      click(".brief-top");
      click(".brief-unit-choice button:nth-child(2)");
      run("select", '[aria-label="Number of floors"]', "2");
      click(".wizard-steps button:nth-child(4)");
      fill('[aria-label="Floor 1 ceiling height"]', 10);
      fill('[aria-label="Floor 2 ceiling height"]', 9);
      await reviewRequirements();
      const generated = await current();
      assert.ok(Math.abs(generated.floors[0].ceilingHeight - 3.048) < 1e-7);
      assert.ok(Math.abs(generated.floors[1].ceilingHeight - 2.7432) < 1e-7);
      run("reload");
      assert.deepEqual((await current()).floors, generated.floors);
      assert.ok(
        evaluate(
          'document.querySelector(".workspace-status > div > button").textContent.includes("Imperial")',
        ),
      );
      click('[aria-label="Floor settings"]');
      assert.ok(
        Math.abs(
          Number(
            evaluate(
              `document.querySelector('[aria-label="Floor ceiling height"]').value`,
            ),
          ) - 10,
        ) < 1e-6,
      );
      fill('[aria-label="Floor ceiling height"]', 11);
      fill('[aria-label="Floor name"]', "Raised ground floor");
      click('.settings-body button[type="submit"]');
      const edited = await current();
      assert.equal(edited.floors[0].name, "Raised ground floor");
      assert.ok(Math.abs(edited.floors[0].ceilingHeight - 3.3528) < 1e-7);
      assert.ok(
        Math.abs(
          edited.brief.floorHeights.find((r) => r.floor === 0).ceilingHeight -
            3.3528,
        ) < 1e-7,
      );
      assert.equal(edited.brief.requirements.reviewKey, undefined);
      assert.deepEqual(edited.floors[0].rooms, generated.floors[0].rooms);
      assert.deepEqual(edited.floors[1], generated.floors[1]);
      click('[aria-label="Undo (Ctrl+Z)"]');
      assert.deepEqual((await current()).floors, generated.floors);
      click(".view-switch button:nth-child(2)");
      downloadBrowser ||= await chromium.connectOverCDP(
        run("get", "cdp-url").cdpUrl,
      );
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      await page.locator(".scene3d canvas").waitFor();
      await page
        .getByRole("button", { name: "Toggle full-height walls" })
        .click();
      run("screenshot", path.join(out, "verified-ceiling-height.png"));
      click(".export-button");
      const pending = page.waitForEvent("download");
      await page.locator('[data-format="glb"]').click();
      const file = await pending;
      assert.equal(await file.failure(), null);
      const destination = path.join(out, "verified-ceiling-height.glb");
      await file.saveAs(destination);
      const bytes = readFileSync(destination);
      const gltf = JSON.parse(
        bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
      );
      const wallTops = gltf.nodes
        .filter((n) => n.extras?.kind === "wall")
        .map((n) => {
          const accessor =
            gltf.accessors[
              gltf.meshes[n.mesh].primitives[0].attributes.POSITION
            ];
          return (
            accessor.max[1] * (n.matrix?.[5] ?? n.scale?.[1] ?? 1) +
            (n.matrix?.[13] ?? n.translation?.[1] ?? 0)
          );
        });
      assert.ok(wallTops.length > 0);
      assert.ok(
        Math.abs(Math.max(...wallTops) - 3.048) < 1e-5,
        "Exported wall vertices reach the specified ceiling height",
      );
      click('[aria-label="Close dialog"]');
      click(".view-switch button:first-child");
    },
  );
  await check("3D scene renders on demand", async () => {
    click(".view-switch button:nth-child(2)");
    for (
      let n = 0;
      n < 30 && !evaluate('!!document.querySelector(".scene3d canvas")');
      n++
    )
      await sleep(200);
    assert.ok(evaluate('!!document.querySelector(".scene3d canvas")'));
    assert.ok(evaluate('document.querySelector(".scene3d canvas").width>100'));
    run("screenshot", path.join(out, "verified-3d.png"));
    click(".view-switch button:first-child");
  });
  await check("Project JSON and PNG exports create usable files", async () => {
    click(".export-button");
    const jsonPath = path.join(out, "export-test.forma.json"),
      pngPath = path.join(out, "export-test.png");
    downloadBrowser ||= await chromium.connectOverCDP(
      run("get", "cdp-url").cdpUrl,
    );
    const page = downloadBrowser
      .contexts()[0]
      .pages()
      .find((p) => p.url().startsWith(baseUrl));
    const exportFile = async (format, destination) => {
      const pending = page.waitForEvent("download");
      await page.locator(`[data-format="${format}"]`).click();
      const file = await pending;
      assert.equal(await file.failure(), null);
      await file.saveAs(destination);
    };
    await exportFile("json", jsonPath);
    assert.ok(existsSync(jsonPath));
    const p = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(p.version, 1);
    assert.equal(p.brief.bedrooms, 3);
    await exportFile("png", pngPath);
    assert.equal(readFileSync(pngPath).subarray(1, 4).toString(), "PNG");
    await exportFile("dxf", path.join(out, "verified-floor.dxf"));
    assert.ok(
      readFileSync(path.join(out, "verified-floor.dxf"), "utf8").includes(
        "$INSUNITS\n70\n6",
      ),
    );
    await exportFile("csv", path.join(out, "verified-schedule.csv"));
    assert.ok(
      readFileSync(path.join(out, "verified-schedule.csv"), "utf8").includes(
        "Quantity",
      ),
    );
    click('[aria-label="Close dialog"]');
    click(".view-switch button:nth-child(2)");
    await page.locator(".scene3d canvas").waitFor();
    click(".export-button");
    await exportFile("glb", path.join(out, "verified-model.glb"));
    assert.equal(
      readFileSync(path.join(out, "verified-model.glb"))
        .subarray(0, 4)
        .toString(),
      "glTF",
    );
    await exportFile("png", path.join(out, "verified-render.png"));
    assert.equal(
      readFileSync(path.join(out, "verified-render.png"))
        .subarray(1, 4)
        .toString(),
      "PNG",
    );
    click('[aria-label="Close dialog"]');
  });
  await check(
    "First-person walkthrough responds to movement and returns to orbit",
    async () => {
      const page = downloadBrowser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith(baseUrl));
      click(".scene-controls button:nth-child(2)");
      await page.locator(".scene3d canvas").focus();
      const before = await page
        .locator(".scene3d canvas")
        .evaluate((canvas) => canvas.toDataURL());
      await page.keyboard.down("w");
      await sleep(500);
      await page.keyboard.up("w");
      const after = await page
        .locator(".scene3d canvas")
        .evaluate((canvas) => canvas.toDataURL());
      assert.notEqual(before, after);
      run("screenshot", path.join(out, "verified-walkthrough.png"));
      click(".scene-controls button:first-child");
      click(".view-switch button:first-child");
    },
  );
  await check(
    "Mobile panels are reachable without horizontal overflow",
    async () => {
      run("set", "viewport", "390", "844");
      assert.ok(
        evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
      );
      if (
        evaluate(
          'document.querySelector(".library").classList.contains("mobile-open")',
        )
      )
        click('[aria-label="Close library"]');
      click(".mobile-tools button:first-child");
      assert.ok(
        evaluate(
          'document.querySelector(".library").classList.contains("mobile-open")',
        ),
      );
      click('[aria-label="Close library"]');
      click(".mobile-tools button:nth-child(2)");
      assert.ok(
        evaluate(
          'document.querySelector(".assistant-panel").classList.contains("mobile-open")',
        ),
      );
      run("screenshot", path.join(out, "verified-mobile.png"));
      click(".assistant-tabs button:first-child");
      click(".prompt-modes button:first-child");
      assert.ok(
        evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
      );
      assert.ok(
        evaluate(
          'document.querySelector("#design-prompt").getBoundingClientRect().bottom < window.innerHeight',
        ),
      );
      run("screenshot", path.join(out, "verified-mobile-interview.png"));
    },
  );
  const errors = run("errors");
  assert.deepEqual(errors.errors, [], "Browser errors were logged");
  writeFileSync(
    path.join(out, "browser-report.json"),
    JSON.stringify({ checks: report, browserErrors: errors }, null, 2),
  );
  console.log(`${report.length} browser checks passed.`);
} catch (e) {
  report.push({ status: "failed", error: String(e) });
  writeFileSync(
    path.join(out, "browser-report.json"),
    JSON.stringify(report, null, 2),
  );
  try {
    run("screenshot", path.join(out, "browser-failure.png"));
  } catch {}
  console.error(e);
  process.exitCode = 1;
} finally {
  await downloadBrowser?.close().catch(() => {});
  try {
    run("close");
  } catch {}
  if (studioServer && studioServer.exitCode === null) {
    const ended = new Promise((resolve) => studioServer.once("exit", resolve));
    studioServer.kill();
    await ended;
  }
  const resolved = path.resolve(testDirectory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("forma-browser-test-"));
  rmSync(resolved, { recursive: true, force: true });
}
