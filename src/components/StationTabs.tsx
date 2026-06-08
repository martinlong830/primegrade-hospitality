"use client";

import type { Station, Task, TaskCompletion } from "@/lib/types";

interface StationTabsProps {
  stations: Station[];
  tasks: Task[];
  completions: TaskCompletion[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  showMapTab?: boolean;
  mapSelected?: boolean;
  onSelectMap?: () => void;
}

export default function StationTabs({
  stations,
  tasks,
  completions,
  selectedSlug,
  onSelect,
  showMapTab = false,
  mapSelected = false,
  onSelectMap,
}: StationTabsProps) {
  const getStationStats = (stationId: string) => {
    const stationTasks = tasks.filter((t) => t.station_id === stationId);
    const completed = stationTasks.filter((t) =>
      completions.some((c) => c.task_id === t.id)
    ).length;
    return { total: stationTasks.length, completed };
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map((station) => {
        const { total, completed } = getStationStats(station.id);
        const isSelected = selectedSlug === station.slug && !mapSelected;
        const allDone = total > 0 && completed === total;

        return (
          <button
            key={station.id}
            type="button"
            onClick={() => onSelect(station.slug)}
            className={`rounded-xl border-2 p-5 text-left transition-all ${
              isSelected
                ? "border-emerald-500 bg-emerald-50 shadow-md ring-2 ring-emerald-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className="mt-1 h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: station.color }}
              />
              <div className="min-w-0 flex-1">
                <h3
                  className={`text-lg font-semibold ${
                    isSelected ? "text-emerald-900" : "text-slate-900"
                  }`}
                >
                  {station.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {total === 0
                    ? "No tasks yet"
                    : `${completed}/${total} tasks complete`}
                </p>
                {allDone && (
                  <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    All done
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {showMapTab && onSelectMap && (
        <button
          type="button"
          onClick={onSelectMap}
          className={`rounded-xl border-2 p-5 text-left transition-all ${
            mapSelected
              ? "border-emerald-500 bg-emerald-50 shadow-md ring-2 ring-emerald-200"
              : "border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
          }`}
        >
          <h3
            className={`text-lg font-semibold ${
              mapSelected ? "text-emerald-900" : "text-slate-700"
            }`}
          >
            Floor Map
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            View restaurant layout
          </p>
        </button>
      )}
    </div>
  );
}
