import { useEffect, useRef, useState } from "react";
import type { ReferenceImage } from "../shared/model";
import { calibrateReference, type ImagePoint } from "../shared/reference";
export default function ReferenceCalibration({
  reference,
  units,
  onApply,
  onClose,
}: {
  reference: ReferenceImage;
  units: "m" | "ft";
  onApply: (reference: ReferenceImage) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [original] = useState(reference);
  const [points, setPoints] = useState<ImagePoint[]>([]),
    [distance, setDistance] = useState(""),
    [error, setError] = useState("");
  const height = (1000 * original.h) / original.w;
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="reference-calibration"
      aria-labelledby="reference-calibration-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="calibration-heading">
        <h3 id="reference-calibration-title">
          Set scale from a known distance
        </h3>
        <button
          className="text-button"
          autoFocus
          onClick={onClose}
          aria-label="Close reference calibration"
        >
          Close
        </button>
      </div>
      <p>
        Click two ends of a measured wall or dimension on the image below. Enter
        the real distance between them. The first point stays in place, and the
        image keeps its proportions and rotation.
      </p>
      <p role="status">
        {points.length === 0
          ? "Choose the first point."
          : points.length === 1
            ? "Choose the second point."
            : "Two points selected. Enter their real distance, then apply."}
      </p>
      <svg
        className="calibration-image"
        aria-label="Reference image calibration points"
        viewBox={`0 0 1000 ${height}`}
        onPointerDown={(e) => {
          if (e.button !== 0 || points.length >= 2) return;
          const matrix = e.currentTarget.getScreenCTM();
          if (!matrix) return;
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
              matrix.inverse(),
            ),
            point = { x: p.x / 1000, y: p.y / height };
          if (point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1) return;
          setPoints([...points, point]);
          setError("");
        }}
      >
        <image href={original.dataUrl} width="1000" height={height} />
        {points.length === 2 && (
          <line
            x1={points[0].x * 1000}
            y1={points[0].y * height}
            x2={points[1].x * 1000}
            y2={points[1].y * height}
            stroke="#cf571d"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((p, i) => (
          <g key={i} pointerEvents="none">
            <circle
              cx={p.x * 1000}
              cy={p.y * height}
              r={Math.min(1000, height) * 0.012}
              fill="#fff"
              stroke="#cf571d"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={p.x * 1000 + 18}
              y={p.y * height - 18}
              fontSize={Math.min(1000, height) * 0.035}
              fill="#b23e0b"
              stroke="white"
              strokeWidth="1"
              paintOrder="stroke"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <details>
        <summary>Enter points with the keyboard</summary>
        <p>
          Positions are percentages of the image, measured from its top-left
          corner.
        </p>
        <div className="calibration-coordinates">
          {[0, 1].map((i) => (
            <fieldset key={i}>
              <legend>Point {i + 1}</legend>
              {(["x", "y"] as const).map((axis) => (
                <label key={axis}>
                  {axis.toUpperCase()} (%)
                  <input
                    aria-label={`Calibration point ${i + 1} ${axis.toUpperCase()}`}
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={
                      points[i]
                        ? Number((points[i][axis] * 100).toFixed(3))
                        : ""
                    }
                    onChange={(e) => {
                      const next = [...points];
                      while (next.length <= i) next.push({ x: 0, y: 0 });
                      next[i] = {
                        ...next[i],
                        [axis]: Number(e.target.value) / 100,
                      };
                      setPoints(next);
                    }}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>
      <label className="calibration-distance">
        Known distance ({units})
        <input
          aria-label="Calibration known distance"
          type="number"
          min="0.001"
          step="any"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="Distance between points 1 and 2"
        />
      </label>
      <p className="fine-print">
        Use a verified measurement. This sets image scale only; it does not
        recognize walls or change the drawn floor plan.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="calibration-actions">
        <button
          className="outline"
          onClick={() => {
            setPoints([]);
            setError("");
          }}
        >
          Choose points again
        </button>
        <button
          className="primary"
          disabled={points.length !== 2 || !distance}
          onClick={() => {
            try {
              if (reference !== original)
                throw Error(
                  "The reference changed while calibration was open. Close and restart calibration.",
                );
              onApply(
                calibrateReference(
                  original,
                  points[0],
                  points[1],
                  Number(distance) * (units === "ft" ? 0.3048 : 1),
                ),
              );
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply scale
        </button>
      </div>
    </dialog>
  );
}
