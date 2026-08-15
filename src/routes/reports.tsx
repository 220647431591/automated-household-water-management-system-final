import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import { useEffect, useState, useRef } from "react";
import { FaHome } from "react-icons/fa";
import Sidebar from "@/components/Sidebar";
import { getJson } from "@/lib/api";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Water Management System" },
      { name: "description", content: "Real-time system performance report and recommendations." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Reports />
    </RequireAuth>
  ),
});

type ReportResponse = {
  success: boolean;
  lastUpdated: string | null;
  usage: { today: number; week: number; month: number; baseline: number };
  leakage: {
    totalVolume: number;
    events: number;
    percentage: number | null;
    currentStatus: "No Leak" | "Low" | "Medium" | "High" | "Critical";
  };
  valve: {
    currentStatus: "Open" | "Closed";
    successfulClosures: number;
    responseSuccessRate: number | null;
  };
  efficiency: "Excellent" | "Good" | "Moderate" | "Poor";
  recommendations: string[];
};

const leakStatusColor: Record<string, string> = {
  "No Leak": "bg-green-600",
  Low: "bg-sky-500",
  Medium: "bg-yellow-500",
  High: "bg-orange-600",
  Critical: "bg-red-600",
};

const efficiencyColor: Record<string, string> = {
  Excellent: "bg-green-600",
  Good: "bg-sky-500",
  Moderate: "bg-yellow-500",
  Poor: "bg-red-600",
};

function Reports() {
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await getJson<ReportResponse>("reports");
        if (cancelled) return;
        if (r.success) {
          setReport(r);
          setError(null);
          hasLoadedRef.current = true;
        } else if (!hasLoadedRef.current) {
          setError("Unable to load the report.");
        }
      } catch {
        if (!cancelled && !hasLoadedRef.current) setError("Unable to reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    // Poll so the report reflects new ESP32 data / leak events automatically,
    // the same way the Dashboard refreshes its live figures.
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const fmt = (n: number) => `${Number.isFinite(n) ? n.toFixed(1).replace(/\.0$/, "") : "0"} L`;
  const lastUpdatedLabel = report?.lastUpdated
    ? new Date(report.lastUpdated.replace(" ", "T")).toLocaleString()
    : "No data recorded yet";

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
      <Sidebar />
      <div className="flex-1 p-4 sm:p-6 md:p-10">
        <div className="mb-6 sm:mb-10 text-center">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text 
            bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 
            animate-pulse drop-shadow-lg tracking-wide"
          >
            🔴 LIVE System Performance Report
          </h2>
          <p className="text-gray-400 italic mt-2">
            Real‑time overview of usage, leakage, and efficiency
          </p>
          <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdatedLabel}</p>
        </div>

        {loading && (
          <p className="text-center text-gray-400 max-w-5xl mx-auto">Loading live report…</p>
        )}
        {!loading && error && (
          <p className="text-center text-rose-400 max-w-5xl mx-auto">{error}</p>
        )}

        {!loading && !error && report && (
          <>
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <div
                className="bg-gradient-to-br from-gray-900 via-gray-800 to-black 
                rounded-2xl shadow-xl border border-blue-600/30 p-6 
                transition duration-300 ease-in-out hover:shadow-blue-500/50 hover:scale-105 hover:bg-gradient-to-tr hover:from-blue-900 hover:via-gray-900 hover:to-black"
              >
                <h3 className="text-xl font-bold text-cyan-400 mb-4">Water Usage Overview</h3>
                <p>
                  Today: <span className="font-bold text-blue-300 transition-all duration-300">{fmt(report.usage.today)}</span>
                </p>
                <p>
                  This Week:{" "}
                  <span className="font-bold text-blue-300 transition-all duration-300">{fmt(report.usage.week)}</span>
                </p>
                <p>
                  This Month:{" "}
                  <span className="font-bold text-blue-300 transition-all duration-300">{fmt(report.usage.month)}</span>
                </p>
              </div>

              <div
                className="bg-gradient-to-br from-gray-900 via-gray-800 to-black 
                rounded-2xl shadow-xl border border-rose-600/30 p-6 
                transition duration-300 ease-in-out hover:shadow-rose-500/50 hover:scale-105 hover:bg-gradient-to-tr hover:from-rose-900 hover:via-gray-900 hover:to-black"
              >
                <h3 className="text-xl font-bold text-rose-400 mb-4">Leakage Overview</h3>
                <p>
                  Total Leakage (this month):{" "}
                  <span className="font-bold text-rose-300 transition-all duration-300">{fmt(report.leakage.totalVolume)}</span>
                </p>
                <p>
                  Events (this month):{" "}
                  <span className="font-bold text-rose-300 transition-all duration-300">{report.leakage.events}</span>
                </p>
                <p>
                  Leakage Percentage:{" "}
                  <span className="font-bold text-rose-300 transition-all duration-300">
                    {report.leakage.percentage === null ? "—" : `${report.leakage.percentage}%`}
                  </span>{" "}
                  of monthly usage
                </p>
                <p className="flex items-center gap-2 mt-2">
                  Current Status:
                  <span
                    className={`px-3 py-1 rounded text-sm font-bold text-white ${leakStatusColor[report.leakage.currentStatus] ?? "bg-gray-600"}`}
                  >
                    {report.leakage.currentStatus}
                  </span>
                </p>
              </div>

              <div
                className="bg-gradient-to-br from-gray-900 via-gray-800 to-black 
                rounded-2xl shadow-xl border border-emerald-600/30 p-6 md:col-span-2
                transition duration-300 ease-in-out hover:shadow-emerald-500/50 hover:scale-105 hover:bg-gradient-to-tr hover:from-emerald-900 hover:via-gray-900 hover:to-black"
              >
                <h3 className="text-xl font-bold text-emerald-400 mb-4">Valve Overview</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <p className="flex items-center gap-2">
                    Current Valve Status:
                    <span
                      className={`px-3 py-1 rounded text-sm font-bold text-white ${report.valve.currentStatus === "Open" ? "bg-green-600" : "bg-red-600"}`}
                    >
                      {report.valve.currentStatus}
                    </span>
                  </p>
                  <p>
                    Automatic Closures:{" "}
                    <span className="font-bold text-emerald-300 transition-all duration-300">
                      {report.valve.successfulClosures}
                    </span>
                  </p>
                  <p>
                    Response Success Rate:{" "}
                    <span className="font-bold text-emerald-300 transition-all duration-300">
                      {report.valve.responseSuccessRate === null
                        ? "—"
                        : `${report.valve.responseSuccessRate}%`}
                    </span>
                  </p>
                </div>
              </div>

              <div
                className="bg-gradient-to-br from-gray-900 via-gray-800 to-black 
                rounded-2xl shadow-xl border border-yellow-600/30 p-6 md:col-span-2 
                transition duration-300 ease-in-out hover:shadow-yellow-500/50 hover:scale-105 hover:bg-gradient-to-tr hover:from-yellow-900 hover:via-gray-900 hover:to-black"
              >
                <h3 className="text-xl font-bold text-yellow-400 mb-4">System Performance</h3>
                <p className="flex items-center gap-2">
                  Overall Efficiency:
                  <span
                    className={`px-3 py-1 rounded text-sm font-bold text-white ${efficiencyColor[report.efficiency] ?? "bg-gray-600"}`}
                  >
                    {report.efficiency}
                  </span>
                </p>
              </div>
            </div>

            <div
              className="mt-10 bg-gray-800/60 rounded-xl p-6 border border-gray-700 max-w-5xl mx-auto 
              transition duration-300 ease-in-out hover:shadow-cyan-500/50 hover:scale-105 hover:bg-gradient-to-tr hover:from-cyan-900 hover:via-gray-900 hover:to-black"
            >
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Recommendations</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                {report.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="flex justify-end mt-6 max-w-5xl mx-auto">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard" })}
            className="px-3 py-1 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-600 transition flex items-center gap-1"
          >
            <FaHome /> Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
