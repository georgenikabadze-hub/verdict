"use client";

export type LayerMode = "photoreal" | "heatmap" | "map";

interface Props {
  value: LayerMode;
  onChange: (mode: LayerMode) => void;
}

const OPTIONS: { value: LayerMode; label: string }[] = [
  { value: "photoreal", label: "3D View" },
  { value: "heatmap",   label: "Heatmap" },
  { value: "map",       label: "Map" },
];

export function LayerSwitcher({ value, onChange }: Props) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex rounded-lg border border-[#2A3038] bg-[#0A0E1A]/90 backdrop-blur p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === opt.value
              ? "bg-[#3DAEFF] text-[#0A0E1A]"
              : "text-[#9BA3AF] hover:text-[#F7F8FA]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
