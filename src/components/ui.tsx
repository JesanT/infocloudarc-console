import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { tone } from "@/lib/cloud/model";

const toneClass = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
} as const;

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${toneClass[tone(value)]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {value}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-medium text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-xs font-medium tracking-wide text-faint uppercase">{label}</div>
      <div className="mt-2 font-mono text-2xl font-medium text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "ghost", className = "", type = "button", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:bg-ink",
    ghost: "border border-line bg-inset text-ink hover:border-line-strong",
    danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
  }[variant];
  return (
    <button
      type={type}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "h-11 rounded-md border border-line bg-canvas px-3 text-sm text-ink outline-none placeholder:text-faint";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full min-w-[640px] text-left text-sm">{children}</table>;
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="border-b border-line px-3 py-2 text-xs font-medium tracking-wide text-faint uppercase">{children}</th>;
}

export function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <td className={`border-b border-line px-3 py-3 align-middle text-ink ${mono ? "font-mono text-xs" : ""}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
