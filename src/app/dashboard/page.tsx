"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ChecklistView from "@/components/ChecklistView";
import MapView from "@/components/MapView";
import StationTabs from "@/components/StationTabs";
import { useAuth } from "@/contexts/AuthContext";
import { getAppData } from "@/lib/db";
import type { AppData } from "@/lib/types";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("kitchen-line");
  const [showMap, setShowMap] = useState(false);

  const refresh = useCallback(async () => {
    const appData = await getAppData();
    setData(appData);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user?.role === "admin") router.replace("/admin");
  }, [user, loading, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !user || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  const selectedStation =
    data.stations.find((s) => s.slug === activeTab) ?? data.stations[0];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              DoH Inspection Ready
            </h1>
            <p className="text-sm text-slate-500">Welcome, {user.name}</p>
          </div>
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
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="space-y-4">
          <StationTabs
            stations={data.stations}
            tasks={data.tasks}
            completions={data.completions}
            selectedSlug={showMap ? null : activeTab}
            onSelect={(slug) => {
              setActiveTab(slug);
              setShowMap(false);
            }}
            showMapTab
            mapSelected={showMap}
            onSelectMap={() => setShowMap(true)}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {showMap ? (
              <MapView
                stations={data.stations}
                sections={data.sections}
                mapZones={data.mapZones}
                mapLayout={data.mapLayout}
              />
            ) : selectedStation ? (
              <ChecklistView
                tasks={data.tasks}
                sections={data.sections}
                completions={data.completions}
                users={data.users}
                currentUser={user}
                station={selectedStation}
                onUpdate={refresh}
              />
            ) : (
              <p className="text-center text-slate-500">
                No stations configured. Ask an admin to set up stations and
                tasks.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
