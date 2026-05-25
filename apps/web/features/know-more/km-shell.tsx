/**
 * Shared primitives for Know More content components.
 * Keep this file framework-agnostic — no client hooks, no data fetching.
 * Every per-stage content file imports from here so panels stay visually
 * consistent across the workspace.
 */
import type { ReactNode } from "react";

export function KMHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="km-header">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

export function KMSection({
  tag,
  children,
}: {
  tag: string;
  children: ReactNode;
}) {
  return (
    <section className="km-section">
      <div className="km-tag">{tag}</div>
      <div className="km-body">{children}</div>
    </section>
  );
}

export function KMList({ children }: { children: ReactNode }) {
  return <ul className="km-list">{children}</ul>;
}

export function KMCode({ children }: { children: ReactNode }) {
  return <code className="km-chip">{children}</code>;
}

export function KMCallout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "success" | "danger";
  children: ReactNode;
}) {
  return <div className={`km-callout km-callout--${tone}`}>{children}</div>;
}
