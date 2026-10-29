import { beforeEach, describe, expect, it } from "vitest";
import { store } from "./store.ts";

beforeEach(() => {
  store.reset();
});

describe("store", () => {
  it("approves a review by appending an allow and leaving the review in the log", () => {
    const allow = store.approve("dec_legal_review");
    const ledger = store.getSnapshot();
    const original = ledger.decisions.find((decision) => decision.id === "dec_legal_review");

    expect(allow?.verdict).toBe("allow");
    expect(allow?.supersedes).toBe("dec_legal_review");
    expect(allow?.expiresAt).toBeTruthy();
    expect(original?.verdict).toBe("review");
    expect(ledger.resolutions[0]).toMatchObject({ decisionId: "dec_legal_review", status: "approved" });
    expect(store.approve("dec_legal_review")).toBeNull();
  });

  it("denies a review without writing a new authority to pay", () => {
    store.deny("dec_proc_review");
    const ledger = store.getSnapshot();
    expect(ledger.resolutions[0]).toMatchObject({ decisionId: "dec_proc_review", status: "denied" });
    expect(ledger.decisions.some((decision) => decision.supersedes === "dec_proc_review")).toBe(false);
  });

  it("opens an escrow only on an allow", () => {
    const held = store.createEscrow({
      agentId: "agt_research",
      seller: "vendor:atlas-data",
      amount: 1800,
      chain: "base",
      deadline: "2026-12-01",
      attestor: "role:finance_lead",
    });
    expect(held.decision.verdict).toBe("review");
    expect(held.escrow).toBeNull();

    const opened = store.createEscrow({
      agentId: "agt_research",
      seller: "vendor:field-notes",
      amount: 100,
      chain: "solana",
      deadline: "2026-12-01",
      attestor: "role:finance_lead",
    });
    expect(opened.decision.verdict).toBe("allow");
    expect(opened.escrow?.state).toBe("created");
    expect(opened.escrow?.chain).toBe("solana");
  });

  it("revokes the active mandate when a new version is published", () => {
    const next = store.publishMandate({
      agentId: "agt_research",
      principal: "role:finance_lead",
      perTransaction: 3000,
      perMonth: 9000,
      currency: "USDC",
      categories: ["data"],
      reviewAbove: 2000,
      expires: "2027-01-01",
      replaces: "mnd_research",
      note: "Raised the data cap for the quarter.",
    });
    const ledger = store.getSnapshot();
    const previous = ledger.mandates.find((mandate) => mandate.id === "mnd_research");
    expect(next.replaces).toBe("mnd_research");
    expect(previous?.status).toBe("revoked");
    expect(ledger.mandates.find((mandate) => mandate.id === next.id)?.status).toBe("active");
  });
});
