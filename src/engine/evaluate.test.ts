import { describe, expect, it } from "vitest";
import type { Decision, Mandate } from "../types.ts";
import { evaluateSpend, monthSpent } from "./evaluate.ts";

const now = Date.parse("2026-10-28T12:00:00.000Z");

function mandate(over: Partial<Mandate> = {}): Mandate {
  const base: Mandate = {
    id: "mnd_a",
    principal: "role:finance_lead",
    agentId: "agt_a",
    limits: { perTransaction: 500, perMonth: 5000, currency: "USD" },
    categories: ["saas"],
    reviewAbove: 250,
    expires: "2026-12-31",
    status: "active",
    replaces: null,
    publishedAt: "2026-10-01T00:00:00.000Z",
    publishedBy: "role:finance_lead",
    note: "",
  };
  return { ...base, ...over, limits: { ...base.limits, ...over.limits } };
}

function allow(amount: number, issuedAt: string, mandateId = "mnd_a"): Decision {
  return {
    id: `dec_${mandateId}_${amount}_${issuedAt}`,
    request: {
      agentId: "agt_a",
      amount,
      currency: "USD",
      recipient: "vendor:acme",
      category: "saas",
    },
    verdict: "allow",
    reason: "ok",
    mandateId,
    policyVersion: "pol_2026.10",
    nonce: "n_test",
    mode: "enforce",
    issuedAt,
    expiresAt: issuedAt,
    supersedes: null,
  };
}

const request = {
  agentId: "agt_a",
  amount: 200,
  currency: "USD" as const,
  recipient: "vendor:acme",
  category: "saas",
};

describe("evaluateSpend", () => {
  it("allows a payment inside the mandate", () => {
    const result = evaluateSpend({ mandates: [mandate()], decisions: [] }, request, now);
    expect(result).toMatchObject({ verdict: "allow", mandateId: "mnd_a" });
  });

  it("asks for a person above the review line, and not on the line itself", () => {
    const onTheLine = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, amount: 250 },
      now,
    );
    const over = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, amount: 251 },
      now,
    );
    expect(onTheLine.verdict).toBe("allow");
    expect(over.verdict).toBe("review");
  });

  it("denies a payment over the per-payment limit", () => {
    const result = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, amount: 600 },
      now,
    );
    expect(result.verdict).toBe("deny_limit");
    expect(result.reason).toContain("per-payment limit");
  });

  it("denies a category the mandate does not list", () => {
    const result = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, category: "compute" },
      now,
    );
    expect(result).toMatchObject({ verdict: "deny_category", mandateId: "mnd_a" });
  });

  it("skips the category check for escrow and still enforces the limit", () => {
    const allowed = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, category: "escrow", amount: 100 },
      now,
      { skipCategory: true },
    );
    const over = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, category: "escrow", amount: 900 },
      now,
      { skipCategory: true },
    );
    expect(allowed.verdict).toBe("allow");
    expect(over.verdict).toBe("deny_limit");
  });

  it("denies an expired mandate and keeps one that expires today", () => {
    const expired = evaluateSpend(
      { mandates: [mandate({ expires: "2026-10-01" })], decisions: [] },
      request,
      now,
    );
    const lastDay = evaluateSpend(
      { mandates: [mandate({ expires: "2026-10-28" })], decisions: [] },
      request,
      now,
    );
    expect(expired.verdict).toBe("deny_expired");
    expect(lastDay.verdict).toBe("allow");
  });

  it("denies a revoked mandate", () => {
    const result = evaluateSpend(
      { mandates: [mandate({ status: "revoked" })], decisions: [] },
      request,
      now,
    );
    expect(result).toMatchObject({ verdict: "deny_revoked", mandateId: "mnd_a" });
  });

  it("denies when no mandate uses the request currency", () => {
    const result = evaluateSpend(
      { mandates: [mandate()], decisions: [] },
      { ...request, currency: "USDC" },
      now,
    );
    expect(result.verdict).toBe("deny_no_mandate");
  });

  it("counts only allows on this mandate toward the 30-day limit", () => {
    const decisions = [
      allow(4900, "2026-10-20T00:00:00.000Z"),
      { ...allow(400, "2026-10-21T00:00:00.000Z"), verdict: "review" as const },
      allow(9000, "2026-10-21T00:00:00.000Z", "mnd_other"),
    ];
    const ledger = { mandates: [mandate()], decisions };
    expect(monthSpent(ledger, mandate(), now)).toBe(4900);

    const room = evaluateSpend(ledger, { ...request, amount: 100 }, now);
    const over = evaluateSpend(
      ledger,
      { ...request, amount: 200 },
      now,
    );
    expect(room.verdict).toBe("allow");
    expect(over.verdict).toBe("deny_limit");
    expect(over.reason).toContain("30 days");
  });

  it("denies the 11th decision inside a minute", () => {
    const decisions = Array.from({ length: 10 }, (_, index) =>
      allow(1, new Date(now - 1_000 - index).toISOString()),
    );
    const result = evaluateSpend(
      { mandates: [mandate({ reviewAbove: null })], decisions },
      { ...request, amount: 1 },
      now,
    );
    expect(result.verdict).toBe("deny_velocity");
  });

  it("picks the earliest allow, otherwise the earliest review, otherwise the oldest result", () => {
    const older = mandate({ id: "mnd_old", publishedAt: "2026-09-01T00:00:00.000Z" });
    const newer = mandate({
      id: "mnd_new",
      publishedAt: "2026-10-01T00:00:00.000Z",
      categories: ["data"],
      limits: { perTransaction: 10, perMonth: 10, currency: "USD" },
    });

    const allowWins = evaluateSpend(
      { mandates: [newer, older], decisions: [] },
      request,
      now,
    );
    expect(allowWins).toMatchObject({ verdict: "allow", mandateId: "mnd_old" });

    const reviewWins = evaluateSpend(
      {
        mandates: [
          mandate({ id: "mnd_old", categories: ["compute"], publishedAt: "2026-09-01T00:00:00.000Z" }),
          mandate({ id: "mnd_new", publishedAt: "2026-10-01T00:00:00.000Z", reviewAbove: 10 }),
        ],
        decisions: [],
      },
      { ...request, amount: 20 },
      now,
    );
    expect(reviewWins).toMatchObject({ verdict: "review", mandateId: "mnd_new" });

    const oldestDeny = evaluateSpend(
      {
        mandates: [
          mandate({ id: "mnd_old", categories: ["compute"], publishedAt: "2026-09-01T00:00:00.000Z" }),
          mandate({ id: "mnd_new", categories: ["legal"], publishedAt: "2026-10-01T00:00:00.000Z" }),
        ],
        decisions: [],
      },
      request,
      now,
    );
    expect(oldestDeny).toMatchObject({ verdict: "deny_category", mandateId: "mnd_old" });
  });
});
