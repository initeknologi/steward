import { formatAmount, POLICY_VERSION } from "../format.ts";
import type { Decision, Ledger, Mandate, SpendRequest, Verdict } from "../types.ts";

export const VELOCITY_LIMIT = 10;
export const VELOCITY_WINDOW_MS = 60_000;
export const ALLOW_TTL_MS = 5 * 60_000;
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export { POLICY_VERSION };

export type Evaluation = {
  verdict: Verdict;
  reason: string;
  mandateId: string | null;
};

type Options = {
  skipCategory?: boolean;
};

export function mandateExpired(expires: string, now: number) {
  return now > Date.parse(`${expires.slice(0, 10)}T23:59:59.999Z`);
}

export function monthSpent(ledger: Pick<Ledger, "decisions">, mandate: Mandate, now: number) {
  const from = now - MONTH_MS;
  return ledger.decisions.reduce((sum, decision) => {
    if (decision.verdict !== "allow" || decision.mandateId !== mandate.id) return sum;
    const issued = Date.parse(decision.issuedAt);
    if (issued < from || issued > now) return sum;
    if (decision.request.currency !== mandate.limits.currency) return sum;
    return sum + decision.request.amount;
  }, 0);
}

export function evaluateSpend(
  ledger: Pick<Ledger, "mandates" | "decisions">,
  request: SpendRequest,
  now: number,
  options: Options = {},
): Evaluation {
  const recent = ledger.decisions.filter((decision) => {
    if (decision.request.agentId !== request.agentId) return false;
    const age = now - Date.parse(decision.issuedAt);
    return age >= 0 && age < VELOCITY_WINDOW_MS;
  });

  if (recent.length >= VELOCITY_LIMIT) {
    return {
      verdict: "deny_velocity",
      reason: `${recent.length} decisions already landed in the last 60 seconds. The ceiling is ${VELOCITY_LIMIT}.`,
      mandateId: null,
    };
  }

  const sameCurrency = ledger.mandates
    .filter((mandate) => mandate.agentId === request.agentId && mandate.limits.currency === request.currency)
    .slice()
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

  if (sameCurrency.length === 0) {
    return {
      verdict: "deny_no_mandate",
      reason: `No mandate in ${request.currency} covers this agent.`,
      mandateId: null,
    };
  }

  const applicable = sameCurrency.filter(
    (mandate) => mandate.status === "active" && !mandateExpired(mandate.expires, now),
  );

  if (applicable.length === 0) {
    const active = sameCurrency.filter((mandate) => mandate.status === "active");
    if (active.length === 0) {
      const revoked = sameCurrency.filter((mandate) => mandate.status === "revoked").at(-1);
      return {
        verdict: "deny_revoked",
        reason: revoked
          ? `Mandate ${revoked.id} was revoked. Spending needs a new one.`
          : "The mandate for this agent was revoked.",
        mandateId: revoked?.id ?? null,
      };
    }
    const expired = active.at(-1)!;
    return {
      verdict: "deny_expired",
      reason: `Mandate ${expired.id} expired on ${expired.expires}.`,
      mandateId: expired.id,
    };
  }

  const outcomes = applicable.map((mandate) => judgeMandate(ledger, mandate, request, now, options));
  return outcomes.find((outcome) => outcome.verdict === "allow")
    ?? outcomes.find((outcome) => outcome.verdict === "review")
    ?? outcomes[0];
}

function judgeMandate(
  ledger: Pick<Ledger, "decisions">,
  mandate: Mandate,
  request: SpendRequest,
  now: number,
  options: Options,
): Evaluation {
  if (!options.skipCategory && !mandate.categories.includes(request.category)) {
    return {
      verdict: "deny_category",
      reason: `“${request.category}” is outside this mandate. It allows ${mandate.categories.join(", ")}.`,
      mandateId: mandate.id,
    };
  }

  const currency = mandate.limits.currency;
  if (request.amount > mandate.limits.perTransaction) {
    return {
      verdict: "deny_limit",
      reason: `${formatAmount(request.amount, currency)} is above the per-payment limit of ${formatAmount(mandate.limits.perTransaction, currency)}.`,
      mandateId: mandate.id,
    };
  }

  const spent = monthSpent(ledger, mandate, now);
  if (spent + request.amount > mandate.limits.perMonth) {
    return {
      verdict: "deny_limit",
      reason: `This would bring the last 30 days to ${formatAmount(spent + request.amount, currency)}, above the monthly limit of ${formatAmount(mandate.limits.perMonth, currency)}.`,
      mandateId: mandate.id,
    };
  }

  if (mandate.reviewAbove !== null && request.amount > mandate.reviewAbove) {
    return {
      verdict: "review",
      reason: `${formatAmount(request.amount, currency)} is above the review line of ${formatAmount(mandate.reviewAbove, currency)}. A person needs to approve it.`,
      mandateId: mandate.id,
    };
  }

  return {
    verdict: "allow",
    reason: `Within mandate ${mandate.id}.`,
    mandateId: mandate.id,
  };
}

export function isPayableAllow(decision: Decision, now: number) {
  return decision.verdict === "allow"
    && decision.expiresAt !== null
    && Date.parse(decision.expiresAt) > now;
}
