import { createFileRoute } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getJson } from "@/lib/api";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "Usage — Water Management System" },
      { name: "description", content: "Track your water usage per room and period." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <UsagePage />
    </RequireAuth>
  ),
});

type UsageResponse = {
  success: boolean;
  period: string;
  kitchen: number;
  washroom: number;
  overall: number;
};

function UsagePage() {
  const [period, setPeriod] = useState("current");
  const [kitchenUsage, setKitchenUsage] = useState(0);
  const [washroomUsage, setWashroomUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async (p: string) => {
    setLoading(true);
    try {
      const r = await getJson<UsageResponse>("usage", { period: p });
      if (r.success) {
        setKitchenUsage(r.kitchen);
        setWashroomUsage(r.washroom);
        setError(null);
      } else {
        setError("Unable to load usage data.");
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsage("current");
  }, []);

  const handleCheckUsage = () => {
    void loadUsage(period);
  };

  const overallUsage = kitchenUsage + washroomUsage;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
      <Sidebar />
      <div className="flex-1 p-4 sm:p-6 md:p-10">
        <div className="w-full max-w-6xl mx-auto space-y-6 sm:space-y-10">
          <div className="text-center space-y-2">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text 
              bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 tracking-tight drop-shadow-lg"
            >
              AquaTrack • Smart Water Insights
            </h2>
            <p className="text-gray-400 italic text-lg">💧 Flow Smart • Save More • Live Better</p>
            {error && <p className="text-rose-400 text-sm">{error}</p>}
          </div>

          <div className="bg-gray-900/80 rounded-2xl shadow-2xl border border-gray-700 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <label className="block text-gray-300 font-medium mb-2">Select Period:</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-gray-800 text-gray-200 p-3 rounded-md focus:ring-2 focus:ring-teal-400"
              >
                <option value="current">Today (Current)</option>
                <option value="week">This Week</option>
                <option value="lastWeek">Last Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
            <button
              onClick={handleCheckUsage}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-lg font-semibold transform hover:scale-105 transition disabled:opacity-60"
            >
              {loading ? "Loading…" : "Show Usage"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 hover:shadow-teal-500/30 transition transform hover:-translate-y-1">
              <h3 className="text-xl font-bold text-teal-400 mb-4">Kitchen</h3>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      stroke="#2dd4bf"
                      strokeWidth="10"
                      fill="none"
                      strokeDasharray="283"
                      strokeDashoffset={283 - (Math.min(kitchenUsage, 2500) / 2500) * 283}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold">
                    {kitchenUsage}L
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-4 text-center">Water used in kitchen</p>
            </div>

            <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 hover:shadow-blue-500/30 transition transform hover:-translate-y-1">
              <h3 className="text-xl font-bold text-blue-400 mb-4">Washroom</h3>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      stroke="#3b82f6"
                      strokeWidth="10"
                      fill="none"
                      strokeDasharray="283"
                      strokeDashoffset={283 - (Math.min(washroomUsage, 2500) / 2500) * 283}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold">
                    {washroomUsage}L
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-4 text-center">Water used in washroom</p>
            </div>

            <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 hover:shadow-purple-500/30 transition transform hover:-translate-y-1">
              <h3 className="text-xl font-bold text-purple-400 mb-4">Overall</h3>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      stroke="#a855f7"
                      strokeWidth="10"
                      fill="none"
                      strokeDasharray="283"
                      strokeDashoffset={283 - (Math.min(overallUsage, 5000) / 5000) * 283}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold">
                    {overallUsage}L
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-4 text-center">Total household usage</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
