import type { Brief } from "../shared/model";
import { siteEnvelope } from "../shared/site";

export default function SiteSetbacks({
  brief,
  units,
  onChange,
}: {
  brief: Brief;
  units: "m" | "ft";
  onChange: (value: Brief["sideSetbacks"]) => void;
}) {
  const envelope = siteEnvelope(brief),
    factor = units === "ft" ? 1 / 0.3048 : 1;
  const plotW = Math.max(1, brief.width),
    plotD = Math.max(1, brief.depth),
    scale = Math.min(210 / plotW, 140 / plotD),
    x = 150 - (plotW * scale) / 2,
    y = 105 - (plotD * scale) / 2;
  const show = (n: number) => Number((n * factor).toFixed(2));
  return (
    <section className="site-setbacks">
      <label className="check-row">
        <input
          aria-label="Different setbacks on each side"
          type="checkbox"
          checked={!!brief.sideSetbacks}
          onChange={(e) =>
            onChange(e.target.checked ? { ...envelope.setbacks } : null)
          }
        />
        <span>Use different setbacks on each side</span>
      </label>
      {brief.sideSetbacks && (
        <div className="form-grid">
          {(["north", "east", "south", "west"] as const).map((side) => (
            <label key={side}>
              {side[0].toUpperCase() + side.slice(1)} setback ({units})
              <input
                type="number"
                aria-label={`${side} setback`}
                min="0"
                max={10 * factor}
                step="any"
                value={show(envelope.setbacks[side])}
                onChange={(e) =>
                  onChange({
                    ...envelope.setbacks,
                    [side]: +e.target.value / factor,
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      <svg
        className="site-setback-preview"
        viewBox="0 0 300 220"
        role="img"
        aria-label="Plot and buildable footprint with north, east, south and west setbacks"
      >
        <rect
          x={x}
          y={y}
          width={plotW * scale}
          height={plotD * scale}
          fill="#eee9da"
          stroke="#a9ad99"
          strokeDasharray="3 2"
        />
        {envelope.width > 0 && envelope.depth > 0 && (
          <rect
            x={x + envelope.x * scale}
            y={y + envelope.y * scale}
            width={envelope.width * scale}
            height={envelope.depth * scale}
            fill="#d7e7cf"
            stroke="#4c7357"
          />
        )}
        <text x="150" y="18" textAnchor="middle">
          N · {show(envelope.setbacks.north)} {units}
        </text>
        <text x="150" y="207" textAnchor="middle">
          S · {show(envelope.setbacks.south)} {units}
        </text>
        <text x="8" y="105" textAnchor="start" transform="rotate(-90 8 105)">
          W · {show(envelope.setbacks.west)} {units}
        </text>
        <text x="292" y="105" textAnchor="end" transform="rotate(90 292 105)">
          E · {show(envelope.setbacks.east)} {units}
        </text>
      </svg>
      <p className="muted">
        Dashed outline: plot. Green: buildable footprint shown in the editor.
        North stays at the top; changing the entrance does not rotate the site
        clearances. Setbacks are measured from the plot boundary.
      </p>
      {(envelope.width <= 0 || envelope.depth <= 0) && (
        <p className="error-text">
          The setbacks leave no buildable footprint. Reduce them or correct the
          plot dimensions.
        </p>
      )}
    </section>
  );
}
