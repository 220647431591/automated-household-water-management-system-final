import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaUser, FaLock, FaEnvelope, FaHome, FaSignInAlt } from "react-icons/fa";
import { toast } from "react-toastify";
import { postJson } from "@/lib/api";
import { registerSchema, firstError } from "@/lib/validation";
import PasswordStrength from "@/components/PasswordStrength";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Automated Household Water Management System" },
      { name: "description", content: "Create a new account to start managing your water system." },
    ],
  }),
  component: Register,
});

type RegisterResponse = { success?: boolean; message?: string };

function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      toast.error("❌ " + firstError(parsed.error));
      return;
    }
    setSubmitting(true);
    try {
      const data = await postJson<RegisterResponse>("register", {
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (data.success) {
        toast.success("✅ Account created successfully!");
        setTimeout(() => navigate({ to: "/" }), 1200);
      } else {
        toast.error("❌ " + (data.message ?? "Registration failed"));
      }
    } catch (error) {
      toast.error("❌ Server error: " + firstError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 px-4 py-8">
      <div className="w-full max-w-md p-8 bg-gray-900/80 rounded-2xl shadow-2xl border border-gray-700">
        <div className="text-center mb-6">
          <h1
            className="text-2xl font-extrabold text-transparent bg-clip-text 
          bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 
          animate-fadeInOut"
          >
            REGISTER NEW ACCOUNT
          </h1>
          <p className="text-sm text-gray-400 mt-1 italic">Smart • Secure • Efficient</p>
          <div className="flex justify-center mt-6">
            <FaHome className="text-teal-400 text-5xl animate-bounceY" />
          </div>
          <div className="mt-4 w-32 h-1 bg-gradient-to-r from-teal-500 to-blue-500 mx-auto rounded-full"></div>
        </div>

        <form className="space-y-5" onSubmit={handleRegister}>
          <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
            <FaUser className="text-teal-400 mr-2" />
            <input
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-gray-200 focus:outline-none"
            />
            <FaEnvelope className="text-teal-400 ml-2" />
          </div>

          <div>
            <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
              <FaLock className="text-blue-400 mr-2" />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-gray-200 focus:outline-none"
              />
            </div>
            <PasswordStrength value={password} />
          </div>

          <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
            <FaLock className="text-purple-400 mr-2" />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent text-gray-200 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-md font-semibold disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create Account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="w-full mt-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition flex items-center justify-center gap-2"
        >
          <FaSignInAlt /> Back to Login
        </button>
      </div>
    </div>
  );
}
