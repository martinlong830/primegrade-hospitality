"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ChecklistView from "@/components/ChecklistView";
import EmployeeTaskList from "@/components/EmployeeTaskList";
import MapView from "@/components/MapView";
import PageHeader from "@/components/PageHeader";
import StationTabs from "@/components/StationTabs";
import { useAuth } from "@/contexts/AuthContext";
import { DateProvider, useViewDate } from "@/contexts/DateContext";
import { getAppData } from "@/lib/db";
import { filterCompletionsForDate } from "@/lib/dates";
import type { AppData } from "@/lib/types";

type DashboardView = "all" | "map" | string;

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const {
    selectedDate,
    readOnly,
    isViewingPast,
    isViewingFuture,
    fullLabel,
  } = useViewDate();
  const [data, setData] = useState<AppData | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("all");

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
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  const viewMode = isViewingPast ? "past" : isViewingFuture ? "future" : "today";
  const showAll = activeView === "all";
  const showMap = activeView === "map";
  const selectedStation = showAll
    ? null
    : showMap
      ? null
      : (data.stations.find((s) => s.slug === activeView) ?? data.stations[0]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PageHeader
        title="Employee Dashboard"
        subtitle={`Welcome, ${user.name}`}
        actions={
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:px-4"
          >
            Sign Out
          </button>
        }
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <StationTabs
          stations={data.stations}
          tasks={data.tasks}
          completions={dateCompletions}
          selectedSlug={showAll || showMap ? null : activeView}
          onSelect={(slug) => setActiveView(slug)}
          showAllTab
          allSelected={showAll}
          onSelectAll={() => setActiveView("all")}
          showMapTab
          mapSelected={showMap}
          onSelectMap={() => setActiveView("map")}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {showMap ? (
            <MapView
              stations={data.stations}
              sections={data.sections}
              mapZones={data.mapZones}
              mapLayout={data.mapLayout}
            />
          ) : showAll ? (
            <EmployeeTaskList
              tasks={data.tasks}
              stations={data.stations}
              sections={data.sections}
              completions={dateCompletions}
              users={data.users}
              currentUser={user}
              onUpdate={refresh}
              readOnly={readOnly}
              viewMode={viewMode}
              viewDateLabel={fullLabel}
            />
          ) : selectedStation ? (
            <ChecklistView
              tasks={data.tasks}
              sections={data.sections}
              completions={dateCompletions}
              users={data.users}
              currentUser={user}
              station={selectedStation}
              onUpdate={refresh}
              readOnly={readOnly}
              viewMode={viewMode}
              viewDateLabel={fullLabel}
            />
          ) : (
            <p className="text-center text-slate-500">
              No stations configured. Ask an admin to set up stations and tasks.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user?.role === "admin") router.replace("/admin");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <DateProvider>
      <DashboardContent />
    </DateProvider>
  );
}
