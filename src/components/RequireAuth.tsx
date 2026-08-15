import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { FaTint } from "react-icons/fa";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800">
        <div className="flex flex-col items-center gap-3">
          <FaTint className="text-teal-400 text-5xl animate-bounce" />
          <p className="text-gray-400 text-sm">Checking your session…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
