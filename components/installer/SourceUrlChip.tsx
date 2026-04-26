"use client";

import { ExternalLink } from "lucide-react";

interface Props {
  url: string;
  label?: string;
}

function hostFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SourceUrlChip({ url, label }: Props) {
  const display = label ?? hostFromUrl(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-[#2A3038] bg-[#12161C] px-1.5 py-0.5 text-[10px] text-[#9BA3AF] transition-colors hover:border-[#3DAEFF]/50 hover:text-[#3DAEFF]"
    >
      <ExternalLink size={10} className="shrink-0" />
      <span className="truncate">{display}</span>
    </a>
  );
}
