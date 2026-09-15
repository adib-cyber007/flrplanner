import { useEffect, useState } from "react";
import RequirementsIntake from "./RequirementsIntake";
import RoomSizeInputs from "./RoomSizeInputs";
import SiteSetbacks from "./SiteSetbacks";
import FloorProgramInputs from "./FloorProgramInputs";
import FloorHeightInputs from "./FloorHeightInputs";
import OpeningSizeInputs from "./OpeningSizeInputs";
import RelationshipInputs from "./RelationshipInputs";
import { defaultFloorProgram } from "../shared/program";
import { siteEnvelope } from "../shared/site";
import { circulationDescription } from "../shared/circulation";
import { approveRequirements } from "../shared/requirements";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  House,
  LayoutGrid,
  Heart,
  SlidersHorizontal,
  Sparkles,
  Plus,
  Minus,
} from "lucide-react";
import { BriefSchema, type Brief } from "../shared/model";
export default function BriefWizard({
  initial,
  initialStep = 0,
  generationBlocker,
  onGenerate,
  units,
  onUnitsChange,
  onSaveDraft,
}: {
  initial: Brief;
  initialStep?: 0 | 4;
  generationBlocker?: string;
  onGenerate: (b: Brief) => void;
  units: "m" | "ft";
  onUnitsChange: (units: "m" | "ft") => void;
  onSaveDraft: (brief: Brief) => void;
}) {
  const [brief, setBrief] = useState<Brief>(structuredClone(initial));
  const [step, setStep] = useState<number>(initialStep);
  const [error, setError] = useState("");
  useEffect(() => {
    if (BriefSchema.safeParse(brief).success) onSaveDraft(brief);
  }, [brief, onSaveDraft]);
  const factor = units === "ft" ? 1 / 0.3048 : 1;
  const envelope = siteEnvelope(brief);
  const display = (meters: number) => Number((meters * factor).toFixed(2));
  const update = <K extends keyof Brief>(key: K, value: Brief[K]) =>
    setBrief((b) => ({
      ...b,
      [key]: value,
      ...(key === "floors" && b.floorHeights
        ? {
            floorHeights: b.floorHeights.filter((r) => r.floor < Number(value)),
          }
        : {}),
      ...(key === "floors" && b.floorPrograms
        ? {
            floorPrograms: Array.from(
              { length: Number(value) },
              (_, index) =>
                b.floorPrograms!.find((p) => p.floor === index) ||
                defaultFloorProgram(b, index),
            ),
          }
        : {}),
      ...(key !== "requirements" && b.requirements
        ? {
            requirements: {
              ...b.requirements,
              reviewKey: undefined,
              reviewedAt: undefined,
              coreConfirmed: false,
              assumptionsAccepted: false,
            },
          }
        : {}),
    }));
  const toggle = (key: "extras" | "priorities", value: string) =>
    update(
      key,
      brief[key].includes(value)
        ? brief[key].filter((x) => x !== value)
        : [...brief[key], value],
    );
  const steps = [
    { title: "Your space", icon: House },
    { title: "Your rooms", icon: LayoutGrid },
    { title: "Your lifestyle", icon: Heart },
    { title: "The details", icon: SlidersHorizontal },
    { title: "Constraints", icon: LayoutGrid },
    { title: "Review", icon: Check },
  ];
  return (
    <div className="brief-wizard">
      <div className="wizard-intro">
        <span className="eyebrow-icon">
          <Sparkles size={18} />
        </span>
        <div>
          <h2>Requirements before design.</h2>
          <p>Tell us what matters. Review the constraints before AI builds.</p>
        </div>
      </div>
      <div className="wizard-steps">
        {steps.map((s, i) => (
          <button
            key={s.title}
            onClick={() => setStep(i)}
            className={i === step ? "current" : i < step ? "complete" : ""}
          >
            <span>{i < step ? <Check size={14} /> : <s.icon size={15} />}</span>
            {s.title}
          </button>
        ))}
      </div>
      <div className="wizard-body">
        {step === 4 && (
          <RequirementsIntake
            brief={brief}
            units={units}
            onChange={(r) => update("requirements", r)}
          />
        )}
        {step === 5 && (
          <RequirementsIntake
            brief={brief}
            units={units}
            review
            onChange={(r) => update("requirements", r)}
          />
        )}
        {step === 0 && (
          <>
            <h3>Let’s get to know your space.</h3>
            <p className="muted">
              A rough estimate is a good place to start. Choose the measurements
              you use every day.
            </p>
            <div
              className="brief-unit-choice"
              role="group"
              aria-label="Brief measurement units"
            >
              <button
                className={units === "m" ? "selected" : ""}
                onClick={() => onUnitsChange("m")}
              >
                Meters
              </button>
              <button
                className={units === "ft" ? "selected" : ""}
                onClick={() => onUnitsChange("ft")}
              >
                Feet
              </button>
            </div>
            <div className="form-grid">
              <label>
                Plot width ({units})
                <input
                  aria-label="Plot width"
                  type="number"
                  min={display(5)}
                  max={display(60)}
                  step=".1"
                  value={display(brief.width)}
                  onChange={(e) => update("width", +e.target.value / factor)}
                />
              </label>
              <label>
                Plot depth ({units})
                <input
                  aria-label="Plot depth"
                  type="number"
                  min={display(5)}
                  max={display(60)}
                  step=".1"
                  value={display(brief.depth)}
                  onChange={(e) => update("depth", +e.target.value / factor)}
                />
              </label>
              <label>
                Setback on each side ({units})
                <input
                  aria-label="Setback on each side"
                  type="number"
                  min="0"
                  max={display(10)}
                  step=".1"
                  value={display(brief.setback)}
                  disabled={!!brief.sideSetbacks}
                  onChange={(e) => update("setback", +e.target.value / factor)}
                />
                <small>
                  {brief.sideSetbacks
                    ? "Individual side values below take precedence."
                    : "Space kept clear around your building."}
                </small>
              </label>
              <label>
                Number of floors
                <select
                  aria-label="Number of floors"
                  value={brief.floors}
                  onChange={(e) => update("floors", +e.target.value)}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                City / region
                <input
                  value={brief.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="e.g. Bengaluru, India"
                />
              </label>
              <label>
                Preferred entrance
                <select
                  value={brief.orientation}
                  onChange={(e) =>
                    update(
                      "orientation",
                      e.target.value as Brief["orientation"],
                    )
                  }
                >
                  {["North", "East", "South", "West"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="area-note">
              <House size={20} />
              <div>
                <strong>
                  {(
                    Math.max(0, envelope.width) *
                    Math.max(0, envelope.depth) *
                    factor *
                    factor
                  ).toFixed(1)}{" "}
                  {units}²
                </strong>{" "}
                buildable footprint{" "}
                <small>
                  Before wall thickness and circulation. Verify setbacks
                  locally.
                </small>
              </div>
            </div>
            <SiteSetbacks
              brief={brief}
              units={units}
              onChange={(value) => update("sideSetbacks", value)}
            />
          </>
        )}
        {step === 1 && (
          <>
            <h3>Make room for your everyday.</h3>
            <p className="muted">
              Use the same room counts throughout, or give each floor its own
              requirements.
            </p>
            <FloorProgramInputs
              brief={brief}
              onChange={(value) => update("floorPrograms", value)}
            />
            {brief.floorPrograms && (
              <label>
                Total occupants
                <input
                  aria-label="Total occupants"
                  type="number"
                  min="1"
                  max="20"
                  value={brief.occupants}
                  onChange={(e) => update("occupants", +e.target.value)}
                />
              </label>
            )}
            {!brief.floorPrograms && (
              <>
                <div className="counters">
                  {(["bedrooms", "bathrooms", "occupants"] as const).map(
                    (key) => (
                      <div className="counter" key={key}>
                        <span>{key[0].toUpperCase() + key.slice(1)}</span>
                        <div>
                          <button
                            aria-label={`Fewer ${key}`}
                            onClick={() =>
                              update(
                                key,
                                Math.max(
                                  key === "bedrooms" ? 0 : 1,
                                  brief[key] - 1,
                                ),
                              )
                            }
                          >
                            <Minus size={15} />
                          </button>
                          <strong>{brief[key]}</strong>
                          <button
                            aria-label={`More ${key}`}
                            onClick={() =>
                              update(
                                key,
                                Math.min(
                                  key === "bedrooms"
                                    ? 8
                                    : key === "bathrooms"
                                      ? 5
                                      : 20,
                                  brief[key] + 1,
                                ),
                              )
                            }
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
                <label className="block-label">
                  Anything else on your wish list?
                </label>
                <div className="choice-grid">
                  {[
                    "Dining room",
                    "Office",
                    "Utility",
                    "Balcony",
                    "Garage",
                    "Prayer room",
                  ].map((x) => (
                    <button
                      key={x}
                      className={
                        brief.extras.includes(x) ? "choice selected" : "choice"
                      }
                      onClick={() => toggle("extras", x)}
                    >
                      {x}
                      {brief.extras.includes(x) ? (
                        <Check size={15} />
                      ) : (
                        <Plus size={15} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={brief.openPlan}
                onChange={(e) => update("openPlan", e.target.checked)}
              />
              <span>
                <strong>I’d like open-plan living</strong>
                <small>Living and kitchen spaces that feel connected.</small>
              </span>
            </label>
            <RoomSizeInputs
              brief={brief}
              units={units}
              onChange={(rules) => update("roomSizeRules", rules)}
            />
            <RelationshipInputs
              brief={brief}
              units={units}
              onChange={(rules) => update("roomRelationships", rules)}
            />
          </>
        )}
        {step === 2 && (
          <>
            <h3>How do you want to feel at home?</h3>
            <p className="muted">
              Choose a direction. There’s no wrong answer.
            </p>
            <label className="block-label">Your design style</label>
            <div className="style-grid">
              {(
                [
                  "Japandi",
                  "Contemporary",
                  "Minimal",
                  "Traditional",
                  "Industrial",
                  "Coastal",
                ] as const
              ).map((x, i) => (
                <button
                  key={x}
                  className={`style-choice ${brief.style === x ? "selected" : ""}`}
                  onClick={() => update("style", x)}
                >
                  <span className={`swatch-set swatch-${i}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                  {x}
                  {brief.style === x && <Check size={13} />}
                </button>
              ))}
            </div>
            <label className="block-label">What matters most?</label>
            <div className="chips">
              {[
                "Natural light",
                "Open living",
                "Privacy",
                "More storage",
                "Work from home",
                "Entertaining",
                "Pet friendly",
                "Vastu preferences",
                "Easy maintenance",
              ].map((x) => (
                <button
                  key={x}
                  className={brief.priorities.includes(x) ? "active" : ""}
                  onClick={() => toggle("priorities", x)}
                >
                  {brief.priorities.includes(x) && <Check size={12} />} {x}
                </button>
              ))}
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={brief.accessibility}
                onChange={(e) => update("accessibility", e.target.checked)}
              />
              <span>
                <strong>Plan for easier mobility</strong>
                <small>
                  Request a wider hallway and doors. Detailed accessibility
                  review is still needed.
                </small>
              </span>
            </label>
            <section className="circulation-inputs">
              <h4>Required circulation widths</h4>
              <p className="muted">
                Enter minimums from your brief or access specialist.
                Measurements describe hallway footprints and door leaves; wall
                finishes, clear opening widths, turning space and step-free
                routes need separate review.
              </p>
              <div className="room-size-fields">
                {(["minHallwayWidth", "minDoorWidth"] as const).map((key) => {
                  const factor = units === "ft" ? 1 / 0.3048 : 1;
                  return (
                    <label key={key}>
                      {key === "minHallwayWidth"
                        ? "Min. hallway width"
                        : "Min. door leaf width"}{" "}
                      ({units})
                      <input
                        aria-label={
                          key === "minHallwayWidth"
                            ? "Minimum hallway width"
                            : "Minimum door width"
                        }
                        type="number"
                        step="any"
                        min={(key === "minHallwayWidth" ? 0.6 : 0.5) * factor}
                        max={(key === "minHallwayWidth" ? 5 : 3) * factor}
                        value={
                          brief.circulation?.[key] === undefined
                            ? ""
                            : Number(
                                (brief.circulation[key]! * factor).toFixed(3),
                              )
                        }
                        placeholder="Automatic"
                        onChange={(e) => {
                          const next = { ...brief.circulation };
                          if (e.target.value === "") delete next[key];
                          else next[key] = Number(e.target.value) / factor;
                          update(
                            "circulation",
                            Object.keys(next).length ? next : undefined,
                          );
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="info-box">
                Generation targets: {circulationDescription(brief, units)}.
                Existing mobility defaults remain a lower bound. An entrance
                wider than the requested hallway also widens the generated
                hallway.
              </p>
            </section>
          </>
        )}
        {step === 3 && (
          <>
            <FloorHeightInputs
              brief={brief}
              units={units}
              onChange={(value) => update("floorHeights", value)}
            />
            <OpeningSizeInputs
              brief={brief}
              units={units}
              onChange={(value) => update("openingSizes", value)}
            />
            <h3>The little details make it yours.</h3>
            <p className="muted">
              Tell us in your own words, in any language. Your notes are saved
              with the project.
            </p>
            <label>
              Budget and currency <span className="optional">Optional</span>
              <input
                value={brief.budget}
                onChange={(e) => update("budget", e.target.value)}
                placeholder="e.g. ₹60 lakh total, or $150,000 for renovation"
              />
            </label>
            <label className="notes-label">
              Everything else we should know
              <textarea
                rows={6}
                maxLength={12000}
                value={brief.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Who lives here? Any pets? A kitchen next to the dining room? A quiet room for parents? Existing columns, plumbing, doors, slopes or views to preserve? Tell us what is a must-have and where you’re flexible."
              />
            </label>
            <div className="info-box">
              The built-in planner uses dimensions and room counts. An AI
              connection helps interpret your notes; preferences such as
              sunlight, Vastu, adjacencies and budget remain visible for review.
            </div>
          </>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {generationBlocker && (
        <p className="error-text" role="alert">
          {generationBlocker}
        </p>
      )}
      <div className="wizard-footer">
        <button
          className="text-button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <span>{step + 1} of 6 · Draft saved automatically</span>
        <button
          className="primary"
          disabled={step === 5 && !!generationBlocker}
          onClick={() => {
            setError("");
            if (step < 5) {
              setStep(step + 1);
              return;
            }
            const p = BriefSchema.safeParse(brief);
            if (!p.success) {
              setError(
                "Check your dimensions, room counts and room-size limits. " +
                  p.error.issues
                    .slice(0, 2)
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; "),
              );
              return;
            }
            try {
              onGenerate(approveRequirements(brief));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {step === 5 ? (
            <>
              <Sparkles size={16} />
              Build reviewed concept
            </>
          ) : (
            <>
              Continue
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
