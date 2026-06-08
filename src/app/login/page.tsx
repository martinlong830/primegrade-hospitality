"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const ok = await login(username, password);
    setSubmitting(false);
    if (!ok) {
      setError("Invalid username or password.");
      return;
    }
    const session = localStorage.getItem("doh-inspection-session");
    if (session) {
      const parsed = JSON.parse(session) as { role: string };
      router.replace(parsed.role === "admin" ? "/admin" : "/dashboard");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100">
        <p className="text-lg font-semibold text-slate-900">PrimeGrade Hospitality</p>
        <p className="mt-1 text-sm text-slate-500">PGH · Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-2xl font-bold text-white shadow-lg">
            PGH
          </div>
          <h1 className="text-2xl font-bold text-white">PrimeGrade Hospitality</h1>
          <p className="mt-2 text-slate-300">
            Restaurant health &amp; safety compliance
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white p-8 shadow-2xl"
        >
          <h2 className="mb-6 text-lg font-semibold text-slate-900">Sign In</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Martin Long"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <p className="mb-2 font-semibold text-slate-600">Demo accounts:</p>
            <p>
              <strong>Admin:</strong> Martin Long / doh
            </p>
            <p>
              <strong>User:</strong> Eduardo Ramirez / doh
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
