# Forma floor-plan studio

Forma is a local web application for collecting a home-design brief, drafting a layout, furnishing it and exploring it in 2D and 3D. It has an original interface inspired by professional floor-planning workspaces.

## Start here

- **Enter constraints:** click **Requirements & constraints** in the top bar. Complete the six steps, including the 12-topic constraints checklist, then review the brief before building. Unknown answers remain explicit; unsupported non-negotiables block AI generation.
- **Describe what you need:** in **AI prompts**, choose **Collect needs** and answer in your own words. Review and save the proposed answers. Use **New layout** to turn the saved brief into a replacement-layout proposal.
- **Edit or redo a design:** in **AI prompts**, choose **Edit this floor** and type into **Tell AI what to change**. Review the proposed changes, then apply or dismiss them. Undo is available after applying.
- **Choose the AI:** open **Settings** to connect the installed Ollama model or an OpenAI-compatible API. The built-in geometric planner and simple edit commands also work without a model.
- **Keep your work:** projects save on this computer. Use **Projects → Save version** before a major redesign and export a project JSON backup for safekeeping.
- **Measure in feet:** the workspace starts in feet and remembers the last unit choice. Use **Imperial / Metric** in the lower status bar to switch every editable measurement.

## Run

Node.js 22.12+ is required. From this folder:

On Windows, double-click **run-local.bat**. It installs dependencies the first
time, starts the editor and local API, and prints the address to open. Press
Ctrl+C in its window to stop both servers.

Or run the commands manually:

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Vite serves the editor; the local Express API listens on port 3001. Both bind to the local machine.

For a production build on this machine:

```powershell
npm run build
npm start
```

Then open **http://127.0.0.1:3001**. The workspace runs on this computer without an account. Authentication and remote collaboration are outside the current local studio scope.

## Local studio storage

Projects, every floor, the complete assistant conversation, and accepted briefs save to `.forma/projects/`. Recovery versions live in `.forma/versions/`. Set `FORMA_DATA_DIR` in `.env` to use a different folder. The Projects panel shows the actual storage location.

Saves write a temporary file, flush it, and atomically replace the previous project file. Revisions prevent two windows from overwriting each other's changes. **All changes saved to this computer** appears only after the local server confirms a file save. Browser storage is a fallback for pending drafts; existing browser projects migrate into the studio on startup. Divergent browser drafts are recovered as separate projects.

Use **Projects → Save version** to name a design milestone. Automatic recovery versions are retained while you edit, at most once per minute. **Restore** first saves the current design in version history. **Duplicate project** creates a separate design; importing a JSON backup also creates a separate project. There is no automatic project-count eviction. Keep an external backup by exporting projects or copying the `.forma` folder while Forma is closed.

## Design workflow

Draw a room or drag a selected room's corner bracket to see live width and depth in the current units, even with static dimensions hidden. In Properties, dimension fields accept unfinished text: clear and replace a value, then press Enter or leave the field to apply it. Escape cancels. Use the minus/plus buttons or arrow keys to adjust dimensions by 0.1 of the displayed unit. Invalid values restore the previous dimension with an explanation.

**Room properties > Wall thickness** starts new rooms at the common 4½-inch (114 mm) partition size and provides one-click 4½-inch and 9-inch (229 mm) choices. The precise field remains available in meters or feet for custom sizes from 0.05-1 m. Entered room width and depth are the overall footprint including walls; Properties shows the clear inside width, depth and area remaining after those walls. Unshared walls sit wholly inside the footprint. A wall shared by rooms on opposite sides is counted once across their common boundary. Coincident wall sections merge using the greater thickness, never the sum; unshared portions keep their room's thickness. This also handles smaller rooms inside larger rooms sharing one, two or three sides. The 2D plan, 3D walls, walkthrough collision checks and DXF/GLB geometry use the same wall segments. Values persist in projects and CSV schedules, support Undo, and are protected by room geometry locks.

Select a custom wall to drag it or move either endpoint handle. **Wall properties → Length and direction** accepts an exact length in meters/feet and an angle, keeping the chosen endpoint fixed. Attached doors, windows and passages follow a moved/rotated wall without changing their sizes. Shortening a wall is rejected if an attached opening would no longer fit; locked openings and ambiguous attachments to overlapping walls also prevent the edit. These changes support Undo and AI prompts such as “Move Kitchen partition 2 feet down” or “Rotate Kitchen partition by 90 degrees.” Room perimeter walls remain controlled by the rectangular room footprint.

**The details → Required door and window dimensions** records project-wide door/passsage heights, window opening heights and sill heights before generation, in meters or feet. Requirements apply to every matching opening on every floor and can be linked to written non-negotiables. Conflicts with ceiling heights block generation; AI edits cannot violate the recorded sizes. Select an individual door/window/open passage to edit **Opening elevation** in Properties. Opening height is vertical and distinct from the plan's depth. Windows have an editable sill; doors/passages start at floor level. Legacy defaults are 2.15 m door/passage height and a 1.3 m window at a 0.85 m sill. Openings above the ceiling are rejected, including when lowering a floor's ceiling. Custom elevations persist in projects, GLB geometry and CSV schedules; schedules separate differently sized openings. Manual exceptions to project-wide sizes appear in Design checks. The 3D renderer preserves different opening tops/sills and merges overlapping voids; walkthrough navigation blocks doors/passages under its 1.8 m standing clearance. That navigation limit is not a code or headroom certification. AI prompts such as “Set selected window sill height to 3 feet” produce a reviewable change.

**Requirements & constraints → The details → Ceiling heights by floor** collects one floor-surface-to-ceiling height for each level in meters or feet. Unspecified floors use a reviewed 2.7 m assumption; the software supports 2.2–6 m. Generated floors, full-height 3D walls, walkthrough walls, GLB exports, editable project backups and CSV schedules retain these heights. Cutaway walls remain 1.35 m for visibility. Use **Floor settings** beside the active-floor selector to rename a floor or change an existing floor's height; applying is undoable and height changes update the corresponding brief rule and invalidate its review. Locked custom walls prevent height changes. AI **New layout** proposals can specify per-floor heights, and written non-negotiables can link to these structured rules. These are modeled ceiling heights, not floor-to-floor elevations: slabs, suspended ceilings, stair rise/headroom and opening head heights remain independently coordinated. 2D DXF exports remain plan drawings without vertical geometry.

Custom walls also support **Wall properties → Lock wall geometry**. Give surveyed walls descriptive names so they can be selected from Layers or referred to in AI prompts. Locking protects endpoints and thickness against property edits, deletion and AI changes; moving a containing room leaves a locked wall in place. Unlocked internal walls still move with their room. Locks and names survive local saves and project backups, and any locked custom wall blocks regeneration. Names remain editable while locked. Doors and windows remain independent, and a wall lock does not establish structural suitability or resolve broader structural requirements. Wall geometry can be unlocked manually, with Undo available.

For surveyed rooms, select the room and choose **Lock room geometry** in Room properties. Position and dimensions become fixed: dragging, resizing, deletion and conflicting AI edits are blocked. Names and finishes remain editable, and a duplicate starts unlocked. Locks persist in studio saves and project backups, and locking/unlocking is undoable. A project with locked rooms cannot regenerate its layout; the current generator cannot preserve arbitrary fixed footprints. Furniture, openings and custom walls are independent of this footprint lock. This does not resolve a written requirement to preserve structural elements.

1. Explore the furnished sample, or open **Projects → New project**.
2. Open **Requirements & constraints** in the header or above the **AI prompts** composer. Six steps collect plot dimensions in meters or feet, setbacks, rooms, floors, occupants, location, entrance, style, accessibility, budget and notes. The Constraints step covers 12 areas: project use, site, household, room program, adjacency/privacy, access, fixed structure, services, environment, outdoor spaces, budget and external rules. Each needs details, an explicit unknown, or a not-applicable answer. Add custom requirements in your own words and mark preferences or non-negotiables. Draft answers save with the project.
3. **Review → Build reviewed concept** requires confirmation of core inputs and explicit acceptance of unknowns and manual checks. Changing inputs invalidates the previous review. Unresolved non-negotiable written requirements block generation and AI edits because the current solver cannot verify them. Generated concepts use a bounded search around a central hall, with doors, exterior windows and the selected entrance direction. Infeasible programs return an error. Alternatively, use **Build** to draw rooms and walls manually.
4. Search **Furnish**, click an object to add it, or drag it onto the plan. The catalog includes 25 original parametric object types for living, sleeping, dining, kitchens, bathrooms, offices, decor and structure.
5. Select rooms or objects to drag their corner handles or enter exact dimensions, position, color and rotation. Moving a room carries its contents and attached openings, respecting object locks. Doors and windows snap to nearby walls. **Materials** changes room finishes. **Layers** lists each floor's contents. Undo/redo retains 50 editing states for the open project.
6. Switch to **3D view** to orbit a furnished cutaway or full-height model. Right-drag pans; the wheel zooms. **Walk through** uses WASD/arrow keys or on-screen controls, and drag to look. Wall collisions respect actual doorway openings. WebGL is required.
7. Open **Design checks** for room overlaps, plot bounds, counts, compact spaces and the requested hallway width. These checks do not certify construction or regulatory compliance.
8. Export a 2D/3D PNG, measured SVG, print/PDF, editable `.forma.json` project, DXF drawing, GLB scene, or CSV room/object schedule. GLB exports the displayed 3D scene, and DXF uses meters. Project imports validate the schema and accept files up to 25 MB.

Upload a PNG, JPEG or WebP in **Build → Import a reference image** (up to 5 MB / 40 megapixels). One reference is saved per floor with position, scale, rotation, opacity and visibility. It initially fits the buildable footprint while preserving aspect ratio; set its full-image width and X/Y offsets in meters or feet to trace at the intended scale. Hiding keeps the reference saved, and removal is undoable. References survive reloads, studio versions and project JSON backups; generating another layout keeps references on corresponding floors. Visible references also appear in 2D drawing exports. Uploads that would take a project beyond the 24 MB backup limit are rejected. Large projects may exceed browser cache capacity; local disk remains the primary store. This is manual tracing, not automatic plan recognition. Image pixels are excluded from AI text-model requests.

Use **Calibrate from two points** when you know the length of a wall or dimension within the drawing. Choose its endpoints on the image preview and enter their real distance in the workspace's current units. Keyboard users can enter endpoint positions as percentages of image width/height. **Apply scale** preserves the first point's position on the plan, the image's aspect ratio and its existing rotation; drawn rooms and furniture are unchanged. The dialog previews the source image without rotation for point selection. Coincident points, nonpositive distances and scales beyond project limits are rejected. Cancel leaves the reference unchanged; applying is one undoable edit. Calibration depends on the accuracy of the client-provided measurement.

**Your rooms → Specify different rooms on each floor** records an independent list for every generated level. Choose counts for living rooms, kitchens, bedrooms, bathrooms and additional spaces; zero omits a room type. These lists override the shared counts while enabled. Every selected floor needs at least one room. Increasing the floor count adds a new list; reducing it removes the higher-floor requirements. Review shows every floor's program, and generated floors retain their program association for later validation and AI edits. For example, an upper floor can contain only bedrooms and bathrooms. Local/API models can propose these lists from a conversational request. Minimum sizes apply on the floors requesting that room type. Stair markers are still indicative: the generator does not yet coordinate shafts, openings or structural connections across levels.

**Requirements & constraints → Your rooms → Required room sizes** accepts minimum and maximum width, depth and area in meters or feet. Set equal minimum and maximum values for an exact size: a 3 × 4 m office uses width 3–3 m and depth 4–4 m. Each rule applies to every room of that type wherever requested. Width and depth follow the displayed plan axes, even when the entrance rotates. These are overall footprint dimensions including walls; the room Properties panel reports the smaller clear interior. The bounded search can shift the hallway and distribute spare space without exceeding room limits. If every room reaches its maximum, excess footprint stays unallocated. Conflicting ranges are rejected; a search failure does not prove no other layout is possible. Limits appear in Review and Design checks; conflicting AI edits are rejected, while manual changes show violations. Changing a maximum invalidates any written-requirement link to that rule. Individual named-room exceptions remain future work.

**Your lifestyle → Required circulation widths** accepts minimum hallway footprint and door leaf widths in meters or feet. These are nominal dimensions: finished clear passage, frames, door approach space, furniture obstructions, wheelchair turning and step-free routes still need review. Generation respects the requested lower bounds, with ordinary defaults of 1.2 m hallways / 0.9 m door leaves, or 1.5 m / 1 m when easier mobility is selected. A wider entrance request also widens the generated hall. Every generated floor is checked; narrowing a constrained hallway or door through AI is rejected, and manual violations appear in Design checks. Written requirements can link to these numeric rules, but full accessibility requirements must not be treated as satisfied by widths alone. Local/API models can propose the fields from explicit client requests; `tests/local-circulation.mjs` verifies the local model path.

**Design checks → Doorway connections** traces room-boundary connections from exterior doors on the outer room extent. Doors and open passages need at least 0.5 m of overlapping boundary; windows, floating doors and corner contact do not connect rooms. It lists rooms with no identified connection and unconnected door/opening objects. Generation checks every floor. AI edits cannot disconnect a previously connected room or add a room without a connection; replacing a doorway in the same proposal is supported. Existing incomplete drafts can still be repaired. This is a per-floor topology check, not proof of an unobstructed route: internal partitions, furniture, clear widths and vertical circulation need separate review. Recessed entrances and courtyards may need manual verification. Manual edits remain available and Undo restores a removed entrance.

## AI options

**Your rooms → Required room relationships** adds geometric adjacency and separation rules. “Beside” requires at least one pair of the selected room types to share a footprint boundary of at least 1 m on each floor requesting both. “Keep apart” means no pair shares a boundary; separate floors can satisfy this. Corner contact and opposite sides of a hallway do not count as adjacency. The bounded generator searches room allocations and orderings, then checks the resulting geometry. Unsatisfied rules reject generation and AI edits. Manual edits report violations in Design checks. These rules do not ensure connecting doors, acoustic isolation, or a bathroom beside every bedroom; individual-room targets and distance-based relationships remain future work. Local/API models can propose the supported rules for review.

**Your space → Use different setbacks on each side** adds north, east, south and west clearances in meters or feet. A diagram shows the plot and remaining buildable area. North remains fixed when the entrance changes. Each side overrides the uniform value until that option is switched off. Floor coordinates and drawing exports start at the buildable footprint's north-west corner; add the west/north setback offsets to locate the floor within the plot. The editor, generator, measured-image exports and design checks share the same footprint calculation. Invalid clearances block generation. These are client-provided values, not automatic verification of local setback regulations.

**AI prompts → Collect needs** starts a guided interview at the first unanswered topic. Type or dictate an answer, choose its priority, or explicitly mark it unknown/not applicable. Review **Save these answers** before the notes change; Forma then asks about the next unanswered topic. This guided path works without an LLM. Select **Let AI organize my notes** to have a local/API model group a longer message across topics. Each new detail must be an exact quote from your message; invented or paraphrased details are rejected. Review the original message for anything the model missed. Existing notes are appended, and non-negotiable notes cannot be erased or downgraded through the interview. Corrections and conflicting statements remain visible for manual review.

**Constraints → Non-negotiable → Confirm these rules fully express this requirement** links a written must-have to existing room-size and relationship rules. Select every rule needed to represent the entire statement; split mixed requirements into individual entries first. This is an explicit client interpretation, not automatic semantic verification or a professional sign-off. For example, a note requiring every bedroom to be at least 3 m wide can link to the Bedroom width minimum. The original wording and selected rule values are retained. Changed text, removed/changed rules or changes to the affected room counts and floor programs reopen the blocker. The final review still applies, and AI edits must satisfy the linked geometry checks. Unsupported structure, acoustics, door connections, budget and regulatory conditions cannot be resolved by these rules. Keep those requirements unresolved and use manual design. Links survive local storage and project export; AI models cannot create them on the client's behalf.

With a local/API model selected, **Propose layout brief from saved answers** interprets the collected notes into dimensions and room counts for review. Saving interview answers alone does not alter structured dimensions or floor geometry. All twelve topics and the final review gate still apply before generation. Proposals and saved answers persist with the project; changed requirements invalidate older proposals.

Open **AI prompts** and type in **Tell AI what to change**. **Edit this floor** proposes changes to the current floor: for example, “Remove the dining table,” “Make the primary bedroom 5 m wide,” or select an object and say “Move it 1 m left.” Review the listed changes and design warnings, then choose **Apply changes** or **Dismiss**. Apply is one undoable action. A proposal becomes stale if the floor or its requirements change before application.

**New layout** interprets a replacement brief. Choose **Review constraints & build** on the response to complete intake before replacing geometry. The built-in planner uses geometric rules and a deterministic English parser; it is explicitly labeled and is **not** an LLM. Local Ollama or an OpenAI-compatible model supports flexible requests and validated room, furniture and wall operations. Voice transcription depends on browser support and microphone permission.

With an LLM selected, try: “Every bedroom must be at least 4 meters wide, 3 meters deep and 14 square meters in area.” The proposed brief contains structured minimums for your review. Room dimensions are kept separate from plot dimensions.

Exact dimensions and upper limits can also be requested: “Every office must be exactly 3 meters wide and exactly 4 meters deep. Every bedroom must have an area no larger than 16 square meters.” Explicit English numeric statements are grounded independently of model output, including equal bounds for exact sizes, so a partial model response cannot weaken those recognized statements. Conflicting explicit values ask for clarification. Named-room exceptions, floor-specific statements and ambiguous prose still require model/client review. A live local Ollama test covers this example in `tests/local-size-limits.mjs`.

### Ollama

1. Install [Ollama](https://ollama.com/) and run a supported local model.
2. In **Settings → Local AI with Ollama**, enter `http://127.0.0.1:11434`.
3. Select **Test connection** to discover installed model IDs, and enter the desired ID.
4. Send your request to the design assistant.

Installed Ollama models are discovered automatically; the workspace selects a local model when available. Requests use non-streaming structured output, a context sized from 4,096 to 16,384 tokens and a small batch size. Requests too large for the local context budget return an error without dropping requirements. No model weights are bundled or automatically downloaded. Speed depends on the model and hardware. The development machine has `qwen3:4b` and `qwen2.5-coder:7b`; live brief interpretation and a validated room-rename proposal have been verified with the local model.

### API providers / LM Studio

Use **Settings → Connect an API**. Supply an OpenAI-compatible base URL (ending in `/v1`), a model ID and an API key if required. The provider must support Chat Completions JSON-object output. LM Studio can use a loopback URL such as `http://127.0.0.1:1234/v1`. Remote providers must use HTTPS.

Alternatively, copy `.env.example` to `.env` and set server configuration. Never commit `.env`. Keys entered in the UI stay in React memory for the current session; they are never included in project exports or browser project storage. The proxy does not log prompts or authorization headers.

When a remote provider is selected, submitting a flexible assistant request sends the prompt and complete brief, including collected constraints, to that provider. Editing also sends the current floor and selection; brief interpretation includes recent conversation. Exact quick-edit commands are handled on this computer. Ollama requests go to the local endpoint.

The connector follows [Ollama's structured output API](https://docs.ollama.com/capabilities/structured-outputs) and [chat endpoint](https://docs.ollama.com/api/chat). Model output is validated before becoming a proposal. Provider errors, malformed output and timeouts are surfaced in the conversation.

## Verification

```powershell
npm run test
npm run test:browser
```

Unit and integration tests cover geometry, editing transformations, input interpretation, AI provider requests, local file persistence, version restoration, concurrent writers, corrupt files and browser-draft reconciliation. The browser command builds the production application and launches an isolated server with a temporary studio directory. It exercises editing, corner resizing, history, drawing, recovery after clearing browser storage, intake in meters and feet, 3D, exports, walkthrough controls and mobile panels. Screenshots and a report are written under `artifacts/`. Browser tests do not use the working studio's files.

## Architecture

- `src/App.tsx`: editor orchestration, history, projects, exports and assistant UI.
- `src/PlanCanvas.tsx`: SVG editing with metric world coordinates and pointer interaction.
- `src/Furniture.tsx`: original vector furniture symbols.
- `src/SceneView.tsx`, `src/Furniture3D.ts`: lazily loaded Three.js scene, procedural furniture, walkthrough and scene exports.
- `src/BriefWizard.tsx`, `src/RequirementsIntake.tsx`: structured and free-text intake with a review gate.
- `shared/requirements.ts`: intake completeness, unresolved constraints and review invalidation.
- `src/RoomSizeInputs.tsx`, `shared/roomSizes.ts`, `shared/sizeIntent.ts`: unit-aware size limits, geometry validation and numeric grounding.
- `shared/agent.ts`: quick edits, transactional operations, proposal validation and stale-proposal fingerprints.
- `shared/model.ts`: versioned Zod schemas, catalog and furnished sample.
- `shared/layout.ts`, `shared/planner.ts`: bounded layout search and geometric checks.
- `shared/geometry.ts`, `shared/editing.ts`, `shared/export.ts`: wall/opening geometry, editing operations and DXF/CSV output.
- `src/studio.ts`, `src/useStudio.ts`: browser-draft reconciliation and queued autosaves.
- `server/repository.ts`, `server/projects.ts`: atomic local files, optimistic revisions and recovery versions.
- `server/index.ts`: local AI gateway, endpoint validation and provider adapters.
- `tests/`: geometry tests and browser workflow verification.

Room footprints are rectangular. Coordinates are meters with the origin at the top left; north is up. Imperial intake and display convert measurements without changing the underlying coordinate units. Import validates dimensions and rejects duplicate identifiers. Supported project limits are eight editable floors, 100 rooms, 1,000 objects and 500 custom walls per floor.

## Scope still to build for broad Planner 5D parity

This is a working local studio foundation; broad Planner 5D parity remains unfinished. Outstanding capabilities include a commercial-scale licensed asset library, arbitrary polygonal rooms and connected shared-wall editing, photorealistic rendering, automatic floor-plan recognition, custom GLB uploads, CAD/BIM import, pricing/catalog integrations and engineered multi-floor circulation. Remote collaboration, accounts and cloud backups are deferred for the requested local studio workflow.

The generator honors plot size, uniform or per-side setbacks, shared or per-floor room counts, entrance direction, circulation widths, structured room-size limits and supported adjacency/separation rules. AI edits cannot put room footprints outside the buildable envelope or remove existing doorway connectivity. Sunlight analysis, cultural constraints, budgets and richer adjacency rules remain for review rather than certification. Multi-floor circulation and stair alignment need manual coordination. The walkthrough collides with walls, but does not yet check collisions with furniture. Tracing references are saved per floor; automatic image recognition remains future work.

These are substantial product capabilities, not hidden toggles. Do not represent generated designs as permit-ready drawings or the current application as a complete replacement for a mature CAD/interior-design system.
