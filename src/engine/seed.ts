import { POLICY_VERSION } from "../format.ts";
import type { Decision, Escrow, Ledger, Mandate, SpendRequest } from "../types.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function at(now: number, offset: number) {
  return new Date(now + offset).toISOString();
}

function day(now: number, offsetDays: number) {
  const midnight = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`);
  return new Date(midnight + offsetDays * DAY).toISOString().slice(0, 10);
}

function decision(
  id: string,
  request: SpendRequest,
  verdict: Decision["verdict"],
  mandateId: string | null,
  issuedAt: string,
  reason: string,
): Decision {
  return {
    id,
    request,
    verdict,
    reason,
    mandateId,
    policyVersion: POLICY_VERSION,
    nonce: `n_${id.slice(-4)}`,
    mode: "enforce",
    issuedAt,
    expiresAt: verdict === "allow" ? new Date(Date.parse(issuedAt) + 5 * MINUTE).toISOString() : null,
    supersedes: null,
  };
}

export function createSeed(now = Date.now()): Ledger {
  const agents = [
    {
      id: "agt_research",
      name: "research-bot",
      purpose: "Buys datasets and extracts.",
    },
    {
      id: "agt_procurement",
      name: "procurement-01",
      purpose: "Pays for SaaS tools.",
    },
    {
      id: "agt_crawl",
      name: "crawl-news",
      purpose: "Pays per call for news APIs.",
    },
    {
      id: "agt_legal",
      name: "legal-review",
      purpose: "Commissions research that needs a person.",
    },
  ];

  const mandates: Mandate[] = [
    {
      id: "mnd_research_prev",
      principal: "role:finance_lead",
      agentId: "agt_research",
      limits: { perTransaction: 25, perMonth: 400, currency: "USDC" },
      categories: ["data"],
      reviewAbove: 20,
      expires: day(now, 20),
      status: "revoked",
      replaces: null,
      publishedAt: at(now, -40 * DAY),
      publishedBy: "role:finance_lead",
      note: "First cap, before the quarterly data budget.",
    },
    {
      id: "mnd_research",
      principal: "role:finance_lead",
      agentId: "agt_research",
      limits: { perTransaction: 2000, perMonth: 8000, currency: "USDC" },
      categories: ["data"],
      reviewAbove: 1500,
      expires: day(now, 80),
      status: "active",
      replaces: "mnd_research_prev",
      publishedAt: at(now, -12 * DAY),
      publishedBy: "role:finance_lead",
      note: "Raised after the quarterly data budget was approved.",
    },
    {
      id: "mnd_procurement",
      principal: "role:procurement_lead",
      agentId: "agt_procurement",
      limits: { perTransaction: 500, perMonth: 5000, currency: "USD" },
      categories: ["saas"],
      reviewAbove: 250,
      expires: day(now, 70),
      status: "active",
      replaces: null,
      publishedAt: at(now, -20 * DAY),
      publishedBy: "role:procurement_lead",
      note: "SaaS only. Anything above $250 waits.",
    },
    {
      id: "mnd_crawl",
      principal: "role:finance_lead",
      agentId: "agt_crawl",
      limits: { perTransaction: 2, perMonth: 80, currency: "USDC" },
      categories: ["api"],
      reviewAbove: null,
      expires: day(now, 100),
      status: "active",
      replaces: null,
      publishedAt: at(now, -30 * DAY),
      publishedBy: "role:finance_lead",
      note: "Micropayments. No review line.",
    },
    {
      id: "mnd_legal",
      principal: "role:controller",
      agentId: "agt_legal",
      limits: { perTransaction: 2000, perMonth: 6000, currency: "USD" },
      categories: ["legal"],
      reviewAbove: 500,
      expires: day(now, 40),
      status: "active",
      replaces: null,
      publishedAt: at(now, -8 * DAY),
      publishedBy: "role:controller",
      note: "A person sees anything above $500.",
    },
  ];

  const decisions: Decision[] = [
    decision(
      "dec_legal_review",
      { agentId: "agt_legal", amount: 1200, currency: "USD", recipient: "vendor:lexcorpus", category: "legal", protocol: "ap2" },
      "review",
      "mnd_legal",
      at(now, -25 * MINUTE),
      "$1,200.00 is above the review line of $500.00. A person needs to approve it.",
    ),
    decision(
      "dec_crawl_002",
      { agentId: "agt_crawl", amount: 0.02, currency: "USDC", recipient: "vendor:newsgrid", category: "api", protocol: "x402" },
      "allow",
      "mnd_crawl",
      at(now, -8 * MINUTE),
      "Within mandate mnd_crawl.",
    ),
    decision(
      "dec_research_610",
      { agentId: "agt_research", amount: 6.1, currency: "USDC", recipient: "vendor:atlas-data", category: "data", protocol: "x402" },
      "allow",
      "mnd_research",
      at(now, -18 * MINUTE),
      "Within mandate mnd_research.",
    ),
    decision(
      "dec_research_420",
      { agentId: "agt_research", amount: 4.2, currency: "USDC", recipient: "vendor:atlas-data", category: "data", protocol: "x402" },
      "allow",
      "mnd_research",
      at(now, -32 * MINUTE),
      "Within mandate mnd_research.",
    ),
    decision(
      "dec_proc_180",
      { agentId: "agt_procurement", amount: 180, currency: "USD", recipient: "vendor:acme-saas", category: "saas", protocol: "acp" },
      "allow",
      "mnd_procurement",
      at(now, -2 * HOUR),
      "Within mandate mnd_procurement.",
    ),
    decision(
      "dec_proc_review",
      { agentId: "agt_procurement", amount: 420, currency: "USD", recipient: "vendor:acme-saas", category: "saas", protocol: "acp" },
      "review",
      "mnd_procurement",
      at(now, -3 * HOUR),
      "$420.00 is above the review line of $250.00. A person needs to approve it.",
    ),
    decision(
      "dec_crawl_085",
      { agentId: "agt_crawl", amount: 0.85, currency: "USDC", recipient: "vendor:newsgrid", category: "api", protocol: "x402" },
      "allow",
      "mnd_crawl",
      at(now, -5 * HOUR),
      "Within mandate mnd_crawl.",
    ),
    decision(
      "dec_escrow_field",
      { agentId: "agt_research", amount: 400, currency: "USDC", recipient: "vendor:field-notes", category: "escrow" },
      "allow",
      "mnd_research",
      at(now, -6 * HOUR),
      "Within mandate mnd_research.",
    ),
    decision(
      "dec_deny_cat",
      { agentId: "agt_research", amount: 20, currency: "USDC", recipient: "vendor:gpu-pool", category: "compute", protocol: "x402" },
      "deny_category",
      "mnd_research",
      at(now, -26 * HOUR),
      "“compute” is outside this mandate. It allows data.",
    ),
    decision(
      "dec_deny_limit",
      { agentId: "agt_research", amount: 2500, currency: "USDC", recipient: "vendor:atlas-data", category: "data", protocol: "x402" },
      "deny_limit",
      "mnd_research",
      at(now, -28 * HOUR),
      "2,500.00 USDC is above the per-payment limit of 2,000.00 USDC.",
    ),
    decision(
      "dec_research_48",
      { agentId: "agt_research", amount: 48, currency: "USDC", recipient: "vendor:atlas-data", category: "data", protocol: "x402" },
      "allow",
      "mnd_research",
      at(now, -30 * HOUR),
      "Within mandate mnd_research.",
    ),
    decision(
      "dec_escrow_atlas",
      { agentId: "agt_research", amount: 1250, currency: "USDC", recipient: "vendor:atlas-data", category: "escrow" },
      "allow",
      "mnd_research",
      at(now, -2 * DAY),
      "Within mandate mnd_research.",
    ),
    decision(
      "dec_proc_90",
      { agentId: "agt_procurement", amount: 90, currency: "USD", recipient: "vendor:acme-saas", category: "saas", protocol: "acp" },
      "allow",
      "mnd_procurement",
      at(now, -3 * DAY),
      "Within mandate mnd_procurement.",
    ),
    decision(
      "dec_old_research",
      { agentId: "agt_research", amount: 10, currency: "USDC", recipient: "vendor:atlas-data", category: "data", protocol: "x402" },
      "allow",
      "mnd_research_prev",
      at(now, -20 * DAY),
      "Within mandate mnd_research_prev.",
    ),
    decision(
      "dec_escrow_archive",
      { agentId: "agt_research", amount: 800, currency: "USDC", recipient: "vendor:archive-desk", category: "escrow" },
      "allow",
      "mnd_research",
      at(now, -10 * DAY),
      "Within mandate mnd_research.",
    ),
  ];

  for (let index = 0; index < 6; index += 1) {
    decisions.push(
      decision(
        `dec_crawl_hist_${index}`,
        { agentId: "agt_crawl", amount: 0.4, currency: "USDC", recipient: "vendor:newsgrid", category: "api", protocol: "x402" },
        "allow",
        "mnd_crawl",
        at(now, -(index + 2) * DAY),
        "Within mandate mnd_crawl.",
      ),
    );
  }

  decisions.sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));

  const escrows: Escrow[] = [
    {
      id: "esc_field",
      agentId: "agt_research",
      seller: "vendor:field-notes",
      amount: 400,
      currency: "USDC",
      chain: "base",
      state: "created",
      condition: {
        type: "attestation",
        attestor: "role:finance_lead",
        deadline: day(now, 12),
      },
      decisionId: "dec_escrow_field",
      history: [
        {
          state: "created",
          at: at(now, -6 * HOUR),
          detail: "Opened after an allow. Waiting for the buyer's USDC.",
        },
      ],
    },
    {
      id: "esc_atlas",
      agentId: "agt_research",
      seller: "vendor:atlas-data",
      amount: 1250,
      currency: "USDC",
      chain: "base",
      state: "funded",
      condition: {
        type: "attestation",
        attestor: "role:finance_lead",
        deadline: day(now, 14),
      },
      decisionId: "dec_escrow_atlas",
      history: [
        {
          state: "created",
          at: at(now, -2 * DAY),
          detail: "Opened after an allow. Waiting for USDC to be recorded against the deal.",
        },
        {
          state: "funded",
          at: at(now, -2 * DAY + 20 * MINUTE),
          detail: "Funds were recorded against this deal. Release waits on the finance lead, not on Steward.",
        },
      ],
    },
    {
      id: "esc_archive",
      agentId: "agt_research",
      seller: "vendor:archive-desk",
      amount: 800,
      currency: "USDC",
      chain: "solana",
      state: "released",
      condition: {
        type: "attestation",
        attestor: "role:finance_lead",
        deadline: day(now, -2),
      },
      decisionId: "dec_escrow_archive",
      history: [
        {
          state: "created",
          at: at(now, -10 * DAY),
          detail: "Opened after an allow.",
        },
        {
          state: "funded",
          at: at(now, -10 * DAY + HOUR),
          detail: "Funds were recorded against this deal.",
        },
        {
          state: "delivered",
          at: at(now, -9 * DAY),
          detail: "The finance lead confirmed delivery.",
        },
        {
          state: "released",
          at: at(now, -9 * DAY + HOUR),
          detail: "The deal is closed. The record says the seller received the USDC.",
        },
      ],
    },
  ];

  return {
    version: 1,
    mode: "enforce",
    actor: "role:finance_lead",
    agents,
    mandates,
    decisions,
    resolutions: [],
    escrows,
  };
}
