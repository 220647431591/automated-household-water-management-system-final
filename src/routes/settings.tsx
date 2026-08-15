import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import { useState } from "react";
import {
  FaUser,
  FaLock,
  FaEnvelope,
  FaIdBadge,
  FaMapMarkerAlt,
  FaDownload,
  FaTrash,
  FaHome,
  FaBell,
} from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { getJson, postJson, downloadUrl } from "@/lib/api";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Water Management System" },
      { name: "description", content: "Manage your profile, password, exports, and account." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  ),
});

type SimpleResponse = { success?: boolean; message?: string };

function Settings() {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const [name, setName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [notifEmail, setNotifEmail] = useState("");
  const [notifyLeakage, setNotifyLeakage] = useState(true);
  const [notifHistory, setNotifHistory] = useState<
    Array<{
      id: number;
      recipient: string;
      status: string;
      message: string;
      time: string;
      severity: string | null;
      volume: number | null;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Populate the Profile tab from the logged-in user's real database record
  // (via useAuth -> /api/me) instead of placeholder defaults.
  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setHouseholdId(user.householdId ?? "");
    setLocation(user.location ?? "");
    setEmail(user.email ?? "");
  }, [user]);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    (async () => {
      try {
        const d = await getJson<{
          success: boolean;
          notification_email?: string;
          notify_leakage?: number;
        }>("notification-settings");
        if (d.success) {
          setNotifEmail(d.notification_email ?? "");
          setNotifyLeakage(Boolean(d.notify_leakage));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    let cancelled = false;
    const loadHistory = async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setHistoryLoading(true);
      try {
        const h = await getJson<{ success: boolean; history?: typeof notifHistory }>(
          "notification-history",
          { limit: "10" },
        );
        if (!cancelled && h.success) setNotifHistory(h.history ?? []);
      } catch {
        /* A silent background poll failing here just tries again next tick —
           the currently-shown history list is left exactly as it was. */
      } finally {
        if (!opts.silent && !cancelled) setHistoryLoading(false);
      }
    };
    void loadHistory();
    // Refresh so a new leak alert (sent by the backend) shows up without a
    // manual reload — runs silently so it never re-shows the loading state.
    const id = setInterval(() => void loadHistory({ silent: true }), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTab]);

  const handleSaveNotifications = async () => {
    if (notifEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifEmail)) {
      toast.warn("⚠️ Please enter a valid notification email.", { position: "top-center" });
      return;
    }
    try {
      const d = await postJson<SimpleResponse>("notification-settings", {
        notification_email: notifEmail,
        notify_leakage: notifyLeakage ? "1" : "0",
      });
      if (d.success)
        toast.success("✅ Notification preferences saved.", { position: "top-center" });
      else toast.error("❌ " + (d.message ?? "Save failed"), { position: "top-center" });
    } catch (err) {
      toast.error("❌ " + (err instanceof Error ? err.message : String(err)), {
        position: "top-center",
      });
    }
  };

  const [testEmailSending, setTestEmailSending] = useState(false);

  const handleSendTestEmail = async () => {
    setTestEmailSending(true);
    try {
      const d = await postJson<{
        success?: boolean;
        sent?: boolean;
        to?: string;
        mail?: string;
        message?: string;
      }>("test-email", {});
      if (d.success && d.sent) {
        toast.success(`✅ Test email sent to ${d.to ?? "your notification address"}.`, {
          position: "top-center",
        });
      } else {
        toast.error("❌ " + (d.mail ?? d.message ?? "Test email failed"), {
          position: "top-center",
        });
      }
    } catch (err) {
      toast.error("❌ " + (err instanceof Error ? err.message : String(err)), {
        position: "top-center",
      });
    } finally {
      setTestEmailSending(false);
    }
  };

  const handleExport = (format: string) => {
    window.open(downloadUrl("export", { format }), "_blank");
  };

  const handleUpdateProfile = async () => {
    try {
      const data = await postJson<SimpleResponse>("update-profile", {
        name,
        householdId,
        location,
        email,
      });
      if (data.success) {
        toast.success("✅ Profile updated successfully!", { position: "top-center" });
        void refresh();
      } else toast.error("❌ " + (data.message ?? "Update failed"), { position: "top-center" });
    } catch (err) {
      toast.error("❌ " + (err instanceof Error ? err.message : String(err)), {
        position: "top-center",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast.warn("⚠️ Please enter your current password.", { position: "top-center" });
      return;
    }
    if (newPassword.length < 8) {
      toast.warn("⚠️ New password must be at least 8 characters.", { position: "top-center" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warn("⚠️ New passwords do not match.", { position: "top-center" });
      return;
    }
    try {
      const data = await postJson<SimpleResponse>("change-password", {
        oldPassword,
        newPassword,
      });
      if (data.success) {
        toast.success("✅ Password updated successfully!", { position: "top-center" });
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("❌ " + (data.message ?? "Change failed"), { position: "top-center" });
      }
    } catch (err) {
      toast.error("❌ " + (err instanceof Error ? err.message : String(err)), {
        position: "top-center",
      });
    }
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm(
      "⚠️ Are you sure you want to delete your account? This action cannot be undone.",
    );
    if (!confirmDelete) return;
    try {
      const data = await postJson<SimpleResponse>("delete-account", {});
      if (data.success) {
        toast.success("Account deleted successfully.", { position: "top-center" });
        setTimeout(() => navigate({ to: "/" }), 1200);
      } else {
        toast.error("❌ " + (data.message ?? "Delete failed"), { position: "top-center" });
      }
    } catch (err) {
      toast.error("❌ " + (err instanceof Error ? err.message : String(err)), {
        position: "top-center",
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-3xl mx-auto space-y-6 sm:space-y-10">
        <h1
          className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text 
        bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 text-center mb-6"
        >
          Settings
        </h1>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-6">
          {["profile", "password", "notifications", "export", "account"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md font-semibold transition ${
                activeTab === tab
                  ? "bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {tab === "profile" && "User Profile"}
              {tab === "password" && "Change Password"}
              {tab === "notifications" && "Notifications"}
              {tab === "export" && "Export Data"}
              {tab === "account" && "Account Management"}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
          <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 space-y-4">
            <h2 className="text-2xl font-bold text-teal-400">User Profile</h2>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaUser className="text-teal-400 mr-2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="Full Name"
              />
            </div>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaIdBadge className="text-blue-400 mr-2" />
              <input
                type="text"
                value={householdId}
                onChange={(e) => setHouseholdId(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="Household ID"
              />
            </div>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaMapMarkerAlt className="text-purple-400 mr-2" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="Location"
              />
            </div>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaEnvelope className="text-teal-400 mr-2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="Email"
              />
            </div>
            <button
              onClick={handleUpdateProfile}
              className="w-full py-2 mt-4 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-md font-semibold transform hover:scale-105 transition"
            >
              Update Profile
            </button>
          </div>
        )}

        {activeTab === "password" && (
          <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 space-y-4">
            <h2 className="text-2xl font-bold text-blue-400">Change Password</h2>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaLock className="text-purple-400 mr-2" />
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="Current Password"
              />
            </div>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaLock className="text-blue-400 mr-2" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="New Password"
              />
            </div>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaLock className="text-teal-400 mr-2" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
                placeholder="Confirm New Password"
              />
            </div>
            <button
              onClick={handleChangePassword}
              className="w-full py-2 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-md font-semibold transform hover:scale-105 transition"
            >
              Change Password
            </button>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 space-y-4">
            <h2 className="text-2xl font-bold text-amber-400 flex items-center gap-2">
              <FaBell /> Notifications
            </h2>
            <p className="text-sm text-gray-400">
              Choose where leakage alerts are sent. Leave the email blank to use your account email.
            </p>
            <div className="flex items-center bg-gray-800 p-3 rounded-md">
              <FaEnvelope className="text-teal-400 mr-2" />
              <input
                type="email"
                value={notifEmail}
                onChange={(e) => setNotifEmail(e.target.value)}
                placeholder="notifications@example.com"
                className="w-full bg-transparent text-gray-200 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-gray-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={notifyLeakage}
                onChange={(e) => setNotifyLeakage(e.target.checked)}
                className="w-4 h-4 accent-teal-500"
              />
              Enable leakage email notifications
            </label>
            <button
              onClick={handleSaveNotifications}
              className="w-full py-2 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-md font-semibold transform hover:scale-105 transition"
            >
              Save Preferences
            </button>

            <button
              onClick={handleSendTestEmail}
              disabled={testEmailSending}
              className="w-full py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-md font-semibold hover:bg-gray-700 transition disabled:opacity-60"
            >
              {testEmailSending ? "Sending…" : "Send Test Email"}
            </button>

            <div className="pt-4 border-t border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Notification History</h3>
              {historyLoading && <p className="text-sm text-gray-500">Loading…</p>}
              {!historyLoading && notifHistory.length === 0 && (
                <p className="text-sm text-gray-500">No notifications have been sent yet.</p>
              )}
              {!historyLoading && notifHistory.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {notifHistory.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between gap-3 bg-gray-800/70 rounded-md px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="text-gray-200 break-words">
                          {h.severity ? `${h.severity} leak` : "Leak alert"}
                          {h.volume !== null ? ` — ${h.volume} L` : ""}
                        </p>
                        <p className="text-xs text-gray-500 break-words">
                          {h.recipient} • {h.time}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold ${
                          h.status === "sent"
                            ? "bg-green-600"
                            : h.status === "skipped"
                              ? "bg-gray-600"
                              : "bg-red-600"
                        }`}
                      >
                        {h.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "export" && (
          <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 space-y-4">
            <h2 className="text-2xl font-bold text-purple-400">Export Data</h2>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => handleExport("CSV")}
                className="flex items-center space-x-2 py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-md transform hover:scale-105 transition"
              >
                <FaDownload className="text-teal-400" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => handleExport("PDF")}
                className="flex items-center space-x-2 py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-md transform hover:scale-105 transition"
              >
                <FaDownload className="text-purple-400" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === "account" && (
          <div className="bg-gray-900/80 rounded-2xl shadow-xl border border-gray-700 p-6 space-y-4">
            <h2 className="text-2xl font-bold text-teal-400">Account Management</h2>
            <button
              onClick={handleDeleteAccount}
              className="flex items-center justify-center space-x-2 w-full py-2 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 hover:opacity-90 text-white rounded-md font-semibold transform hover:scale-105 transition"
            >
              <FaTrash />
              <span>Delete Account</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="w-full py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition flex items-center justify-center gap-2"
        >
          <FaHome /> Back to Home
        </button>

        <ToastContainer />
      </div>
    </div>
  );
}
