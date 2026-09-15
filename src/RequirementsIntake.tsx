import { useState } from "react";
import {
  Check,
  Plus,
  Trash2,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { uid, type Brief, type Requirements } from "../shared/model";
import { roomSizeDescription } from "../shared/roomSizes";
import { siteEnvelope, setbackDescription } from "../shared/site";
import { programSummary } from "../shared/program";
import { relationshipDescription } from "../shared/relationships";
import { circulationDescription } from "../shared/circulation";
import { requestedHeight } from "../shared/heights";
import { openingSizeLabels } from "./OpeningSizeInputs";
import {
  displayLength,
  formatLength,
  lengthFactor,
  type DisplayUnits,
} from "../shared/units";
import {
  confirmRuleLink,
  enforceableRules,
  linkedRequirement,
} from "../shared/requirementLinks";
import {
  emptyRequirements,
  intakeIssues,
  requirementTopics,
} from "../shared/requirements";

export default function RequirementsIntake({
  brief,
  onChange,
  review = false,
  units,
}: {
  brief: Brief;
  onChange: (requirements: Requirements) => void;
  review?: boolean;
  units: DisplayUnits;
}) {
  const r = brief.requirements || emptyRequirements();
  const [custom, setCustom] = useState("");
  const [priority, setPriority] = useState<"must" | "preference">("preference");
  const update = (next: Requirements) =>
    onChange({ ...next, reviewKey: undefined, reviewedAt: undefined });
  const answered = r.responses.filter(
    (a) => a.status !== "provided" || !!a.details.trim(),
  ).length;
  if (review)
    return (
      <div className="constraint-review">
        <h3>Review before AI builds</h3>
        <p className="muted">
          Confirm what is known and what remains a design assumption. Generation
          replaces the current layout; Undo keeps the previous design.
        </p>
        <div className="constraint-core">
          <strong>
            {displayLength(brief.width, units)} ×{" "}
            {displayLength(brief.depth, units)} {units} plot
          </strong>
          <span>Setbacks: {setbackDescription(brief, units)}</span>
          <span>
            Buildable footprint:{" "}
            {displayLength(siteEnvelope(brief).width, units)} ×{" "}
            {displayLength(siteEnvelope(brief).depth, units)} {units} ·{" "}
            {brief.floors} floor(s)
          </span>
          {Array.from({ length: brief.floors }, (_, index) => (
            <span key={index}>
              Floor {index + 1}: {programSummary(brief, index)} · Ceiling{" "}
              {formatLength(requestedHeight(brief, index), units, 3)}
              {!brief.floorHeights?.some((r) => r.floor === index)
                ? " (default assumption)"
                : ""}
            </span>
          ))}
          <span>
            Entrance {brief.orientation} · {brief.occupants} occupants
          </span>
          <span>
            Circulation targets: {circulationDescription(brief, units)}
          </span>
        </div>
        {brief.openingSizes && (
          <div className="constraint-core">
            <strong>Required opening dimensions · all floors</strong>
            {(
              Object.keys(
                openingSizeLabels,
              ) as (keyof typeof openingSizeLabels)[]
            )
              .filter((key) => brief.openingSizes?.[key] !== undefined)
              .map((key) => (
                <span key={key}>
                  {openingSizeLabels[key]}:{" "}
                  {displayLength(brief.openingSizes![key]!, units, 3)} {units}
                </span>
              ))}
          </div>
        )}
        {!!brief.roomSizeRules?.length && (
          <div className="constraint-core">
            <strong>Required size limits · every room of each type</strong>
            {brief.roomSizeRules.map((rule) => (
              <span key={rule.roomType}>
                {rule.roomType}: {roomSizeDescription(rule, units)}
              </span>
            ))}
          </div>
        )}
        {!!brief.roomRelationships?.length && (
          <div className="constraint-core">
            <strong>Required room relationships</strong>
            {brief.roomRelationships.map((r, i) => (
              <span key={i}>{relationshipDescription(r, units)}</span>
            ))}
          </div>
        )}
        <h4>
          Collected requirements · {answered}/{requirementTopics.length}{" "}
          sections
        </h4>
        {requirementTopics.map((topic) => {
          const a = r.responses.find((a) => a.key === topic.key);
          return (
            <details key={topic.key} className="review-topic">
              <summary>
                {topic.title}
                <span>
                  {!a
                    ? "Missing"
                    : a.status === "provided"
                      ? a.priority === "must"
                        ? "Non-negotiable"
                        : "Provided"
                      : a.status === "unknown"
                        ? "Unknown"
                        : "Not applicable"}
                </span>
              </summary>
              <p>
                {a?.details ||
                  (a?.status === "unknown"
                    ? "Not yet known. This stays unresolved in the concept design."
                    : "No additional details recorded.")}
              </p>
              {a?.priority === "must" && a.status === "provided" && (
                <RuleLink
                  key={a.details}
                  brief={brief}
                  source={`topic:${topic.key}`}
                  text={a.details}
                  onChange={update}
                  units={units}
                />
              )}
            </details>
          );
        })}
        {r.custom.map((c) => (
          <div key={c.id} className="info-box">
            <div>
              {c.priority === "must" ? "Non-negotiable" : "Preference"}:{" "}
              {c.text}
              {c.priority === "must" && (
                <RuleLink
                  brief={brief}
                  source={`custom:${c.id}`}
                  text={c.text}
                  onChange={update}
                  units={units}
                />
              )}
            </div>
          </div>
        ))}
        <div className="constraint-limit">
          <AlertTriangle size={17} />
          <div>
            <strong>What the generator can enforce</strong>
            <p>
              Rectangular plot size, setbacks on each side, room counts,
              entrance side, requested hallway and door leaf widths, structured
              room relationships, room-size limits, opening dimensions and floor
              ceiling heights. Written constraints remain attached to the design
              for review. Structure, services, irregular sites, detailed
              adjacencies, costs and regulatory compliance are not automatically
              verified. Non-negotiable written constraints block generation
              unless you explicitly link their full meaning to supported rules
              below. Linking records your interpretation; it does not verify
              arbitrary written requirements.
            </p>
          </div>
        </div>
        <label className="check-row">
          <input
            data-core-confirm
            type="checkbox"
            checked={r.coreConfirmed}
            onChange={(e) => update({ ...r, coreConfirmed: e.target.checked })}
          />
          <span>
            I have checked the dimensions, room-size limits, room counts per
            floor, ceiling heights, setbacks and entrance above.
          </span>
        </label>
        <label className="check-row">
          <input
            data-assumptions-confirm
            type="checkbox"
            checked={r.assumptionsAccepted}
            onChange={(e) =>
              update({ ...r, assumptionsAccepted: e.target.checked })
            }
          />
          <span>
            I reviewed unknowns and manual checks. Proceed only with a concept
            using these stated assumptions.
          </span>
        </label>
        {!!intakeIssues(brief, units).length && (
          <div className="intake-blockers" role="status">
            <strong>Before generation</strong>
            <ul>
              {intakeIssues(brief, units).map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  return (
    <div className="requirements-intake">
      <h3>Requirements & constraints</h3>
      <p className="muted">
        Describe each area in your own words, in any language. Choose “Not sure
        yet” when a detail is unknown; the agent must not silently invent it.
      </p>
      <div className="intake-progress">
        <ClipboardList size={17} />
        <strong>
          {answered} of {requirementTopics.length} sections answered
        </strong>
        <span>All sections need a response before generation.</span>
      </div>
      {requirementTopics.map((topic, i) => {
        const a = r.responses.find((a) => a.key === topic.key);
        const change = (patch: Partial<Requirements["responses"][number]>) =>
          update({
            ...r,
            coreConfirmed: false,
            assumptionsAccepted: false,
            responses: [
              ...r.responses.filter((a) => a.key !== topic.key),
              {
                key: topic.key,
                status: a?.status || "provided",
                details: a?.details || "",
                priority: a?.priority || "preference",
                ...patch,
              },
            ],
          });
        return (
          <details className="requirement-topic" key={topic.key} open>
            <summary>
              <span className="requirement-number">
                {a && (a.status !== "provided" || a.details.trim()) ? (
                  <Check size={14} />
                ) : (
                  i + 1
                )}
              </span>
              <strong>{topic.title}</strong>
              <span>
                {!a
                  ? "Needs input"
                  : a.status === "unknown"
                    ? "Unknown"
                    : a.status === "not-applicable"
                      ? "Not applicable"
                      : a.details.trim()
                        ? "Recorded"
                        : "Add details"}
              </span>
            </summary>
            <div className="requirement-answer">
              <h4>{topic.question}</h4>
              <p>{topic.help}</p>
              <div className="form-grid">
                <label>
                  How much do you know?
                  <select
                    aria-label={`${topic.title} status`}
                    value={a?.status || ""}
                    onChange={(e) =>
                      change({
                        status: e.target.value as
                          "provided" | "unknown" | "not-applicable",
                      })
                    }
                  >
                    <option value="" disabled>
                      Choose a response
                    </option>
                    <option value="provided">I can provide details</option>
                    <option value="unknown">
                      Not sure yet — keep unresolved
                    </option>
                    <option value="not-applicable">
                      Not applicable to this project
                    </option>
                  </select>
                </label>
                <label>
                  How should this be treated?
                  <select
                    aria-label={`${topic.title} priority`}
                    value={a?.priority || "preference"}
                    disabled={!a || a.status === "not-applicable"}
                    onChange={(e) =>
                      change({
                        priority: e.target.value as "must" | "preference",
                      })
                    }
                  >
                    <option value="preference">
                      Preference / needs manual review
                    </option>
                    <option value="must">
                      Non-negotiable — block until satisfied
                    </option>
                  </select>
                </label>
              </div>
              <label>
                Your details
                <textarea
                  rows={3}
                  maxLength={4000}
                  aria-label={`${topic.title} details`}
                  value={a?.details || ""}
                  placeholder="Measurements, needs, exceptions, things to preserve…"
                  onChange={(e) =>
                    change({
                      details: e.target.value,
                      ...(!a ? { status: "provided" as const } : {}),
                    })
                  }
                />
              </label>
              {a?.priority === "must" && a.status === "provided" && (
                <RuleLink
                  key={a.details}
                  brief={brief}
                  source={`topic:${topic.key}`}
                  text={a.details}
                  onChange={update}
                  units={units}
                />
              )}
            </div>
          </details>
        );
      })}
      <h4>Anything the questions missed?</h4>
      <p className="muted">
        Add any unusual requirement. It will be saved alongside the brief and
        included in AI context.
      </p>
      <div className="custom-constraint">
        <textarea
          aria-label="Additional constraint"
          rows={2}
          maxLength={2000}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="One requirement per entry"
        />
        <select
          aria-label="Additional constraint priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as "must" | "preference")}
        >
          <option value="preference">Preference / manual review</option>
          <option value="must">Non-negotiable</option>
        </select>
        <button
          className="outline"
          disabled={!custom.trim() || r.custom.length >= 40}
          onClick={() => {
            update({
              ...r,
              custom: [
                ...r.custom,
                { id: uid(), text: custom.trim(), priority },
              ],
              assumptionsAccepted: false,
            });
            setCustom("");
          }}
        >
          <Plus size={14} />
          Add constraint
        </button>
      </div>
      {r.custom.map((c) => (
        <div className="custom-constraint-row" key={c.id}>
          <div>
            <strong>
              {c.priority === "must" ? "Non-negotiable" : "Preference"}
            </strong>
            {c.text}
            {c.priority === "must" && (
              <RuleLink
                brief={brief}
                source={`custom:${c.id}`}
                text={c.text}
                onChange={update}
                units={units}
              />
            )}
          </div>
          <button
            aria-label={`Remove constraint ${c.text}`}
            className="icon-button"
            onClick={() =>
              update({
                ...r,
                custom: r.custom.filter((x) => x.id !== c.id),
                assumptionsAccepted: false,
              })
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function RuleLink({
  brief,
  source,
  text,
  onChange,
  units,
}: {
  brief: Brief;
  source: string;
  text: string;
  onChange: (r: Requirements) => void;
  units: DisplayUnits;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const factor = lengthFactor(units);
  const rules = enforceableRules(brief, units);
  const linked = linkedRequirement(brief, source, text);
  const existing = brief.requirements?.ruleLinks?.find(
    (l) => l.source === source,
  );
  return (
    <div className="requirement-rule-link" data-requirement-source={source}>
      {linked ? (
        <>
          <strong>Linked to enforced rules · confirmed by you</strong>
          <ul>
            {existing!.rules.map((key) => (
              <li key={key}>{rules.find((r) => r.key === key)!.label}</li>
            ))}
          </ul>
          <button
            className="text-button"
            onClick={() =>
              onChange({
                ...brief.requirements!,
                ruleLinks: brief.requirements!.ruleLinks!.filter(
                  (l) => l.source !== source,
                ),
                coreConfirmed: false,
                assumptionsAccepted: false,
              })
            }
          >
            Remove rule link
          </button>
        </>
      ) : (
        <>
          <strong>
            {existing
              ? "Requirement or rules changed — review the link again"
              : "Unresolved non-negotiable"}
          </strong>
          <p>
            Generation waits until this requirement can be enforced. If its
            entire meaning is covered by the rules below, select them and
            confirm. Otherwise keep it unresolved. Split mixed requirements into
            separate entries.
          </p>
          {rules.length ? (
            <>
              <p>
                Size limits apply to every room of that type. “Beside” means at
                least one pair per floor containing both types, with a shared
                boundary of at least {Number((1 * factor).toFixed(2))} {units}.
                These rules cannot guarantee doorways, sound isolation,
                structural preservation or compliance.
              </p>
              {rules.map((rule) => (
                <label className="check-row" key={rule.key}>
                  <input
                    type="checkbox"
                    checked={selected.includes(rule.key)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, rule.key]
                          : selected.filter((key) => key !== rule.key),
                      )
                    }
                  />
                  <span>{rule.label}</span>
                </label>
              ))}
              <button
                className="outline"
                disabled={!selected.length}
                onClick={() => {
                  try {
                    onChange(confirmRuleLink(brief, source, text, selected));
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Confirm these rules fully express this requirement
              </button>
            </>
          ) : (
            <p>
              Add matching size or relationship rules in{" "}
              <strong>Your rooms</strong>, or circulation widths in{" "}
              <strong>Your lifestyle</strong> first. Unsupported requirements
              still need manual design.
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
