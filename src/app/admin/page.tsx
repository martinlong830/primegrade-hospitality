"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPanel from "@/components/AdminPanel";
import PageHeader from "@/components/PageHeader";
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
      <PageHeader
        title="Admin Console"
        subtitle={`${user.name} · Manage tasks, team & layout`}
        maxWidthClass="max-w-6xl"
        actions={
          <>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:px-4"
            >
              View Dashboard
            </Link>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:px-4"
            >
              Sign Out
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
