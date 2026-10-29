import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Verdict } from "../types.ts";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger";
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`btn ${variant} ${className}`.trim()} {...props} />;
}

export function Badge({ tone, children }: { tone: "allow" | "review" | "deny" | "neutral"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function verdictTone(verdict: Verdict): "allow" | "review" | "deny" {
  if (verdict === "allow") return "allow";
  if (verdict === "review") return "review";
  return "deny";
}

export function Banner({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "allow" | "review" | "deny";
  children: ReactNode;
}) {
  return (
    <div className={`banner ${tone}`} role="status">
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="stat">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function PageHeader({ title, lede }: { title: string; lede: string }) {
  useEffect(() => {
    document.title = `${title} · Steward`;
  }, [title]);

  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </header>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-back" onMouseDown={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-head">
          <h2 id="drawer-title">{title}</h2>
          <Button variant="quiet" onClick={onClose} autoFocus>
            Close
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
