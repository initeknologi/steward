import { monthSpent } from "./evaluate.ts";
import type { Currency, Decision, Escrow, Ledger, Mandate } from "../types.ts";

export function agentById(ledger: Ledger, agentId: string) {
  return ledger.agents.find((agent) => agent.id === agentId);
}

export function mandateById(ledger: Ledger, mandateId: string | null) {
  if (!mandateId) return undefined;
  return ledger.mandates.find((mandate) => mandate.id === mandateId);
}

export function resolutionFor(ledger: Ledger, decisionId: string) {
  return ledger.resolutions.find((resolution) => resolution.decisionId === decisionId);
}

export function pendingReviews(ledger: Ledger) {
  const done = new Set(ledger.resolutions.map((resolution) => resolution.decisionId));
  return ledger.decisions.filter((decision) => decision.verdict === "review" && !done.has(decision.id));
}

export function spentToday(ledger: Ledger, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const totals: Record<Currency, number> = { USD: 0, USDC: 0 };
  for (const decision of ledger.decisions) {
    if (decision.verdict !== "allow" || !decision.issuedAt.startsWith(day)) continue;
    totals[decision.request.currency] += decision.request.amount;
  }
  return totals;
}

export function verdictCounts(ledger: Ledger, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const counts = { allow: 0, review: 0, deny: 0 };
  for (const decision of ledger.decisions) {
    if (!decision.issuedAt.startsWith(day)) continue;
    if (decision.verdict === "allow") counts.allow += 1;
    else if (decision.verdict === "review") counts.review += 1;
    else counts.deny += 1;
  }
  return counts;
}

export function escrowStillOpen(ledger: Ledger) {
  return ledger.escrows.filter((escrow) =>
    escrow.state === "created" || escrow.state === "funded" || escrow.state === "delivered",
  );
}

export function escrowTotal(escrows: Escrow[]) {
  return escrows.reduce((sum, escrow) => sum + escrow.amount, 0);
}

export type MandateUsage = {
  mandate: Mandate;
  agentName: string;
  spent: number;
};

export function activeUsage(ledger: Ledger, now = Date.now()): MandateUsage[] {
  return ledger.mandates
    .filter((mandate) => mandate.status === "active")
    .map((mandate) => ({
      mandate,
      agentName: agentById(ledger, mandate.agentId)?.name ?? mandate.agentId,
      spent: monthSpent(ledger, mandate, now),
    }));
}

export function allowedTotal(ledger: Ledger, mandateId: string) {
  return ledger.decisions.reduce((sum, decision) => {
    if (decision.verdict !== "allow" || decision.mandateId !== mandateId) return sum;
    return sum + decision.request.amount;
  }, 0);
}

export function followUpAllow(ledger: Ledger, reviewId: string): Decision | undefined {
  return ledger.decisions.find((decision) => decision.supersedes === reviewId);
}
