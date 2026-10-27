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
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-semibold ${toneClass[tone(value)]}`}>
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
    <section className={`rounded-sm border border-line bg-white p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
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
    <div className="rounded-sm border border-line bg-white px-4 py-3">
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-muted">{hint}</div>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "ghost", className = "", type = "button", ...props }: ButtonProps) {
  const styles = {
    primary: "border border-[#0078d4] bg-[#0078d4] text-white hover:bg-[#106ebe]",
    ghost: "border border-[#8a8886] bg-white text-ink hover:bg-[#f3f2f1]",
    danger: "border border-[#a4262c] bg-white text-[#a4262c] hover:bg-[#fdf6f6]",
  }[variant];
  return (
    <button
      type={type}
      className={`inline-flex h-8 items-center justify-center gap-2 rounded-sm px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
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
  "h-8 rounded-sm border border-[#8a8886] bg-white px-2 text-sm text-ink outline-none placeholder:text-faint focus:border-[#0078d4]";

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
  return <th className="border-b border-line bg-[#faf9f8] px-3 py-2 text-left text-xs font-semibold text-muted">{children}</th>;
}

export function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <td className={`border-b border-line px-3 py-2 align-middle text-ink ${mono ? "font-mono text-xs" : ""}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
