"use client";

import { useState, useCallback, useRef } from "react";
import { FlashManager } from "@/lib/flash/FlashManager";
import type {
  ChipInfo,
  FlashSegment,
  FlashOptions,
  FlashProgress,
  FlashError,
} from "@/lib/flash/types";
import { classifyFlashError } from "@/lib/flash/types";

export function useFlash() {
  const flashRef = useRef<FlashManager | null>(null);
  const [chipInfo, setChipInfo] = useState<ChipInfo | null>(null);
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<FlashError | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const connect = useCallback(
    async (port: SerialPort) => {
      setError(null);
      try {
        flashRef.current = new FlashManager(addLog, setProgress);
        const info = await flashRef.current.connect(port);
        setChipInfo(info);
        setIsConnected(true);
        return info;
      } catch (err) {
        const classified = classifyFlashError(
          err instanceof Error ? err : new Error(String(err))
        );
        setError(classified);
        throw err;
      }
    },
    [addLog]
  );

  const flash = useCallback(
    async (segments: FlashSegment[], options?: Partial<FlashOptions>) => {
      if (!flashRef.current) throw new Error("Not connected");
      setError(null);
      try {
        await flashRef.current.flash(segments, options);
      } catch (err) {
        const classified = classifyFlashError(
          err instanceof Error ? err : new Error(String(err))
        );
        setError(classified);
        throw err;
      }
    },
    []
  );

  const eraseFlash = useCallback(async () => {
    if (!flashRef.current) throw new Error("Not connected");
    setError(null);
    try {
      await flashRef.current.eraseFlash();
    } catch (err) {
      const classified = classifyFlashError(
        err instanceof Error ? err : new Error(String(err))
      );
      setError(classified);
      throw err;
    }
  }, []);

  const buildSegments = useCallback(
    (appData: string, bootloaderData?: string, partitionData?: string) => {
      if (!flashRef.current) throw new Error("Not connected");
      return flashRef.current.buildSegments(appData, bootloaderData, partitionData);
    },
    []
  );

  const getBootloaderOffset = useCallback((): number => {
    if (!flashRef.current) return 0x1000;
    return flashRef.current.getBootloaderOffset();
  }, []);

  const disconnect = useCallback(async () => {
    if (flashRef.current) {
      await flashRef.current.disconnect();
    }
    setChipInfo(null);
    setIsConnected(false);
    setError(null);
    flashRef.current = null;
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    chipInfo,
    progress,
    logs,
    isConnected,
    error,
    connect,
    flash,
    eraseFlash,
    buildSegments,
    getBootloaderOffset,
    disconnect,
    clearLogs,
    clearError,
  };
}
