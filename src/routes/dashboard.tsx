import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RequireAuth from "@/components/RequireAuth";
import { FaTint, FaBolt, FaChartLine } from "react-icons/fa";
import { useAuth } from "@/hooks/useAuth";
import { getJson } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Water Management System" },
      { name: "description", content: "Household water system overview and navigation." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

type TrendResponse = { success: boolean; labels?: string[]; data?: number[] };

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <div
      className="relative overflow-hidden bg-gray-900/70 border border-gray-700 
                 rounded-2xl p-6 backdrop-blur-lg shadow-xl h-full 
                 transition duration-200 
                 active:bg-gray-800/90 active:shadow-[0_0_20px_rgba(0,255,255,0.6)]"
    >
      <div
        className={`absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-30 ${tone}`}
      ></div>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl grid place-items-center ${tone}`}>{icon}</div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-3xl font-bold text-white transition-all duration-300">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-4 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [labels, setLabels] = useState<string[]>([]);
  const [data, setData] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const t = await getJson<TrendResponse>("usage-trend");
        if (cancelled) return;
        setLabels(Array.isArray(t.labels) ? t.labels : []);
        setData(Array.isArray(t.data) ? t.data.map((v) => Math.max(0, v)) : []);
      } catch {
        if (!cancelled) {
          setLabels([]);
          setData([]);
        }
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

  const totalLitres = data.reduce((s, v) => s + v, 0);
  const avgLitres = data.length ? Math.round(totalLitres / data.length) : 0;
  const hasData = data.length > 0;
  const peakValue = hasData ? Math.max(...data) : 0;
  const peakDate = hasData ? labels[data.indexOf(peakValue)] : undefined;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {/* Title with refined horizontal scroll */}
        <div className="overflow-hidden mb-6 text-center">
          <h1
            className="text-4xl font-extrabold text-transparent bg-clip-text 
            bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 
            animate-titleMarquee inline-block whitespace-nowrap marquee-mask"
          >
            Automated Household Water Management System
          </h1>

          {/* Centered water drop + line */}
          <div className="flex flex-col items-center mt-6">
            <FaTint className="text-teal-400 text-5xl animate-bounce" />
            <div className="mt-3 w-32 h-1 bg-gradient-to-r from-teal-500 via-blue-500 to-purple-600 rounded-full"></div>
            <p className="mt-2 text-sm text-gray-400 italic">Flow Smart • Save More</p>
          </div>
        </div>

        {/* Greeting */}
        <div className="mb-6">
          <p className="text-sm text-gray-400">Welcome back,</p>
          <p className="text-lg font-semibold text-white">{user?.email}</p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto mb-6">
          <Kpi
            icon={<FaChartLine className="text-white text-lg" />}
            label="Daily average"
            value={`${avgLitres} L`}
            hint={peakDate ? `Peak day: ${peakDate}` : "—"}
            tone="bg-gradient-to-br from-blue-500 to-purple-600"
          />
          <Kpi
            icon={<FaBolt className="text-white text-lg" />}
            label="Peak usage"
            value={`${peakValue} L`}
            hint={peakDate ?? "No data yet"}
            tone="bg-gradient-to-br from-purple-500 to-pink-600"
          />
        </div>

        {/* Overview panel */}
        <div
          className="bg-gray-900/80 backdrop-blur-lg p-6 rounded-xl shadow-lg border border-gray-700 
                        max-w-3xl mx-auto transition duration-200 
                        active:bg-gray-800/90 active:shadow-[0_0_25px_rgba(0,255,255,0.6)]"
        >
          <h2 className="text-lg font-semibold text-white mb-2 text-center">System overview</h2>
          <p className="text-gray-300 text-sm leading-relaxed text-center">
            Monitor household water usage and trends in one place. Use the sidebar to access
            reports, leakage events, and settings quickly.
          </p>
        </div>
      </main>
    </div>
  );
}
