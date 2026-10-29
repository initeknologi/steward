export type Mode = "observe" | "enforce";

export type Currency = "USD" | "USDC";

export type Chain = "base" | "solana";

export type Protocol = "x402" | "acp" | "ap2" | "mpp" | "card";

export type Verdict =
  | "allow"
  | "review"
  | "deny_limit"
  | "deny_velocity"
  | "deny_category"
  | "deny_expired"
  | "deny_revoked"
  | "deny_no_mandate";

export type Agent = {
  id: string;
  name: string;
  purpose: string;
};

export type Mandate = {
  id: string;
  principal: string;
  agentId: string;
  limits: {
    perTransaction: number;
    perMonth: number;
    currency: Currency;
  };
  categories: string[];
  reviewAbove: number | null;
  expires: string;
  status: "active" | "revoked";
  replaces: string | null;
  publishedAt: string;
  publishedBy: string;
  note: string;
};

export type SpendRequest = {
  agentId: string;
  amount: number;
  currency: Currency;
  recipient: string;
  category: string;
  protocol?: Protocol;
};

export type Decision = {
  id: string;
  request: SpendRequest;
  verdict: Verdict;
  reason: string;
  mandateId: string | null;
  policyVersion: string;
  nonce: string;
  mode: Mode;
  issuedAt: string;
  expiresAt: string | null;
  supersedes: string | null;
};

export type ReviewResolution = {
  id: string;
  decisionId: string;
  status: "approved" | "denied";
  at: string;
  by: string;
};

export type EscrowState = "created" | "funded" | "delivered" | "released" | "refunded";

export type Escrow = {
  id: string;
  agentId: string;
  seller: string;
  amount: number;
  currency: "USDC";
  chain: Chain;
  state: EscrowState;
  condition: {
    type: "attestation";
    attestor: string;
    deadline: string;
  };
  decisionId: string;
  history: { state: EscrowState; at: string; detail: string }[];
};

export type Ledger = {
  version: 1;
  mode: Mode;
  actor: string;
  agents: Agent[];
  mandates: Mandate[];
  decisions: Decision[];
  resolutions: ReviewResolution[];
  escrows: Escrow[];
};

export type MandateDraft = {
  agentId: string;
  principal: string;
  perTransaction: number;
  perMonth: number;
  currency: Currency;
  categories: string[];
  reviewAbove: number | null;
  expires: string;
  replaces: string | null;
  note: string;
};

export type EscrowDraft = {
  agentId: string;
  seller: string;
  amount: number;
  chain: Chain;
  deadline: string;
  attestor: string;
};
