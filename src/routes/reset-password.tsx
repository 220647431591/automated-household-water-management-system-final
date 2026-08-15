import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { FaLock, FaSignInAlt, FaShieldAlt } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { postJson } from "@/lib/api";
import { passwordSchema, firstError } from "@/lib/validation";
import PasswordStrength from "@/components/PasswordStrength";
import { z } from "zod";

type ResetSearch = { token?: string };

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>): ResetSearch => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reset Password — Water Management System" },
      { name: "description", content: "Choose a new password for your account." },
    ],
  }),
  component: ResetPassword,
});

type ResetResponse = { success?: boolean; message?: string };

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

function ResetPassword() {
  const { token } = useSearch({ from: "/reset-password" });
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("❌ Missing or invalid reset token", { position: "top-center" });
      return;
    }
    try {
      schema.parse({ password, confirm });
    } catch (err) {
      toast.error("❌ " + firstError(err), { position: "top-center" });
      return;
    }
    setSubmitting(true);
    try {
      const data = await postJson<ResetResponse>("reset-password", { token, password });
      if (data.success) {
        toast.success("✅ Password updated. Redirecting to sign in…", { position: "top-center" });
        setTimeout(() => navigate({ to: "/" }), 1200);
      } else {
        toast.error("❌ " + (data.message ?? "Could not reset password"), {
          position: "top-center",
        });
      }
    } catch (error) {
      toast.error("❌ Server error: " + (error instanceof Error ? error.message : String(error)), {
        position: "top-center",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 px-4 py-8">
      <div className="w-full max-w-md p-8 bg-gray-900/80 rounded-2xl shadow-2xl border border-gray-700">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 animate-fadeInOut">
            Reset Password
          </h1>
          <p className="text-sm text-gray-400 mt-1 italic">
            Choose a new password for your account
          </p>
          <div className="flex justify-center mt-6">
            <FaShieldAlt className="text-teal-400 text-5xl animate-bounceY" />
          </div>
          <div className="mt-4 w-32 h-1 bg-gradient-to-r from-teal-500 to-blue-500 mx-auto rounded-full"></div>
        </div>

        {!token && (
          <p className="mb-4 text-center text-sm text-red-400">
            This page requires a valid reset link from your email.
          </p>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
            <FaLock className="text-teal-400 mr-2" />
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-gray-200 focus:outline-none"
            />
          </div>
          <PasswordStrength value={password} />

          <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
            <FaLock className="text-teal-400 mr-2" />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-transparent text-gray-200 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !token}
            className="w-full py-2 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-md font-semibold disabled:opacity-60"
          >
            {submitting ? "Updating…" : "Update Password"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="w-full mt-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition flex items-center justify-center gap-2"
        >
          <FaSignInAlt /> Back to Login
        </button>

        <ToastContainer />
      </div>
    </div>
  );
}
