import { useState } from "react";
import type { Floor } from "../shared/model";
import { ceilingHeight } from "../shared/heights";

export default function FloorSettings({
  floor,
  units,
  onSave,
}: {
  floor: Floor;
  units: "m" | "ft";
  onSave: (value: { name: string; ceilingHeight: number }) => void;
}) {
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  const [name, setName] = useState(floor.name);
  const [height, setHeight] = useState(
    String(Number((ceilingHeight(floor) * factor).toFixed(6))),
  );
  const [error, setError] = useState("");
  return (
    <form
      className="settings-body"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave({ name, ceilingHeight: Number(height) / factor });
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label>
        Floor name
        <input
          aria-label="Floor name"
          value={name}
          maxLength={80}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Ceiling height ({units})
        <input
          aria-label="Floor ceiling height"
          type="number"
          step="any"
          min={2.2 * factor}
          max={6 * factor}
          required
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />
      </label>
      <p className="muted">
        Sets the full wall height throughout this floor. Cutaway view keeps
        shorter walls for visibility. Furniture sizes, door/window head heights
        and stair geometry are unchanged.
      </p>
      <p className="info-box">
        Changing height also updates this floor's requirement when it belongs to
        the generation brief, and requires a fresh requirements review.
        Floor-to-floor elevations, slab thickness and headroom are not
        calculated.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Apply floor settings
      </button>
    </form>
  );
}
