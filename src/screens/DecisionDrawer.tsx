import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Drawer, verdictTone } from "../design/ui.tsx";
import {
  formatAmount,
  formatWhen,
  POLICY_VERSION,
  principalLabel,
  VERDICT_LABEL,
} from "../format.ts";
import { mandateSentence } from "../engine/prose.ts";
import { followUpAllow, mandateById, resolutionFor, agentById } from "../engine/selectors.ts";
import { store } from "../engine/store.ts";
import type { Decision, Ledger } from "../types.ts";

function statusLine(decision: Decision, ledger: Ledger, now: number) {
  const resolution = resolutionFor(ledger, decision.id);
  if (resolution?.status === "approved") {
    return `Approved by ${principalLabel(resolution.by)} at ${formatWhen(resolution.at)}.`;
  }
  if (resolution?.status === "denied") {
    return `Denied by ${principalLabel(resolution.by)} at ${formatWhen(resolution.at)}.`;
  }
  if (decision.supersedes) return `Supersedes ${decision.supersedes}.`;
  if (decision.verdict === "allow" && decision.expiresAt) {
    if (Date.parse(decision.expiresAt) > now) return `Payable until ${formatWhen(decision.expiresAt)}.`;
    return "Allow expired.";
  }
  if (decision.verdict === "review") return "Waiting.";
  return null;
}

export function DecisionDrawer({
  ledger,
  decision,
  now,
  onClose,
  onOpen,
}: {
  ledger: Ledger;
  decision: Decision | null;
  now: number;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const mandate = decision ? mandateById(ledger, decision.mandateId) : undefined;
  const agent = decision ? agentById(ledger, decision.request.agentId) : undefined;
  const resolution = decision ? resolutionFor(ledger, decision.id) : undefined;
  const followUp = decision ? followUpAllow(ledger, decision.id) : undefined;
  const pending = decision?.verdict === "review" && !resolution;

  return (
    <Drawer open={decision !== null} title="Decision" onClose={onClose}>
      {decision ? (
        <div className="stack">
          <Badge tone={verdictTone(decision.verdict)}>{VERDICT_LABEL[decision.verdict]}</Badge>
          <p className="reason">{decision.reason}</p>
          <p className="muted">{statusLine(decision, ledger, now)}</p>
          <dl className="facts">
            <div>
              <dt>Agent</dt>
              <dd>{agent?.name ?? decision.request.agentId}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd className="num">{formatAmount(decision.request.amount, decision.request.currency)}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>{decision.request.recipient}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{decision.request.category}</dd>
            </div>
            <div>
              <dt>Rail</dt>
              <dd>{decision.request.protocol ?? "None"}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{decision.mode}</dd>
            </div>
            <div>
              <dt>Mandate</dt>
              <dd>{decision.mandateId ?? "None"}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{POLICY_VERSION}</dd>
            </div>
            <div>
              <dt>Recorded</dt>
              <dd>{formatWhen(decision.issuedAt)}</dd>
            </div>
          </dl>
          {mandate && agent ? (
            <blockquote className="quote">{mandateSentence(mandate, agent.name)}</blockquote>
          ) : (
            <p className="muted">No mandate on this request.</p>
          )}
          {followUp ? (
            <p>
              <button type="button" className="text-button" onClick={() => onOpen(followUp.id)}>
                Open the allow this review produced
              </button>
            </p>
          ) : null}
          {decision.supersedes ? (
            <p>
              <button type="button" className="text-button" onClick={() => onOpen(decision.supersedes ?? "")}>
                Open the review it supersedes
              </button>
            </p>
          ) : null}
          {pending ? (
            <div className="row-actions">
              <Button
                onClick={() => {
                  const allow = store.approve(decision.id);
                  if (allow) onOpen(allow.id);
                }}
              >
                Approve
              </Button>
              <Button variant="danger" onClick={() => store.deny(decision.id)}>
                Deny
              </Button>
            </div>
          ) : null}
          <p className="muted">
            <Link to="/trace">Open trace</Link>
          </p>
        </div>
      ) : null}
    </Drawer>
  );
}

export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
