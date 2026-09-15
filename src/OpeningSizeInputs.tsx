import type { Brief } from "../shared/model";
export const openingSizeLabels = {
  doorHeight: "Door height",
  passageHeight: "Open passage height",
  windowHeight: "Window opening height",
  windowSill: "Window sill height",
} as const;
export default function OpeningSizeInputs({
  brief,
  units,
  onChange,
}: {
  brief: Brief;
  units: "m" | "ft";
  onChange: (value: Brief["openingSizes"]) => void;
}) {
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  return (
    <section className="floor-program-inputs">
      <h4>Required door and window dimensions</h4>
      <p className="muted">
        These vertical requirements apply to every opening of the corresponding
        type on every floor. Leave a field blank to use the concept defaults:
        doors/passages {Number((2.15 * factor).toFixed(2))} {units} high;
        windows {Number((1.3 * factor).toFixed(2))} {units} high with a{" "}
        {Number((0.85 * factor).toFixed(2))} {units} sill. Individual exceptions
        can be edited after generation, but will be flagged if they conflict
        with a requirement.
      </p>
      <div className="form-grid">
        {(
          Object.keys(openingSizeLabels) as (keyof typeof openingSizeLabels)[]
        ).map((key) => (
          <label key={key}>
            {openingSizeLabels[key]} ({units})
            <input
              aria-label={`Required ${openingSizeLabels[key].toLowerCase()}`}
              type="number"
              step="any"
              min={(key === "windowSill" ? 0 : 0.1) * factor}
              max={(key === "windowSill" ? 5.9 : 6) * factor}
              placeholder="Automatic"
              value={
                brief.openingSizes?.[key] === undefined
                  ? ""
                  : Number((brief.openingSizes[key]! * factor).toFixed(3))
              }
              onChange={(e) => {
                const next = { ...brief.openingSizes };
                if (e.target.value === "") delete next[key];
                else next[key] = Number(e.target.value) / factor;
                onChange(Object.keys(next).length ? next : undefined);
              }}
            />
          </label>
        ))}
      </div>
      <p className="muted">
        Window top = sill + opening height. Openings must fit below the ceiling.
        These are modeled dimensions, not verified clearances or construction
        specifications.
      </p>
    </section>
  );
}
