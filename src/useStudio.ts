import { useCallback, useEffect, useRef, useState } from "react";
import { type Project } from "../shared/model";
import { ACTIVE, listProjects, persistProject } from "./storage";
import { StudioClient, StudioError } from "./studio";

export function useStudio(
  project: Project,
  activate: (project: Project) => void,
) {
  const [client] = useState(() => {
    try {
      return new StudioClient(localStorage);
    } catch {
      return new StudioClient();
    }
  });
  const [ready, setReady] = useState(false),
    [online, setOnline] = useState(false);
  const [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(true);
  const [directory, setDirectory] = useState("");
  const [library, setLibrary] = useState<Project[]>([]);
  const [notice, setNotice] = useState("");
  const latest = useRef(project);
  latest.current = project;
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bootstrap = useRef<ReturnType<StudioClient["initialize"]> | undefined>(
    undefined,
  );
  useEffect(() => {
    let live = true;
    if (!bootstrap.current) {
      let cached: Project[] = [],
        active: string | null = null;
      try {
        cached = listProjects(localStorage);
        active = localStorage.getItem(ACTIVE);
      } catch {
        /* Use disk. */
      }
      bootstrap.current = client.initialize(cached, active);
    }
    bootstrap.current
      .then((result) => {
        if (!live) return;
        setLibrary(result.projects);
        setDirectory(result.directory);
        for (const p of result.projects) {
          try {
            persistProject(localStorage, p);
          } catch {
            /* Disk files are already safe. */
          }
        }
        const chosen =
          result.projects.find((p) => p.id === result.selectedId) ||
          result.projects[0];
        if (chosen) activate(chosen);
        setNotice(
          [
            result.recoveryCount
              ? `${result.recoveryCount} browser draft${result.recoveryCount > 1 ? "s were" : " was"} recovered as a separate project.`
              : "",
            ...result.warnings,
          ]
            .filter(Boolean)
            .join(" "),
        );
        setOnline(true);
      })
      .catch((e) => {
        if (!live) return;
        setError((e as Error).message);
        try {
          setLibrary(listProjects(localStorage));
        } catch {
          /* In-memory project still works. */
        }
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [activate, client]);
  const cache = useCallback((p: Project) => {
    try {
      persistProject(localStorage, p);
      return true;
    } catch {
      return false;
    }
  }, []);
  const saveNow = useCallback(
    async (p: Project) => {
      const cached = cache(p);
      if (latest.current.id === p.id) setBackupAvailable(cached);
      if (!online)
        throw new StudioError(
          cached
            ? "Browser backup only. Restart the local server and reopen Forma to save studio files."
            : "Could not save to disk or browser. Export a project backup now.",
        );
      try {
        return await client.save(p);
      } catch (e) {
        if (latest.current.id === p.id) {
          setSaved(false);
          setError((e as Error).message);
          setConflict(e instanceof StudioError && e.status === 409);
        }
        throw e;
      }
    },
    [cache, client, online],
  );
  useEffect(() => {
    if (!ready) return;
    const stamp = ++generation.current;
    setSaved(false);
    const cached = cache(project);
    setBackupAvailable(cached);
    if (!online) {
      setError(
        cached
          ? "Browser backup only · local server unavailable"
          : "Could not save · export a backup",
      );
      return;
    }
    timer.current = setTimeout(() => {
      saveNow(project)
        .then(() => {
          if (generation.current === stamp) {
            setSaved(true);
            setError("");
            setConflict(false);
          }
        })
        .catch(() => {});
    }, 450);
    return () => {
      clearTimeout(timer.current);
    };
  }, [project, ready, online, cache, saveNow]);
  useEffect(() => {
    const backup = () => {
      if (ready) cache(latest.current);
    };
    window.addEventListener("pagehide", backup);
    const hidden = () => {
      if (document.visibilityState === "hidden") backup();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", backup);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [ready, cache]);
  const refresh = useCallback(async () => {
    if (online) setLibrary(await client.list());
  }, [client, online]);
  const restore = async (versionId: string) => {
    clearTimeout(timer.current);
    generation.current++;
    await saveNow(latest.current);
    const restored = await client.restore(latest.current.id, versionId);
    activate(restored.project);
    setSaved(true);
    setError("");
    setConflict(false);
    await refresh();
  };
  return {
    client,
    ready,
    online,
    saved,
    error,
    conflict,
    backupAvailable,
    directory,
    library,
    notice,
    saveNow,
    refresh,
    restore,
  };
}
