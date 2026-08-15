import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import { FaHome } from "react-icons/fa";
import Sidebar from "@/components/Sidebar";
import { getJson } from "@/lib/api";

export const Route = createFileRoute("/leakage")({
  head: () => ({
    meta: [
      { title: "Leakage Events — Water Management System" },
      { name: "description", content: "Detect and monitor water leakage events in real time." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Leakage />
    </RequireAuth>
  ),
});

type LeakageEvent = { id: number; volume: number; time: string; valveStatus: string };
type LeakageResponse = { success: boolean; period: string; events: LeakageEvent[] };

function Leakage() {
  const [period, setPeriod] = useState("latest");
  const [leakageEvents, setLeakageEvents] = useState<LeakageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchLeakage = async (selectedPeriod: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const r = await getJson<LeakageResponse>("leakage", { period: selectedPeriod });
      if (r.success) {
        // Always safe to apply on success, silent or not — this is exactly
        // the "replace data smoothly once the response arrives" case.
        setLeakageEvents(r.events ?? []);
        setError(null);
      } else if (!opts.silent) {
        setError("Unable to load leakage events.");
      }
    } catch {
      // A silent background poll that fails should never wipe the
      // currently-visible events or button state — just try again next tick.
      if (!opts.silent) setError("Unable to reach the server.");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  const handleFilter = (selectedPeriod: string) => {
    setPeriod(selectedPeriod);
    void fetchLeakage(selectedPeriod);
  };

  useEffect(() => {
    void fetchLeakage("latest");
  }, []);

  // Keep the currently selected period live, the same way Dashboard/Reports/
  // Settings/Usage-Trend already auto-refresh — otherwise a real leak event
  // from the ESP32 wouldn't show up here until the user manually re-clicked
  // a filter button. Runs silently so it never touches the loading/disabled
  // button state or clears the table on a hiccup.
  useEffect(() => {
    const id = setInterval(() => {
      void fetchLeakage(period, { silent: true });
    }, 2000);
    return () => clearInterval(id);
  }, [period]);

  // The leakage API orders by detected_at DESC (newest first). "Latest" returns
  // only that single most recent event; "Today"/"This Week"/"This Month"
  // each return every matching record for that window, newest first.
  const hasEvents = leakageEvents.length > 0;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
      <Sidebar />
      <div className="flex-1 p-4 sm:p-6 md:p-10">
        <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-10">
          <div className="text-center space-y-2">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text 
              bg-gradient-to-r from-rose-500 via-fuchsia-600 to-purple-700 tracking-tight drop-shadow-[0_0_15px_rgba(255,0,150,0.7)]"
            >
              ⚠️ Leakage Events
            </h2>
            <p className="text-gray-400 italic text-lg">Monitor leaks • Act fast • Save water</p>
            {error && <p className="text-rose-400 text-sm">{error}</p>}
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {["latest", "today", "week", "month"].map((p) => (
              <button
                key={p}
                onClick={() => void handleFilter(p)}
                disabled={loading}
                className={`px-6 py-3 rounded-lg font-semibold transition transform hover:scale-105 disabled:opacity-60
                  ${
                    period === p
                      ? "bg-gradient-to-r from-rose-500 via-pink-600 to-purple-700 text-white shadow-lg shadow-pink-500/50"
                      : "bg-gray-800 text-gray-300 hover:bg-gradient-to-r hover:from-gray-700 hover:to-gray-600"
                  }`}
              >
                {p === "latest"
                  ? "Latest Leakage"
                  : p === "today"
                    ? "Today"
                    : p === "week"
                      ? "This Week"
                      : "This Month"}
              </button>
            ))}
          </div>

          {!loading && !hasEvents && !error && (
            <p className="text-center text-gray-400">No leakage events recorded for this period.</p>
          )}

          {hasEvents && (
            <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl shadow-2xl border border-pink-600/40 p-6 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left border-collapse">
                <thead>
                  <tr className="text-pink-400 border-b border-gray-700">
                    <th className="p-3">Time</th>
                    <th className="p-3">Volume (Liters)</th>
                    <th className="p-3">Valve Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leakageEvents.map((event) => (
                    <tr
                      key={event.id}
                      className="border-b border-gray-700 hover:bg-gradient-to-r hover:from-gray-800 hover:to-gray-700 transition"
                    >
                      <td className="p-3 text-cyan-300 font-semibold">{event.time}</td>
                      <td className="p-3 font-extrabold text-rose-400 drop-shadow-[0_0_8px_rgba(255,0,100,0.7)]">
                        {event.volume}
                      </td>
                      <td className="p-3 font-bold">
                        <span
                          className={
                            event.valveStatus === "Activated"
                              ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(0,255,150,0.7)]"
                              : "text-gray-400"
                          }
                        >
                          {event.valveStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
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
    </div>
  );
}
