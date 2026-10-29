import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Banner, Button, Field, PageHeader } from "../design/ui.tsx";
import {
  isBaseHash,
  isSolanaSignature,
  latestBaseUsdcTransfer,
  traceBaseHash,
  traceSolanaSignature,
  TraceError,
  type TraceResult,
} from "../chain/trace.ts";
import { addDays, formatAmount, formatDay, formatWhen, principalLabel, todayUtc } from "../format.ts";
import { agentById } from "../engine/selectors.ts";
import { store } from "../engine/store.ts";
import { useLedger } from "../engine/useLedger.ts";
import type { Chain, EscrowState } from "../types.ts";

const STATE_MEANING: Record<EscrowState, string> = {
  created: "Waiting for the buyer's USDC.",
  funded: "Funds are recorded against the deal. They move when the condition is met, or come back if it is not.",
  delivered: "Delivery is confirmed. The next record is the release.",
  released: "Closed. The seller has the USDC in this record.",
  refunded: "Closed. The buyer has the USDC back in this record.",
};

function actions(state: EscrowState) {
  if (state === "created") {
    return [
      { to: "funded" as const, label: "Record that funds arrived" },
      { to: "refunded" as const, label: "Record a refund" },
    ];
  }
  if (state === "funded") {
    return [
      { to: "delivered" as const, label: "Record the attestor's confirmation" },
      { to: "refunded" as const, label: "Record a refund" },
    ];
  }
  if (state === "delivered") return [{ to: "released" as const, label: "Record the release" }];
  return [];
}

export function Trace() {
  const ledger = useLedger();
  const [chain, setChain] = useState<Chain>("base");
  const [hash, setHash] = useState("");
  const [selectedId, setSelectedId] = useState(ledger.escrows[0]?.id ?? "");
  const selected = ledger.escrows.find((escrow) => escrow.id === selectedId) ?? ledger.escrows[0];

  const trace = useMutation({
    mutationFn: async (input: { chain: Chain; hash: string } | { live: true }): Promise<TraceResult> => {
      if ("live" in input) return latestBaseUsdcTransfer();
      const value = input.hash.trim();
      if (input.chain === "base") {
        if (!isBaseHash(value)) {
          throw new TraceError("A Base transaction id looks like 0x followed by 64 hex characters.");
        }
        return traceBaseHash(value);
      }
      if (!isSolanaSignature(value)) throw new TraceError("A Solana signature is a base58 string.");
      return traceSolanaSignature(value);
    },
  });

  const errorMessage = trace.error instanceof Error ? trace.error.message : null;

  return (
    <>
      <PageHeader
        title="Trace"
        lede="USDC on Base and Solana, read from the chain. Escrow deals here are stored in the browser."
      />
      <div className="split">
        <section className="panel" aria-labelledby="chain-title">
          <div className="panel-head">
            <h2 id="chain-title">Read a transaction</h2>
            <span className="pill live">Live chain</span>
          </div>
          <div className="segmented" role="group" aria-label="Chain">
            {(["base", "solana"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={chain === item} onClick={() => setChain(item)}>
                {item === "base" ? "Base" : "Solana"}
              </button>
            ))}
          </div>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              trace.mutate({ chain, hash });
            }}
          >
            <Field
              label={chain === "base" ? "Base transaction" : "Solana signature"}
              hint={chain === "base" ? "USDC contract 0x8335…2913" : "USDC mint EPjF…Dt1v"}
            >
              <input
                value={hash}
                spellCheck={false}
                onChange={(event) => setHash(event.target.value)}
                placeholder={chain === "base" ? "0x…" : "Signature"}
              />
            </Field>
            <div className="row-actions">
              <Button type="submit" disabled={trace.isPending}>
                {trace.isPending ? "Reading…" : "Read"}
              </Button>
              {chain === "base" ? (
                <Button variant="quiet" disabled={trace.isPending} onClick={() => trace.mutate({ live: true })}>
                  Load a recent USDC transfer
                </Button>
              ) : null}
            </div>
          </form>
          {trace.isError ? (
            <Banner tone="deny">
              {errorMessage ?? "The chain didn't respond."}
            </Banner>
          ) : null}
          {trace.data ? <TraceCard result={trace.data} /> : (
            <p className="muted">
              Paste a transaction, or load a recent USDC transfer from Base. The sentences come from the chain.
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="escrow-title">
          <div className="panel-head">
            <h2 id="escrow-title">Escrow deals</h2>
            <span className="pill">Recorded here</span>
          </div>
          <ul className="deal-list">
            {ledger.escrows.map((escrow) => {
              const agent = agentById(ledger, escrow.agentId);
              const current = selected?.id === escrow.id;
              return (
                <li key={escrow.id}>
                  <button type="button" className={current ? "deal current" : "deal"} onClick={() => setSelectedId(escrow.id)}>
                    <span>{agent?.name} → {escrow.seller}</span>
                    <strong className="num">{formatAmount(escrow.amount, "USDC")}</strong>
                    <span className="muted">{escrow.chain} · {escrow.state}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected ? <Deal escrowId={selected.id} /> : <p className="muted">No deals yet.</p>}
        </section>
      </div>
      <OpenEscrow onOpened={setSelectedId} />
    </>
  );
}

function TraceCard({ result }: { result: TraceResult }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.hash);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="trace-card">
      <p className="kicker">{result.status === "success" ? "Succeeded" : "Failed"} · {result.chain}</p>
      <p className="statement">{result.summary}</p>
      {result.lines.length > 0 ? (
        <ul className="plain-list">
          {result.lines.slice(0, 8).map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
      {result.lines.length > 8 ? <p className="muted">And {result.lines.length - 8} more balance changes.</p> : null}
      <p className="hash-line">
        <span className="num">{result.hash}</span>
        <button type="button" className="text-button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </p>
      <p>
        <a href={result.explorerUrl} target="_blank" rel="noreferrer">
          Source transaction
        </a>
      </p>
    </article>
  );
}

function Deal({ escrowId }: { escrowId: string }) {
  const ledger = useLedger();
  const escrow = ledger.escrows.find((item) => item.id === escrowId);
  if (!escrow) return null;
  const agent = agentById(ledger, escrow.agentId);

  return (
    <div className="stack">
      <p className="statement small">
        {agent?.name} is buying from {escrow.seller} for {formatAmount(escrow.amount, "USDC")} on {escrow.chain === "base" ? "Base" : "Solana"}.
      </p>
      <p>{STATE_MEANING[escrow.state]}</p>
      <p className="muted">
        {principalLabel(escrow.condition.attestor)} confirms delivery by {formatDay(escrow.condition.deadline)}. If that does not happen, the record can be a refund.
      </p>
      <ol className="timeline">
        {escrow.history.map((step) => (
          <li key={`${step.state}-${step.at}`}>
            <span className="dot done" aria-hidden="true" />
            <div>
              <strong>{step.state}</strong>
              <p>{step.detail}</p>
              <p className="muted">{formatWhen(step.at)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="row-actions">
        {actions(escrow.state).map((action) => (
          <Button key={action.to} variant="quiet" onClick={() => store.advanceEscrow(escrow.id, action.to)}>
            {action.label}
          </Button>
        ))}
      </div>
      <p>
        <Link to={`/?decision=${escrow.decisionId}`}>Open the decision that allowed this deal</Link>
      </p>
    </div>
  );
}

function OpenEscrow({ onOpened }: { onOpened: (id: string) => void }) {
  const ledger = useLedger();
  const [agentId, setAgentId] = useState("agt_research");
  const [seller, setSeller] = useState("vendor:atlas-data");
  const [amount, setAmount] = useState("1800");
  const [chain, setChain] = useState<Chain>("base");
  const [deadline, setDeadline] = useState(addDays(todayUtc(), 14));
  const [notice, setNotice] = useState<{ tone: "allow" | "review" | "deny"; text: string; decisionId: string } | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(amount);
    if (!(parsed > 0) || !seller.trim()) {
      setNotice({ tone: "deny", text: "Enter a seller and an amount greater than zero.", decisionId: "" });
      return;
    }
    const result = store.createEscrow({
      agentId,
      seller,
      amount: parsed,
      chain,
      deadline,
      attestor: ledger.actor,
    });
    if (result.escrow) {
      onOpened(result.escrow.id);
      setNotice({
        tone: "allow",
        text: `Opened ${result.escrow.id}.`,
        decisionId: result.decision.id,
      });
      return;
    }
    const tone = result.decision.verdict === "review" ? "review" : "deny";
    const extra = result.decision.verdict === "review"
      ? " No escrow opened. Approving it later still won't."
      : " No escrow opened.";
    setNotice({
      tone,
      text: `${result.decision.reason}${extra}`,
      decisionId: result.decision.id,
    });
  }

  return (
    <section className="panel" aria-labelledby="open-escrow-title">
      <div className="panel-head">
        <h2 id="open-escrow-title">Open an escrow</h2>
      </div>
      <p className="muted">
        Checked before anything is opened. Settlement is USDC.
      </p>
      <form className="stack" onSubmit={onSubmit}>
        <div className="pair">
          <Field label="Buyer">
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              {ledger.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Seller">
            <input value={seller} onChange={(event) => setSeller(event.target.value)} />
          </Field>
        </div>
        <div className="pair">
          <Field label="Amount in USDC">
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Chain">
            <select value={chain} onChange={(event) => setChain(event.target.value as Chain)}>
              <option value="base">Base</option>
              <option value="solana">Solana</option>
            </select>
          </Field>
        </div>
        <Field label="Deadline">
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        </Field>
        <p className="muted">Attestor: {principalLabel(ledger.actor)}. A review or a denial does not open a deal.</p>
        {notice ? (
          <Banner tone={notice.tone}>
            {notice.text}{" "}
            {notice.decisionId ? <Link to={`/?decision=${notice.decisionId}`}>Open the decision</Link> : null}
          </Banner>
        ) : null}
        <div className="row-actions">
          <Button type="submit">Check and open</Button>
        </div>
      </form>
    </section>
  );
}
