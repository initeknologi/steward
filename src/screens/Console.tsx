import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Field, PageHeader, Stat, verdictTone } from "../design/ui.tsx";
import { DecisionDrawer, useNow } from "./DecisionDrawer.tsx";
import {
  CATEGORIES,
  formatAmount,
  formatWhen,
  parseAmount,
  PROTOCOLS,
  VERDICT_LABEL,
} from "../format.ts";
import {
  activeUsage,
  agentById,
  escrowStillOpen,
  escrowTotal,
  pendingReviews,
  resolutionFor,
  spentToday,
  verdictCounts,
} from "../engine/selectors.ts";
import { store } from "../engine/store.ts";
import { useLedger } from "../engine/useLedger.ts";
import type { Currency, Decision, Protocol, SpendRequest } from "../types.ts";

function todayValue(totals: Record<Currency, number>) {
  const parts: string[] = [];
  if (totals.USD > 0) parts.push(formatAmount(totals.USD, "USD"));
  if (totals.USDC > 0) parts.push(formatAmount(totals.USDC, "USDC"));
  return parts.length > 0 ? parts.join(" · ") : formatAmount(0, "USD");
}

function rowNote(decision: Decision, now: number, resolved: boolean) {
  if (decision.verdict === "review") return resolved ? "Resolved" : "Waiting";
  if (decision.supersedes) return "From a review";
  if (decision.verdict === "allow" && decision.expiresAt && Date.parse(decision.expiresAt) <= now) {
    return "Window closed";
  }
  if (decision.verdict === "allow" && decision.expiresAt) return "Payable now";
  return VERDICT_LABEL[decision.verdict];
}

export function Console() {
  const ledger = useLedger();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const openId = params.get("decision");
  const decision = ledger.decisions.find((item) => item.id === openId) ?? null;
  const queue = pendingReviews(ledger);
  const totals = spentToday(ledger, now);
  const counts = verdictCounts(ledger, now);
  const openEscrow = escrowStillOpen(ledger);
  const usage = activeUsage(ledger, now);
  const [burstNote, setBurstNote] = useState<string | null>(null);

  function open(id: string) {
    setParams({ decision: id });
  }

  function onBurst() {
    const results = store.sendBurst();
    const allowed = results.filter((item) => item.verdict === "allow").length;
    const denied = results.length - allowed;
    setBurstNote(
      `${results.length} requests from crawl-news. ${allowed} allowed. ${denied} denied by the frequency rule.`,
    );
    const last = results.at(-1);
    if (last) open(last.id);
  }

  return (
    <>
      <PageHeader
        title="Console"
        lede="Spend, the verdict behind it, and what is still waiting."
      />
      <section className="stats" aria-label="Today">
        <Stat label="Spent today" value={todayValue(totals)} detail="Allows recorded today, UTC" />
        <Stat label="Waiting" value={String(queue.length)} detail="Reviews with no resolution" />
        <Stat
          label="Escrow still open"
          value={formatAmount(escrowTotal(openEscrow), "USDC")}
          detail={`${openEscrow.length} deals not closed`}
        />
        <Stat
          label="Active mandates"
          value={String(usage.length)}
          detail={`${counts.allow} allows, ${counts.review} reviews, ${counts.deny} denials today`}
        />
      </section>

      <section className="panel" aria-labelledby="queue-title">
        <div className="panel-head">
          <h2 id="queue-title">Waiting for a person</h2>
        </div>
        {queue.length === 0 ? (
          <p className="muted">Nothing is waiting. Payments under the review line settle on an allow.</p>
        ) : (
          <div className="queue">
            {queue.map((item) => {
              const agent = agentById(ledger, item.request.agentId);
              return (
                <article key={item.id} className="queue-card">
                  <p className="kicker">{agent?.name ?? item.request.agentId}</p>
                  <h3 className="num">{formatAmount(item.request.amount, item.request.currency)}</h3>
                  <p>{item.reason}</p>
                  <div className="row-actions">
                    <Button
                      onClick={() => {
                        const allow = store.approve(item.id);
                        if (allow) open(allow.id);
                      }}
                    >
                      Approve
                    </Button>
                    <Button variant="danger" onClick={() => store.deny(item.id)}>
                      Deny
                    </Button>
                    <Button variant="quiet" onClick={() => open(item.id)}>
                      Details
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="usage-title">
          <div className="panel-head">
            <h2 id="usage-title">Last 30 days</h2>
          </div>
          <p className="muted">Active mandate only. Revoked mandates keep their own totals.</p>
          <ul className="bars">
            {usage.map(({ mandate, agentName, spent }) => {
              const ratio = mandate.limits.perMonth === 0 ? 0 : spent / mandate.limits.perMonth;
              const tone = ratio > 1 ? "deny" : ratio >= 0.85 ? "review" : "allow";
              return (
                <li key={mandate.id}>
                  <div className="bar-label">
                    <span>{agentName}</span>
                    <span className="num">
                      {formatAmount(spent, mandate.limits.currency)} of {formatAmount(mandate.limits.perMonth, mandate.limits.currency)}
                    </span>
                  </div>
                  <div className="track" role="img" aria-label={`${agentName} has used ${Math.round(ratio * 100)} percent of the 30-day limit`}>
                    <span className={tone} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <SpendForm
          onSpent={(item) => open(item.id)}
          onBurst={onBurst}
          burstNote={burstNote}
        />
      </div>

      <section className="panel" aria-labelledby="activity-title">
        <div className="panel-head">
          <h2 id="activity-title">Activity</h2>
          <p className="muted">An allow lasts five minutes.</p>
        </div>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Spend decisions, newest first</caption>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Recipient</th>
                <th className="amount">Amount</th>
                <th>Rail</th>
                <th>Verdict</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ledger.decisions.slice(0, 40).map((item) => {
                const agent = agentById(ledger, item.request.agentId);
                const resolved = Boolean(resolutionFor(ledger, item.id));
                return (
                  <tr key={item.id}>
                    <td className="num">{formatWhen(item.issuedAt)}</td>
                    <td>{agent?.name ?? item.request.agentId}</td>
                    <td className="truncate" title={item.request.recipient}>{item.request.recipient}</td>
                    <td className="num amount">{formatAmount(item.request.amount, item.request.currency)}</td>
                    <td>{item.request.protocol ?? "—"}</td>
                    <td>
                      <Badge tone={verdictTone(item.verdict)}>{VERDICT_LABEL[item.verdict]}</Badge>
                      <span className="sub">{rowNote(item, now, resolved)}</span>
                    </td>
                    <td>
                      <Button variant="quiet" onClick={() => open(item.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <DecisionDrawer
        ledger={ledger}
        decision={decision}
        now={now}
        onClose={() => setParams({})}
        onOpen={open}
      />
    </>
  );
}

function SpendForm({
  onSpent,
  onBurst,
  burstNote,
}: {
  onSpent: (decision: Decision) => void;
  onBurst: () => void;
  burstNote: string | null;
}) {
  const ledger = useLedger();
  const [agentId, setAgentId] = useState(ledger.agents[0]?.id ?? "");
  const [amount, setAmount] = useState("12");
  const [currency, setCurrency] = useState<Currency>("USDC");
  const [recipient, setRecipient] = useState("vendor:atlas-data");
  const [category, setCategory] = useState<string>("data");
  const [protocol, setProtocol] = useState<Protocol | "">("x402");
  const [error, setError] = useState<string | null>(null);

  function onAgent(next: string) {
    setAgentId(next);
    const active = ledger.mandates.find((mandate) => mandate.agentId === next && mandate.status === "active");
    if (!active) return;
    setCurrency(active.limits.currency);
    setCategory(active.categories[0] ?? "data");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (parsed === null) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!recipient.trim()) {
      setError("Name the recipient.");
      return;
    }
    setError(null);
    const request: SpendRequest = {
      agentId,
      amount: parsed,
      currency,
      recipient: recipient.trim(),
      category,
      ...(protocol ? { protocol } : {}),
    };
    onSpent(store.requestSpend(request));
  }

  return (
    <section className="panel" aria-labelledby="ask-title">
      <div className="panel-head">
        <h2 id="ask-title">Ask to spend</h2>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <Field label="Agent">
          <select value={agentId} onChange={(event) => onAgent(event.target.value)}>
            {ledger.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="pair">
          <Field label="Amount">
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="USDC">USDC</option>
            </select>
          </Field>
        </div>
        <Field label="Recipient">
          <input list="recipients" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
          <datalist id="recipients">
            <option value="vendor:atlas-data" />
            <option value="vendor:newsgrid" />
            <option value="vendor:acme-saas" />
            <option value="vendor:lexcorpus" />
          </datalist>
        </Field>
        <div className="pair">
          <Field label="Category">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rail" hint="Optional.">
            <select value={protocol} onChange={(event) => setProtocol(event.target.value as Protocol | "")}>
              <option value="">Not labeled</option>
              {PROTOCOLS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error ? <Banner tone="deny">{error}</Banner> : null}
        {burstNote ? <Banner>{burstNote}</Banner> : null}
        <div className="row-actions">
          <Button type="submit">Ask</Button>
          <Button variant="quiet" onClick={onBurst}>
            Burst crawl-news
          </Button>
        </div>
      </form>
    </section>
  );
}
