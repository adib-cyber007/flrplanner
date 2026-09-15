import { z } from "zod";
import { ProjectSchema, uid, type Project } from "../shared/model";

const RecordSchema = z.object({
  revision: z.number().int().positive(),
  savedAt: z.string(),
  project: ProjectSchema,
});
export type StudioRecord = z.infer<typeof RecordSchema>;
export type VersionInfo = {
  versionId: string;
  revision: number;
  savedAt: string;
  label: string;
};
type StorageLike = Pick<Storage, "getItem" | "setItem">;
type Base = { revision: number; signature: string };
const BASES = "forma-studio-bases-v1";
function content(project: Project) {
  return JSON.stringify({
    ...ProjectSchema.parse(project),
    updatedAt: "",
    conversation: project.conversation || [],
  });
}
async function signature(project: Project) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content(project)),
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export class StudioError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

/** One queue per project avoids racing autosaves and tracks the server revision. */
export class StudioClient {
  private records = new Map<string, StudioRecord>();
  private queues = new Map<string, Promise<unknown>>();
  constructor(
    private storage?: StorageLike,
    private request: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  private bases(): Record<string, Base> {
    try {
      return JSON.parse(this.storage?.getItem(BASES) || "{}");
    } catch {
      return {};
    }
  }
  private async remember(record: StudioRecord) {
    this.records.set(record.project.id, record);
    const hash = await signature(record.project);
    try {
      this.storage?.setItem(
        BASES,
        JSON.stringify({
          ...this.bases(),
          [record.project.id]: { revision: record.revision, signature: hash },
        }),
      );
    } catch {
      /* Disk storage remains authoritative when browser storage is full. */
    }
    return record;
  }
  private async api(url: string, body?: unknown, method = "POST") {
    let response: Response;
    try {
      response = await this.request("/api/projects" + url, {
        method: body === undefined ? "GET" : method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new StudioError(
        "The local studio server is unavailable. Your browser draft is still available; retry when the server is running.",
      );
    }
    const data = await response.json();
    if (!response.ok)
      throw new StudioError(
        data.error || "Could not save this project.",
        response.status,
      );
    return data;
  }
  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) || Promise.resolve();
    const task = previous.catch(() => {}).then(action);
    this.queues.set(id, task);
    try {
      return await task;
    } finally {
      if (this.queues.get(id) === task) this.queues.delete(id);
    }
  }
  async initialize(cached: Project[], activeId: string | null) {
    const result = await this.api("");
    const records = z.array(RecordSchema).parse(result.projects);
    const bases = this.bases();
    const projects = new Map(records.map((r) => [r.project.id, r.project]));
    // Read all reconciliation markers before updating them.
    for (const record of records) this.records.set(record.project.id, record);
    let selectedId = activeId,
      recoveryCount = 0;
    for (const cachedProject of cached) {
      const server = this.records.get(cachedProject.id);
      let draft: Project | undefined;
      if (!server) draft = cachedProject;
      else if (content(server.project) !== content(cachedProject)) {
        const base = bases[cachedProject.id];
        const cachedHash = await signature(cachedProject);
        const serverHash = await signature(server.project);
        if (base?.signature === cachedHash) {
          /* The browser copy is unchanged; use the newer disk file. */
        } else if (
          base?.revision === server.revision &&
          base.signature === serverHash
        )
          draft = cachedProject;
        else {
          draft = {
            ...cachedProject,
            id: uid(),
            name: cachedProject.name.slice(0, 76) + " · Recovered draft",
          };
          if (selectedId === cachedProject.id) selectedId = draft.id;
          recoveryCount++;
        }
      }
      if (draft) {
        const saved = await this.save(draft);
        projects.set(saved.project.id, saved.project);
      }
    }
    for (const record of this.records.values()) await this.remember(record);
    const list = [...projects.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    return {
      projects: list,
      selectedId,
      recoveryCount,
      directory: String(result.directory || ""),
      warnings: (result.warnings || []) as string[],
    };
  }
  save(project: Project) {
    const snapshot = ProjectSchema.parse(project);
    return this.serial(snapshot.id, async () => {
      const known = this.records.get(snapshot.id);
      if (known && content(known.project) === content(snapshot)) return known;
      const record = RecordSchema.parse(
        await this.api(
          "/" + encodeURIComponent(snapshot.id),
          { project: snapshot, expectedRevision: known?.revision ?? null },
          "PUT",
        ),
      );
      return this.remember(record);
    });
  }
  async list() {
    const data = await this.api("");
    // Listing does not advance revisions for open drafts; writes must still detect conflicts.
    return z
      .array(RecordSchema)
      .parse(data.projects)
      .map((r) => r.project);
  }
  async open(id: string) {
    const result = await this.api("");
    const record = z
      .array(RecordSchema)
      .parse(result.projects)
      .find((r) => r.project.id === id);
    if (!record)
      throw new StudioError(
        "This project is no longer in the studio library.",
        404,
      );
    await this.remember(record);
    return record.project;
  }
  async versions(
    id: string,
  ): Promise<{ versions: VersionInfo[]; warnings: string[] }> {
    return this.api("/" + encodeURIComponent(id) + "/versions");
  }
  checkpoint(project: Project, label: string) {
    return this.serial(project.id, async () => {
      const known = this.records.get(project.id);
      if (!known)
        throw new StudioError("Save this project before creating a version.");
      return this.api("/" + encodeURIComponent(project.id) + "/versions", {
        expectedRevision: known.revision,
        label,
      });
    });
  }
  restore(id: string, versionId: string) {
    return this.serial(id, async () => {
      const known = this.records.get(id);
      if (!known)
        throw new StudioError("Open this project before restoring a version.");
      const restored = RecordSchema.parse(
        await this.api(
          `/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
          { expectedRevision: known.revision },
        ),
      );
      return this.remember(restored);
    });
  }
}
