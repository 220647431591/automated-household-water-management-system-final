import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  FaHome,
  FaTint,
  FaExclamationTriangle,
  FaFileAlt,
  FaCog,
  FaSignOutAlt,
  FaChartLine,
  FaBars,
  FaTimes,
} from "react-icons/fa";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

type NavItem = {
  label: string;
  icon: React.ReactNode;
  path?: string;
  action?: "logout";
  grey?: boolean;
};

const Sidebar = () => {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  // Mobile-only off-canvas drawer state. Desktop layout/behavior below is
  // unchanged from before — this only controls the new mobile drawer.
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { label: "Dashboard", icon: <FaHome />, path: "/dashboard" },
    { label: "Usage", icon: <FaTint />, path: "/usage" },
    { label: "Leakage", icon: <FaExclamationTriangle />, path: "/leakage" },
    { label: "Reports", icon: <FaFileAlt />, path: "/reports" },
    { label: "Usage Trend", icon: <FaChartLine />, path: "/usage-trend" },
    { label: "Settings", icon: <FaCog />, path: "/settings" },
    { label: "Logout", icon: <FaSignOutAlt />, action: "logout", grey: true },
  ];

  const handleNavClick = async (item: NavItem) => {
    if (item.action === "logout") {
      await signOut();
      navigate({ to: "/" });
    } else if (item.path) {
      navigate({ to: item.path });
    }
    // Close the mobile drawer after any navigation so it doesn't stay open
    // over the newly-loaded page. No-op on desktop (drawer isn't used there).
    setMobileOpen(false);
  };

  const renderNavItems = (collapsedLabels: boolean) =>
    navItems.map((item, idx) => {
      const isActive = pathname === item.path;
      const baseColor = item.grey
        ? "bg-gray-700 hover:bg-gray-600"
        : "bg-gray-800 hover:bg-gray-700";
      const activeColor = item.grey
        ? "bg-gray-600"
        : "bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white";

      return (
        <button
          key={idx}
          onClick={() => handleNavClick(item)}
          className={`w-full flex items-center space-x-3 py-2 px-4 rounded transition ${
            isActive ? activeColor : baseColor
          }`}
        >
          {item.icon}
          {!collapsedLabels && <span>{item.label}</span>}
        </button>
      );
    });

  return (
    <>
      {/* Mobile top bar (hamburger) — replaces the sidebar's horizontal
          space on small screens so page content gets the full width
          instead of being squeezed beside a fixed-width sidebar. */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-4 py-3">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="text-teal-400 hover:text-blue-400 transition text-xl p-1"
        >
          <FaBars />
        </button>
        <h2 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600">
          Water System
        </h2>
        <span className="w-6" aria-hidden="true" />
      </div>

      {/* Mobile off-canvas drawer + backdrop. Only ever mounted while open,
          and only relevant below the md breakpoint. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] h-full overflow-y-auto bg-gradient-to-b from-gray-900 via-black to-gray-800 p-6 border-r border-gray-700">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600">
                Water System
              </h2>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-teal-400 hover:text-blue-400 transition text-xl"
              >
                <FaTimes />
              </button>
            </div>
            <nav className="space-y-3">{renderNavItems(false)}</nav>
          </aside>
        </div>
      )}

      {/* Desktop sidebar — identical markup/behavior to before (including
          the existing collapse toggle), just hidden below md so it doesn't
          also render on mobile. */}
      <aside
        className={`hidden md:block ${
          collapsed ? "w-20" : "w-64"
        } bg-gradient-to-b from-gray-900 via-black to-gray-800 p-6 border-r border-gray-700 transition-all duration-300`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mb-6 text-teal-400 hover:text-blue-400 transition"
        >
          <FaBars />
        </button>

        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 mb-6">
          {collapsed ? "WS" : "Water System"}
        </h2>

        <nav className="space-y-3">{renderNavItems(collapsed)}</nav>
      </aside>
    </>
  );
};

export default Sidebar;
