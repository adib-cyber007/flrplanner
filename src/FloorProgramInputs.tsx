import { roomTypes, type Brief } from "../shared/model";
import { defaultFloorProgram, floorProgram } from "../shared/program";

export default function FloorProgramInputs({
  brief,
  onChange,
}: {
  brief: Brief;
  onChange: (value: Brief["floorPrograms"]) => void;
}) {
  return (
    <section className="floor-program-inputs">
      <label className="check-row">
        <input
          type="checkbox"
          aria-label="Different rooms on each floor"
          checked={!!brief.floorPrograms}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? Array.from({ length: brief.floors }, (_, index) =>
                    defaultFloorProgram(brief, index),
                  )
                : null,
            )
          }
        />
        <span>Specify different rooms on each floor</span>
      </label>
      {brief.floorPrograms && (
        <>
          <p className="muted">
            Choose every room needed on each level. Set a count to zero to omit
            that room. The connecting hallway is added automatically. Stair
            positions still need coordination between floors.
          </p>
          {Array.from({ length: brief.floors }, (_, index) => {
            const program = floorProgram(brief, index);
            return (
              <details className="floor-program-level" key={index} open>
                <summary>
                  {index === 0 ? "Ground floor" : `Floor ${index + 1}`} ·{" "}
                  {program.rooms.reduce((sum, r) => sum + r.count, 0)} requested
                  rooms
                </summary>
                <div className="floor-room-counts">
                  {roomTypes
                    .filter((t) => t !== "Hallway")
                    .map((type) => (
                      <label key={type}>
                        {type}
                        <input
                          aria-label={`Floor ${index + 1} ${type} count`}
                          type="number"
                          min="0"
                          max="8"
                          step="1"
                          value={
                            program.rooms.find((r) => r.type === type)?.count ||
                            0
                          }
                          onChange={(e) => {
                            const count = Number(e.target.value),
                              rooms = [
                                ...program.rooms.filter((r) => r.type !== type),
                                ...(count > 0
                                  ? [
                                      {
                                        type: type as (typeof program.rooms)[number]["type"],
                                        count,
                                      },
                                    ]
                                  : []),
                              ];
                            onChange([
                              ...(brief.floorPrograms || []).filter(
                                (p) => p.floor !== index,
                              ),
                              { floor: index, rooms },
                            ]);
                          }}
                        />
                      </label>
                    ))}
                </div>
              </details>
            );
          })}
        </>
      )}
    </section>
  );
}
