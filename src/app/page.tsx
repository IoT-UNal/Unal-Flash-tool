"use client";

import Link from "next/link";
import { useSerial } from "@/hooks/useSerial";
import ArchitectureDiagram from "@/components/ArchitectureDiagram/ArchitectureDiagram";

export default function DashboardPage() {
  const { state, deviceName, isSupported } = useSerial();

  const quickActions = [
    {
      title: "Flash Device",
      description: "Flash firmware to an ESP32 device via USB",
      href: "/flash",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: "blue",
    },
    {
      title: "Serial Terminal",
      description: "Open a serial monitor for debugging",
      href: "/terminal",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: "green",
    },
    {
      title: "Firmware Manager",
      description: "Browse and manage firmware versions",
      href: "/firmware",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      color: "purple",
    },
    {
      title: "Credentials",
      description: "Configure WiFi, MQTT, API keys, and certificates",
      href: "/credentials",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
      color: "amber",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "border-blue-600/30 hover:border-blue-500/50 text-blue-400",
    green: "border-green-600/30 hover:border-green-500/50 text-green-400",
    purple: "border-purple-600/30 hover:border-purple-500/50 text-purple-400",
    amber: "border-amber-600/30 hover:border-amber-500/50 text-amber-400",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Flash, monitor, and manage your ESP32 devices from the browser.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Connection</p>
          <div className="flex items-center gap-2 mt-2">
            <div
              className={`w-3 h-3 rounded-full ${
                state === "connected"
                  ? "bg-green-500"
                  : state === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-gray-600"
              }`}
            />
            <span className="text-white font-medium capitalize">{state}</span>
          </div>
          <p className="text-gray-500 text-sm mt-1">{deviceName}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Web Serial API</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-3 h-3 rounded-full ${isSupported ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-white font-medium">
              {isSupported ? "Supported" : "Not Supported"}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {isSupported ? "Chrome/Edge detected" : "Use Chrome or Edge 89+"}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Platform</p>
          <p className="text-white font-medium mt-2">Zephyr RTOS</p>
          <p className="text-gray-500 text-sm mt-1">ESP32 / S3 / C3 / C6</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group bg-gray-900 border rounded-xl p-5 flex items-start gap-4 transition-all hover:bg-gray-800/50 ${colorMap[action.color]}`}
            >
              <div className="mt-0.5">{action.icon}</div>
              <div>
                <h3 className="text-white font-medium group-hover:text-blue-300 transition-colors">
                  {action.title}
                </h3>
                <p className="text-gray-500 text-sm mt-1">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Architecture</h2>
        <ArchitectureDiagram />
      </div>
    </div>
  );
}
