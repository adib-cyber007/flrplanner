import { roomTypes, type Brief, type RoomSizeRule } from "../shared/model";
import { floorProgram } from "../shared/program";

export default function RoomSizeInputs({
  brief,
  units,
  onChange,
}: {
  brief: Brief;
  units: "m" | "ft";
  onChange: (rules: RoomSizeRule[]) => void;
}) {
  const rules = brief.roomSizeRules || [];
  const active = new Set([
    ...Array.from({ length: brief.floors }, (_, index) =>
      floorProgram(brief, index).rooms.map((r) => r.type),
    ).flat(),
    ...rules.map((r) => r.roomType),
  ]);
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  const change = (
    roomType: RoomSizeRule["roomType"],
    key:
      "minWidth" | "minDepth" | "minArea" | "maxWidth" | "maxDepth" | "maxArea",
    value: string,
  ) => {
    const next = { ...rules.find((r) => r.roomType === roomType), roomType };
    if (value === "") delete next[key];
    else
      next[key] =
        Number(value) / (key.endsWith("Area") ? factor * factor : factor);
    onChange([
      ...rules.filter((r) => r.roomType !== roomType),
      ...(next.minWidth !== undefined ||
      next.minDepth !== undefined ||
      next.minArea !== undefined ||
      next.maxWidth !== undefined ||
      next.maxDepth !== undefined ||
      next.maxArea !== undefined
        ? [next]
        : []),
    ]);
  };
  return (
    <section className="room-size-inputs" aria-label="Required room sizes">
      <h4>Required room sizes</h4>
      <p className="muted">
        Optional minimums and maximums, applied wherever that room type is
        requested. Set the same minimum and maximum for an exact dimension.
        Width runs left to right; depth runs top to bottom on the plan. These
        are overall footprint dimensions including walls; the clear space inside
        is smaller. Leave a field blank to use the planner’s default.
      </p>
      {roomTypes
        .filter((t) => t !== "Hallway" && active.has(t))
        .map((type) => {
          const rule = rules.find((r) => r.roomType === type);
          return (
            <div className="room-size-row" key={type}>
              <strong>{type}</strong>
              <div className="room-size-fields">
                {(
                  [
                    "minWidth",
                    "minDepth",
                    "minArea",
                    "maxWidth",
                    "maxDepth",
                    "maxArea",
                  ] as const
                ).map((key) => {
                  const area = key.endsWith("Area"),
                    scale = area ? factor * factor : factor;
                  return (
                    <label key={key}>
                      {key.startsWith("min") ? "Min." : "Max."}{" "}
                      {key.endsWith("Width")
                        ? "width"
                        : key.endsWith("Depth")
                          ? "depth"
                          : "area"}{" "}
                      ({units}
                      {area ? "²" : ""})
                      <input
                        aria-label={`${type} ${key}`}
                        type="number"
                        step="any"
                        min={(area ? 0.25 : 0.5) * scale}
                        max={(area ? 3600 : 60) * scale}
                        placeholder={
                          key.startsWith("min") ? "Automatic" : "No limit"
                        }
                        value={
                          rule?.[key] === undefined
                            ? ""
                            : Number((rule[key]! * scale).toFixed(3))
                        }
                        onChange={(e) =>
                          change(
                            type as RoomSizeRule["roomType"],
                            key,
                            e.target.value,
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      <p className="info-box">
        These are required constraints. Generation and AI edits must satisfy
        them. Manual edits remain available, with violations listed in Design
        checks. Capped rooms may leave some of the footprint unallocated.
      </p>
    </section>
  );
}
