import { ProjectSchema, type Project } from "../shared/model";
export const STORE = "forma-projects-v1",
  ACTIVE = "forma-active-v1";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
function entries(storage: StorageLike): unknown[] {
  const raw = storage.getItem(STORE);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed))
    throw Error("The stored project library is not readable.");
  return parsed;
}
export function listProjects(storage: StorageLike): Project[] {
  try {
    return entries(storage).flatMap((entry) => {
      const result = ProjectSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}
export function persistProject(storage: StorageLike, project: Project) {
  ProjectSchema.parse(project);
  // Preserve unrecognized projects and never silently evict an older project.
  const others = entries(storage).filter(
    (entry) =>
      !(
        entry &&
        typeof entry === "object" &&
        "id" in entry &&
        entry.id === project.id
      ),
  );
  storage.setItem(
    STORE,
    JSON.stringify([
      { ...project, updatedAt: new Date().toISOString() },
      ...others,
    ]),
  );
  storage.setItem(ACTIVE, project.id);
}
