import { ALLOW_TTL_MS, evaluateSpend, POLICY_VERSION } from "./evaluate.ts";
import { createSeed } from "./seed.ts";
import type {
  Decision,
  Escrow,
  EscrowDraft,
  EscrowState,
  Ledger,
  Mandate,
  MandateDraft,
  Mode,
  SpendRequest,
} from "../types.ts";

const STORAGE_KEY = "steward.ledger.v2";

export function createId(prefix: string) {
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `${prefix}_${id}`;
}

function isLedger(value: unknown): value is Ledger {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Ledger>;
  return record.version === 1
    && Array.isArray(record.agents)
    && Array.isArray(record.mandates)
    && Array.isArray(record.decisions)
    && Array.isArray(record.resolutions)
    && Array.isArray(record.escrows);
}

function readStored(): Ledger | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLedger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(ledger: Ledger) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // private mode or a full quota
  }
}

let state: Ledger = readStored() ?? createSeed();
if (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === null) {
  writeStored(state);
}

const listeners = new Set<() => void>();

function commit(next: Ledger) {
  state = next;
  writeStored(state);
  listeners.forEach((listener) => listener());
}

function toDecision(
  ledger: Ledger,
  request: SpendRequest,
  evaluation: { verdict: Decision["verdict"]; reason: string; mandateId: string | null },
  now: number,
  supersedes: string | null,
): Decision {
  return {
    id: createId("dec"),
    request,
    verdict: evaluation.verdict,
    reason: evaluation.reason,
    mandateId: evaluation.mandateId,
    policyVersion: POLICY_VERSION,
    nonce: createId("n"),
    mode: ledger.mode,
    issuedAt: new Date(now).toISOString(),
    expiresAt: evaluation.verdict === "allow" ? new Date(now + ALLOW_TTL_MS).toISOString() : null,
    supersedes,
  };
}

export function canAdvance(from: EscrowState, to: EscrowState) {
  if (from === "created") return to === "funded" || to === "refunded";
  if (from === "funded") return to === "delivered" || to === "refunded";
  if (from === "delivered") return to === "released";
  return false;
}

const ADVANCE_DETAIL: Record<Exclude<EscrowState, "created">, string> = {
  funded: "Funds were recorded against this deal. In production they would sit in the contract, not with Steward.",
  delivered: "The attestor confirmed delivery. Release is still a later step in the record.",
  released: "The deal is closed. The record says the seller received the USDC.",
  refunded: "The deal is closed. The record says the USDC returned to the buyer.",
};

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
  setMode(mode: Mode) {
    commit({ ...state, mode });
  },
  setActor(actor: string) {
    commit({ ...state, actor });
  },
  reset() {
    commit(createSeed());
  },
  requestSpend(request: SpendRequest, options?: { skipCategory?: boolean }) {
    if (!(request.amount > 0)) throw new Error("Amount must be greater than zero.");
    const now = Date.now();
    const evaluation = evaluateSpend(state, request, now, options);
    const decision = toDecision(state, request, evaluation, now, null);
    commit({ ...state, decisions: [decision, ...state.decisions] });
    return decision;
  },
  approve(decisionId: string) {
    const original = state.decisions.find((decision) => decision.id === decisionId);
    if (!original || original.verdict !== "review") return null;
    if (state.resolutions.some((resolution) => resolution.decisionId === decisionId)) return null;
    const now = Date.now();
    const allow = toDecision(
      state,
      original.request,
      {
        verdict: "allow",
        reason: `Approved by ${state.actor}. Supersedes ${original.id}.`,
        mandateId: original.mandateId,
      },
      now,
      original.id,
    );
    commit({
      ...state,
      decisions: [allow, ...state.decisions],
      resolutions: [
        {
          id: createId("res"),
          decisionId,
          status: "approved",
          at: allow.issuedAt,
          by: state.actor,
        },
        ...state.resolutions,
      ],
    });
    return allow;
  },
  deny(decisionId: string) {
    const original = state.decisions.find((decision) => decision.id === decisionId);
    if (!original || original.verdict !== "review") return;
    if (state.resolutions.some((resolution) => resolution.decisionId === decisionId)) return;
    commit({
      ...state,
      resolutions: [
        {
          id: createId("res"),
          decisionId,
          status: "denied",
          at: new Date().toISOString(),
          by: state.actor,
        },
        ...state.resolutions,
      ],
    });
  },
  publishMandate(draft: MandateDraft) {
    const mandate: Mandate = {
      id: createId("mnd"),
      principal: draft.principal,
      agentId: draft.agentId,
      limits: {
        perTransaction: draft.perTransaction,
        perMonth: draft.perMonth,
        currency: draft.currency,
      },
      categories: [...draft.categories],
      reviewAbove: draft.reviewAbove,
      expires: draft.expires,
      status: "active",
      replaces: draft.replaces,
      publishedAt: new Date().toISOString(),
      publishedBy: state.actor,
      note: draft.note.trim(),
    };
    commit({
      ...state,
      mandates: [
        mandate,
        ...state.mandates.map((item) =>
          item.agentId === draft.agentId && item.status === "active"
            ? { ...item, status: "revoked" as const }
            : item,
        ),
      ],
    });
    return mandate;
  },
  createEscrow(draft: EscrowDraft) {
    const decision = this.requestSpend(
      {
        agentId: draft.agentId,
        amount: draft.amount,
        currency: "USDC",
        recipient: draft.seller.trim(),
        category: "escrow",
      },
      { skipCategory: true },
    );
    if (decision.verdict !== "allow") return { decision, escrow: null as Escrow | null };

    const escrow: Escrow = {
      id: createId("esc"),
      agentId: draft.agentId,
      seller: draft.seller.trim(),
      amount: draft.amount,
      currency: "USDC",
      chain: draft.chain,
      state: "created",
      condition: {
        type: "attestation",
        attestor: draft.attestor,
        deadline: draft.deadline,
      },
      decisionId: decision.id,
      history: [
        {
          state: "created",
          at: decision.issuedAt,
          detail: "Opened after an allow. Waiting for the buyer's USDC.",
        },
      ],
    };
    commit({ ...state, escrows: [escrow, ...state.escrows] });
    return { decision, escrow };
  },
  advanceEscrow(id: string, to: EscrowState) {
    const escrow = state.escrows.find((item) => item.id === id);
    if (!escrow || to === "created" || !canAdvance(escrow.state, to)) return;
    const next: Escrow = {
      ...escrow,
      state: to,
      history: [
        ...escrow.history,
        { state: to, at: new Date().toISOString(), detail: ADVANCE_DETAIL[to] },
      ],
    };
    commit({
      ...state,
      escrows: state.escrows.map((item) => (item.id === id ? next : item)),
    });
  },
  sendBurst() {
    const results: Decision[] = [];
    for (let index = 0; index < 11; index += 1) {
      results.push(
        this.requestSpend({
          agentId: "agt_crawl",
          amount: 0.02,
          currency: "USDC",
          recipient: "vendor:newsgrid",
          category: "api",
          protocol: "x402",
        }),
      );
    }
    return results;
  },
};
