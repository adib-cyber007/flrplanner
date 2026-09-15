import type { IntakeProposal } from "../shared/model";
import { requirementTopics } from "../shared/requirements";

export default function IntakeProposalCard({
  proposal,
  onApply,
  onDismiss,
}: {
  proposal: IntakeProposal;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="proposal intake-proposal">
      <strong>Review answers · {proposal.responses.length} topic(s)</strong>
      <p>
        Existing notes are kept. Check combined notes for corrections or
        conflicts before saving.
      </p>
      <details>
        <summary>Your original message · check for anything missed</summary>
        <p className="intake-answer-text">{proposal.source}</p>
      </details>
      {proposal.responses.map((answer) => (
        <details key={answer.key} open>
          <summary>
            {requirementTopics.find((t) => t.key === answer.key)?.title} ·{" "}
            {answer.priority === "must"
              ? "Non-negotiable"
              : answer.status === "provided"
                ? "Provided"
                : answer.status === "unknown"
                  ? "Unknown"
                  : "Not applicable"}
          </summary>
          <p className="intake-answer-text">{answer.details}</p>
        </details>
      ))}
      {proposal.status === "pending" ? (
        <div className="proposal-actions">
          <button className="primary small" onClick={onApply}>
            Save these answers
          </button>
          <button className="text-button" onClick={onDismiss}>
            Dismiss answers
          </button>
        </div>
      ) : (
        <span className="proposal-status">
          {proposal.status === "applied"
            ? "Answers saved"
            : "Answers dismissed"}
        </span>
      )}
    </div>
  );
}
