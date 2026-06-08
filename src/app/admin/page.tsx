"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPanel from "@/components/AdminPanel";
import { useAuth } from "@/contexts/AuthContext";
import { getAppData } from "@/lib/db";
import type { AppData } from "@/lib/types";

export default function AdminPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);

  const refresh = useCallback(async () => {
    const appData = await getAppData();
    setData(appData);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user?.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !user || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Console</h1>
            <p className="text-sm text-slate-500">
              {user.name} · Manage tasks, team &amp; layout
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View Dashboard
            </Link>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <AdminPanel data={data} onUpdate={refresh} />
        </div>
      </main>
    </div>
  );
}
