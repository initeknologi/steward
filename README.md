# Steward

Steward is a finance console for agent spend. It evaluates payment requests against explicit mandates and records the resulting verdict without holding funds or executing payments.

[Open the live app](https://steward-ochre.vercel.app/)

## Features

- **Finance console** — shows current spend, pending reviews, mandate usage, and an append-only decision log.
- **Spend evaluation** — returns allow, review, or a specific denial with the mandate and reason behind it.
- **Approval queue** — lets an authorized role resolve requests that require review while preserving the original decision.
- **Mandate editor** — creates readable spending rules with per-payment and rolling 30-day limits, category restrictions, review thresholds, and expiry dates.
- **Version history** — replaces mandates instead of editing them in place, with side-by-side comparisons between versions.
- **USDC trace** — reads Base and Solana transactions from public RPC endpoints and links to the appropriate block explorer.
- **Escrow records** — models created, funded, delivered, released, and refunded states after an allowed request.

## How decisions are made

A request is evaluated in this order:

1. Velocity limit
2. Active mandate and expiry
3. Allowed spending category
4. Per-payment limit
5. Rolling 30-day limit
6. Human-review threshold

More than ten decisions from one agent within 60 seconds is denied before mandate matching. An amount equal to the review threshold is allowed; only an amount above it requires review. An allow is payable for five minutes.

When several mandates match, the first allow in creation order wins. If none allow, the first review wins. Otherwise, the oldest denial is returned.

## Technical overview

- React 19 and TypeScript
- Vite
- React Router
- TanStack Query for asynchronous chain reads
- viem for Base receipt and ERC-20 event decoding
- Solana JSON-RPC for parsed transaction data
- Vitest for policy engine and store tests
- oxlint for static analysis

The application has no backend. The ledger and sample escrow records are stored in `localStorage`. Base and Solana transaction data comes from public mainnet RPC endpoints.

The evaluation engine is kept separate from the React components. It accepts a ledger, a request, and a timestamp, then returns a deterministic verdict. Store operations append decisions and resolutions rather than rewriting existing records.

## Run locally

Node.js 20.19 or newer is required.

```bash
npm install
npm run dev
```

The development server runs at `http://localhost:5173`.

## Available scripts

```bash
npm run dev      # Start the development server
npm run build    # Type-check and create a production build
npm run preview  # Preview the production build
npm run lint     # Run static analysis
npm test         # Run the test suite
```

## Data and limitations

- Sample data is saved in the browser and can be restored with **Reset sample**.
- Observe and enforce are recorded on each decision; Steward does not intercept or submit payments.
- Escrow entries are local workflow records, not deployed smart contracts.
- Public RPC endpoints may rate-limit requests or be temporarily unavailable.
- No wallet, private key, card data, or customer funds are stored by the app.
