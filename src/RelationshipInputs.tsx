import { useState } from "react";
import { roomTypes, type Brief } from "../shared/model";
import {
  relationshipDescription,
  type RoomRelationship,
} from "../shared/relationships";

export default function RelationshipInputs({
  brief,
  units,
  onChange,
}: {
  brief: Brief;
  units: "m" | "ft";
  onChange: (rules: RoomRelationship[]) => void;
}) {
  const [a, setA] = useState<RoomRelationship["a"]>("Kitchen"),
    [b, setB] = useState<RoomRelationship["b"]>("Dining room"),
    [relation, setRelation] =
      useState<RoomRelationship["relation"]>("adjacent");
  const rules = brief.roomRelationships || [],
    duplicate = rules.some(
      (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
    );
  return (
    <section className="relationship-inputs">
      <h4>Required room relationships</h4>
      <p className="muted">
        “Beside” requires at least one pair to share a boundary of{" "}
        {units === "ft" ? "3.28 ft" : "1 m"} or more on each floor containing
        both types. “Keep apart” prevents a shared boundary for every pair.
        Corner contact and rooms across a hallway do not count as beside. These
        rules do not guarantee a connecting door, sound isolation or adjacency
        for every bedroom.
      </p>
      <div className="relationship-fields">
        <label>
          Room type
          <select
            aria-label="Relationship first room"
            value={a}
            onChange={(e) => setA(e.target.value as typeof a)}
          >
            {roomTypes
              .filter((t) => t !== "Hallway")
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            aria-label="Room relationship"
            value={relation}
            onChange={(e) => setRelation(e.target.value as typeof relation)}
          >
            <option value="adjacent">Beside (shared boundary)</option>
            <option value="separate">Keep apart (no shared edge)</option>
          </select>
        </label>
        <label>
          Other room type
          <select
            aria-label="Relationship second room"
            value={b}
            onChange={(e) => setB(e.target.value as typeof b)}
          >
            {roomTypes
              .filter((t) => t !== "Hallway")
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
        </label>
      </div>
      <button
        className="outline"
        disabled={a === b || duplicate || rules.length >= 12}
        onClick={() => onChange([...rules, { a, b, relation }])}
      >
        Add required relationship
      </button>
      {duplicate && (
        <p className="muted">
          This pair already has a rule. Remove it before changing its
          relationship.
        </p>
      )}
      {rules.map((r, i) => (
        <div className="relationship-row" key={i}>
          <span>{relationshipDescription(r)}</span>
          <button
            className="text-button"
            aria-label={`Remove relationship ${r.a} ${r.b}`}
            onClick={() => onChange(rules.filter((_, j) => i !== j))}
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  );
}
