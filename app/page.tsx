export default function Home() {
  return (
    <main className="relative min-h-dvh bg-[#0A0E1A] text-[#F7F8FA] flex flex-col">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-base font-semibold tracking-tight">Verdict</span>
        <a
          href="/installer"
          className="text-sm text-[#9BA3AF] hover:text-[#F7F8FA] transition-colors"
        >
          For installers
        </a>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="max-w-3xl text-3xl sm:text-5xl font-semibold leading-[1.1] tracking-tight">
          Your home can earn more than you&rsquo;re losing on energy.
        </h1>
        <p className="mt-4 text-sm sm:text-base text-[#9BA3AF]">
          Based on 1,277 real Reonic projects.
        </p>

        <div className="mt-10 w-full max-w-xl flex flex-col gap-3">
          <label className="sr-only" htmlFor="address">Your address</label>
          <input
            id="address"
            name="address"
            type="text"
            placeholder="Enter your address..."
            autoComplete="off"
            className="w-full rounded-lg border border-[#2A3038] bg-[#12161C] px-5 py-4 text-base text-[#F7F8FA] placeholder:text-[#5B6470] focus:outline-none focus:border-[#3DAEFF] focus:ring-2 focus:ring-[#3DAEFF]/30 transition-all"
          />
          <button
            type="button"
            className="self-center text-sm text-[#9BA3AF] hover:text-[#3DAEFF] transition-colors"
          >
            ⌖ Use my location
          </button>
          <p className="self-center text-xs text-[#5B6470] mt-2">
            Address autocomplete + 3D house reveal arriving in Sprint 3.
          </p>
        </div>

        {/* Footer signal */}
        <div className="absolute bottom-6 right-6 flex items-center gap-2 text-xs text-[#9BA3AF]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#62E6A7] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#62E6A7]" />
          </span>
          41 Reonic projects in your region
        </div>
      </section>
    </main>
  );
}
