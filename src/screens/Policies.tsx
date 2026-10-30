import { useState, type FormEvent } from "react";
import { Banner, Button, Field, PageHeader } from "../design/ui.tsx";
import { ACTORS, addDays, CATEGORIES, formatAmount, formatWhen, principalLabel, todayUtc } from "../format.ts";
import { diffMandates, mandateSentence } from "../engine/prose.ts";
import { allowedTotal, agentById } from "../engine/selectors.ts";
import { store } from "../engine/store.ts";
import { useLedger } from "../engine/useLedger.ts";
import type { Currency, Mandate, MandateDraft } from "../types.ts";

export function Policies() {
  const ledger = useLedger();
  const [agentId, setAgentId] = useState("agt_research");
  const agent = agentById(ledger, agentId);

  return (
    <>
      <PageHeader
        title="Policies"
        lede="Read a mandate, compare two versions, publish a replacement."
      />
      <div className="segmented wrap" role="group" aria-label="Agent">
        {ledger.agents.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.id === agentId} onClick={() => setAgentId(item.id)}>
            {item.name}
          </button>
        ))}
      </div>
      {agent ? <p className="muted agent-purpose">{agent.purpose}</p> : null}
      <PolicyBody key={agentId} agentId={agentId} />
    </>
  );
}

function PolicyBody({ agentId }: { agentId: string }) {
  const ledger = useLedger();
  const agent = agentById(ledger, agentId);
  const versions = ledger.mandates
    .filter((mandate) => mandate.agentId === agentId)
    .slice()
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const active = versions.find((mandate) => mandate.status === "active") ?? null;
  const [earlierId, setEarlierId] = useState(versions.at(-2)?.id ?? versions[0]?.id ?? "");
  const [laterId, setLaterId] = useState(versions.at(-1)?.id ?? "");
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const earlier = versions.find((mandate) => mandate.id === earlierId);
  const later = versions.find((mandate) => mandate.id === laterId);

  return (
    <div className="stack loose">
      {notice ? <Banner tone="allow">{notice}</Banner> : null}
      <section className="prose-card">
        <p className="sub">{active ? active.id : "No active mandate"}</p>
        {active && agent ? (
          <p className="statement">{mandateSentence(active, agent.name)}</p>
        ) : (
          <p className="statement">This agent cannot spend until someone publishes a mandate.</p>
        )}
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="history-title">
          <div className="panel-head">
            <h2 id="history-title">Who changed what</h2>
          </div>
          <ol className="history">
            {[...versions].reverse().map((mandate) => (
              <li key={mandate.id}>
                <div className="history-top">
                  <strong className="num">{mandate.id}</strong>
                  <span className={`pill ${mandate.status}`}>{mandate.status}</span>
                </div>
                <p>{mandate.note}</p>
                <p className="muted">
                  {principalLabel(mandate.publishedBy)} · {formatWhen(mandate.publishedAt)}
                  {mandate.replaces ? ` · replaces ${mandate.replaces}` : ""}
                </p>
                <p className="muted">
                  {formatAmount(allowedTotal(ledger, mandate.id), mandate.limits.currency)} allowed under this version.
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="compare-title">
          <div className="panel-head">
            <h2 id="compare-title">Compare</h2>
          </div>
          {versions.length < 2 ? (
            <p className="muted">
              Publish another version to compare. The old one stays in the history.
            </p>
          ) : (
            <>
              <div className="pair">
                <Field label="Earlier">
                  <select value={earlierId} onChange={(event) => setEarlierId(event.target.value)}>
                    {versions.map((mandate) => (
                      <option key={mandate.id} value={mandate.id}>
                        {mandate.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Later">
                  <select value={laterId} onChange={(event) => setLaterId(event.target.value)}>
                    {versions.map((mandate) => (
                      <option key={mandate.id} value={mandate.id}>
                        {mandate.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {earlier && later ? <DiffTable before={earlier} after={later} /> : null}
            </>
          )}
        </section>
      </div>

      <PublishForm
        key={formKey}
        agentId={agentId}
        active={active}
        onPublished={(mandate) => {
          setLaterId(mandate.id);
          setEarlierId(mandate.replaces ?? earlierId);
          setFormKey((value) => value + 1);
          setNotice(
            `Published ${mandate.id}.${mandate.replaces ? ` ${mandate.replaces} revoked.` : ""}`,
          );
        }}
      />
    </div>
  );
}

function DiffTable({ before, after }: { before: Mandate; after: Mandate }) {
  const rows = diffMandates(before, after);
  return (
    <div className="table-wrap flat">
      <table>
        <caption className="sr-only">Differences between two mandate versions</caption>
        <thead>
          <tr>
            <th>Rule</th>
            <th>Earlier</th>
            <th>Later</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.changed ? "changed" : undefined}>
              <th scope="row">{row.label}</th>
              <td>{row.before}</td>
              <td>{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublishForm({
  agentId,
  active,
  onPublished,
}: {
  agentId: string;
  active: Mandate | null;
  onPublished: (mandate: Mandate) => void;
}) {
  const ledger = useLedger();
  const agent = agentById(ledger, agentId);
  const [principal, setPrincipal] = useState(active?.principal ?? ledger.actor);
  const [perTransaction, setPerTransaction] = useState(String(active?.limits.perTransaction ?? 100));
  const [perMonth, setPerMonth] = useState(String(active?.limits.perMonth ?? 1000));
  const [currency, setCurrency] = useState<Currency>(active?.limits.currency ?? "USDC");
  const [categories, setCategories] = useState<string[]>(active?.categories ?? ["data"]);
  const [reviewOn, setReviewOn] = useState(active?.reviewAbove !== null && active?.reviewAbove !== undefined);
  const [reviewAbove, setReviewAbove] = useState(String(active?.reviewAbove ?? 250));
  const [expires, setExpires] = useState(active?.expires ?? addDays(todayUtc(), 90));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const perTx = Number(perTransaction);
  const month = Number(perMonth);
  const review = reviewOn ? Number(reviewAbove) : null;
  const draft: MandateDraft = {
    agentId,
    principal,
    perTransaction: perTx,
    perMonth: month,
    currency,
    categories,
    reviewAbove: review,
    expires,
    replaces: active?.id ?? null,
    note,
  };
  const problem = validate(draft);
  const preview: Mandate = {
    id: "preview",
    principal,
    agentId,
    limits: { perTransaction: Number.isFinite(perTx) ? perTx : 0, perMonth: Number.isFinite(month) ? month : 0, currency },
    categories,
    reviewAbove: review !== null && Number.isFinite(review) ? review : null,
    expires,
    status: "active",
    replaces: active?.id ?? null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    publishedBy: ledger.actor,
    note: note.trim(),
  };

  function toggleCategory(category: string) {
    setCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onPublished(store.publishMandate(draft));
  }

  return (
    <section className="panel" aria-labelledby="publish-title">
      <div className="panel-head">
        <h2 id="publish-title">Publish a version</h2>
      </div>
      <p className="muted">
        {active ? `Replaces ${active.id}. Past decisions keep that id.` : "First mandate for this agent."}{" "}
        Publishing as {principalLabel(ledger.actor)}.
      </p>
      <form className="stack" onSubmit={onSubmit}>
        <div className="pair">
          <Field label="Granted by">
            <select value={principal} onChange={(event) => setPrincipal(event.target.value)}>
              {ACTORS.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="USDC">USDC</option>
            </select>
          </Field>
        </div>
        <div className="pair">
          <Field label="Per payment">
            <input inputMode="decimal" value={perTransaction} onChange={(event) => setPerTransaction(event.target.value)} />
          </Field>
          <Field label="Across 30 days">
            <input inputMode="decimal" value={perMonth} onChange={(event) => setPerMonth(event.target.value)} />
          </Field>
        </div>
        <fieldset className="chips">
          <legend>Categories</legend>
          <div className="chip-row">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={categories.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={reviewOn} onChange={(event) => setReviewOn(event.target.checked)} />
          Hold for a person above a line
        </label>
        {reviewOn ? (
          <Field label="Review line" hint="Amounts above this wait. Amounts on the line do not.">
            <input inputMode="decimal" value={reviewAbove} onChange={(event) => setReviewAbove(event.target.value)} />
          </Field>
        ) : null}
        <Field label="Runs until">
          <input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} />
        </Field>
        <Field label="Note" hint="Shown in the history.">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {agent ? <blockquote className="quote">{mandateSentence(preview, agent.name)}</blockquote> : null}
        {error ? <Banner tone="deny">{error}</Banner> : null}
        <div className="row-actions">
          <Button type="submit" disabled={problem !== null}>
            Publish
          </Button>
          {problem ? <span className="muted">{problem}</span> : null}
        </div>
      </form>
    </section>
  );
}

function validate(draft: MandateDraft) {
  if (!(draft.perTransaction > 0)) return "Enter a per-payment limit greater than zero.";
  if (!(draft.perMonth >= draft.perTransaction)) return "The 30-day limit needs to be at least the per-payment limit.";
  if (draft.categories.length === 0) return "Pick at least one category.";
  if (draft.expires < todayUtc()) return "Choose an expiry of today or later.";
  if (draft.reviewAbove !== null && !(draft.reviewAbove > 0)) return "The review line needs to be greater than zero, or turned off.";
  if (draft.reviewAbove !== null && draft.reviewAbove > draft.perTransaction) {
    return "That review line sits above the per-payment limit, so a person would never see a review. Lower it, or turn it off.";
  }
  if (draft.note.trim().length < 8) return "Add a short note.";
  return null;
}
