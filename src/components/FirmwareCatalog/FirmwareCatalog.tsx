"use client";

import { useEffect } from "react";
import { useFirmware } from "@/hooks/useFirmware";

export default function FirmwareCatalog() {
  const { releases, loading, error, fetchReleases, downloadBinary } = useFirmware();

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchReleases()}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <p className="text-sm text-gray-500">
          {releases.length} {releases.length === 1 ? "release" : "releases"} found
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* No releases */}
      {!loading && releases.length === 0 && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-gray-400 mt-4">No firmware releases found.</p>
          <p className="text-gray-500 text-sm mt-1">
            Configure GITHUB_REPO in .env to connect to your firmware repository.
          </p>
        </div>
      )}

      {/* Release Cards */}
      <div className="space-y-4">
        {releases.map((release) => (
          <div
            key={release.id}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-medium">{release.name || release.tagName}</h3>
                  <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded-full border border-blue-800/50">
                    {release.tagName}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  Published {new Date(release.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Assets */}
            {release.assets.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-xs uppercase text-gray-500 tracking-wider">Assets</h4>
                {release.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <p className="text-gray-300 text-sm">{asset.name}</p>
                        <p className="text-gray-600 text-xs">
                          {(asset.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadBinary(asset.id)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
