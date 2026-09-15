import type { ReferenceImage } from "../shared/model";
import { useState } from "react";
import ReferenceCalibration from "./ReferenceCalibration";
export default function ReferenceControls({
  reference,
  units,
  onChange,
}: {
  reference: ReferenceImage;
  units: "m" | "ft";
  onChange: (value: ReferenceImage | undefined) => void;
}) {
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  const [calibrating, setCalibrating] = useState(false);
  const ratio = reference.h / reference.w;
  return (
    <section className="reference-controls">
      <strong>{reference.name}</strong>
      <p className="fine-print">
        Saved with this floor. Set the full image width to scale it, then
        position it using X/Y. Aspect ratio stays fixed. Rotation is around the
        image center.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={reference.visible}
          onChange={(e) =>
            onChange({ ...reference, visible: e.target.checked })
          }
        />
        Show reference image
      </label>
      <label>
        Full image width ({units})
        <input
          aria-label="Reference image width"
          type="number"
          step="any"
          min={Math.max(0.1, 0.1 / ratio) * factor}
          max={Math.min(120, 120 / ratio) * factor}
          value={Number((reference.w * factor).toFixed(3))}
          onChange={(e) => {
            const w = Number(e.target.value) / factor;
            if (w > 0) onChange({ ...reference, w, h: w * ratio });
          }}
        />
      </label>
      <button className="outline" onClick={() => setCalibrating(true)}>
        Calibrate from two points
      </button>
      {calibrating && (
        <ReferenceCalibration
          reference={reference}
          units={units}
          onApply={onChange}
          onClose={() => setCalibrating(false)}
        />
      )}
      <p className="fine-print">
        Image height: {Number((reference.h * factor).toFixed(3))} {units}
      </p>
      <div className="reference-position">
        {(["x", "y"] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()} ({units})
            <input
              aria-label={`Reference ${key.toUpperCase()}`}
              type="number"
              step="any"
              min={-100 * factor}
              max={100 * factor}
              value={Number((reference[key] * factor).toFixed(3))}
              onChange={(e) =>
                onChange({
                  ...reference,
                  [key]: Number(e.target.value) / factor,
                })
              }
            />
          </label>
        ))}
      </div>
      <label>
        Rotation (°)
        <input
          aria-label="Reference rotation"
          type="number"
          min={-360}
          max={360}
          value={reference.rotation}
          onChange={(e) =>
            onChange({ ...reference, rotation: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Opacity · {Math.round(reference.opacity * 100)}%
        <input
          aria-label="Reference opacity"
          type="range"
          min={0}
          max={100}
          value={Math.round(reference.opacity * 100)}
          onChange={(e) =>
            onChange({ ...reference, opacity: Number(e.target.value) / 100 })
          }
        />
      </label>
      <button
        aria-label="Remove reference image"
        className="text-button"
        onClick={() => onChange(undefined)}
      >
        Remove reference image
      </button>
    </section>
  );
}
