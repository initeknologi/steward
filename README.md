# Steward

Console for agent spend. A request is checked against a mandate and comes back as a verdict. Mandates get replaced, not edited. USDC on Base and Solana is read from the chain. Escrow state in the app stays in the browser. Nothing here holds funds.

```bash
npm install
npm test
npm run dev
```

Sample data is saved in the browser. Reset sample loads it again.
