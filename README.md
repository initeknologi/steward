# Steward

Steward is a finance console for agent spend. An agent asks to pay a vendor. The app checks that ask against the mandate for that agent and writes the verdict. It does not send the payment, and it does not hold the funds. Whoever integrates with it pays, and only after an allow.

Three screens.

Console is the daily view. Spend so far, the queue of requests waiting on a person, and the decision log. You can submit a request from the same page. An allow lasts five minutes. Approving a review appends a new allow and leaves the original review where it was. Denying one writes the resolution only.

Policies is the mandate. It is shown as a sentence, so you can read the cap, the categories, the review line, and who granted it. Compare puts the current mandate next to the one it replaced. Publishing revokes the active mandate for that agent and adds a new one. The old mandate stays in the history. Past decisions keep its id.

Trace reads USDC on Base and Solana from the chain. You can paste a transaction or load a recent Base transfer. Escrow deals on that page are a record kept in the browser: created, funded, delivered, then released, or refunded. They are not a contract. A review or a denial does not open one, and approving that review later still does not.

A request is checked in one order. More than ten decisions from the same agent in a minute is denied before a mandate is considered. Then the category, the per-payment cap, and the rolling 30 days of allows on that mandate. Above the review line, a person has to approve. An amount sitting on the line is allowed. If several mandates could apply, the earliest allow wins. If none allow, the earliest review wins. Otherwise the oldest result stands.

Observe and enforce are only stamps on the decision. The app does not block a payment in either mode. The enforce note on screen is the reminder to pay only on an allow.

The sample ledger is saved in the browser. Reset sample loads a fresh one.

```bash
npm install
npm test
npm run dev
```

React and TypeScript, on Vite. Chain reads go through TanStack Query. Base uses viem. Solana is a `getTransaction` call on the public RPC.
