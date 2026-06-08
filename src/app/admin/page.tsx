"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPanel from "@/components/AdminPanel";
import DateNavigator from "@/components/DateNavigator";
import { useAuth } from "@/contexts/AuthContext";
import { DateProvider, useViewDate } from "@/contexts/DateContext";
import { getAppData } from "@/lib/db";
import { filterCompletionsForDate } from "@/lib/dates";
import type { AppData } from "@/lib/types";

function AdminContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { selectedDate } = useViewDate();
  const [data, setData] = useState<AppData | null>(null);

  const refresh = useCallback(async () => {
    const appData = await getAppData();
    setData(appData);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dateCompletions = useMemo(
    () =>
      data ? filterCompletionsForDate(data.completions, selectedDate) : [],
    [data, selectedDate]
  );

  if (!user || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 py-4">
          <div className="min-w-0 justify-self-start overflow-hidden">
            <h1 className="truncate text-xl font-bold text-slate-900">
              Admin Console
            </h1>
            <p className="truncate whitespace-nowrap text-sm text-slate-500">
              {user.name} · Manage tasks, team &amp; layout
            </p>
          </div>
          <div className="shrink-0 justify-self-center">
            <DateNavigator />
          </div>
          <div className="flex shrink-0 justify-end gap-3 justify-self-end whitespace-nowrap">
            <Link
              href="/dashboard"
              className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View Dashboard
            </Link>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <AdminPanel
            data={data}
            completionsForDate={dateCompletions}
            onUpdate={refresh}
          />
        </div>
      </main>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user?.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <DateProvider>
      <AdminContent />
    </DateProvider>
  );
}
