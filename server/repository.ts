import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ProjectSchema, type Project } from "../shared/model";

const RecordSchema = z.object({
  revision: z.number().int().positive(),
  savedAt: z.string(),
  project: ProjectSchema,
});
const VersionSchema = RecordSchema.extend({
  versionId: z.string().uuid(),
  label: z.string().max(120),
});
export type ProjectRecord = z.infer<typeof RecordSchema>;
export type ProjectVersion = z.infer<typeof VersionSchema>;
export class RepositoryError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
export function projectSignature(project: Project) {
  return JSON.stringify({
    ...ProjectSchema.parse(project),
    updatedAt: "",
    conversation: project.conversation || [],
  });
}

/** Each ID maps to a fixed hash, never a client-supplied filesystem path. */
export class ProjectRepository {
  readonly directory: string;
  private queues = new Map<string, Promise<unknown>>();
  private lastVersion = new Map<string, number>();
  constructor(directory: string) {
    this.directory = path.resolve(directory);
  }
  private key(id: string) {
    return createHash("sha256").update(id).digest("hex");
  }
  private projectFile(id: string) {
    return path.join(this.directory, "projects", this.key(id) + ".json");
  }
  private versionDirectory(id: string) {
    return path.join(this.directory, "versions", this.key(id));
  }
  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    this.queues.set(id, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(id) === current) this.queues.delete(id);
    }
  }
  private async atomic(file: string, data: unknown) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = file + "." + randomUUID() + ".tmp";
    // Flush before the atomic replacement. A failed write leaves the prior file intact.
    await writeFile(temporary, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      flag: "wx",
      flush: true,
    });
    await rename(temporary, file);
  }
  async get(id: string): Promise<ProjectRecord | null> {
    try {
      const record = RecordSchema.parse(
        JSON.parse(await readFile(this.projectFile(id), "utf8")),
      );
      if (record.project.id !== id) throw Error("ID mismatch");
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new RepositoryError(
        "This project file cannot be read. It has been preserved; recover a version as a new project.",
      );
    }
  }
  async list() {
    const projects: ProjectRecord[] = [],
      warnings: string[] = [];
    const directory = path.join(this.directory, "projects");
    await mkdir(directory, { recursive: true });
    for (const name of await readdir(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const record = RecordSchema.parse(
          JSON.parse(await readFile(path.join(directory, name), "utf8")),
        );
        if (name !== this.key(record.project.id) + ".json")
          throw Error("ID mismatch");
        projects.push(record);
      } catch {
        warnings.push(`Could not read ${name}. The file was preserved.`);
      }
    }
    projects.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return { projects, warnings, directory: this.directory };
  }
  private check(current: ProjectRecord | null, expected: number | null) {
    if ((current?.revision ?? null) !== expected)
      throw new RepositoryError(
        "A newer version was saved in another window. Save your changes as a copy to keep both designs.",
        409,
      );
  }
  private async snapshot(
    record: ProjectRecord,
    label: string,
  ): Promise<ProjectVersion> {
    const version = VersionSchema.parse({
      ...record,
      versionId: randomUUID(),
      label,
    });
    await this.atomic(
      path.join(
        this.versionDirectory(record.project.id),
        version.versionId + ".json",
      ),
      version,
    );
    this.lastVersion.set(record.project.id, Date.now());
    return version;
  }
  async save(project: Project, expectedRevision: number | null) {
    const validated = ProjectSchema.parse(project);
    return this.serial(validated.id, async () => {
      const current = await this.get(validated.id);
      this.check(current, expectedRevision);
      if (
        current &&
        projectSignature(current.project) === projectSignature(validated)
      )
        return current;
      if (
        current &&
        Date.now() - (this.lastVersion.get(validated.id) || 0) >= 60000
      )
        await this.snapshot(current, "Automatic recovery version");
      const savedAt = new Date().toISOString();
      const record: ProjectRecord = {
        revision: (current?.revision || 0) + 1,
        savedAt,
        project: { ...validated, updatedAt: savedAt },
      };
      await this.atomic(this.projectFile(validated.id), record);
      return record;
    });
  }
  async versions(id: string) {
    let files: string[];
    try {
      files = await readdir(this.versionDirectory(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { versions: [], warnings: [] };
      throw error;
    }
    const versions: Omit<ProjectVersion, "project">[] = [],
      warnings: string[] = [];
    for (const file of files) {
      if (!/^[0-9a-f-]{36}\.json$/.test(file)) continue;
      try {
        const version = await this.version(id, file.slice(0, -5));
        const { project: _project, ...metadata } = version;
        versions.push(metadata);
      } catch {
        warnings.push(
          `Could not read recovery version ${file}. The file was preserved.`,
        );
      }
    }
    return {
      versions: versions.sort(
        (a, b) => b.revision - a.revision || b.savedAt.localeCompare(a.savedAt),
      ),
      warnings,
    };
  }
  async version(id: string, versionId: string) {
    if (!z.string().uuid().safeParse(versionId).success)
      throw new RepositoryError("Invalid version ID.", 400);
    try {
      const version = VersionSchema.parse(
        JSON.parse(
          await readFile(
            path.join(this.versionDirectory(id), versionId + ".json"),
            "utf8",
          ),
        ),
      );
      if (version.project.id !== id || version.versionId !== versionId)
        throw Error("ID mismatch");
      return version;
    } catch {
      throw new RepositoryError(
        "This recovery version could not be read.",
        404,
      );
    }
  }
  async checkpoint(id: string, expectedRevision: number, label: string) {
    return this.serial(id, async () => {
      const current = await this.get(id);
      this.check(current, expectedRevision);
      if (!current) throw new RepositoryError("Project not found.", 404);
      return this.snapshot(current, label.trim() || "Saved version");
    });
  }
  async restore(id: string, versionId: string, expectedRevision: number) {
    return this.serial(id, async () => {
      const current = await this.get(id);
      this.check(current, expectedRevision);
      if (!current) throw new RepositoryError("Project not found.", 404);
      const version = await this.version(id, versionId);
      await this.snapshot(current, "Before restoring a version");
      const savedAt = new Date().toISOString();
      const restored = {
        revision: current.revision + 1,
        savedAt,
        project: { ...version.project, updatedAt: savedAt },
      };
      await this.atomic(this.projectFile(id), restored);
      return restored;
    });
  }
}
