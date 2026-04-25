import { IntakePanel } from "@/components/homeowner/IntakePanel";

export default function Home() {
  return (
    <main className="relative min-h-dvh bg-[#0A0E1A] text-[#F7F8FA] flex flex-col">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10 z-20">
        <span className="text-base font-semibold tracking-tight">Verdict</span>
        <a
          href="/installer"
          className="text-sm text-[#9BA3AF] hover:text-[#F7F8FA] transition-colors"
        >
          For installers
        </a>
      </nav>

      {/* Two-pane: 3D house left, intake right (stacked on mobile) */}
      <section className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-0">
        {/* LEFT: 3D house placeholder */}
        <div className="relative h-[42vh] lg:h-auto bg-[#0A0E1A] border-b lg:border-b-0 lg:border-r border-[#1A1F2A] overflow-hidden flex items-center justify-center">
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
            3D drone mesh + live solar overlay arriving in Sprint 3
          </div>
        </div>

        {/* RIGHT: intake form */}
        <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12">
          <IntakePanel />
        </div>
      </section>

      {/* Footer signal */}
      <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 hidden lg:flex items-center gap-2 text-xs text-[#9BA3AF] z-20">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#62E6A7] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#62E6A7]" />
        </span>
        41 Reonic projects in your region
      </div>
    </main>
  );
}
