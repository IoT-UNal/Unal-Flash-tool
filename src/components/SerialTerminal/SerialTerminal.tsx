"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { SerialManager } from "@/lib/serial/SerialManager";
import { type BaudRate } from "@/lib/serial/types";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import SerialToolbar, {
  type DisplayMode,
  type LineEnding,
} from "./SerialToolbar";
import "@xterm/xterm/css/xterm.css";

/** Format a Uint8Array as hex dump: "41 42 43  |ABC|" */
function formatHexLine(data: Uint8Array): string {
  const hex = Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
  const ascii = Array.from(data)
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
    .join("");
  return `${hex}  |${ascii}|`;
}

function getTimestamp(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function lineEndingSuffix(ending: LineEnding): string {
  switch (ending) {
    case "cr": return "\r";
    case "lf": return "\n";
    case "crlf": return "\r\n";
    default: return "";
  }
}

export default function SerialTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const logBufferRef = useRef<string[]>([]);
  const unsubsRef = useRef<Array<() => void>>([]);

  const [isConnected, setIsConnected] = useState(false);
  const [baudRate, setBaudRate] = useState<BaudRate>(115200);
  const [dtr, setDtr] = useState(false);
  const [rts, setRts] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [timestamps, setTimestamps] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("text");
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [bytesReceived, setBytesReceived] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [, setHistoryIndex] = useState(-1);

  // Refs that we read inside callbacks to avoid stale closures
  const timestampsRef = useRef(timestamps);
  const displayModeRef = useRef(displayMode);
  const autoScrollRef = useRef(autoScroll);
  timestampsRef.current = timestamps;
  displayModeRef.current = displayMode;
  autoScrollRef.current = autoScroll;

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#111827",
        foreground: "#d1d5db",
        cursor: "#60a5fa",
        selectionBackground: "#374151",
      },
      fontFamily: "var(--font-geist-mono), monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 50000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[1;34m╔════════════════════════════════════════╗\x1b[0m");
    term.writeln("\x1b[1;34m║  UNAL Flash Tool — Serial Terminal     ║\x1b[0m");
    term.writeln("\x1b[1;34m╚════════════════════════════════════════╝\x1b[0m");
    term.writeln("\x1b[90mClick 'Connect' to select a serial port.\x1b[0m");
    term.writeln("\x1b[90mUse the input bar below to send commands.\x1b[0m");
    term.writeln("");

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(terminalRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  // Cleanup on unmount: close serial connection to release the port
  useEffect(() => {
    return () => {
      const manager = SerialManager.getInstance();
      if (manager.isConnected) {
        manager.close().catch(() => {});
      }
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    };
  }, []);

  const writeToTerminal = useCallback(
    (data: Uint8Array) => {
      const term = xtermRef.current;
      if (!term) return;

      const ts = timestampsRef.current;
      const mode = displayModeRef.current;

      if (mode === "hex") {
        // Hex view: 16 bytes per line
        for (let i = 0; i < data.length; i += 16) {
          const chunk = data.slice(i, Math.min(i + 16, data.length));
          const line = formatHexLine(chunk);
          const output = ts
            ? `\x1b[90m[${getTimestamp()}]\x1b[0m ${line}`
            : line;
          term.writeln(output);
          logBufferRef.current.push(
            ts ? `[${getTimestamp()}] ${line}` : line
          );
        }
      } else {
        // Text view
        const text = new TextDecoder().decode(data);
        if (ts) {
          // Add timestamps to each newline-delimited segment
          const lines = text.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const seg = lines[i];
            if (i === 0 && seg === "") continue;
            if (seg !== "" || i < lines.length - 1) {
              const prefix = `\x1b[90m[${getTimestamp()}]\x1b[0m `;
              term.write(prefix + seg + (i < lines.length - 1 ? "\n" : ""));
              logBufferRef.current.push(`[${getTimestamp()}] ${seg}`);
            }
          }
        } else {
          term.write(data);
          logBufferRef.current.push(text);
        }
      }

      if (autoScrollRef.current) {
        term.scrollToBottom();
      }
    },
    []
  );

  const handleConnect = useCallback(async () => {
    const manager = SerialManager.getInstance();
    const term = xtermRef.current;
    if (!term) return;

    try {
      await manager.requestPort();
      await manager.open({ baudRate });

      // Clean up previous listeners
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];

      unsubsRef.current.push(
        manager.on("data", (data) => {
          if (data instanceof Uint8Array) {
            writeToTerminal(data);
            const stats = manager.getStats();
            setBytesReceived(stats.bytesReceived);
          }
        })
      );

      unsubsRef.current.push(
        manager.on("disconnect", () => {
          setIsConnected(false);
          term.writeln("\r\n\x1b[31m[Disconnected]\x1b[0m");
        })
      );

      unsubsRef.current.push(
        manager.on("error", (err) => {
          if (err instanceof Error) {
            term.writeln(`\r\n\x1b[31m[Error]\x1b[0m ${err.message}`);
          }
        })
      );

      setIsConnected(true);
      setBytesReceived(0);
      setBytesSent(0);

      const info = manager.getPortInfo();
      term.writeln(
        `\x1b[32m[Connected]\x1b[0m ${manager.getDeviceName()} @ ${baudRate} baud`
      );
      if (info?.usbVendorId) {
        term.writeln(
          `\x1b[90mVendor: 0x${info.usbVendorId.toString(16).padStart(4, "0")} Product: 0x${(info.usbProductId ?? 0).toString(16).padStart(4, "0")}\x1b[0m`
        );
      }
    } catch (err) {
      term.writeln(
        `\r\n\x1b[31m[Error]\x1b[0m ${err instanceof Error ? err.message : "Connection failed"}`
      );
    }
  }, [baudRate, writeToTerminal]);

  const handleDisconnect = useCallback(async () => {
    const manager = SerialManager.getInstance();
    await manager.close();
    setIsConnected(false);
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
  }, []);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
    logBufferRef.current = [];
  }, []);

  const handleExportLog = useCallback(() => {
    const content = logBufferRef.current.join("");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serial-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDtr = useCallback(
    async (checked: boolean) => {
      setDtr(checked);
      if (isConnected) {
        await SerialManager.getInstance().setSignals(checked, rts);
      }
    },
    [isConnected, rts]
  );

  const handleRts = useCallback(
    async (checked: boolean) => {
      setRts(checked);
      if (isConnected) {
        await SerialManager.getInstance().setSignals(dtr, checked);
      }
    },
    [isConnected, dtr]
  );

  const handleResetDevice = useCallback(async () => {
    const term = xtermRef.current;
    try {
      await SerialManager.getInstance().resetDevice();
      term?.writeln("\x1b[33m[Reset]\x1b[0m Device reset triggered");
    } catch (err) {
      term?.writeln(
        `\x1b[31m[Error]\x1b[0m Reset failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }, []);

  const handleSendCommand = useCallback(
    async (cmd: string) => {
      if (!cmd || !isConnected) return;
      const manager = SerialManager.getInstance();
      const suffix = lineEndingSuffix(lineEnding);
      await manager.write(cmd + suffix);
      const stats = manager.getStats();
      setBytesSent(stats.bytesSent);

      setCommandHistory((prev) => {
        const filtered = prev.filter((c) => c !== cmd);
        return [cmd, ...filtered].slice(0, 50);
      });
      setHistoryIndex(-1);
      setCommandInput("");
    },
    [isConnected, lineEnding]
  );

  const handleCommandKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSendCommand(commandInput);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = Math.min(prev + 1, commandHistory.length - 1);
          if (next >= 0) setCommandInput(commandHistory[next]);
          return next;
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = Math.max(prev - 1, -1);
          setCommandInput(next >= 0 ? commandHistory[next] : "");
          return next;
        });
      }
    },
    [commandInput, commandHistory, handleSendCommand]
  );

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Toolbar */}
      <SerialToolbar
        isConnected={isConnected}
        baudRate={baudRate}
        dtr={dtr}
        rts={rts}
        autoScroll={autoScroll}
        timestamps={timestamps}
        displayMode={displayMode}
        lineEnding={lineEnding}
        bytesReceived={bytesReceived}
        bytesSent={bytesSent}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onBaudRateChange={setBaudRate}
        onDtrChange={handleDtr}
        onRtsChange={handleRts}
        onAutoScrollChange={setAutoScroll}
        onTimestampsChange={setTimestamps}
        onDisplayModeChange={setDisplayMode}
        onLineEndingChange={setLineEnding}
        onClear={handleClear}
        onExportLog={handleExportLog}
        onResetDevice={handleResetDevice}
      />

      {/* Terminal */}
      <div className="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div ref={terminalRef} className="h-full w-full" />
      </div>

      {/* Command input bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <span className="px-3 text-gray-500 text-sm select-none">{">"}</span>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleCommandKeyDown}
            placeholder={isConnected ? "Type a command and press Enter..." : "Connect to send commands"}
            disabled={!isConnected}
            className="flex-1 bg-transparent text-gray-200 text-sm py-2 pr-3 outline-none placeholder:text-gray-600 disabled:opacity-50 font-mono"
          />
        </div>
        <button
          onClick={() => handleSendCommand(commandInput)}
          disabled={!isConnected || !commandInput}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
