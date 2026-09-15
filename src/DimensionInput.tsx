import { useState } from "react";

/** Keep unfinished text local; only complete dimensions enter project history. */
export default function DimensionInput({
  label,
  value,
  min,
  max,
  step = 0.1,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const formatted = Number(value.toFixed(3)).toString();
  const parse = () =>
    draft === null ? value : draft.trim() === "" ? NaN : Number(draft);
  const valid = (n: number) =>
    Number.isFinite(n) && n >= min - 1e-8 && n <= max + 1e-8;
  const commit = () => {
    if (draft === null) return;
    const n = parse();
    if (valid(n)) {
      if (Math.abs(n - value) > 1e-8) onCommit(Math.min(max, Math.max(min, n)));
      setError("");
    } else {
      setError(
        `Enter a value from ${Number(min.toFixed(3))} to ${Number(max.toFixed(3))}. Previous value restored.`,
      );
    }
    setDraft(null);
  };
  const adjust = (direction: number) => {
    const n = parse();
    const next = Math.min(
      max,
      Math.max(
        min,
        Number(((valid(n) ? n : value) + direction * step).toFixed(6)),
      ),
    );
    setDraft(null);
    setError("");
    if (Math.abs(next - value) > 1e-8) onCommit(next);
  };
  return (
    <span className="dimension-control">
      <span className="dimension-input">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => adjust(-1)}
        >
          −
        </button>
        <input
          id={label.toLowerCase().replaceAll(" ", "-")}
          aria-label={label}
          type="number"
          step="any"
          min={min}
          max={max}
          disabled={disabled}
          value={draft ?? formatted}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (["Enter", "Escape", "ArrowUp", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(null);
                setError("");
              }
              if (e.key === "ArrowUp") adjust(1);
              if (e.key === "ArrowDown") adjust(-1);
            }
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => adjust(1)}
        >
          +
        </button>
      </span>
      {error && (
        <span className="dimension-error" role="status">
          {error}
        </span>
      )}
    </span>
  );
}
