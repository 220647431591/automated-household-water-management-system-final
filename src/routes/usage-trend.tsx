import { createFileRoute } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { getJson } from "@/lib/api";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export const Route = createFileRoute("/usage-trend")({
  head: () => ({
    meta: [
      { title: "Usage Trend — Water Management System" },
      { name: "description", content: "Weekly water usage trend and quick insights." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <UsageTrend />
    </RequireAuth>
  ),
});

type TrendResponse = { success: boolean; labels: string[]; data: number[] };

function UsageTrend() {
  const [labels, setLabels] = useState<string[]>([]);
  const [data, setData] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await getJson<TrendResponse>("usage-trend");
        if (cancelled) return;
        if (r.success) {
          setLabels(r.labels ?? []);
          // ✅ clamp negatives to 0
          setData((r.data ?? []).map((v) => Math.max(0, v)));
          setError(null);
          hasLoadedRef.current = true;
        } else if (!hasLoadedRef.current) {
          // Only surface this before we've ever shown real data — once the
          // chart has loaded successfully once, a later bad response just
          // gets ignored and the last-good chart stays on screen.
          setError("Unable to load usage trend.");
        }
      } catch {
        if (!cancelled && !hasLoadedRef.current) setError("Unable to reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const usageData = {
    labels,
    datasets: [
      {
        label: "Litres Used",
        data,
        borderColor: "#14b8a6",
        backgroundColor: "rgba(20, 184, 166, 0.25)",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: "#0d9488",
        pointBorderColor: "#0f766e",
      },
    ],
  };

  const options = {
    responsive: true,
    animation: false as const,
    plugins: {
      legend: {
        position: "top" as const,
        labels: { color: "white", font: { size: 14 } },
      },
      tooltip: {
        enabled: true,
        backgroundColor: "#1e293b",
        titleColor: "#38bdf8",
        bodyColor: "#f1f5f9",
      },
    },
    scales: {
      x: { ticks: { color: "white" }, grid: { color: "#334155" } },
      y: {
        ticks: { color: "white" },
        grid: { color: "#334155" },
        min: 0, // ✅ never below zero
      },
    },
  };

  const hasData = data.length > 0;
  const maxUsage = hasData ? Math.max(...data) : 0;
  const minUsage = hasData ? Math.min(...data) : 0;
  const maxDay = hasData ? labels[data.indexOf(maxUsage)] : "—";
  const minDay = hasData ? labels[data.indexOf(minUsage)] : "—";

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-900 text-white">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-teal-400 mb-6">Usage Trend</h1>

        {loading && <p className="text-gray-400">Loading live trend…</p>}
        {!loading && error && <p className="text-rose-400">{error}</p>}

        {!loading && !error && (
          <>
            <div
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-black 
              p-6 rounded-xl shadow-lg border border-gray-700 
              transition duration-300 ease-in-out hover:shadow-teal-500/50"
            >
              <Line data={usageData} options={options} />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div
                className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 
                transition duration-300 ease-in-out hover:shadow-green-500/40"
              >
                <h2 className="text-lg font-semibold text-green-400">📈 Highest Usage</h2>
                <p className="text-gray-300 mt-2">
                  {maxDay}: <span className="font-bold text-white transition-all duration-300">{maxUsage} L</span>
                </p>
              </div>

              <div
                className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 
                transition duration-300 ease-in-out hover:shadow-red-500/40"
              >
                <h2 className="text-lg font-semibold text-red-400">📉 Lowest Usage</h2>
                <p className="text-gray-300 mt-2">
                  {minDay}: <span className="font-bold text-white transition-all duration-300">{minUsage} L</span>
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
