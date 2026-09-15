import { useState } from "react";
import {
  FloorSchema,
  openingDimensions,
  type Floor,
  type Item,
} from "../shared/model";
import { ceilingHeight } from "../shared/heights";

export default function OpeningControls({
  item,
  floor,
  units,
  onApply,
}: {
  item: Item;
  floor: Floor;
  units: "m" | "ft";
  onApply: (value: NonNullable<Item["opening"]>) => void;
}) {
  const dimensions = openingDimensions(item)!;
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  const [height, setHeight] = useState(
    String(Number((dimensions.height * factor).toFixed(6))),
  );
  const [sill, setSill] = useState(
    String(Number((dimensions.sill * factor).toFixed(6))),
  );
  const [error, setError] = useState("");
  return (
    <form
      className="opening-controls"
      onSubmit={(e) => {
        e.preventDefault();
        if (item.locked) return;
        const opening = {
          height: Number(height) / factor,
          sill: item.type === "window" ? Number(sill) / factor : 0,
        };
        const checked = FloorSchema.safeParse({
          ...floor,
          items: floor.items.map((i) =>
            i.id === item.id ? { ...i, opening } : i,
          ),
        });
        if (!checked.success) {
          setError(checked.error.issues[0].message);
          return;
        }
        setError("");
        onApply(opening);
      }}
    >
      <h4>Opening elevation</h4>
      <p className="muted">
        Vertical measurements from this floor's surface. Wall / ceiling height:{" "}
        {(ceilingHeight(floor) * factor).toFixed(3)} {units}.
      </p>
      <div className="form-grid">
        <label>
          Opening height ({units})
          <input
            aria-label="Opening height"
            type="number"
            required
            step="any"
            min={0.1 * factor}
            max={6 * factor}
            disabled={item.locked}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        {item.type === "window" && (
          <label>
            Sill height ({units})
            <input
              aria-label="Window sill height"
              type="number"
              required
              step="any"
              min="0"
              max={5.9 * factor}
              disabled={item.locked}
              value={sill}
              onChange={(e) => setSill(e.target.value)}
            />
          </label>
        )}
      </div>
      <p className="muted">
        {item.type === "window"
          ? "The opening top is sill height + opening height."
          : `Doors and open passages start at floor level. The walkthrough needs ${Number((1.8 * factor).toFixed(2))} ${units} of standing clearance.`}{" "}
        Plan depth is separate from vertical height.
      </p>
      {item.locked && (
        <p className="muted">Unlock movement to edit these dimensions.</p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button
        className="outline full-width"
        type="submit"
        disabled={item.locked}
      >
        Apply opening dimensions
      </button>
    </form>
  );
}
