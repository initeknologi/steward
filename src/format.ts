import type { Currency, Verdict } from "./types.ts";

export const POLICY_VERSION = "pol_2026.10";

export const CATEGORIES = ["data", "api", "saas", "legal", "compute"] as const;

export const PROTOCOLS = ["x402", "acp", "ap2", "mpp", "card"] as const;

export const ACTORS = ["role:finance_lead", "role:procurement_lead", "role:controller"] as const;

export const VERDICT_LABEL: Record<Verdict, string> = {
  allow: "Allow",
  review: "Needs a person",
  deny_limit: "Over the limit",
  deny_velocity: "Too fast",
  deny_category: "Outside category",
  deny_expired: "Mandate expired",
  deny_revoked: "Mandate revoked",
  deny_no_mandate: "No mandate",
};

const PRINCIPALS: Record<string, string> = {
  "role:finance_lead": "the finance lead",
  "role:procurement_lead": "the procurement lead",
  "role:controller": "the controller",
};

export function principalLabel(principal: string) {
  return PRINCIPALS[principal] ?? principal;
}

export function formatNumber(amount: number) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatAmount(amount: number, currency: Currency) {
  const number = formatNumber(amount);
  return currency === "USD" ? `$${number}` : `${number} USDC`;
}

export function formatToken(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatWhen(iso: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso)) + " UTC"
  );
}

export function formatDay(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function shortId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function shortAddr(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function listWords(items: string[]) {
  if (items.length === 0) return "nothing";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function parseAmount(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function todayUtc(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
