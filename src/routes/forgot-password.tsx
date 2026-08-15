import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaEnvelope, FaHome, FaSignInAlt } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { postJson } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      {
        title: "Forgot Password — Automated Household Water Management System",
      },
      {
        name: "description",
        content: "Reset your account password securely.",
      },
    ],
  }),
  component: ForgotPassword,
});

type ForgotResponse = {
  success?: boolean;
  message?: string;
};

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.includes("@")) {
      toast.error("❌ Please enter a valid email address", {
        position: "top-center",
      });
      return;
    }

    try {
      const data = await postJson<ForgotResponse>("forgot-password", { email });

      if (data.success) {
        toast.success(
          "✅ If that email exists, a password reset link has been sent to your email.",
          {
            position: "top-center",
          },
        );

        // IMPORTANT:
        // No reset link is displayed here.
        // The link is only sent through email.
      } else {
        toast.error("❌ " + (data.message ?? "Could not send reset link"), {
          position: "top-center",
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      toast.error("❌ Server error: " + msg, {
        position: "top-center",
      });
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 px-4 py-8">
      <div className="w-full max-w-md p-8 bg-gray-900/80 rounded-2xl shadow-2xl border border-gray-700">
        <div className="text-center mb-6">
          <h1
            className="
            text-2xl font-extrabold 
            text-transparent bg-clip-text 
            bg-gradient-to-r from-teal-400 
            via-blue-500 to-purple-600
            animate-fadeInOut
            "
          >
            Forgot Password
          </h1>

          <p className="text-sm text-gray-400 mt-1 italic">Reset your account securely</p>

          <div className="flex justify-center mt-6">
            <FaHome className="text-teal-400 text-5xl animate-bounceY" />
          </div>

          <div className="mt-4 w-32 h-1 bg-gradient-to-r from-teal-500 to-blue-500 mx-auto rounded-full"></div>
        </div>

        <form className="space-y-5" onSubmit={handleReset}>
          <div className="flex items-center border border-gray-700 rounded-md px-3 py-2 bg-gray-800">
            <FaEnvelope className="text-teal-400 mr-2" />

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-gray-200 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="
            w-full py-2 bg-gradient-to-r 
            from-teal-500 via-blue-600 
            to-purple-600 text-white 
            rounded-md font-semibold
            "
          >
            Send Reset Link
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="
          w-full mt-4 py-2 bg-gray-700 
          text-white rounded-md 
          hover:bg-gray-600 transition 
          flex items-center justify-center gap-2
          "
        >
          <FaSignInAlt />
          Back to Login
        </button>

        <ToastContainer />
      </div>
    </div>
  );
}
