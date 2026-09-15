import { useState } from "react";
import type { Wall } from "../shared/model";
import { wallEndpoints } from "../shared/wallEditing";
export default function WallGeometryControls({
  wall,
  units,
  onApply,
}: {
  wall: Wall;
  units: "m" | "ft";
  onApply: (
    patch: ReturnType<typeof wallEndpoints>,
    anchor: "start" | "end",
  ) => void;
}) {
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  const [length, setLength] = useState(
    String(
      Number(
        (Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) * factor).toFixed(6),
      ),
    ),
  );
  const [angle, setAngle] = useState(
    String(
      Number(
        (
          (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) /
          Math.PI
        ).toFixed(6),
      ),
    ),
  );
  const [anchor, setAnchor] = useState<"start" | "end">("start");
  const [error, setError] = useState("");
  return (
    <form
      className="wall-geometry-controls"
      onSubmit={(e) => {
        e.preventDefault();
        if (wall.geometryLocked) return;
        try {
          onApply(
            wallEndpoints(wall, Number(length) / factor, Number(angle), anchor),
            anchor,
          );
          setError("");
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h4>Length and direction</h4>
      <div className="form-grid">
        <label>
          Length ({units})
          <input
            aria-label="Wall length"
            type="number"
            step="any"
            min={0.2 * factor}
            required
            disabled={!!wall.geometryLocked}
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </label>
        <label>
          Angle (degrees)
          <input
            aria-label="Wall angle"
            type="number"
            step="any"
            min="-360"
            max="360"
            required
            disabled={!!wall.geometryLocked}
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
          />
        </label>
      </div>
      <label>
        Keep fixed
        <select
          aria-label="Fixed wall endpoint"
          disabled={!!wall.geometryLocked}
          value={anchor}
          onChange={(e) => setAnchor(e.target.value as "start" | "end")}
        >
          <option value="start">Start endpoint</option>
          <option value="end">End endpoint</option>
        </select>
      </label>
      <p className="muted">
        0° points right/east; 90° points down/south. Attached openings keep
        their sizes and distance from the fixed endpoint. Drag the wall or its
        endpoint handles on the plan for quick edits.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button
        className="outline full-width"
        type="submit"
        disabled={!!wall.geometryLocked}
      >
        Apply wall geometry
      </button>
    </form>
  );
}
