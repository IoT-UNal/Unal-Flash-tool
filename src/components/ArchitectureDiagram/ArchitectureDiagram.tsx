"use client";

export default function ArchitectureDiagram() {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px] space-y-3 p-2">
        
        {/* Title */}
        <div className="text-center">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
            System Architecture
          </h3>
        </div>

        {/* Layer 1: Browser / Frontend */}
        <div className="relative rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-gray-900/60 p-4">
          <span className="absolute -top-2.5 left-4 bg-gray-900 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-400">
            Browser
          </span>

          {/* Next.js App Shell */}
          <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-white bg-black/40 rounded px-2 py-0.5">
                Next.js 14
              </span>
              <span className="text-[10px] text-gray-500">App Router &bull; React 18 &bull; TypeScript</span>
            </div>

            {/* Pages grid */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              <PageBox name="Dashboard" route="/" color="gray" />
              <PageBox name="Flash" route="/flash" color="blue" />
              <PageBox name="Terminal" route="/terminal" color="green" />
              <PageBox name="Firmware" route="/firmware" color="purple" />
              <PageBox name="Credentials" route="/credentials" color="amber" />
            </div>

            {/* Core modules */}
            <div className="grid grid-cols-3 gap-2">
              <ModuleBox
                name="Flash Manager"
                tech="esptool-js"
                color="blue"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
              <ModuleBox
                name="Serial Terminal"
                tech="xterm.js"
                color="green"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
              />
              <ModuleBox
                name="Credential Writer"
                tech="PROV:* Protocol"
                color="amber"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                }
              />
            </div>
          </div>
        </div>

        {/* Connection: Web Serial API */}
        <div className="flex items-center justify-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          <div className="flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-950/30 px-4 py-1.5">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="text-xs font-semibold text-cyan-400">Web Serial API</span>
            <span className="text-[10px] text-cyan-600">USB &bull; Chrome/Edge 89+</span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
        </div>

        {/* Layer 2: Device */}
        <div className="relative rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-gray-900/60 p-4">
          <span className="absolute -top-2.5 left-4 bg-gray-900 px-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Device
          </span>

          <div className="grid grid-cols-2 gap-3">
            {/* MCU */}
            <div className="rounded-lg border border-emerald-700/40 bg-gray-800/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded bg-emerald-600/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-white">ESP32-C6 XIAO</p>
                  <p className="text-[10px] text-gray-500">RISC-V &bull; WiFi 6 &bull; BLE 5.3</p>
                </div>
              </div>
              <div className="space-y-1">
                <ChipRow label="USB" value="CDC/JTAG (0x303A)" />
                <ChipRow label="Flash" value="4 MB @ 80 MHz" />
                <ChipRow label="Boot" value="Simple Boot (0x0)" />
              </div>
            </div>

            {/* Flash Memory Map */}
            <div className="rounded-lg border border-gray-700/40 bg-gray-800/50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Flash Layout</p>
              <div className="space-y-0.5 font-mono text-[10px]">
                <MemBlock addr="0x000000" label="Bootloader + App" size="~146 KB" color="emerald" />
                <MemBlock addr="0x008000" label="Partition Table" size="3 KB" color="sky" />
                <MemBlock addr="0x009000" label="NVS (Credentials)" size="28 KB" color="amber" />
                <MemBlock addr="0x010000" label="Application" size="~1 MB" color="violet" />
                <MemBlock addr="0x3FFFFF" label="End (4 MB)" size="" color="gray" />
              </div>
            </div>
          </div>

          {/* Zephyr RTOS */}
          <div className="mt-3 rounded-lg border border-emerald-700/30 bg-emerald-950/20 p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-300">Zephyr RTOS</span>
              <span className="text-[10px] text-gray-500">GPIO &bull; UART &bull; WiFi &bull; NVS &bull; Shell</span>
            </div>
            <span className="text-[10px] text-emerald-600 font-mono">CONFIG_ESP_SIMPLE_BOOT=y</span>
          </div>
        </div>

        {/* Layer 3: Infrastructure */}
        <div className="grid grid-cols-2 gap-3">
          {/* GitHub */}
          <div className="relative rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/30 to-gray-900/60 p-4">
            <span className="absolute -top-2.5 left-4 bg-gray-900 px-2 text-[10px] font-bold uppercase tracking-wider text-violet-400">
              CI / CD
            </span>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <div>
                  <p className="text-xs font-bold text-white">GitHub Actions</p>
                  <p className="text-[10px] text-gray-500">Build on tag push (v*)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <div>
                  <p className="text-xs font-bold text-white">GitHub Releases</p>
                  <p className="text-[10px] text-gray-500">Binary distribution &bull; Manifest JSON</p>
                </div>
              </div>
            </div>
          </div>

          {/* Monitoring */}
          <div className="relative rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-950/30 to-gray-900/60 p-4">
            <span className="absolute -top-2.5 left-4 bg-gray-900 px-2 text-[10px] font-bold uppercase tracking-wider text-orange-400">
              Observability
            </span>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-orange-600/30 flex items-center justify-center text-[10px] font-bold text-orange-400">P</div>
                <div>
                  <p className="text-xs font-bold text-white">Prometheus</p>
                  <p className="text-[10px] text-gray-500">Metrics &bull; /api/metrics</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-orange-600/30 flex items-center justify-center text-[10px] font-bold text-orange-400">G</div>
                <div>
                  <p className="text-xs font-bold text-white">Grafana</p>
                  <p className="text-[10px] text-gray-500">Dashboards &bull; :3001</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flow arrows legend */}
        <div className="flex items-center justify-center gap-6 pt-1">
          <LegendItem color="blue" label="Flash via esptool-js" />
          <LegendItem color="green" label="Serial I/O" />
          <LegendItem color="amber" label="PROV:* Credentials" />
          <LegendItem color="violet" label="GitHub API" />
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function PageBox({ name, route, color }: { name: string; route: string; color: string }) {
  const colors: Record<string, string> = {
    gray: "border-gray-600/40 text-gray-400",
    blue: "border-blue-600/40 text-blue-400",
    green: "border-green-600/40 text-green-400",
    purple: "border-purple-600/40 text-purple-400",
    amber: "border-amber-600/40 text-amber-400",
  };
  return (
    <div className={`rounded border bg-gray-900/60 px-2 py-1.5 text-center ${colors[color]}`}>
      <p className="text-[10px] font-semibold">{name}</p>
      <p className="text-[9px] text-gray-600 font-mono">{route}</p>
    </div>
  );
}

function ModuleBox({ name, tech, color, icon }: { name: string; tech: string; color: string; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    blue: "border-blue-600/30 bg-blue-950/20 text-blue-400",
    green: "border-green-600/30 bg-green-950/20 text-green-400",
    amber: "border-amber-600/30 bg-amber-950/20 text-amber-400",
  };
  return (
    <div className={`rounded-lg border p-2.5 flex items-center gap-2 ${colors[color]}`}>
      {icon}
      <div>
        <p className="text-[11px] font-semibold text-white">{name}</p>
        <p className="text-[10px] text-gray-500">{tech}</p>
      </div>
    </div>
  );
}

function ChipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 font-mono">{value}</span>
    </div>
  );
}

function MemBlock({ addr, label, size, color }: { addr: string; label: string; size: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
    sky: "bg-sky-500/20 border-sky-500/30 text-sky-400",
    amber: "bg-amber-500/20 border-amber-500/30 text-amber-400",
    violet: "bg-violet-500/20 border-violet-500/30 text-violet-400",
    gray: "bg-gray-500/10 border-gray-500/20 text-gray-500",
  };
  return (
    <div className={`flex items-center gap-2 rounded border px-2 py-0.5 ${colors[color]}`}>
      <span className="text-gray-500 w-16">{addr}</span>
      <span className="flex-1">{label}</span>
      <span className="text-gray-600">{size}</span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const dots: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${dots[color]}`} />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}
