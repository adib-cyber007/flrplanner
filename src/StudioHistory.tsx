import { useEffect, useState } from "react";
import { History, Save, RotateCcw } from "lucide-react";
import type { Project } from "../shared/model";
import type { StudioClient, VersionInfo } from "./studio";

export default function StudioHistory({
  project,
  client,
  save,
  restore,
  notify,
}: {
  project: Project;
  client: StudioClient;
  save: () => Promise<unknown>;
  restore: (versionId: string) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    const result = await client.versions(project.id);
    setVersions(result.versions);
    setError(result.warnings.join(" "));
  };
  useEffect(() => {
    let live = true;
    client
      .versions(project.id)
      .then((result) => {
        if (live) {
          setVersions(result.versions);
          setError(result.warnings.join(" "));
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [client, project.id]);
  async function checkpoint() {
    setBusy(true);
    setError("");
    try {
      await save();
      await client.checkpoint(project, label || "Design milestone");
      await refresh();
      setLabel("");
      notify("A recovery version was saved on this computer.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recover(version: VersionInfo) {
    setBusy(true);
    setError("");
    try {
      await restore(version.versionId);
      await refresh();
      notify(
        "Version restored. Your previous design is also in version history.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-history" aria-label="Project version history">
      <div className="history-heading">
        <History size={18} />
        <div>
          <h3>Version history</h3>
          <p className="muted">
            {project.name || "Untitled home"} · Recovery versions stay on this
            computer.
          </p>
        </div>
      </div>
      <div className="checkpoint-form">
        <input
          aria-label="Version name"
          placeholder="Name a milestone, e.g. Client review 01"
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
        <button className="outline" onClick={checkpoint} disabled={busy}>
          <Save size={15} />
          {busy ? "Working…" : "Save version"}
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="version-list">
        {versions.length ? (
          versions.map((version) => (
            <div className="version-row" key={version.versionId}>
              <div>
                <strong>{version.label}</strong>
                <span>
                  {new Date(version.savedAt).toLocaleString()} · Revision{" "}
                  {version.revision}
                </span>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => recover(version)}
                aria-label={`Restore ${version.label}`}
              >
                <RotateCcw size={14} />
                Restore
              </button>
            </div>
          ))
        ) : (
          <p className="muted">
            Save a milestone now. Automatic recovery versions are also created
            while you edit, at most once per minute.
          </p>
        )}
      </div>
    </section>
  );
}
