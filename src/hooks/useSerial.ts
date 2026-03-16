"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SerialManager } from "@/lib/serial/SerialManager";
import type { SerialConfig, SerialState } from "@/lib/serial/types";

export function useSerial() {
  const managerRef = useRef<SerialManager | null>(null);
  const [state, setState] = useState<SerialState>("disconnected");
  const [deviceName, setDeviceName] = useState<string>("No device");
  const [isSupported, setIsSupported] = useState(false);
  const [portInfo, setPortInfo] = useState<SerialPortInfo | null>(null);
  const [stats, setStats] = useState({ bytesReceived: 0, bytesSent: 0, uptime: 0 });

  useEffect(() => {
    setIsSupported(SerialManager.isSupported());
    managerRef.current = SerialManager.getInstance();

    const manager = managerRef.current;
    const unsubs = [
      manager.on("connect", () => {
        setState("connected");
        setDeviceName(manager.getDeviceName());
        setPortInfo(manager.getPortInfo());
      }),
      manager.on("disconnect", () => {
        setState("disconnected");
        setDeviceName("No device");
        setPortInfo(null);
      }),
      manager.on("error", () => setState("error")),
    ];

    setState(manager.state);
    if (manager.isConnected) {
      setDeviceName(manager.getDeviceName());
      setPortInfo(manager.getPortInfo());
    }

    return () => unsubs.forEach((u) => u());
  }, []);

  // Poll stats while connected
  useEffect(() => {
    if (state !== "connected") return;
    const interval = setInterval(() => {
      const manager = managerRef.current;
      if (manager) setStats(manager.getStats());
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const connect = useCallback(async (config: SerialConfig) => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.requestPort();
    await manager.open(config);
  }, []);

  const disconnect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.close();
  }, []);

  const reconnect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.reconnect();
  }, []);

  const write = useCallback(async (data: string | Uint8Array) => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.write(data);
  }, []);

  const writeLine = useCallback(async (data: string) => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.writeLine(data);
  }, []);

  const setSignals = useCallback(async (dtr?: boolean, rts?: boolean) => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.setSignals(dtr, rts);
  }, []);

  const resetDevice = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.resetDevice();
  }, []);

  const enterBootloader = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.enterBootloader();
  }, []);

  return {
    state,
    deviceName,
    isSupported,
    isConnected: state === "connected",
    portInfo,
    stats,
    manager: managerRef.current,
    connect,
    disconnect,
    reconnect,
    write,
    writeLine,
    setSignals,
    resetDevice,
    enterBootloader,
  };
}
