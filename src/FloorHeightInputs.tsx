import type { Brief } from "../shared/model";
import { requestedHeight } from "../shared/heights";

export default function FloorHeightInputs({
  brief,
  units,
  onChange,
}: {
  brief: Brief;
  units: "m" | "ft";
  onChange: (value: Brief["floorHeights"]) => void;
}) {
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  return (
    <section className="floor-program-inputs">
      <h4>Ceiling heights by floor</h4>
      <p className="muted">
        One height per floor, measured from its floor surface to the ceiling.
        The 3D walls use this height. Slabs, floor-to-floor elevations, stair
        rise and suspended ceilings are separate design decisions.
      </p>
      <div className="form-grid">
        {Array.from({ length: brief.floors }, (_, index) => (
          <label key={index}>
            {index === 0 ? "Ground floor" : `Floor ${index + 1}`} ({units})
            <input
              type="number"
              step="any"
              min={2.2 * factor}
              max={6 * factor}
              aria-label={`Floor ${index + 1} ceiling height`}
              value={Number(
                (requestedHeight(brief, index) * factor).toFixed(3),
              )}
              onChange={(e) =>
                onChange([
                  ...(brief.floorHeights || []).filter(
                    (r) => r.floor !== index,
                  ),
                  {
                    floor: index,
                    ceilingHeight: Number(e.target.value) / factor,
                  },
                ])
              }
            />
          </label>
        ))}
      </div>
      <p className="muted">
        Unspecified floors use {Number((2.7 * factor).toFixed(2))} {units} for
        the concept. Supported heights: {Number((2.2 * factor).toFixed(2))}–
        {Number((6 * factor).toFixed(2))} {units}; these bounds are software
        limits, not a statement of code compliance.
      </p>
    </section>
  );
}
