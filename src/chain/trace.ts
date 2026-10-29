import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  parseAbiItem,
  type Hash,
} from "viem";
import { base } from "viem/chains";
import { formatToken, shortAddr } from "../format.ts";

export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const BASE_RPC = "https://base-rpc.publicnode.com";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const baseClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC, { timeout: 12_000, retryCount: 0 }),
});

export class TraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceError";
  }
}

export type TraceResult = {
  chain: "base" | "solana";
  hash: string;
  status: "success" | "failed";
  summary: string;
  lines: string[];
  explorerUrl: string;
};

export function isBaseHash(value: string): value is Hash {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function isSolanaSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(value.trim());
}

function asTraceError(chain: string, error: unknown) {
  if (error instanceof TraceError) return error;
  const message = error instanceof Error ? error.message : "Unknown error";
  if (/429|rate|limit reached/i.test(message)) {
    return new TraceError(`${chain} is busy. Try again, or paste a transaction.`);
  }
  if (/aborted|timeout|failed to fetch|network|cors|load failed/i.test(message)) {
    return new TraceError(`${chain} didn't respond.`);
  }
  if (/not found|could not be found/i.test(message)) {
    return new TraceError(`${chain} has no transaction with that id.`);
  }
  return new TraceError(message);
}

function movedSentence(total: string, count: number, chain: string) {
  const noun = count === 1 ? "transfer" : "transfers";
  return `This ${chain} transaction succeeded and moved ${total} USDC in ${count} ${noun}.`;
}

export async function traceBaseHash(hash: Hash): Promise<TraceResult> {
  try {
    const receipt = await baseClient.getTransactionReceipt({ hash });
    const transfers: { from: string; to: string; amount: string }[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: [transferEvent],
          data: log.data,
          topics: log.topics,
        });
        transfers.push({
          from: decoded.args.from,
          to: decoded.args.to,
          amount: formatUnits(decoded.args.value, 6),
        });
      } catch {
        // Not a USDC Transfer log.
      }
    }

    const status = receipt.status === "success" ? "success" : "failed";
    const lines = transfers.map(
      (transfer) => `${shortAddr(transfer.from)} sent ${formatToken(transfer.amount)} USDC to ${shortAddr(transfer.to)}.`,
    );
    const total = formatToken(String(transfers.reduce((sum, transfer) => sum + Number(transfer.amount), 0)));
    let summary = "This Base transaction succeeded, and it did not move USDC.";
    if (status === "failed") summary = "This Base transaction reverted. Treat the USDC as not settled.";
    else if (transfers.length > 0) summary = movedSentence(total, transfers.length, "Base");

    return {
      chain: "base",
      hash,
      status,
      summary,
      lines,
      explorerUrl: `https://basescan.org/tx/${hash}`,
    };
  } catch (error) {
    throw asTraceError("Base", error);
  }
}

export async function latestBaseUsdcTransfer(): Promise<TraceResult> {
  try {
    const block = await baseClient.getBlockNumber();
    const fromBlock = block > 5n ? block - 5n : 0n;
    const logs = await baseClient.getLogs({
      address: BASE_USDC,
      event: transferEvent,
      fromBlock,
      toBlock: block,
    });
    const hash = [...logs].reverse().find((log) => log.transactionHash)?.transactionHash;
    if (!hash) {
      throw new TraceError("No USDC transfer showed up in the last 5 Base blocks. Paste a transaction id instead.");
    }
    return traceBaseHash(hash);
  } catch (error) {
    throw asTraceError("Base", error);
  }
}

type TokenBalance = {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { uiAmountString?: string };
};

type SolanaTransaction = {
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
};

function usdcTotals(rows: TokenBalance[] | null | undefined) {
  const totals = new Map<string, number>();
  for (const row of rows ?? []) {
    if (row.mint !== SOLANA_USDC || !row.owner) continue;
    const amount = Number(row.uiTokenAmount?.uiAmountString ?? "0");
    if (!Number.isFinite(amount)) continue;
    totals.set(row.owner, (totals.get(row.owner) ?? 0) + amount);
  }
  return totals;
}

export async function traceSolanaSignature(signature: string): Promise<TraceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
        ],
      }),
    });
    if (!response.ok) throw new TraceError("Solana didn't respond.");
    const body = (await response.json()) as { result?: SolanaTransaction | null; error?: { message?: string } };
    if (body.error) throw new TraceError(body.error.message || "Solana rejected that signature.");
    if (!body.result) throw new TraceError("Solana has no transaction with that signature.");

    const failed = Boolean(body.result.meta?.err);
    const before = usdcTotals(body.result.meta?.preTokenBalances);
    const after = usdcTotals(body.result.meta?.postTokenBalances);
    const owners = new Set([...before.keys(), ...after.keys()]);
    const lines: string[] = [];
    let decreased = 0;
    let increased = 0;
    for (const owner of owners) {
      const delta = (after.get(owner) ?? 0) - (before.get(owner) ?? 0);
      if (Math.abs(delta) < 1e-9) continue;
      const amount = formatToken(String(Math.abs(delta)));
      if (delta < 0) {
        lines.push(`${shortAddr(owner)} decreased by ${amount} USDC.`);
        decreased += Math.abs(delta);
      } else {
        lines.push(`${shortAddr(owner)} increased by ${amount} USDC.`);
        increased += delta;
      }
    }

    const volume = decreased > 0 ? decreased : increased;
    let summary = "This Solana transaction succeeded, and it did not change a USDC balance.";
    if (failed) summary = "This Solana transaction failed. Do not treat a USDC balance change as settled.";
    else if (lines.length > 0) {
      summary = `This Solana transaction succeeded. ${formatToken(String(volume))} USDC changed hands.`;
    }

    return {
      chain: "solana",
      hash: signature,
      status: failed ? "failed" : "success",
      summary,
      lines,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    throw asTraceError("Solana", error);
  } finally {
    clearTimeout(timer);
  }
}
