import { InstallerReview } from "@/components/installer/InstallerReview";
import { Bell } from "lucide-react";

export default function InstallerPage() {
  return (
    <main className="relative min-h-dvh bg-[#0A0E1A] text-[#F7F8FA] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[#1A1F2A] px-6 py-4 sm:px-10">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold tracking-tight">Berlin Solar Pro</span>
          <span className="text-xs text-[#9BA3AF]">· Inbox</span>
        </div>
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-[#62E6A7]" />
          <span className="text-xs text-[#9BA3AF]">1 new</span>
        </div>
      </header>

      <section className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-0">
        {/* LEFT: house preview */}
        <div className="relative h-[36vh] lg:h-auto bg-[#0A0E1A] border-b lg:border-b-0 lg:border-r border-[#1A1F2A] overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              viewBox="0 0 400 280"
              className="w-[80%] max-w-2xl opacity-90"
              aria-hidden="true"
            >
              <polygon
                points="80,180 320,180 320,260 80,260"
                fill="#12161C"
                stroke="#2A3038"
                strokeWidth="1.5"
              />
              <polygon
                points="60,180 200,80 340,180"
                fill="#1A1F2A"
                stroke="#2A3038"
                strokeWidth="1.5"
              />
              <g>
                {Array.from({ length: 12 }).map((_, i) => {
                  const col = i % 4;
                  const row = Math.floor(i / 4);
                  const x = 130 + col * 35;
                  const y = 110 + row * 22;
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={y}
                      width="30"
                      height="18"
                      fill="#0A0E1A"
                      stroke="#3DAEFF"
                      strokeWidth="0.7"
                      opacity="0.85"
                    />
                  );
                })}
              </g>
              <rect x="184" y="220" width="32" height="40" fill="#0A0E1A" stroke="#2A3038" />
              <line x1="60" y1="180" x2="200" y2="80" stroke="#3DAEFF" strokeWidth="0.6" opacity="0.5" />
              <line x1="200" y1="80" x2="340" y2="180" stroke="#3DAEFF" strokeWidth="0.6" opacity="0.5" />
            </svg>
          </div>
          <div className="absolute bottom-6 left-6 text-xs text-[#5B6470]">
            Conrad&rsquo;s roof &middot; same view the homeowner sees
          </div>
        </div>

        {/* RIGHT: editable review */}
        <div className="flex flex-col px-6 sm:px-10 lg:px-12 py-8 lg:py-10 overflow-y-auto">
          <InstallerReview />
        </div>
      </section>
    </main>
  );
}
