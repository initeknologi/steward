import { formatAmount, formatDay, listWords, principalLabel } from "../format.ts";
import type { Mandate } from "../types.ts";

export function mandateSentence(mandate: Mandate, agentName: string) {
  const currency = mandate.limits.currency;
  const per = formatAmount(mandate.limits.perTransaction, currency);
  const month = formatAmount(mandate.limits.perMonth, currency);
  const review = mandate.reviewAbove === null
    ? "Payments inside those limits do not wait for a person."
    : `Payments above ${formatAmount(mandate.reviewAbove, currency)} wait for a person.`;

  return `${agentName} may spend up to ${per} per payment and ${month} across 30 days, and only for ${listWords(mandate.categories)}. ${review} This runs until ${formatDay(mandate.expires)}, granted by ${principalLabel(mandate.principal)}.`;
}

export type DiffRow = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

function row(label: string, before: string, after: string): DiffRow {
  return { label, before, after, changed: before !== after };
}

export function diffMandates(before: Mandate, after: Mandate): DiffRow[] {
  const review = (mandate: Mandate) =>
    mandate.reviewAbove === null ? "No review line" : formatAmount(mandate.reviewAbove, mandate.limits.currency);

  return [
    row(
      "Per payment",
      formatAmount(before.limits.perTransaction, before.limits.currency),
      formatAmount(after.limits.perTransaction, after.limits.currency),
    ),
    row(
      "Across 30 days",
      formatAmount(before.limits.perMonth, before.limits.currency),
      formatAmount(after.limits.perMonth, after.limits.currency),
    ),
    row("Currency", before.limits.currency, after.limits.currency),
    row("Categories", before.categories.join(", "), after.categories.join(", ")),
    row("Review line", review(before), review(after)),
    row("Runs until", formatDay(before.expires), formatDay(after.expires)),
    row("Granted by", before.principal, after.principal),
    row("Note", before.note || "None", after.note || "None"),
  ];
}
