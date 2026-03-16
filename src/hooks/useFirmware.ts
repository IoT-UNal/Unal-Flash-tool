"use client";

import { useState, useEffect, useCallback } from "react";
import { FirmwareService } from "@/lib/firmware/FirmwareService";
import type { FirmwareRelease } from "@/lib/firmware/types";

export function useFirmware() {
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = new FirmwareService();

  const fetchReleases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.listReleases();
      setReleases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch firmware");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const downloadBinary = useCallback(
    async (assetId: number) => {
      return service.downloadBinary(assetId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { releases, loading, error, fetchReleases, downloadBinary };
}
