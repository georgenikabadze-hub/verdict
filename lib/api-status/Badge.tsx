/**
 * Tiny pill that renders the freshness of an API call.
 *
 * Used everywhere we surface live data so the demo audience can see at a
 * glance whether the number on screen came from the wire, from cache, or
 * from a hard error.
 */

import * as React from "react";
import type { ApiStatus } from "../contracts";

export interface ApiStatusBadgeProps {
  status: ApiStatus;
  className?: string;
}

interface Variant {
  label: string;
  dot: string;
  textClass: string;
  borderClass: string;
}

function variantFor(status: ApiStatus): Variant {
  if (status.status === "error") {
    return {
      label: "Error",
      dot: "🔴",
      textClass: "text-red-300",
      borderClass: "border-red-500/40",
    };
  }
  if (status.status === "timeout" || status.source === "cached") {
    return {
      label: "Cached",
      dot: "🟡",
      textClass: "text-amber-200",
      borderClass: "border-amber-500/40",
    };
  }
  return {
    label: "Live",
    dot: "🟢",
    textClass: "text-emerald-200",
    borderClass: "border-emerald-500/40",
  };
}

export function ApiStatusBadge({ status, className }: ApiStatusBadgeProps): React.ReactElement {
  const v = variantFor(status);
  const tooltip =
    `${v.label} · ${status.latencyMs}ms` +
    (status.message ? ` · ${status.message}` : "");

  const base =
    "inline-flex items-center gap-1 rounded-md border bg-neutral-950/40 " +
    "px-1.5 py-0.5 font-medium leading-none";
  const composed = [base, v.borderClass, v.textClass, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={composed}
      style={{ fontSize: "11px" }}
      title={tooltip}
      aria-label={tooltip}
    >
      <span aria-hidden>{v.dot}</span>
      <span>{v.label}</span>
    </span>
  );
}
