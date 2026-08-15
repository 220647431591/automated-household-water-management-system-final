import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaUser, FaLock, FaEye, FaEyeSlash, FaEnvelope, FaHome } from "react-icons/fa";
import { toast } from "react-toastify";
import { postJson } from "@/lib/api";
import { loginSchema, firstError } from "@/lib/validation";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Login — Automated Household Water Management System" },
      { name: "description", content: "Sign in to manage your smart household water system." },
    ],
  }),
  component: Login,
});

type LoginResponse = { success?: boolean; message?: string };

function Login() {
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error("❌ " + firstError(parsed.error));
      return;
    }
    setSubmitting(true);
    try {
      const data = await postJson<LoginResponse>("login", parsed.data);
      if (data.success) {
        if (remember) localStorage.setItem("whms_last_email", parsed.data.email);
        else localStorage.removeItem("whms_last_email");
        await refresh();
        toast.success("✅ Login successful!");
        setTimeout(() => navigate({ to: "/dashboard" }), 700);
      } else {
        toast.error("❌ " + (data.message ?? "Login failed"));
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
            AUTOMATED HOUSEHOLD WATER MANAGEMENT SYSTEM
          </h1>
          <p className="text-sm text-gray-400 mt-1 italic">Smart • Secure • Efficient</p>
          <div className="flex justify-center mt-6">
            <FaHome className="text-teal-400 text-5xl animate-bounceY" />
          </div>
          <div className="mt-4 w-32 h-1 bg-gradient-to-r from-teal-500 to-blue-500 mx-auto rounded-full"></div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
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

          <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
            <FaLock className="text-blue-400 mr-2" />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-gray-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="ml-2 text-purple-400 hover:text-teal-400 transition"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-400">
            <label className="flex items-center font-bold">
              <input
                type="checkbox"
                checked={remember}
                onChange={() => setRemember(!remember)}
                className="mr-2 accent-teal-500"
              />
              Remember Me
            </label>
            <button
              type="button"
              onClick={() => navigate({ to: "/forgot-password" })}
              className="hover:text-teal-400 transition"
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-gradient-to-r from-teal-500 via-blue-600 to-purple-600 text-white rounded-md font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>

          <div className="text-center text-sm text-gray-400 mt-2">Don't have an account?</div>
          <button
            type="button"
            onClick={() => navigate({ to: "/register" })}
            className="w-full py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition"
          >
            Register
          </button>
        </form>
      </div>
    </div>
  );
}
